# Phase 4 — Career Coach Agent (Orchestrator)

## Goal

Build the **Career Coach Agent** — the orchestrator "manager" agent that owns the user's overall career goal, plans a multi-week roadmap, delegates tasks to specialized agents, checks progress, and keeps a human in the loop for high-impact decisions.

This is the most architecturally significant phase. It introduces the **WorkflowEngine** (built in Phase 1) as the runtime for multi-step, multi-agent, long-running processes.

---

## Why Phase 4

- The PDF's core vision is an autonomous "Career Coach" that owns the end-to-end goal of "getting hired"
- Every agent built so far (Resume, JobSearch, Match, CoverLetter) reports to the Career Coach
- The WorkflowEngine from Phase 1 is now battle-tested and ready for orchestration
- Human-in-the-loop gates are critical for user trust — the Career Coach asks before applying

---

## 1. CareerCoachAgent — `src/agents/CareerCoachAgent.js`

### 1.1 Agent Overview

| Property | Value |
|---|---|
| Name | `CareerCoachAgent` |
| Description | Orchestrates the entire job search: sets goals, plans weekly roadmaps, delegates to specialized agents, tracks progress, and manages human-in-the-loop approvals. |
| Tools | 6 |
| Sub-agents | ResumeAgent, JobSearchAgent, MatchAgent, CoverLetterAgent (Phases 1-3), InterviewAgent, LearningAgent (Phase 5), ApplicationTrackerAgent (Phase 6) |
| Dependencies | `WorkflowEngine`, `AgentRegistry`, all specialized agents |

### 1.2 Architecture

```
CareerCoachAgent
  |
  |- Owns the Goal: "I want a backend Laravel job in Nigeria paying at least N600k/month"
  |
  |- Plans: Week-by-week roadmap (WorkflowEngine graph)
  |
  |- Delegates:
  |   |- ResumeAgent -> "Analyze my resume"
  |   |- ResumeAgent -> "Tailor for this job"
  |   |- JobSearchAgent -> "Find Laravel jobs in Nigeria"
  |   |- MatchAgent -> "Score these jobs against my resume"
  |   |- CoverLetterAgent -> "Write a cover letter for this job"
  |   |- InterviewAgent -> "Prepare me for this interview" (Phase 5)
  |   |- LearningAgent -> "What skills should I learn?" (Phase 5)
  |   `- ApplicationTrackerAgent -> "Track my applications" (Phase 6)
  |
  |- Checks Progress: Daily check-in with the user
  |
  `- Manages Gates: Asks for approval before:
      |- Submitting an application
      |- Sharing personal information
      |- Making significant resume changes
      `- Committing to a learning plan
```

### 1.3 Tools

#### Tool 1: `define_goal`

Takes the user's natural language goal and structures it into a machine-readable plan.

```js
// src/agents/tools/defineGoal.js
const aiService = require('../../services/ai/AIService');

