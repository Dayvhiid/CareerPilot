# Phase 1 — Foundation + Resume Agent

## Goal

Build the lightweight custom agent framework and deploy the first specialized agent (Resume Agent) that wraps existing resume processing logic as tools. By the end of this phase, the system can accept a resume upload and have an AI agent reason about its quality, detect weak points, and tailor it for specific job descriptions.

---

## Why Phase 1 First

- The existing codebase has **zero agent infrastructure** — every phase depends on the core framework
- Resume processing is the most mature subsystem (controllers, extractors, scorers already exist)
- ResumeAgent delivers immediate visible value: "analyze my resume" and "tailor for this job" are concrete, demoable features
- The Career Coach Agent in Phase 4 requires all other agents to be registered first

---

## 1. Agent Core Framework

### 1.1 `src/agents/core/Tool.js`

Every capability an agent can invoke is modeled as a Tool. A Tool has a name, description, a JSON Schema for its inputs, and an async handler function.

```js
class Tool {
  constructor({ name, description, inputSchema, handler }) {
    if (!name) throw new Error('Tool name is required');
    if (!handler) throw new Error('Tool handler is required');

    this.name = name;
    this.description = description || '';
    this.inputSchema = inputSchema || { type: 'object', properties: {} };
    this.handler = handler;
  }

  async execute(args) {
    this._validate(args);
    return this.handler(args);
  }

  _validate(args) {
    // Validate args against this.inputSchema using a lightweight validator
    // (Simple approach: check required fields exist, type-check primitives)
    const required = this.inputSchema.required || [];
    for (const field of required) {
      if (args[field] === undefined || args[field] === null) {
        throw new Error(`Tool "${this.name}": missing required field "${field}"`);
      }
    }
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  register(tool) {
    if (!(tool instanceof Tool)) {
      throw new Error('Only Tool instances can be registered');
    }
    this._tools.set(tool.name, tool);
  }

  get(name) {
    const tool = this._tools.get(name);
    if (!tool) throw new Error(`Tool "${name}" not found in registry`);
    return tool;
  }

  list() {
    return Array.from(this._tools.values());
  }

  has(name) {
    return this._tools.has(name);
  }
}

module.exports = { Tool, ToolRegistry };
```

#### Design Decisions

- **No external dependency** — pure JS, no decorators, no reflection
- **JSON Schema for input validation** — standard, extensible, easy to generate LLM-friendly descriptions
- **Async handlers everywhere** — every tool call involves I/O (DB, AI, filesystem)
- **`toJSON()` for LLM context** — when building the agent's system prompt, we serialize available tools so the LLM knows what it can call

### 1.2 `src/agents/core/Agent.js`

The base class for all agents. Implements the ReAct (Reasoning + Acting) loop:

1. Build context (system prompt + conversation history + memory)
2. Call LLM → get a response (either a tool call or a final answer)
3. If tool call: execute the tool, feed result back to LLM, go to step 2
4. If final answer: return result

```js
class Agent {
  constructor({ name, description, tools = [], model, memory, maxSteps = 15 }) {
    this.name = name;
    this.description = description;
    this.tools = new ToolRegistry();
    (tools || []).forEach(t => this.tools.register(t));
    this.model = model;                  // Shared AIService or per-agent model config
    this.memory = memory;                // MemoryStore instance
    this.maxSteps = maxSteps;
  }

  /**
   * Main entry point. Takes a task string + optional context and runs the agent loop.
   * Returns { result, steps, tokensUsed, toolCalls }
   */
  async run(task, context = {}) {
    const steps = [];
    const toolCalls = [];
    let tokensUsed = 0;

    const systemPrompt = this._buildSystemPrompt();
    let messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: this._formatTask(task, context) },
    ];

    for (let step = 0; step < this.maxSteps; step++) {
      const response = await this.model.generate(messages, {
        temperature: 0.2,
        tools: this.tools.list().map(t => t.toJSON()),
      });

      tokensUsed += (response.usage?.totalTokens || 0);
      const content = response.content || '';

      // Check if LLM wants to call a tool
      const toolCall = this._parseToolCall(content);
      if (!toolCall) {
        // No tool call → LLM is giving final answer
        steps.push({ type: 'final', content });
        return { result: content, steps, toolCalls, tokensUsed };
      }

      // Execute the tool
      try {
        const tool = this.tools.get(toolCall.name);
        const toolResult = await tool.execute(toolCall.args);
        toolCalls.push({ name: toolCall.name, args: toolCall.args, result: toolResult });

        messages.push(
          { role: 'assistant', content: '', toolCall: toolCall.name, toolArgs: toolCall.args },
          { role: 'tool', name: toolCall.name, content: JSON.stringify(toolResult) },
        );

        steps.push({ type: 'tool', tool: toolCall.name, args: toolCall.args, result: toolResult });
      } catch (err) {
        // Tool execution error → feed back to LLM so it can recover
        messages.push(
          { role: 'assistant', content: '', toolCall: toolCall.name, toolArgs: toolCall.args },
          { role: 'tool', name: toolCall.name, content: `ERROR: ${err.message}` },
        );
        steps.push({ type: 'error', tool: toolCall.name, error: err.message });
      }
    }

    // Max steps reached without final answer
    return {
      result: 'I was unable to complete this task within the allowed steps. Please try a simpler request.',
      steps, toolCalls, tokensUsed,
    };
  }

  /**
   * Build the system prompt that defines this agent's personality, rules, and available tools.
   */
  _buildSystemPrompt() {
    const toolDescriptions = this.tools.list().map(t => {
      return `- ${t.name}: ${t.description} (inputs: ${JSON.stringify(t.inputSchema)})`;
    }).join('\n');

    return `You are ${this.name}, an AI agent. ${this.description}

You have access to the following tools:
${toolDescriptions || 'No tools available.'}

Rules:
1. reason step by step about what tool to call and why
2. when you need to invoke a tool, respond with exactly:
   TOOL_CALL: toolName
   ARGS: {"key": "value"}
3. wait for the tool result, then continue reasoning
4. when you have the final answer, respond with:
   FINAL_ANSWER: your response to the user
5. you can call multiple tools sequentially
6. if a tool fails, try an alternative approach if possible`;
  }

  _formatTask(task, context) {
    let formatted = `Task: ${task}`;
    if (context && Object.keys(context).length > 0) {
      formatted += `\n\nContext:\n${JSON.stringify(context, null, 2)}`;
    }
    return formatted;
  }

  /**
   * Parse LLM response to extract tool calls.
   * Supports both structured output and regex parsing.
   */
  _parseToolCall(content) {
    // Try structured format first
    const toolMatch = content.match(/TOOL_CALL:\s*(\w+)\s*\nARGS:\s*(\{[\s\S]*?\})/);
    if (toolMatch) {
      try {
        return { name: toolMatch[1], args: JSON.parse(toolMatch[2]) };
      } catch (e) {
        return null;
      }
    }

    // Check for final answer
    if (content.includes('FINAL_ANSWER:')) {
      return null;  // signals done
    }

    return null;
  }

  addTool(tool) {
    this.tools.register(tool);
  }
}

module.exports = Agent;
```

#### Agent Loop Flow

```
User: "Analyze my resume"
  │
  ├─ LLM: "I should extract the resume text first. TOOL_CALL: extract_text_from_file"
  ├─ Tool: returns raw text
  ├─ LLM: "Now I'll parse it with AI. TOOL_CALL: ai_parse_resume"
  ├─ Tool: returns structured data
  ├─ LLM: "Let me check for weak points. TOOL_CALL: detect_weak_bullets"
  ├─ Tool: returns weak points list
  ├─ LLM: "FINAL_ANSWER: Here's your resume analysis..."
  └─ Return result to user
```

### 1.3 `src/agents/core/WorkflowEngine.js`

A graph-based workflow engine that extends the existing FSM pattern from `stateMachine.js`. While the base Agent class handles single-turn reasoning loops, the WorkflowEngine handles multi-step, multi-agent, long-running processes with branching, parallelism, and human-in-the-loop gates.

#### Key Differences from Current FSM

| Aspect | Current FSM (`stateMachine.js`) | WorkflowEngine |
|---|---|---|
| Structure | Linear sequence of 13 states | Directed acyclic graph (nodes + edges) |
| Transitions | Implicit (always next state) | Explicit with conditions |
| Branching | None | `if/else`, `switch` conditions on edges |
| Parallelism | None | `Promise.all()` on parallel nodes |
| Human-in-loop | None | `human_gate` node pauses for approval |
| Progress | Hardcoded per-state % | Weighted per-node percentage |
| Persistence | MongoDB Conversation doc | MongoDB snapshot + Redis live state |
| Agents | Not supported | Each node can delegate to any registered agent |