async function defineGoal({ goalStatement, userPreferences }) {
  const prompt = `Extract structured career goal information from this statement.

GOAL: "${goalStatement}"

USER PREFERENCES (if any):
${JSON.stringify(userPreferences, null, 2)}

Respond with ONLY valid JSON:
{
  "targetRole": "extracted job title",
  "targetIndustry": "extracted industry",
  "technologies": ["array of relevant tech stack items"],
  "locations": ["array of target locations"],
  "salaryMin": number (minimum salary if mentioned, else 0),
  "salaryCurrency": "currency code",
  "remotePreferred": boolean,
  "timeframe": "estimated timeframe (e.g., '3 months')",
  "priorityAreas": ["areas to focus on first"],
  "complexity": "simple" | "moderate" | "complex"
}`;

  const response = await aiService.generate(prompt, { temperature: 0.1, maxTokens: 1000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse goal');
  return JSON.parse(jsonMatch[0]);
}

module.exports = defineGoal;
```

#### Tool 2: `build_roadmap`

Creates a week-by-week plan to achieve the goal. Each week has a focus area, specific tasks, and delegates to the appropriate agent.

```js
// src/agents/tools/buildRoadmap.js
const aiService = require('../../services/ai/AIService');

async function buildRoadmap({ goal, currentSkills, availableWeeks }) {
  const numWeeks = availableWeeks || 12;
  const prompt = `You are a career coach. Build a ${numWeeks}-week roadmap to achieve this career goal.

GOAL:
${JSON.stringify(goal, null, 2)}

CURRENT SKILLS:
${currentSkills.join(', ')}

For each week, specify: the focus area, specific tasks, which agent should handle each task, and success criteria.

Respond with ONLY valid JSON:
{
  "totalWeeks": ${numWeeks},
  "weeks": [
    {
      "week": 1,
      "focus": "Resume Optimization",
      "tasks": [
        { "task": "Analyze current resume", "agent": "ResumeAgent", "estimatedHours": 1 },
        { "task": "Identify weak points", "agent": "ResumeAgent", "estimatedHours": 1 },
        { "task": "Strengthen bullet points", "agent": "ResumeAgent", "estimatedHours": 2 }
      ],
      "successCriteria": "Resume score > 7/10",
      "milestone": "Resume ready for applications"
    }
  ],
  "totalEstimatedHours": number,
  "phases": ["Phase 1: Foundation", "Phase 2: Search", "Phase 3: Apply"]
}`;

  const response = await aiService.generate(prompt, { temperature: 0.2, maxTokens: 3000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse roadmap');
  return JSON.parse(jsonMatch[0]);
}

module.exports = buildRoadmap;
```
#### Tool 3: `check_progress`

Evaluates what the user has completed versus the roadmap plan and suggests next steps.

```js
// src/agents/tools/checkProgress.js
async function checkProgress({ goal, roadmap, completedTasks, userContext }) {
  const totalTasks = roadmap.weeks.reduce((sum, w) => sum + w.tasks.length, 0);
  const completedCount = completedTasks.length;
  const percentComplete = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  const now = new Date();
  const goalStart = new Date(goal.startedAt || now);
  const weeksElapsed = Math.floor((now - goalStart) / (7 * 24 * 60 * 60 * 1000));
  const currentWeek = Math.min(weeksElapsed + 1, roadmap.totalWeeks);

  const weeksWithCompletedTasks = new Set(completedTasks.map(t => t.week));
  const weeksCompleted = weeksWithCompletedTasks.size;
  const isOnTrack = weeksCompleted >= currentWeek - 1;

  const currentWeekPlan = roadmap.weeks.find(w => w.week === currentWeek);
  const incompleteTasks = (currentWeekPlan?.tasks || []).filter(
    t => !completedTasks.find(ct => ct.task === t.task)
  );

  return {
    percentComplete, weeksElapsed, currentWeek, weeksCompleted,
    totalWeeks: roadmap.totalWeeks, isOnTrack,
    currentFocus: currentWeekPlan?.focus || "Planning",
    incompleteTasks,
    nextMilestone: currentWeekPlan?.milestone || "Complete current week",
    encouragement: isOnTrack
      ? "Great progress! Keep up the momentum."
      : "Let's focus on catching up this week. I can help prioritize.",
  };
}
module.exports = checkProgress;
```

#### Tool 4: `delegate_task`

Sends a task to the appropriate sub-agent and returns the result. This is the core orchestration mechanism.

```js
// src/agents/tools/delegateTask.js
const registry = require("../core/AgentRegistry");
const { logger } = require("../../config/logger");

async function delegateTask({ agentName, task, params, userId }) {
  logger.info(`CareerCoach: delegating to ${agentName}: "${task}"`);
  const agent = registry.get(agentName);
  if (!agent) throw new Error(`Agent "${agentName}" not found. Available: ${registry.list().join(", ")}`);

  let result;
  switch (agentName) {
    case "ResumeAgent":
      if (task === "analyze") result = await agent.analyze(userId);
      else if (task === "tailor") result = await agent.tailorForJob(userId, params.jobId, params.jobDescription, params.jobTitle, params.companyName);
      else result = await agent.run(task, params);
      break;
    case "JobSearchAgent":
      if (task === "search") result = await agent.searchJobs(userId, params.query, params.location, params.options || {});
      else result = await agent.run(task, params);
      break;
    case "MatchAgent":
      if (task === "match") result = await agent.matchJob(userId, params.job, params.resumeData);
      else if (task === "match_batch") result = await agent.matchJobs(userId, params.jobs, params.domain);
      else result = await agent.run(task, params);
      break;
    case "CoverLetterAgent":
      if (task === "generate") result = await agent.generate(userId, params.jobTitle, params.companyName, params.jobDescription, params.options || {});
      else result = await agent.run(task, params);
      break;
    default:
      result = await agent.run(task, params);
  }
  return result;
}
module.exports = delegateTask;
```

#### Tool 5: `create_approval_gate`

Creates a human-in-the-loop gate that pauses execution until the user approves or rejects.

```js
// src/agents/tools/createApprovalGate.js
const Conversation = require("../../models/Conversation");

async function createApprovalGate({ userId, type, label, data, conversationId }) {
  const gate = {
    gateId: `gate_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    type, label: label || "Requesting approval", data,
    status: "pending", createdAt: new Date(),
  };
  await Conversation.findOneAndUpdate(
    { userId, _id: conversationId },
    { $push: { "memory.pendingGates": gate } }
  );
  return { gate, message: `Approval needed: ${label}`, status: "awaiting_approval" };
}
module.exports = createApprovalGate;
```

#### Tool 6: `summarize_progress`

Produces a human-readable summary of the user"s career journey so far.

```js
// src/agents/tools/summarizeProgress.js
async function summarizeProgress({ goal, roadmap, completedTasks, applications, interviews }) {
  const totalTasks = roadmap.weeks.reduce((sum, w) => sum + w.tasks.length, 0);
  const completedCount = completedTasks.length;
  const appCount = applications?.length || 0;
  const interviewCount = interviews?.length || 0;

  const applied = applications?.filter(a => a.status === "applied").length || 0;
  const interviewing = applications?.filter(a => a.status === "interviewing").length || 0;
  const offers = applications?.filter(a => a.status === "offer").length || 0;

  return {
    goal: goal.statement, startedAt: goal.startedAt, deadline: goal.deadline,
    overallProgress: `${Math.round((completedCount / totalTasks) * 100)}%`,
    tasksCompleted: `${completedCount}/${totalTasks}`,
    applications: { total: appCount, applied, interviewing, offers },
    interviews: interviewCount,
    nextMilestone: roadmap.weeks.find(w => !w.completed)?.milestone || "All milestones completed!",
    weeksRemaining: roadmap.totalWeeks - (roadmap.weeks.filter(w => w.completed).length),
  };
}
module.exports = summarizeProgress;
```
### 1.4 CareerCoachAgent Class

```js
// src/agents/CareerCoachAgent.js
const Agent = require("./core/Agent");
const { Tool } = require("./core/Tool");
const WorkflowEngine = require("./core/WorkflowEngine");
const defineGoal = require("./tools/defineGoal");
const buildRoadmap = require("./tools/buildRoadmap");
const checkProgress = require("./tools/checkProgress");
const delegateTask = require("./tools/delegateTask");
const createApprovalGate = require("./tools/createApprovalGate");
const summarizeProgress = require("./tools/summarizeProgress");
const { logger } = require("../config/logger");

class CareerCoachAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: "define_goal",
        description: "Parse a users natural language career goal into a structured plan.",
        inputSchema: { type: "object", properties: {
          goalStatement: { type: "string" },
          userPreferences: { type: "object" },
        }, required: ["goalStatement"] },
        handler: defineGoal,
      }),
      new Tool({
        name: "build_roadmap",
        description: "Create a week-by-week roadmap with tasks, agent assignments, and success criteria.",
        inputSchema: { type: "object", properties: {
          goal: { type: "object" }, currentSkills: { type: "array" }, availableWeeks: { type: "number" },
        }, required: ["goal", "currentSkills"] },
        handler: buildRoadmap,
      }),
      new Tool({
        name: "check_progress",
        description: "Evaluate progress against the roadmap. Returns completion %, incomplete tasks, next steps.",
        inputSchema: { type: "object", properties: {
          goal: { type: "object" }, roadmap: { type: "object" },
          completedTasks: { type: "array" }, userContext: { type: "object" },
        }, required: ["goal", "roadmap", "completedTasks"] },
        handler: checkProgress,
      }),
      new Tool({
        name: "delegate_task",
        description: "Delegate a task to a specialized sub-agent (ResumeAgent, JobSearchAgent, etc.).",
        inputSchema: { type: "object", properties: {
          agentName: { type: "string" }, task: { type: "string" },
          params: { type: "object" }, userId: { type: "string" },
        }, required: ["agentName", "task", "userId"] },
        handler: delegateTask,
      }),
      new Tool({
        name: "create_approval_gate",
        description: "Pause and ask the user to approve or reject a high-impact action.",
        inputSchema: { type: "object", properties: {
          userId: { type: "string" }, type: { type: "string" },
          label: { type: "string" }, data: { type: "object" },
          conversationId: { type: "string" },
        }, required: ["userId", "type", "label"] },
        handler: createApprovalGate,
      }),
      new Tool({
        name: "summarize_progress",
        description: "Generate a comprehensive progress summary.",
        inputSchema: { type: "object", properties: {
          goal: { type: "object" }, roadmap: { type: "object" },
          completedTasks: { type: "array" }, applications: { type: "array" },
          interviews: { type: "array" },
        }, required: ["goal", "roadmap", "completedTasks"] },
        handler: summarizeProgress,
      }),
    ];
    super({
      name: "CareerCoachAgent",
      description: "Orchestrates the entire job search journey. Defines career goals, builds weekly roadmaps, delegates to specialized agents, tracks progress, and manages approvals.",
      tools, memory,
    });
  }

  async setGoal(userId, goalStatement) {
    logger.info(`CareerCoach: setGoal(${userId})`);
    const prefs = this.memory ? await this.memory.getPreferences(userId) : {};
    const parsed = await defineGoal({ goalStatement, userPreferences: prefs });

    let currentSkills = [];
    try {
      const resumeResult = await delegateTask({ agentName: "ResumeAgent", task: "analyze", params: {}, userId });
      currentSkills = resumeResult.data?.skills || [];
    } catch (err) {
      logger.warn(`CareerCoach: could not get skills: ${err.message}`);
    }

    const roadmap = await buildRoadmap({ goal: parsed, currentSkills, availableWeeks: 12 });

    if (this.memory) {
      await this.memory.updatePreferences(userId, {
        preferredRole: parsed.targetRole, preferredStack: parsed.technologies,
        salaryMin: parsed.salaryMin, salaryCurrency: parsed.salaryCurrency,
        remotePreferred: parsed.remotePreferred, targetCountries: parsed.locations, goalStatement,
        activeGoal: {
          statement: goalStatement, startedAt: new Date(),
          deadline: new Date(Date.now() + roadmap.totalWeeks * 7 * 24 * 60 * 60 * 1000),
          weeklyPlan: roadmap.weeks, status: "active", completionPercentage: 0,
        },
      });
      await this.memory.setContext("CareerCoachAgent", userId, {
        currentGoal: parsed, roadmap, completedTasks: [], startedAt: new Date(),
      });
    }
    return {
      success: true,
      data: { parsedGoal: parsed, roadmap, currentSkills,
        summary: `Goal set: ${parsed.targetRole} in ${parsed.locations?.join(", ") || "your area"}. Roadmap covers ${roadmap.totalWeeks} weeks.` },
    };
  }

  async dailyCheckin(userId) {
    logger.info(`CareerCoach: dailyCheckin(${userId})`);
    const context = this.memory ? await this.memory.getContext("CareerCoachAgent", userId) : {};
    const prefs = this.memory ? await this.memory.getPreferences(userId) : {};
    if (!context.roadmap || !prefs.activeGoal) {
      return { success: false, message: "No active career goal. Set a goal first." };
    }
    const progress = await checkProgress({
      goal: prefs.activeGoal, roadmap: context.roadmap,
      completedTasks: context.completedTasks || [],
    });
    let pendingGates = [];
    try {
      const Conversation = require("../models/Conversation");
      const conv = await Conversation.findOne({ userId, "memory.pendingGates.status": "pending" }).lean();
      pendingGates = conv?.memory?.pendingGates?.filter(g => g.status === "pending") || [];
    } catch (err) {}
    return {
      success: true,
      data: { progress, pendingApprovals: pendingGates.length,
        nextSteps: progress.incompleteTasks.slice(0, 3).map(t => t.task),
        message: progress.isOnTrack
          ? `You are on track! Today: ${progress.incompleteTasks[0]?.task || "review progress"}`
          : `Lets catch up. ${progress.incompleteTasks.length} tasks to focus on.`,
        encouragement: progress.encouragement },
    };
  }

  async runFullWorkflow(userId, options = {}) {
    logger.info(`CareerCoach: runFullWorkflow(${userId})`);
    const context = this.memory ? await this.memory.getContext("CareerCoachAgent", userId) : {};
    const prefs = this.memory ? await this.memory.getPreferences(userId) : {};
    if (!context.roadmap || !prefs.activeGoal) {
      return { success: false, message: "No active goal. Call setGoal first." };
    }

    const workflowNodes = [
      { id: "start", type: "start", weight: 0 },
      { id: "analyze_resume", type: "agent_task", weight: 10, agentName: "ResumeAgent", task: "analyze" },
      { id: "search_jobs", type: "agent_task", weight: 20, agentName: "JobSearchAgent", task: "search",
        taskParams: { query: prefs.preferredRole, location: prefs.targetCountries?.[0] } },
      { id: "score_jobs", type: "agent_task", weight: 15, agentName: "MatchAgent", task: "match_batch" },
      { id: "check_scores", type: "branch", weight: 0 },
      { id: "approve_top", type: "human_gate", weight: 5, label: "Approve top matches?",
        buildGateData: async (ctx) => ({ topJobs: ctx.scored_jobs?.slice(0, 5) }) },
      { id: "tailor_resume", type: "agent_task", weight: 10, agentName: "ResumeAgent", task: "tailor" },
      { id: "write_cover_letter", type: "agent_task", weight: 10, agentName: "CoverLetterAgent", task: "generate" },
      { id: "approve_submit", type: "human_gate", weight: 5, label: "Submit application?",
        buildGateData: async (ctx) => ({ resume: ctx.tailor_resume, coverLetter: ctx.write_cover_letter }) },
      { id: "submit", type: "task", weight: 5, handler: async (ctx) => { ctx.submitted = true; } },
      { id: "track", type: "agent_task", weight: 5, agentName: "ApplicationTrackerAgent", task: "log" },
      { id: "suggest_gaps", type: "agent_task", weight: 10, agentName: "MatchAgent", task: "analyze_gaps" },
      { id: "end", type: "end", weight: 0 },
    ];

    const workflowEdges = [
      { from: "start", to: "analyze_resume" },
      { from: "analyze_resume", to: "search_jobs" },
      { from: "search_jobs", to: "score_jobs" },
      { from: "score_jobs", to: "check_scores" },
      { from: "check_scores", to: "approve_top", condition: async (ctx) => ctx.scored_jobs?.[0]?.score >= 60 },
      { from: "check_scores", to: "suggest_gaps", condition: async (ctx) => (ctx.scored_jobs?.[0]?.score || 0) < 60 },
      { from: "approve_top", to: "tailor_resume", condition: async (ctx) => ctx._pendingGate?.status === "approved" },
      { from: "approve_top", to: "end", condition: async (ctx) => ctx._pendingGate?.status === "rejected" },
      { from: "tailor_resume", to: "write_cover_letter" },
      { from: "write_cover_letter", to: "approve_submit" },
      { from: "approve_submit", to: "submit", condition: async (ctx) => ctx._pendingGate?.status === "approved" },
      { from: "approve_submit", to: "end", condition: async (ctx) => ctx._pendingGate?.status === "rejected" },
      { from: "submit", to: "track" },
      { from: "track", to: "end" },
      { from: "suggest_gaps", to: "end" },
    ];

    const engine = new WorkflowEngine({ nodes: workflowNodes, edges: workflowEdges });
    engine.agentRegistry = require("./core/AgentRegistry");
    return engine.start({ userId, goal: prefs.activeGoal, preferences: prefs });
  }
}
module.exports = CareerCoachAgent;
```

---

## 2. Integrating WorkflowEngine with the Agent System

The `agent_task` node type in the WorkflowEngine delegates to registered agents:

```js
// In WorkflowEngine._executeNode(), add to switch:
case "agent_task": {
  const agent = this.agentRegistry?.get(node.agentName);
  if (!agent) throw new Error(`Agent "${node.agentName}" not registered`);
  const taskParams = node.taskParams || {};
  result = await agent.run(node.task || "", { userId: context.userId, ...taskParams });
  context[node.id] = result;
  break;
}
```

---

## 3. New Routes

Add to `src/routes/agentRoutes.js`:

```js
router.post("/coach/goal", auth, agentController.setGoal);
router.get("/coach/checkin", auth, agentController.dailyCheckin);
router.get("/coach/progress", auth, agentController.getProgress);
router.post("/coach/workflow", auth, agentController.runWorkflow);
```

Add to `src/controllers/agentController.js`:

```js
exports.setGoal = async (req, res) => {
  try {
    const { goalStatement } = req.body;
    if (!goalStatement) return res.status(400).json({ success: false, message: "goalStatement is required" });
    const agent = registry.get("CareerCoachAgent");
    const result = await agent.setGoal(req.user.id, goalStatement);
    res.json(result);
  } catch (err) {
    logger.error(`agentController.setGoal: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.dailyCheckin = async (req, res) => {
  try {
    const agent = registry.get("CareerCoachAgent");
    const result = await agent.dailyCheckin(req.user.id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getProgress = async (req, res) => {
  try {
    const context = await memoryStore.getContext("CareerCoachAgent", req.user.id);
    const prefs = await memoryStore.getPreferences(req.user.id);
    if (!context.roadmap) return res.json({ success: false, message: "No active goal" });
    const progress = await checkProgress({ goal: prefs.activeGoal, roadmap: context.roadmap, completedTasks: context.completedTasks || [] });
    const summary = await summarizeProgress({ goal: prefs.activeGoal, roadmap: context.roadmap, completedTasks: context.completedTasks || [] });
    res.json({ success: true, data: { progress, summary } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.runWorkflow = async (req, res) => {
  try {
    const agent = registry.get("CareerCoachAgent");
    const result = await agent.runFullWorkflow(req.user.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
```

---

## 4. Register in `src/agents/init.js`

```js
const CareerCoachAgent = require("./CareerCoachAgent");
const careerCoachAgent = new CareerCoachAgent(memoryStore);
registry.register(careerCoachAgent);
logger.info(`[Agents] Registered: ${careerCoachAgent.name}`);
```

---

## 5. The "Find Me My Next Job" Workflow

```
User: "Find me my next job"
  |
  `- CareerCoachAgent.runFullWorkflow()
      |
      |- [ResumeAgent.analyze] -> Resume score: 7.2, Domain: Backend
      |- [JobSearchAgent.search] -> Found 143 jobs -> Dedup 112 -> Scam filter 89 -> Skill filter 27
      |- [MatchAgent.match_batch] -> Top match: Senior Laravel Dev at TechCorp (87%)
      |- [BRANCH] Score >= 60%? -> YES
      |- [HUMAN GATE] "Approve top 5 matches?" -> User approves
      |- [ResumeAgent.tailor] -> Resume tailored for TechCorp (score improved 7.2 -> 8.5)
      |- [CoverLetterAgent.generate] -> Letter drafted referencing payment system project
      |- [HUMAN GATE] "Submit application to TechCorp?" -> User approves
      |- [ApplicationTrackerAgent.log] -> Application tracked: Applied
      `- Done. User applied with tailored resume + cover letter.
```

---

## 6. Tests

### Unit: `tests/unit/agents/CareerCoachAgent.test.js`

```js
const CareerCoachAgent = require("../../../src/agents/CareerCoachAgent");

describe("CareerCoachAgent", () => {
  let agent, mockMemory;
  beforeEach(() => {
    mockMemory = {
      getContext: jest.fn().mockResolvedValue({}),
      setContext: jest.fn().mockResolvedValue(),
      getPreferences: jest.fn().mockResolvedValue({}),
      updatePreferences: jest.fn().mockResolvedValue({}),
    };
    agent = new CareerCoachAgent(mockMemory);
  });

  it("is created with 6 tools", () => {
    expect(agent.tools.list()).toHaveLength(6);
    expect(agent.tools.has("define_goal")).toBe(true);
    expect(agent.tools.has("build_roadmap")).toBe(true);
    expect(agent.tools.has("check_progress")).toBe(true);
    expect(agent.tools.has("delegate_task")).toBe(true);
    expect(agent.tools.has("create_approval_gate")).toBe(true);
    expect(agent.tools.has("summarize_progress")).toBe(true);
  });

  describe("check_progress", () => {
    it("returns accurate progress metrics", async () => {
      const tool = agent.tools.get("check_progress");
      const roadmap = { totalWeeks: 4, weeks: [
        { week: 1, tasks: [{ task: "A" }, { task: "B" }], milestone: "M1" },
        { week: 2, tasks: [{ task: "C" }], milestone: "M2" },
      ]};
      const result = await tool.execute({
        goal: { statement: "Test", startedAt: new Date() }, roadmap,
        completedTasks: [{ task: "A", week: 1 }, { task: "B", week: 1 }],
      });
      expect(result.percentComplete).toBe(66);
      expect(result.isOnTrack).toBe(true);
    });

    it("detects when behind schedule", async () => {
      const tool = agent.tools.get("check_progress");
      const roadmap = { totalWeeks: 4, weeks: [{ week: 1, tasks: [{ task: "A" }], milestone: "M1" }] };
      const threeWeeksAgo = new Date(Date.now() - 21 * 24 * 60 * 60 * 1000);
      const result = await tool.execute({
        goal: { statement: "Test", startedAt: threeWeeksAgo }, roadmap,
        completedTasks: [{ task: "A", week: 1 }],
      });
      expect(result.isOnTrack).toBe(false);
    });
  });

  describe("create_approval_gate", () => {
    it("creates a pending gate", async () => {
      const Conversation = require("../../../src/models/Conversation");
      Conversation.findOneAndUpdate = jest.fn().mockResolvedValue({});
      const tool = agent.tools.get("create_approval_gate");
      const result = await tool.execute({
        userId: "user1", type: "approve_application", label: "Submit?",
        data: { jobTitle: "Developer" }, conversationId: "conv1",
      });
      expect(result.status).toBe("awaiting_approval");
      expect(result.gate.status).toBe("pending");
    });
  });
});
```

---

## 7. Files Created / Modified Summary

### New files (7):

| File | Purpose |
|---|---|
| `src/agents/CareerCoachAgent.js` | Orchestrator agent class |
| `src/agents/tools/defineGoal.js` | Tool: parse goal from natural language |
| `src/agents/tools/buildRoadmap.js` | Tool: create weekly roadmap |
| `src/agents/tools/checkProgress.js` | Tool: evaluate progress vs roadmap |
| `src/agents/tools/delegateTask.js` | Tool: dispatch to sub-agents |
| `src/agents/tools/createApprovalGate.js` | Tool: create human-in-the-loop gate |
| `src/agents/tools/summarizeProgress.js` | Tool: produce progress summary |
| `tests/unit/agents/CareerCoachAgent.test.js` | Unit tests |

### Modified files (3):

| File | Change |
|---|---|
| `src/agents/core/WorkflowEngine.js` | Add `agent_task` node type support |
| `src/agents/init.js` | Register CareerCoachAgent |
| `src/routes/agentRoutes.js` | Add coach endpoints |
| `src/controllers/agentController.js` | Add coach handlers |

---

## 8. Rollout Checklist

- [ ] CareerCoachAgent can parse a goal statement into structured data
- [ ] Roadmap builder creates a sensible week-by-week plan
- [ ] Progress checker accurately reports completion %
- [ ] delegate_task routes correctly to each registered agent
- [ ] Approval gates pause workflow execution correctly
- [ ] WorkflowEngine handles agent_task node type
- [ ] Full "Find me my next job" workflow runs
- [ ] /api/agents/coach/goal endpoint works
- [ ] /api/agents/coach/checkin endpoint works
- [ ] /api/agents/coach/progress endpoint works
- [ ] Goal + roadmap persist in UserPreference collection
- [ ] All existing tests pass
- [ ] ESLint passes