```js
class WorkflowEngine {
  /**
   * @param {Object} config
   * @param {Object[]} config.nodes - Array of node definitions
   * @param {string} config.nodes[].id - Unique node ID
   * @param {string} config.nodes[].type - 'task' | 'parallel' | 'branch' | 'human_gate' | 'agent_task' | 'end'
   * @param {string} [config.nodes[].label] - Display name
   * @param {number} [config.nodes[].weight] - Progress weight (all weights sum to 100)
   * @param {Function} [config.nodes[].handler] - Async function to execute for 'task' nodes
   * @param {string} [config.nodes[].agentName] - Agent to delegate to for 'agent_task' nodes
   * @param {Object[]} config.edges - Array of edge definitions
   * @param {string} config.edges[].from - Source node ID
   * @param {string} config.edges[].to - Target node ID
   * @param {Function} [config.edges[].condition] - Async (context) => boolean; if omitted, always true
   */
  constructor({ nodes, edges }) {
    this.nodes = new Map(nodes.map(n => [n.id, n]));
    this.edges = edges;
    this._buildAdjacencyList();
  }

  _buildAdjacencyList() {
    this.adjacency = new Map();
    for (const node of this.nodes.values()) {
      this.adjacency.set(node.id, []);
    }
    for (const edge of this.edges) {
      if (this.adjacency.has(edge.from)) {
        this.adjacency.get(edge.from).push(edge);
      }
    }
  }

  /**
   * Start the workflow with an initial context object.
   * Returns when the workflow reaches an 'end' node or errors.
   */
  async start(initialContext = {}) {
    const context = { ...initialContext, _history: [], _currentNode: null, _errors: [] };
    const startNode = this.nodes.get('start');
    if (!startNode) throw new Error('Workflow must have a "start" node');
    return this._executeNode('start', context);
  }

  async _executeNode(nodeId, context) {
    const node = this.nodes.get(nodeId);
    if (!node) throw new Error(`Node "${nodeId}" not found`);
    if (node.type === 'end') return { context, status: 'completed' };

    context._currentNode = nodeId;
    context._history.push({ nodeId, enteredAt: new Date().toISOString() });

    let result;

    switch (node.type) {
      case 'task':
        result = await node.handler(context);
        context[node.id] = result;
        break;

      case 'agent_task':
        const agent = this.agentRegistry?.get(node.agentName);
        if (!agent) throw new Error(`Agent "${node.agentName}" not registered`);
        result = await agent.run(node.task || '', context);
        context[node.id] = result;
        break;

      case 'parallel':
        // Find all outgoing edges from this node with no condition
        const parallelTargets = this.adjacency.get(nodeId)
          .filter(e => !e.condition)
          .map(e => e.to);
        const parallelResults = await Promise.all(
          parallelTargets.map(targetId => this._executeNode(targetId, { ...context }))
        );
        // Merge results
        for (const pr of parallelResults) {
          Object.assign(context, pr.context);
        }
        result = { parallel: true, count: parallelResults.length };
        break;

      case 'human_gate':
        // Pause and wait for external approval
        context._pendingGate = {
          gateId: node.id,
          label: node.label || 'Awaiting approval',
          data: node.buildGateData ? await node.buildGateData(context) : {},
          status: 'pending',
        };
        // The controller layer polls for pending gates
        // Once approved/rejected, the workflow resumes from here
        return { context, status: 'awaiting_approval', gate: context._pendingGate };

      case 'branch':
        // Evaluate conditions on outgoing edges; take the first matching one
        const outgoing = this.adjacency.get(nodeId);
        for (const edge of outgoing) {
          if (!edge.condition || await edge.condition(context)) {
            return this._executeNode(edge.to, context);
          }
        }
        throw new Error(`Branch node "${nodeId}": no matching condition`);

      default:
        throw new Error(`Unknown node type: ${node.type}`);
    }

    // Find next node(s)
    const outgoingEdges = this.adjacency.get(nodeId) || [];

    if (node.type === 'parallel') {
      // Parallel node handles its own routing
      return { context, status: 'completed' };
    }

    if (outgoingEdges.length === 0) {
      return { context, status: 'completed' };
    }

    // Sequential: find the first edge whose condition passes
    for (const edge of outgoingEdges) {
      if (!edge.condition || await edge.condition(context)) {
        return this._executeNode(edge.to, context);
      }
    }

    return { context, status: 'completed' };
  }

  getProgress(context) {
    const totalWeight = Array.from(this.nodes.values())
      .filter(n => n.type !== 'start' && n.type !== 'end')
      .reduce((sum, n) => sum + (n.weight || 0), 0);

    const completedWeight = context._history
      .map(h => this.nodes.get(h.nodeId))
      .filter(Boolean)
      .reduce((sum, n) => sum + (n.weight || 0), 0);

    return Math.round((completedWeight / (totalWeight || 1)) * 100);
  }

  getStatus(context) {
    return {
      currentNode: context._currentNode,
      history: context._history,
      progress: this.getProgress(context),
      pendingGate: context._pendingGate || null,
      errors: context._errors,
    };
  }
}

module.exports = WorkflowEngine;
```

#### Example Workflow: "Find me my next job"

```
start
  │
  ├─ [agent_task] ResumeAgent.analyze()          weight: 10
  │
  ├─ [agent_task] JobSearchAgent.search()         weight: 20
  │
  ├─ [agent_task] MatchAgent.score()              weight: 15
  │
  ├─ [branch] top_match >= 80%?
  │   ├─ YES → [human_gate] "Approve application?" weight: 5
  │   │             ├─ APPROVED → [agent_task] CoverLetterAgent.draft()  weight: 10
  │   │             │                 └─ [task] submitApplication()       weight: 5
  │   │             └─ REJECTED → [task] logFeedback()                    weight: 5
  │   │
  │   └─ NO → [task] suggestSkillGaps()           weight: 5
  │
  ├─ [agent_task] ApplicationTrackerAgent.log()   weight: 5
  │
  └─ end
```

### 1.4 `src/agents/core/MemoryStore.js`

Two-tier memory system:

| Tier | Backend | Scope | TTL | Content |
|---|---|---|---|---|
| **Short-term** | Redis (via existing `cacheService.js`) | Per-agent, per-session | Session (or 24h) | Current conversation context, recent tool results |
| **Long-term** | MongoDB (`UserPreference` model) | Per-user, permanent | Forever | Goals, preferences, history, learned traits |
| **Vector** | MongoDB Atlas / in-memory | Per-domain, permanent | Forever | Semantic search across past interactions |

```js
class MemoryStore {
  constructor({ redis, userPreferenceModel, vectorStore }) {
    this.redis = redis;
    this.UserPreference = userPreferenceModel;
    this.vectorStore = vectorStore;
  }

  // ── Short-term (Redis) ──

  async getContext(agentId, userId, sessionId = 'default') {
    const key = `agent:${agentId}:${userId}:session:${sessionId}`;
    const raw = await this.redis.get(key);
    return raw ? JSON.parse(raw) : {};
  }

  async setContext(agentId, userId, data, sessionId = 'default', ttl = 86400) {
    const key = `agent:${agentId}:${userId}:session:${sessionId}`;
    // Merge with existing context
    const existing = await this.getContext(agentId, userId, sessionId);
    const merged = { ...existing, ...data, _updatedAt: new Date().toISOString() };
    await this.redis.set(key, JSON.stringify(merged), 'EX', ttl);
  }

  async clearContext(agentId, userId, sessionId = 'default') {
    const key = `agent:${agentId}:${userId}:session:${sessionId}`;
    await this.redis.del(key);
  }

  // ── Long-term (MongoDB UserPreference) ──

  async getPreferences(userId) {
    let prefs = await this.UserPreference.findOne({ userId }).lean();
    if (!prefs) {
      // Auto-create empty preferences for new users
      prefs = await this.UserPreference.create({ userId });
    }
    return prefs;
  }

  async updatePreferences(userId, updates) {
    return this.UserPreference.findOneAndUpdate(
      { userId },
      { $set: updates },
      { upsert: true, new: true, runValidators: true }
    ).lean();
  }

  /**
   * Incrementally learn a preference. For example, if the user
   * applies to 3 Laravel jobs, increment the Laravel confidence.
   */
  async learnPreference(userId, category, value) {
    const field = `learnedPreferences.${category}`;
    return this.UserPreference.findOneAndUpdate(
      { userId },
      {
        $push: {
          [field]: { value, learnedAt: new Date() },
        },
      },
      { upsert: true }
    );
  }

  // ── Vector Store ──

  async storeEmbedding(collection, id, text, embedding, metadata = {}) {
    if (this.vectorStore) {
      await this.vectorStore.store(collection, id, text, embedding, metadata);
    }
  }

  async similaritySearch(collection, queryEmbedding, limit = 5) {
    if (this.vectorStore) {
      return this.vectorStore.search(collection, queryEmbedding, limit);
    }
    return [];
  }
}

module.exports = MemoryStore;
```

### 1.5 `src/agents/core/AgentRegistry.js`

Central registry for all agents. Provides lookup by name and task-based routing.

```js
class AgentRegistry {
  constructor() {
    this._agents = new Map();
  }

  register(agent) {
    if (!agent.name) throw new Error('Agent must have a name');
    this._agents.set(agent.name, agent);
  }

  get(name) {
    const agent = this._agents.get(name);
    if (!agent) throw new Error(`Agent "${name}" not found. Available: ${this.list().join(', ')}`);
    return agent;
  }

  list() {
    return Array.from(this._agents.keys());
  }

  listDetailed() {
    return Array.from(this._agents.values()).map(a => ({
      name: a.name,
      description: a.description,
      tools: a.tools.list().map(t => t.name),
    }));
  }

  /**
   * Route a task to the best-suited agent based on keyword matching
   * against agent descriptions. More sophisticated routing (LLM-based)
   * can be added later.
   */
  route(task) {
    const taskLower = task.toLowerCase();
    let bestAgent = null;
    let bestScore = 0;

    for (const agent of this._agents.values()) {
      const descLower = agent.description.toLowerCase();
      const words = descLower.split(/\s+/);
      let score = 0;
      for (const word of words) {
        if (word.length > 3 && taskLower.includes(word)) {
          score++;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestAgent = agent;
      }
    }

    return bestAgent;
  }

  /**
   * Run a task by routing it to the best agent.
   */
  async runTask(task, context = {}) {
    const agent = this.route(task);
    if (!agent) {
      throw new Error(`No agent found for task: "${task}"`);
    }
    return agent.run(task, context);
  }
}

// Singleton
const registry = new AgentRegistry();
module.exports = registry;
```

---

## 2. New Model — `src/models/UserPreference.js`

Long-term memory storage for user preferences, goals, and agent-inferred traits.

```js
const mongoose = require('mongoose');

const weeklyPlanSchema = new mongoose.Schema({
  week: { type: Number, required: true },
  focus: { type: String, required: true },
  tasks: [String],
  completed: { type: Boolean, default: false },
  completedAt: Date,
  notes: String,
}, { _id: false });

const activeGoalSchema = new mongoose.Schema({
  statement: { type: String, required: true },
  startedAt: { type: Date, default: Date.now },
  deadline: Date,
  weeklyPlan: [weeklyPlanSchema],
  status: {
    type: String,
    enum: ['active', 'paused', 'completed', 'abandoned'],
    default: 'active',
  },
  completionPercentage: { type: Number, default: 0 },
}, { _id: false });

const userPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
    index: true,
  },

  // ── Explicit preferences (user tells us directly) ──
  preferredRole: { type: String, default: '' },
  preferredStack: [String],
  salaryMin: { type: Number, default: 0 },
  salaryCurrency: { type: String, default: 'NGN' },
  remotePreferred: { type: Boolean, default: true },
  targetCountries: [String],
  availableImmediately: { type: Boolean, default: true },
  preferredJobTypes: {
    type: [String],
    enum: ['full-time', 'part-time', 'contract', 'remote', 'hybrid'],
    default: ['full-time'],
  },
  goalStatement: { type: String, default: '' },

  // ── Agent-inferred preferences (learned over time) ──
  learnedPreferences: {
    topSkills: [{
      skill: String,
      confidence: { type: Number, min: 0, max: 1 },
      lastConfirmed: Date,
    }],
    preferredIndustries: [{
      industry: String,
      confidence: { type: Number, min: 0, max: 1 },
    }],
    preferredCompanies: [String],
    applicationFrequency: {
      type: String,
      enum: ['daily', 'weekly', 'occasional', 'never'],
      default: 'occasional',
    },
    bestContactTime: { type: String, default: '' },
    commonWeaknesses: [String],
    improvementProgress: [{
      area: String,
      startedAt: Date,
      status: { type: String, enum: ['in-progress', 'completed', 'not-started'] },
    }],
  },

  // ── Active career goal (set by Career Coach Agent) ──
  activeGoal: activeGoalSchema,

  // ── Agent state persistence ──
  agentStates: {
    type: Map,
    of: new mongoose.Schema({
      lastActive: Date,
      context: mongoose.Schema.Types.Mixed,
      sessionCount: { type: Number, default: 0 },
    }, { _id: false }),
    default: new Map(),
  },

  // ── Metadata ──
  lastInteractionAt: { type: Date, default: Date.now },
  interactionCount: { type: Number, default: 0 },

}, {
  timestamps: true,
});

// Index for quick lookups
userPreferenceSchema.index({ 'activeGoal.status': 1 });
userPreferenceSchema.index({ lastInteractionAt: -1 });

module.exports = mongoose.model('UserPreference', userPreferenceSchema);
```

### Migration: Extend `Conversation.js`

Add a `memory` field to support agent state within conversations:

```js
// Add to existing conversationSchema:
memory: {
  activeAgent: { type: String, default: '' },
  agentContext: { type: mongoose.Schema.Types.Mixed, default: {} },
  pendingGates: [{
    gateId: { type: String, required: true },
    type: {
      type: String,
      enum: ['approve_application', 'confirm_tailor', 'approve_submit', 'confirm_goal'],
      required: true,
    },
    label: String,
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected', 'expired'],
      default: 'pending',
    },
    createdAt: { type: Date, default: Date.now },
    respondedAt: Date,
    responseNotes: String,
  }],
  workflowId: { type: String, default: '' },
  workflowState: { type: mongoose.Schema.Types.Mixed, default: {} },
}
```

---

## 3. ResumeAgent — `src/agents/ResumeAgent.js`

The first specialized agent. Wraps existing resume processing logic into callable tools and adds new LLM-powered capabilities.

### 3.1 Tool Implementations

#### Tool 1: `extract_text_from_file`

Wraps the file-reading logic from `resumeController.js:185-202`.

```js
// src/agents/tools/extractTextFromFile.js
const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');

async function extractTextFromFile({ filePath, mimeType }) {
  let extractedText = '';

  switch (mimeType) {
    case 'application/pdf': {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      extractedText = data.text;
      break;
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword': {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
      break;
    }
    case 'text/plain': {
      extractedText = await fs.readFile(filePath, 'utf8');
      break;
    }
    default:
      throw new Error(`Unsupported file type: ${mimeType}`);
  }

  return { text: extractedText, length: extractedText.length, mimeType };
}
```

#### Tool 2: `ai_parse_resume`

Wraps `AIService.extractResumeData()`.

```js
// src/agents/tools/aiParseResume.js
const aiService = require('../../services/ai/AIService');

async function aiParseResume({ text }) {
  if (!text || text.length < 10) {
    throw new Error('Resume text is too short to parse');
  }
  const extractedData = await aiService.extractResumeData(text);
  return { extractedData, method: 'ai' };
}
```

#### Tool 3: `nlp_extract_resume`

Wraps `resumeExtractor.js` for fallback when AI parsing fails.

```js
// src/agents/tools/nlpExtractResume.js
const extractor = require('../../services/resumeExtractor');

async function nlpExtractResume({ text }) {
  const lines = text.split('\n').filter(Boolean);
  const data = extractor.getEmptyResumeData();

  data.name = extractor.extractNameEnhanced(lines, text);
  data.email = (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || '';
  data.phone = (text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) || [])[0] || '';
  data.location = extractor.extractLocationEnhanced(text);
  data.summary = text.replace(/\s+/g, ' ').trim().substring(0, 400);
  data.skills = extractor.extractSkills(text);
  data.jobTitles = extractor.extractJobExperience(text).titles;
  data.companies = extractor.extractJobExperience(text).companies;

  return { extractedData: data, method: 'nlp' };
}
```

#### Tool 4: `normalize_resume_data`

Wraps `resumeExtractor.normalizeExtractedData()`.

```js
// src/agents/tools/normalizeResumeData.js
const extractor = require('../../services/resumeExtractor');

async function normalizeResumeData({ rawData }) {
  const normalized = extractor.normalizeExtractedData(rawData);
  return { normalizedData: normalized };
}
```

#### Tool 5: `score_resume`

Wraps `resumeScoringService.js`.

```js
// src/agents/tools/scoreResume.js
const resumeScoringService = require('../../services/resumeScoringService');

async function scoreResume({ extractedData }) {
  const score = resumeScoringService.calculateScore(extractedData);
  return {
    score,
    breakdown: {
      skillsCompleteness: score,
      experienceRelevance: score,
      overall: score,
    },
  };
}
```

#### Tool 6: `detect_weak_bullets`

New LLM-powered tool that analyzes work experience bullet points for quality.

```js
// src/agents/tools/detectWeakBullets.js
const aiService = require('../../services/ai/AIService');

async function detectWeakBullets({ workExperience }) {
  if (!workExperience || workExperience.length === 0) {
    return { weakPoints: [], suggestions: [] };
  }

  const prompt = `You are a resume quality analyst. Review each work experience entry and its bullet points. For each bullet point, classify it as STRONG or WEAK using these criteria:

STRONG:
- Starts with a strong action verb (e.g., "Developed", "Led", "Optimized", "Designed")
- Includes quantifiable results (numbers, percentages, money)
- Shows impact on the business or team
- Specific and detailed

WEAK:
- Passive voice (e.g., "Was responsible for", "Was involved in")
- Vague or generic (e.g., "Helped with tasks", "Did work")
- No numbers or metrics
- Reads like a job description, not an achievement

For each WEAK bullet, provide a specific suggestion to improve it.

Work Experience:
${JSON.stringify(workExperience, null, 2)}

Respond with ONLY a JSON array:
[
  {
    "position": "Software Engineer",
    "company": "Acme Corp",
    "bulletPoint": "Responsible for developing features",
    "classification": "WEAK",
    "reason": "Passive voice, no metrics, no impact",
    "suggestion": "Developed 5 customer-facing features that reduced support tickets by 30% using React and Node.js"
  }
]`;

  const response = await aiService.primaryExtractor.generate(prompt, {
    temperature: 0.2,
    maxTokens: 2000,
  });

  // Parse the JSON response
  const jsonMatch = response.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return { weakPoints: [], suggestions: [], error: 'Failed to parse LLM response' };
  }

  const weakPoints = JSON.parse(jsonMatch[0]);
  return {
    weakPoints,
    strongCount: weakPoints.filter(w => w.classification === 'STRONG').length,
    weakCount: weakPoints.filter(w => w.classification === 'WEAK').length,
    suggestions: weakPoints.filter(w => w.suggestion).map(w => ({
      original: w.bulletPoint,
      suggestion: w.suggestion,
      position: w.position,
      company: w.company,
    })),
  };
}
```

#### Tool 7: `extract_domain_keywords`

Wraps `resumeQueryService.extractQuery()`.

```js
// src/agents/tools/extractDomainKeywords.js
const resumeQueryService = require('../../services/resumeQueryService');

async function extractDomainKeywords({ extractedData }) {
  const query = resumeQueryService.extractQuery(extractedData);
  return {
    domain: query.domain || 'unknown',
    keywords: query.keywords || [],
    skills: extractedData.skills || [],
    experience: extractedData.yearsOfExperience || 0,
  };
}
```

#### Tool 8: `tailor_for_job`

New LLM-powered tool that rewrites resume sections to match a specific job description.

```js
// src/agents/tools/tailorForJob.js
const aiService = require('../../services/ai/AIService');

async function tailorForJob({ resumeData, jobDescription, jobTitle, companyName }) {
  if (!resumeData || !jobDescription) {
    throw new Error('Both resumeData and jobDescription are required');
  }

  const prompt = `You are a professional resume tailor. Your job is to rewrite a candidate's resume to maximize match with a specific job description while keeping all facts truthful.

JOB TITLE: ${jobTitle || 'Unknown'}
COMPANY: ${companyName || 'Unknown'}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE RESUME DATA:
${JSON.stringify(resumeData, null, 2)}

INSTRUCTIONS:
1. Rewrite the Professional Summary to emphasize skills and experience relevant to this job
2. Select the 5 most relevant skills from the candidate's skill list; reorder them with job-relevant ones first
3. For each work experience entry, rewrite up to 3 bullet points to emphasize responsibilities that match the job description
4. If the candidate has relevant projects that match the job, list them more prominently
5. Identify up to 3 skills mentioned in the job description that the candidate is missing

Respond ONLY with valid JSON:
{
  "tailoredSummary": "...",
  "reorderedSkills": ["...", "..."],
  "tailoredExperience": [
    {
      "position": "...",
      "company": "...",
      "bulletPoints": ["...", "..."]
    }
  ],
  "highlightedProjects": ["...", "..."],
  "missingSkills": ["...", "..."],
  "changes": [
    "Rewrote summary to emphasize backend experience",
    "Prioritized Laravel and PHP skills"
  ],
  "matchScore": 75
}`;

  const response = await aiService.primaryExtractor.generate(prompt, {
    temperature: 0.3,
    maxTokens: 3000,
  });

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse LLM tailoring response');
  }

  return JSON.parse(jsonMatch[0]);
}
```

### 3.2 ResumeAgent Class

```js
// src/agents/ResumeAgent.js
const Agent = require('./core/Agent');
const { Tool } = require('./core/Tool');
const extractTextFromFile = require('./tools/extractTextFromFile');
const aiParseResume = require('./tools/aiParseResume');
const nlpExtractResume = require('./tools/nlpExtractResume');
const normalizeResumeData = require('./tools/normalizeResumeData');
const scoreResume = require('./tools/scoreResume');
const detectWeakBullets = require('./tools/detectWeakBullets');
const extractDomainKeywords = require('./tools/extractDomainKeywords');
const tailorForJob = require('./tools/tailorForJob');
const Resume = require('../models/Resume');
const { logger } = require('../config/logger');

class ResumeAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: 'extract_text_from_file',
        description: 'Extract raw text from a resume file (PDF, DOCX, DOC, TXT)',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string', description: 'Absolute path to the resume file' },
            mimeType: { type: 'string', description: 'MIME type of the file (application/pdf, etc.)' },
          },
          required: ['filePath', 'mimeType'],
        },
        handler: extractTextFromFile,
      }),
      new Tool({
        name: 'ai_parse_resume',
        description: 'Parse resume text into structured data using AI (extracts name, skills, experience, education, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Raw resume text to parse' },
          },
          required: ['text'],
        },
        handler: aiParseResume,
      }),
      new Tool({
        name: 'nlp_extract_resume',
        description: 'Fallback NLP-based resume extraction when AI parsing fails. Less accurate but always works.',
        inputSchema: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Raw resume text' },
          },
          required: ['text'],
        },
        handler: nlpExtractResume,
      }),
      new Tool({
        name: 'normalize_resume_data',
        description: 'Normalize extracted resume data into a consistent schema, mapping legacy fields',
        inputSchema: {
          type: 'object',
          properties: {
            rawData: { type: 'object', description: 'Raw extracted data from AI or NLP parser' },
          },
          required: ['rawData'],
        },
        handler: normalizeResumeData,
      }),
      new Tool({
        name: 'score_resume',
        description: 'Score resume quality on a scale of 1-10 based on completeness and content',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object', description: 'Normalized resume data' },
          },
          required: ['extractedData'],
        },
        handler: scoreResume,
      }),
      new Tool({
        name: 'detect_weak_bullets',
        description: 'Analyze work experience bullet points and classify them as STRONG or WEAK with improvement suggestions',
        inputSchema: {
          type: 'object',
          properties: {
            workExperience: {
              type: 'array',
              description: 'Array of work experience entries with bullet points',
            },
          },
          required: ['workExperience'],
        },
        handler: detectWeakBullets,
      }),
      new Tool({
        name: 'extract_domain_keywords',
        description: 'Extract job domain and keywords from resume data (e.g., "backend", "Laravel", "PHP")',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object', description: 'Normalized resume data' },
          },
          required: ['extractedData'],
        },
        handler: extractDomainKeywords,
      }),
      new Tool({
        name: 'tailor_for_job',
        description: 'Rewrite resume sections (summary, skills, experience) to maximize match with a specific job description',
        inputSchema: {
          type: 'object',
          properties: {
            resumeData: { type: 'object', description: 'Full candidate resume data' },
            jobDescription: { type: 'string', description: 'Full job description text' },
            jobTitle: { type: 'string', description: 'Job title (optional)' },
            companyName: { type: 'string', description: 'Company name (optional)' },
          },
          required: ['resumeData', 'jobDescription'],
        },
        handler: tailorForJob,
      }),
    ];

    super({
      name: 'ResumeAgent',
      description: 'Analyzes resumes for quality, detects weak bullet points, extracts domain keywords, and tailors resumes for specific job descriptions.',
      tools,
      model: memory?.model,  // Uses shared AIService by default
      memory,
    });

    this.Resume = Resume;
  }

  /**
   * High-level method: analyze a user's stored resume.
   * Orchestrates multiple tool calls automatically without requiring
   * the LLM loop — useful for simple, deterministic workflows.
   */
  async analyze(userId) {
    logger.info(`ResumeAgent: analyze(${userId})`);

    // 1. Load resume from database
    const resume = await this.Resume.findOne({ userId }).lean();
    if (!resume || !resume.filePath) {
      return {
        success: false,
        message: 'No resume found. Please upload a resume first.',
      };
    }

    const extractedText = resume.extractedText || '';
    let extractedData = resume.extractedData || null;

    // 2. If not already processed, run extraction pipeline
    if (!extractedData || !resume.isProcessed) {
      // Extract text from file if needed
      const textResult = extractedText
        ? { text: extractedText }
        : await extractTextFromFile({ filePath: resume.filePath, mimeType: resume.mimeType });

      // Try AI parsing with NLP fallback
      let parseResult;
      try {
        parseResult = await aiParseResume({ text: textResult.text });
      } catch (err) {
        logger.warn(`ResumeAgent: AI parsing failed, using NLP fallback: ${err.message}`);
        parseResult = await nlpExtractResume({ text: textResult.text });
      }

      extractedData = parseResult.extractedData;
    }

    // 3. Normalize
    const { normalizedData } = await normalizeResumeData({ rawData: extractedData });

    // 4. Score
    const { score, breakdown } = await scoreResume({ extractedData: normalizedData });

    // 5. Detect weak points
    const weakPoints = await detectWeakBullets({ workExperience: normalizedData.workExperience || [] });

    // 6. Extract domain
    const domainInfo = await extractDomainKeywords({ extractedData: normalizedData });

    // 7. Store results in memory
    if (this.memory) {
      await this.memory.setContext('ResumeAgent', userId, {
        lastAnalysis: {
          score,
          domain: domainInfo.domain,
          weakPointCount: weakPoints.weakCount,
          analyzedAt: new Date(),
        },
      });

      // Learn skills from resume
      for (const skill of (normalizedData.skills || [])) {
        await this.memory.learnPreference(userId, 'topSkills', {
          skill,
          confidence: 0.5,
          lastConfirmed: new Date(),
        });
      }
    }

    return {
      success: true,
      data: {
        score,
        breakdown,
        weakPoints: weakPoints.weakPoints || [],
        strongBulletCount: weakPoints.strongCount || 0,
        weakBulletCount: weakPoints.weakCount || 0,
        suggestions: weakPoints.suggestions || [],
        domain: domainInfo.domain,
        keywords: domainInfo.keywords,
        skills: normalizedData.skills || [],
        experience: normalizedData.yearsOfExperience || 0,
        summary: normalizedData.summary || '',
        extractedData: normalizedData,
      },
    };
  }

  /**
   * Tailor resume for a specific job.
   */
  async tailorForJob(userId, jobId, jobDescription, jobTitle, companyName) {
    logger.info(`ResumeAgent: tailorForJob(${userId}, ${jobId})`);

    const resume = await this.Resume.findOne({ userId }).lean();
    if (!resume || !resume.extractedData) {
      return { success: false, message: 'No processed resume found.' };
    }

    const tailored = await tailorForJob({
      resumeData: resume.extractedData,
      jobDescription,
      jobTitle,
      companyName,
    });

    // Store in memory for later use
    if (this.memory) {
      await this.memory.setContext('ResumeAgent', userId, {
        lastTailoring: {
          jobId,
          jobTitle,
          companyName,
          matchScore: tailored.matchScore,
          missingSkills: tailored.missingSkills,
          tailoredAt: new Date(),
        },
      });
    }

    return {
      success: true,
      data: tailored,
    };
  }
}

module.exports = ResumeAgent;
```

### 3.3 Tool Files Organization

All tool files live in `src/agents/tools/`:

```
src/agents/tools/
├── extractTextFromFile.js
├── aiParseResume.js
├── nlpExtractResume.js
├── normalizeResumeData.js
├── scoreResume.js
├── detectWeakBullets.js
├── extractDomainKeywords.js
└── tailorForJob.js
```

---

## 4. New Routes

### 4.1 `src/routes/agentRoutes.js`

```js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const agentController = require('../controllers/agentController');
const registry = require('../agents/core/AgentRegistry');

// ── Agent listing ──
router.get('/', auth, (req, res) => {
  res.json({ success: true, data: registry.listDetailed() });
});

router.get('/:name', auth, (req, res) => {
  try {
    const agent = registry.get(req.params.name);
    res.json({
      success: true,
      data: {
        name: agent.name,
        description: agent.description,
        tools: agent.tools.list().map(t => t.toJSON()),
      },
    });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// ── Resume Agent endpoints ──
router.post('/resume/analyze', auth, agentController.analyzeResume);
router.post('/resume/tailor', auth, agentController.tailorResume);
router.post('/resume/weak-points', auth, agentController.detectWeakPoints);
router.get('/resume/status', auth, agentController.resumeStatus);

// ── Memory endpoints ──
router.get('/memory', auth, agentController.getMemory);
router.put('/memory', auth, agentController.updateMemory);

// ── Gate endpoints (for human-in-the-loop) ──
router.get('/gates/pending', auth, agentController.getPendingGates);
router.post('/gates/:gateId/respond', auth, agentController.respondToGate);

// ── Workflow endpoints ──
router.post('/workflow/start', auth, agentController.startWorkflow);
router.get('/workflow/:workflowId/status', auth, agentController.getWorkflowStatus);

module.exports = router;
```

### 4.2 `src/controllers/agentController.js`

```js
const registry = require('../agents/core/AgentRegistry');
const memoryStore = require('../agents/core/MemoryStore');
const Conversation = require('../models/Conversation');
const { logger } = require('../config/logger');

// ── Resume Agent ──

exports.analyzeResume = async (req, res) => {
  try {
    const agent = registry.get('ResumeAgent');
    const result = await agent.analyze(req.user.id);
    res.json(result);
  } catch (err) {
    logger.error(`agentController.analyzeResume: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.tailorResume = async (req, res) => {
  try {
    const { jobId, jobDescription, jobTitle, companyName } = req.body;
    if (!jobId || !jobDescription) {
      return res.status(400).json({
        success: false,
        message: 'jobId and jobDescription are required',
      });
    }

    const agent = registry.get('ResumeAgent');
    const result = await agent.tailorForJob(req.user.id, jobId, jobDescription, jobTitle, companyName);
    res.json(result);
  } catch (err) {
    logger.error(`agentController.tailorResume: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.detectWeakPoints = async (req, res) => {
  try {
    const agent = registry.get('ResumeAgent');
    const result = await agent.analyze(req.user.id);

    if (!result.success) {
      return res.json(result);
    }

    res.json({
      success: true,
      data: {
        weakPoints: result.data.weakPoints,
        strongCount: result.data.strongBulletCount,
        weakCount: result.data.weakBulletCount,
        suggestions: result.data.suggestions,
        score: result.data.score,
      },
    });
  } catch (err) {
    logger.error(`agentController.detectWeakPoints: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.resumeStatus = async (req, res) => {
  try {
    const agent = registry.get('ResumeAgent');
    const context = await agent.memory?.getContext('ResumeAgent', req.user.id);

    res.json({
      success: true,
      data: {
        hasAnalysis: !!context?.lastAnalysis,
        lastAnalyzedAt: context?.lastAnalysis?.analyzedAt || null,
        lastScore: context?.lastAnalysis?.score || null,
        lastTailoring: context?.lastTailoring || null,
      },
    });
  } catch (err) {
    logger.error(`agentController.resumeStatus: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Memory ──

exports.getMemory = async (req, res) => {
  try {
    const prefs = await memoryStore.getPreferences(req.user.id);
    res.json({ success: true, data: prefs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateMemory = async (req, res) => {
  try {
    const allowedFields = [
      'preferredRole', 'preferredStack', 'salaryMin', 'salaryCurrency',
      'remotePreferred', 'targetCountries', 'goalStatement',
    ];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    const prefs = await memoryStore.updatePreferences(req.user.id, updates);
    res.json({ success: true, data: prefs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Human-in-the-loop Gates ──

exports.getPendingGates = async (req, res) => {
  try {
    const conversations = await Conversation.find({
      userId: req.user.id,
      'memory.pendingGates.status': 'pending',
    }).lean();

    const gates = conversations.flatMap(c =>
      (c.memory?.pendingGates || [])
        .filter(g => g.status === 'pending')
        .map(g => ({ ...g, conversationId: c._id }))
    );

    res.json({ success: true, data: gates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.respondToGate = async (req, res) => {
  try {
    const { gateId } = req.params;
    const { decision, notes } = req.body; // decision: 'approved' | 'rejected'

    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'decision must be "approved" or "rejected"' });
    }

    const conversation = await Conversation.findOneAndUpdate(
      {
        userId: req.user.id,
        'memory.pendingGates.gateId': gateId,
        'memory.pendingGates.status': 'pending',
      },
      {
        $set: {
          'memory.pendingGates.$.status': decision,
          'memory.pendingGates.$.respondedAt': new Date(),
          'memory.pendingGates.$.responseNotes': notes || '',
        },
      },
      { new: true }
    );

    if (!conversation) {
      return res.status(404).json({ success: false, message: 'Pending gate not found' });
    }

    res.json({ success: true, data: { gateId, decision } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Workflow ──

exports.startWorkflow = async (req, res) => {
  try {
    const { workflowName, context } = req.body;
    // Workflow engine will be fully integrated in Phase 4
    res.json({
      success: true,
      message: `Workflow "${workflowName}" initiated (stub — full implementation in Phase 4)`,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getWorkflowStatus = async (req, res) => {
  try {
    const { workflowId } = req.params;
    res.json({
      success: true,
      data: {
        workflowId,
        status: 'pending',
        progress: 0,
        message: 'Workflow engine integration pending (Phase 4)',
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
```

### 4.3 Register in `src/app.js`

```js
// Add after existing route registrations (around line 70):
app.use('/api/agents', require('./routes/agentRoutes'));
```

---

## 5. Refactoring Existing Code

### 5.1 `src/controllers/resumeController.js` — Extract Pure Functions

The monolithic `extractTextFromFile()` function (lines 173-359) currently combines:
1. File reading
2. AI extraction with fallback chain
3. NLP fallback
4. Validation
5. Scoring
6. Database persistence

We extract steps 1-5 into `src/services/resumeProcessingService.js` as pure functions, leaving only the orchestration + persistence in the controller.

**New file: `src/services/resumeProcessingService.js`**

```js
const fs = require('fs/promises');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const aiService = require('./ai/AIService');
const extractor = require('./resumeExtractor');
const resumeScoringService = require('./resumeScoringService');
const { logger } = require('../config/logger');

/**
 * Step 1: Extract raw text from a file.
 */
async function extractText(filePath, mimeType) {
  let text = '';
  switch (mimeType) {
    case 'application/pdf': {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      text = data.text;
      break;
    }
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    case 'application/msword': {
      const result = await mammoth.extractRawText({ path: filePath });
      text = result.value;
      break;
    }
    case 'text/plain':
      text = await fs.readFile(filePath, 'utf8');
      break;
  }
  return text;
}

/**
 * Step 2: Parse resume text using AI with NLP fallback.
 * Returns { extractedData, method }.
 */
async function parseResumeText(text) {
  try {
    const data = await aiService.extractResumeData(text);
    if (data && typeof data === 'object') {
      const hasContent = data.name || data.skills?.length > 0 || data.jobTitles?.length > 0 || data.summary;
      if (hasContent) {
        return { extractedData: data, method: 'ai' };
      }
    }
  } catch (err) {
    logger.warn(`AI parsing failed: ${err.message}`);
  }

  // NLP fallback
  logger.info('Using NLP fallback extraction');
  const basic = extractor.getEmptyResumeData();
  const lines = text.split('\n').filter(Boolean);
  basic.name = extractor.extractNameEnhanced(lines, text);
  basic.email = (text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || '';
  basic.phone = (text.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/) || [])[0] || '';
  basic.location = extractor.extractLocationEnhanced(text);
  basic.summary = text.replace(/\s+/g, ' ').trim().substring(0, 400);
  basic.skills = extractor.extractSkills(text);
  const experience = extractor.extractJobExperience(text);
  basic.jobTitles = experience.titles || [];
  basic.companies = experience.companies || [];

  return { extractedData: basic, method: 'nlp' };
}

/**
 * Step 3: Normalize extracted data to schema.
 */
function normalizeData(rawData) {
  return extractor.normalizeExtractedData(rawData);
}

/**
 * Step 4: Score resume quality.
 */
function scoreData(extractedData) {
  return {
    score: resumeScoringService.calculateScore(extractedData),
  };
}

/**
 * Full pipeline: text → parse → normalize → score.
 */
async function processResumeText(filePath, mimeType) {
  const text = await extractText(filePath, mimeType);
  const { extractedData, method } = await parseResumeText(text);
  const normalized = normalizeData(extractedData);
  const { score } = scoreData(normalized);

  return {
    text,
    extractedData: normalized,
    method,
    score,
  };
}

module.exports = {
  extractText,
  parseResumeText,
  normalizeData,
  scoreData,
  processResumeText,
};
```

Then update `resumeController.js` to use the new service:

```js
// In extractTextFromFile, replace the inline logic with:
const resumeProcessingService = require('../services/resumeProcessingService');

async function extractTextFromFile(resumeId, filePath, mimeType) {
  try {
    const result = await resumeProcessingService.processResumeText(filePath, mimeType);

    // Save to DB (this is the I/O part that stays in the controller)
    await Resume.findByIdAndUpdate(resumeId, {
      extractedText: result.text,
      extractedData: result.extractedData,
      resumeScore: result.score,
      isProcessed: true,
      processingStage: 'completed',
      processingProgress: 100,
      processingMessage: `Processed with ${result.method}`,
      processingUpdatedAt: new Date(),
    });

    logger.info(`Resume ${resumeId} processed with ${result.method}, score=${result.score}`);
  } catch (error) {
    logger.error(`Resume ${resumeId} processing failed: ${error.message}`);
    await Resume.findByIdAndUpdate(resumeId, {
      isProcessed: false,
      processingError: error.message,
      processingStage: 'error',
    });
  }
}
```

### 5.2 `src/services/ai/AIService.js` — Add `generate()` Method

Add a simple `generate(prompt, options)` method so agents can send custom prompts:

```js
// New method on AIService:
async generate(prompt, options = {}) {
  const provider = this.primaryExtractor;
  if (!provider) throw new Error('No AI provider configured');
  return provider.generate(prompt, {
    temperature: options.temperature || 0.2,
    maxTokens: options.maxTokens || 2000,
  });
}
```

---

## 6. Bootstrap / Initialization

Create `src/agents/init.js` — called once at server startup to register all agents:

```js
const registry = require('./core/AgentRegistry');
const MemoryStore = require('./core/MemoryStore');
const ResumeAgent = require('./ResumeAgent');
const UserPreference = require('../models/UserPreference');
const redis = require('../config/redis');
const { logger } = require('../config/logger');

let memoryStore;

async function initializeAgents() {
  logger.info('[Agents] Initializing agent system...');

  // Initialize memory store
  memoryStore = new MemoryStore({
    redis,
    userPreferenceModel: UserPreference,
    vectorStore: null, // Will be added in Phase 6
  });

  // Register Resume Agent
  const resumeAgent = new ResumeAgent(memoryStore);
  registry.register(resumeAgent);
  logger.info(`[Agents] Registered: ${resumeAgent.name}`);

  logger.info('[Agents] Agent system initialized successfully');
  logger.info(`[Agents] Available agents: ${registry.list().join(', ')}`);
}

function getMemoryStore() {
  return memoryStore;
}

module.exports = { initializeAgents, getMemoryStore };
```

Call from `server.js`:

```js
// After database connection, add:
const { initializeAgents } = require('./src/agents/init');
await initializeAgents();
```

---

## 7. Tests

### 7.1 Unit: `tests/unit/agents/core/Tool.test.js`

```js
const { Tool, ToolRegistry } = require('../../../../src/agents/core/Tool');

describe('Tool', () => {
  it('creates a tool with required fields', () => {
    const tool = new Tool({
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] },
      handler: async (args) => args.x * 2,
    });
    expect(tool.name).toBe('test_tool');
    expect(tool.description).toBe('A test tool');
  });

  it('validates required fields on execute', async () => {
    const tool = new Tool({
      name: 'test_tool',
      handler: async (args) => args.x,
      inputSchema: { type: 'object', properties: { x: { type: 'number' } }, required: ['x'] },
    });
    await expect(tool.execute({})).rejects.toThrow('missing required');
  });

  it('executes the handler with provided args', async () => {
    const handler = jest.fn(async (args) => args.x + args.y);
    const tool = new Tool({
      name: 'sum',
      handler,
      inputSchema: { type: 'object', properties: { x: {}, y: {} }, required: ['x', 'y'] },
    });
    const result = await tool.execute({ x: 2, y: 3 });
    expect(result).toBe(5);
    expect(handler).toHaveBeenCalledWith({ x: 2, y: 3 });
  });
});

describe('ToolRegistry', () => {
  it('registers and retrieves tools', () => {
    const registry = new ToolRegistry();
    const tool = new Tool({ name: 'my_tool', handler: async () => {} });
    registry.register(tool);
    expect(registry.get('my_tool')).toBe(tool);
  });

  it('throws when getting unregistered tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.get('unknown')).toThrow('not found');
  });

  it('lists all registered tools', () => {
    const registry = new ToolRegistry();
    registry.register(new Tool({ name: 'a', handler: async () => {} }));
    registry.register(new Tool({ name: 'b', handler: async () => {} }));
    expect(registry.list().map(t => t.name)).toEqual(['a', 'b']);
  });
});
```

### 7.2 Unit: `tests/unit/agents/core/Agent.test.js`

```js
const Agent = require('../../../../src/agents/core/Agent');
const { Tool } = require('../../../../src/agents/core/Tool');

describe('Agent', () => {
  it('creates an agent with name and description', () => {
    const agent = new Agent({
      name: 'TestAgent',
      description: 'I am a test agent',
    });
    expect(agent.name).toBe('TestAgent');
    expect(agent.description).toBe('I am a test agent');
  });

  it('registers tools on construction', () => {
    const tool = new Tool({ name: 'greet', handler: async ({ name }) => `Hello ${name}` });
    const agent = new Agent({ name: 'Greeter', tools: [tool] });
    expect(agent.tools.has('greet')).toBe(true);
    expect(agent.tools.list()).toHaveLength(1);
  });

  it('can add tools after construction', () => {
    const agent = new Agent({ name: 'Test' });
    const tool = new Tool({ name: 'later', handler: async () => {} });
    agent.addTool(tool);
    expect(agent.tools.has('later')).toBe(true);
  });

  it('builds a system prompt describing itself and its tools', () => {
    const tool = new Tool({
      name: 'say_hello',
      description: 'Says hello to someone',
      inputSchema: { type: 'object', properties: { name: { type: 'string' } } },
      handler: async () => {},
    });
    const agent = new Agent({ name: 'HelloAgent', description: 'Greets users', tools: [tool] });
    const prompt = agent._buildSystemPrompt();
    expect(prompt).toContain('HelloAgent');
    expect(prompt).toContain('say_hello');
    expect(prompt).toContain('Says hello to someone');
  });

  it('formats task with context', () => {
    const agent = new Agent({ name: 'Test' });
    const formatted = agent._formatTask('Do something', { userId: 'abc' });
    expect(formatted).toContain('Do something');
    expect(formatted).toContain('"userId"');
    expect(formatted).toContain('"abc"');
  });

  it('parses tool calls from LLM response', () => {
    const agent = new Agent({ name: 'Test' });
    const result = agent._parseToolCall('TOOL_CALL: my_tool\nARGS: {"key": "value"}');
    expect(result).toEqual({ name: 'my_tool', args: { key: 'value' } });
  });

  it('returns null for final answer', () => {
    const agent = new Agent({ name: 'Test' });
    const result = agent._parseToolCall('FINAL_ANSWER: Here is the result');
    expect(result).toBeNull();
  });

  it('runs and returns result when model gives final answer', async () => {
    const mockModel = {
      generate: jest.fn().mockResolvedValue({ content: 'FINAL_ANSWER: Done!' }),
    };
    const agent = new Agent({ name: 'Simple', model: mockModel });
    const result = await agent.run('test task');
    expect(result.result).toBe('Done!');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].type).toBe('final');
  });

  it('executes tool calls and loops back to LLM', async () => {
    const callOrder = [];
    const mockModel = {
      generate: jest.fn()
        .mockResolvedValueOnce({ content: 'TOOL_CALL: my_tool\nARGS: {"x": 1}' })
        .mockResolvedValueOnce({ content: 'FINAL_ANSWER: Result is 3' }),
    };
    const tool = new Tool({
      name: 'my_tool',
      handler: async ({ x }) => { callOrder.push('tool'); return x + 2; },
    });
    const agent = new Agent({ name: 'Test', model: mockModel, tools: [tool] });
    const result = await agent.run('test');
    expect(result.result).toBe('Result is 3');
    expect(callOrder).toEqual(['tool']);
    expect(mockModel.generate).toHaveBeenCalledTimes(2);
  });

  it('stops after maxSteps and returns error message', async () => {
    const mockModel = {
      generate: jest.fn().mockResolvedValue({ content: 'TOOL_CALL: loop\nARGS: {}' }),
    };
    const tool = new Tool({
      name: 'loop',
      handler: async () => ({ stillGoing: true }),
    });
    const agent = new Agent({ name: 'LoopAgent', model: mockModel, tools: [tool], maxSteps: 3 });
    const result = await agent.run('test');
    expect(result.result).toContain('unable to complete');
    expect(mockModel.generate).toHaveBeenCalledTimes(3);
  });

  it('handles tool execution errors gracefully', async () => {
    const mockModel = {
      generate: jest.fn()
        .mockResolvedValueOnce({ content: 'TOOL_CALL: broken\nARGS: {}' })
        .mockResolvedValueOnce({ content: 'FINAL_ANSWER: recovered' }),
    };
    const tool = new Tool({
      name: 'broken',
      handler: async () => { throw new Error('Tool crashed'); },
    });
    const agent = new Agent({ name: 'Test', model: mockModel, tools: [tool] });
    const result = await agent.run('test');
    expect(result.result).toBe('recovered');
    expect(result.toolCalls[0].result).toBeUndefined();
    expect(result.steps[0].type).toBe('error');
  });
});
```

### 7.3 Unit: `tests/unit/agents/core/WorkflowEngine.test.js`

```js
const WorkflowEngine = require('../../../../src/agents/core/WorkflowEngine');

describe('WorkflowEngine', () => {
  const makeSimpleWorkflow = () => {
    const nodes = [
      { id: 'start', type: 'start', weight: 0 },
      { id: 'step1', type: 'task', weight: 50, handler: async (ctx) => { ctx.step1Done = true; return 's1'; } },
      { id: 'step2', type: 'task', weight: 50, handler: async (ctx) => { ctx.step2Done = true; return 's2'; } },
      { id: 'end', type: 'end', weight: 0 },
    ];
    const edges = [
      { from: 'start', to: 'step1' },
      { from: 'step1', to: 'step2' },
      { from: 'step2', to: 'end' },
    ];
    return new WorkflowEngine({ nodes, edges });
  };

  it('executes a linear workflow', async () => {
    const engine = makeSimpleWorkflow();
    const { context, status } = await engine.start({});
    expect(status).toBe('completed');
    expect(context.step1Done).toBe(true);
    expect(context.step2Done).toBe(true);
  });

  it('tracks progress', async () => {
    const engine = makeSimpleWorkflow();
    const { context } = await engine.start({});
    expect(engine.getProgress(context)).toBe(100);
  });

  it('evaluates branch conditions', async () => {
    const nodes = [
      { id: 'start', type: 'start', weight: 0 },
      { id: 'check', type: 'branch', weight: 0, handler: async () => {} },
      { id: 'high_route', type: 'task', weight: 50, handler: async (ctx) => { ctx.route = 'high'; } },
      { id: 'low_route', type: 'task', weight: 50, handler: async (ctx) => { ctx.route = 'low'; } },
      { id: 'end', type: 'end', weight: 0 },
    ];
    const edges = [
      { from: 'start', to: 'check' },
      { from: 'check', to: 'high_route', condition: async (ctx) => ctx.score >= 70 },
      { from: 'check', to: 'low_route', condition: async (ctx) => ctx.score < 70 },
      { from: 'high_route', to: 'end' },
      { from: 'low_route', to: 'end' },
    ];
    const engine = new WorkflowEngine({ nodes, edges });

    const highResult = await engine.start({ score: 85 });
    expect(highResult.context.route).toBe('high');

    const lowResult = await engine.start({ score: 40 });
    expect(lowResult.context.route).toBe('low');
  });

  it('executes parallel nodes', async () => {
    let order = [];
    const nodes = [
      { id: 'start', type: 'start', weight: 0 },
      { id: 'parallel_1', type: 'parallel', weight: 0 },
      { id: 'task_a', type: 'task', weight: 30, handler: async (ctx) => { order.push('A'); ctx.a = 'done'; } },
      { id: 'task_b', type: 'task', weight: 30, handler: async (ctx) => { order.push('B'); ctx.b = 'done'; } },
      { id: 'join', type: 'task', weight: 40, handler: async (ctx) => { ctx.joined = true; } },
      { id: 'end', type: 'end', weight: 0 },
    ];
    const edges = [
      { from: 'start', to: 'parallel_1' },
      { from: 'parallel_1', to: 'task_a' },
      { from: 'parallel_1', to: 'task_b' },
      { from: 'task_a', to: 'join' },
      { from: 'task_b', to: 'join' },
      { from: 'join', to: 'end' },
    ];
    const engine = new WorkflowEngine({ nodes, edges });
    const { context } = await engine.start({});
    expect(context.joined).toBe(true);
    expect(context.a).toBe('done');
    expect(context.b).toBe('done');
  });

  it('handles human_gate and returns awaiting_approval', async () => {
    const nodes = [
      { id: 'start', type: 'start', weight: 0 },
      { id: 'approve', type: 'human_gate', weight: 50, label: 'Approve application?',
        buildGateData: async (ctx) => ({ jobTitle: ctx.jobTitle }) },
      { id: 'end', type: 'end', weight: 0 },
    ];
    const edges = [
      { from: 'start', to: 'approve' },
      { from: 'approve', to: 'end' },
    ];
    const engine = new WorkflowEngine({ nodes, edges });
    const result = await engine.start({ jobTitle: 'Software Engineer' });
    expect(result.status).toBe('awaiting_approval');
    expect(result.gate).toBeDefined();
    expect(result.gate.label).toBe('Approve application?');
    expect(result.gate.data.jobTitle).toBe('Software Engineer');
  });

  it('throws on unknown node type', async () => {
    const nodes = [
      { id: 'start', type: 'start', weight: 0 },
      { id: 'bad', type: 'nonexistent', weight: 100, handler: async () => {} },
    ];
    const edges = [{ from: 'start', to: 'bad' }];
    const engine = new WorkflowEngine({ nodes, edges });
    await expect(engine.start({})).rejects.toThrow('Unknown node type');
  });
});
```

### 7.4 Unit: `tests/unit/agents/core/MemoryStore.test.js`

```js
const MemoryStore = require('../../../../src/agents/core/MemoryStore');

describe('MemoryStore', () => {
  let mockRedis;
  let mockUserPreference;
  let store;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
    };
    mockUserPreference = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
      create: jest.fn(),
    };
    store = new MemoryStore({ redis: mockRedis, userPreferenceModel: mockUserPreference });
  });

  describe('short-term context', () => {
    it('gets context from Redis', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ foo: 'bar' }));
      const ctx = await store.getContext('AgentA', 'user1');
      expect(ctx).toEqual({ foo: 'bar' });
      expect(mockRedis.get).toHaveBeenCalledWith('agent:AgentA:user1:session:default');
    });

    it('returns empty object when no context exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      const ctx = await store.getContext('AgentA', 'user1');
      expect(ctx).toEqual({});
    });

    it('sets context merged with existing', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({ existingKey: 'old' }));
      mockRedis.set.mockResolvedValue('OK');

      await store.setContext('AgentA', 'user1', { newKey: 'new' });
      expect(mockRedis.set).toHaveBeenCalled();
      const setArg = JSON.parse(mockRedis.set.mock.calls[0][1]);
      expect(setArg.existingKey).toBe('old');
      expect(setArg.newKey).toBe('new');
      expect(setArg._updatedAt).toBeDefined();
    });

    it('clears context', async () => {
      mockRedis.del.mockResolvedValue(1);
      await store.clearContext('AgentA', 'user1');
      expect(mockRedis.del).toHaveBeenCalledWith('agent:AgentA:user1:session:default');
    });
  });

  describe('long-term preferences', () => {
    it('gets existing preferences', async () => {
      mockUserPreference.findOne.mockResolvedValue({ userId: 'u1', preferredRole: 'Engineer' });
      const prefs = await store.getPreferences('u1');
      expect(prefs.preferredRole).toBe('Engineer');
    });

    it('creates preferences if none exist', async () => {
      mockUserPreference.findOne.mockResolvedValue(null);
      mockUserPreference.create.mockResolvedValue({ userId: 'u1' });
      const prefs = await store.getPreferences('u1');
      expect(mockUserPreference.create).toHaveBeenCalledWith({ userId: 'u1' });
    });

    it('updates preferences', async () => {
      mockUserPreference.findOneAndUpdate.mockResolvedValue({ userId: 'u1', remotePreferred: true });
      await store.updatePreferences('u1', { remotePreferred: true });
      expect(mockUserPreference.findOneAndUpdate).toHaveBeenCalledWith(
        { userId: 'u1' },
        { $set: { remotePreferred: true } },
        { upsert: true, new: true, runValidators: true }
      );
    });
  });
});
```

### 7.5 Unit: `tests/unit/agents/ResumeAgent.test.js`

```js
const ResumeAgent = require('../../../src/agents/ResumeAgent');

describe('ResumeAgent', () => {
  let agent;
  let mockMemory;
  let mockResume;

  beforeEach(() => {
    mockMemory = {
      getContext: jest.fn().mockResolvedValue({}),
      setContext: jest.fn().mockResolvedValue(),
      learnPreference: jest.fn().mockResolvedValue(),
    };
    mockResume = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };

    agent = new ResumeAgent(mockMemory);
    agent.Resume = mockResume;
  });

  it('is created with 8 tools', () => {
    expect(agent.tools.list()).toHaveLength(8);
    expect(agent.tools.has('extract_text_from_file')).toBe(true);
    expect(agent.tools.has('ai_parse_resume')).toBe(true);
    expect(agent.tools.has('nlp_extract_resume')).toBe(true);
    expect(agent.tools.has('normalize_resume_data')).toBe(true);
    expect(agent.tools.has('score_resume')).toBe(true);
    expect(agent.tools.has('detect_weak_bullets')).toBe(true);
    expect(agent.tools.has('extract_domain_keywords')).toBe(true);
    expect(agent.tools.has('tailor_for_job')).toBe(true);
  });

  it('analyze returns error when no resume exists', async () => {
    mockResume.findOne.mockResolvedValue(null);
    const result = await agent.analyze('user123');
    expect(result.success).toBe(false);
    expect(result.message).toContain('No resume found');
  });

  it('analyze processes existing extracted data', async () => {
    mockResume.findOne.mockResolvedValue({
      filePath: '/path/to/resume.pdf',
      mimeType: 'application/pdf',
      extractedText: 'Sample resume text',
      extractedData: {
        name: 'John Doe',
        skills: ['JavaScript', 'Node.js'],
        jobTitles: ['Developer'],
        summary: 'Experienced developer',
        workExperience: [],
        yearsOfExperience: 5,
      },
      isProcessed: true,
    });

    const result = await agent.analyze('user123');
    expect(result.success).toBe(true);
    expect(result.data.score).toBeDefined();
    expect(result.data.domain).toBeDefined();
    expect(result.data.weakPoints).toBeDefined();
  });

  it('tailorForJob returns error when no resume', async () => {
    mockResume.findOne.mockResolvedValue(null);
    const result = await agent.tailorForJob('user123', 'job456', 'Job description text');
    expect(result.success).toBe(false);
  });
});
```

### 7.6 Integration: `tests/integration/agents/resume.test.js`

```js
const request = require('supertest');
const app = require('../../../src/app');
const { initializeAgents } = require('../../../src/agents/init');

beforeAll(async () => {
  await initializeAgents();
});

describe('Resume Agent API', () => {
  let authToken;

  beforeAll(async () => {
    // Register and login a test user
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@test.com', password: 'Password123!' });
    authToken = res.body.data.accessToken;
  });

  describe('GET /api/agents', () => {
    it('lists registered agents', async () => {
      const res = await request(app)
        .get('/api/agents')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      expect(res.body.data.find(a => a.name === 'ResumeAgent')).toBeDefined();
    });
  });

  describe('GET /api/agents/ResumeAgent', () => {
    it('returns agent details', async () => {
      const res = await request(app)
        .get('/api/agents/ResumeAgent')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('ResumeAgent');
      expect(res.body.data.tools.length).toBe(8);
    });
  });

  describe('POST /api/agents/resume/analyze', () => {
    it('returns not-found when user has no resume', async () => {
      const res = await request(app)
        .post('/api/agents/resume/analyze')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('No resume found');
    });
  });

  describe('GET /api/agents/resume/status', () => {
    it('returns resume agent status', async () => {
      const res = await request(app)
        .get('/api/agents/resume/status')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('Memory endpoints', () => {
    it('GET /api/agents/memory returns user preferences', async () => {
      const res = await request(app)
        .get('/api/agents/memory')
        .set('Authorization', `Bearer ${authToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.userId).toBeDefined();
    });

    it('PUT /api/agents/memory updates allowed fields', async () => {
      const res = await request(app)
        .put('/api/agents/memory')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ preferredRole: 'Backend Engineer', remotePreferred: true });
      expect(res.status).toBe(200);
      expect(res.body.data.preferredRole).toBe('Backend Engineer');
    });
  });
});
```

### 7.7 Unit: `tests/unit/services/resumeProcessingService.test.js`

```js
const resumeProcessingService = require('../../../src/services/resumeProcessingService');

jest.mock('pdf-parse', () => jest.fn().mockResolvedValue({ text: 'Mock PDF text' }));
jest.mock('mammoth', () => ({ extractRawText: jest.fn().mockResolvedValue({ value: 'Mock DOCX text' }) }));

describe('resumeProcessingService', () => {
  describe('extractText', () => {
    it('extracts text from PDF', async () => {
      const text = await resumeProcessingService.extractText('test.pdf', 'application/pdf');
      expect(text).toBe('Mock PDF text');
    });

    it('extracts text from DOCX', async () => {
      const text = await resumeProcessingService.extractText('test.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(text).toBe('Mock DOCX text');
    });
  });

  describe('normalizeData', () => {
    it('normalizes extracted data', () => {
      const raw = { name: 'John', skills: ['JS'], job_titles: ['Dev'] };
      const normalized = resumeProcessingService.normalizeData(raw);
      expect(normalized.name).toBe('John');
      expect(normalized.jobTitles).toEqual(['Dev']);
    });
  });
});
```

---

## 8. No New npm Dependencies Required

All Phase 1 functionality wraps existing packages:

| Package | Used By |
|---|---|
| `pdf-parse` | File text extraction |
| `mammoth` | DOCX text extraction |
| `compromise` | NLP fallback extraction |
| `mongoose` | UserPreference model, Conversation extension |
| `ioredis` | Short-term memory cache |
| Google/Groq/xAI APIs | AI provider calls through AIService |
| `express` | New agent routes |

If MongoDB Atlas Vector Search is used later (Phase 6), it's built into MongoDB Atlas — no additional package.

---

## 9. Rollout Checklist

### Before merging:

- [ ] `Tool`, `ToolRegistry` classes work and are tested
- [ ] `Agent` base class runs tool-calling loops correctly
- [ ] `WorkflowEngine` executes linear, branching, parallel, and human-gate workflows
- [ ] `MemoryStore` reads/writes short-term Redis context
- [ ] `MemoryStore` reads/writes long-term MongoDB preferences
- [ ] `UserPreference` model created with correct indexes
- [ ] `Conversation.js` migration adds `memory` field
- [ ] All 8 ResumeAgent tools return correct results
- [ ] `ResumeAgent.analyze()` processes a stored resume end-to-end
- [ ] `ResumeAgent.tailorForJob()` tailors a resume for a JD
- [ ] `resumeProcessingService.js` extracted and existing `resumeController.js` backward-compatible
- [ ] `/api/agents` returns agent list
- [ ] `POST /api/agents/resume/analyze` works
- [ ] `POST /api/agents/resume/tailor` works
- [ ] `GET /api/agents/resume/status` works
- [ ] `GET /api/agents/memory` returns user preferences
- [ ] `PUT /api/agents/memory` updates allowed fields
- [ ] All existing tests still pass
- [ ] ESLint passes
- [ ] No regression in existing resume upload flow

### After merge:

- [ ] Monitor agent response times in production
- [ ] Verify Redis memory usage stays reasonable
- [ ] Check UserPreference collection growth
- [ ] Gather feedback on resume analysis quality
- [ ] Plan Phase 2 tool requirements based on Phase 1 learnings

---

## 10. Files Created / Modified Summary

### New files (13):

| File | Purpose |
|---|---|
| `src/agents/core/Agent.js` | Base agent class with ReAct loop |
| `src/agents/core/Tool.js` | Tool definition + ToolRegistry |
| `src/agents/core/WorkflowEngine.js` | Graph-based workflow engine |
| `src/agents/core/MemoryStore.js` | Two-tier memory system |
| `src/agents/core/AgentRegistry.js` | Central agent registry |
| `src/agents/tools/extractTextFromFile.js` | ResumeAgent tool |
| `src/agents/tools/aiParseResume.js` | ResumeAgent tool |
| `src/agents/tools/nlpExtractResume.js` | ResumeAgent tool |
| `src/agents/tools/normalizeResumeData.js` | ResumeAgent tool |
| `src/agents/tools/scoreResume.js` | ResumeAgent tool |
| `src/agents/tools/detectWeakBullets.js` | ResumeAgent tool |
| `src/agents/tools/extractDomainKeywords.js` | ResumeAgent tool |
| `src/agents/tools/tailorForJob.js` | ResumeAgent tool |
| `src/agents/ResumeAgent.js` | ResumeAgent class |
| `src/agents/init.js` | Bootstrap all agents at startup |
| `src/agents/controllers/agentController.js` | HTTP handlers for agent routes |
| `src/routes/agentRoutes.js` | `/api/agents/*` routes |
| `src/models/UserPreference.js` | Long-term memory model |
| `src/services/resumeProcessingService.js` | Extracted pure functions from resumeController |
| `tests/unit/agents/core/Agent.test.js` | Unit tests |
| `tests/unit/agents/core/Tool.test.js` | Unit tests |
| `tests/unit/agents/core/WorkflowEngine.test.js` | Unit tests |
| `tests/unit/agents/core/MemoryStore.test.js` | Unit tests |
| `tests/unit/agents/ResumeAgent.test.js` | Unit tests |
| `tests/unit/services/resumeProcessingService.test.js` | Unit tests |
| `tests/integration/agents/resume.test.js` | Integration tests |

### Modified files (4):

| File | Change |
|---|---|
| `src/app.js` | Add `app.use('/api/agents', agentRoutes)` |
| `src/controllers/resumeController.js` | Extract pure functions → call `resumeProcessingService` |
| `src/services/ai/AIService.js` | Add `generate()` method for agents |
| `src/models/Conversation.js` | Add `memory` field with `pendingGates`, `workflowState` |
| `server.js` | Call `initializeAgents()` at startup |
