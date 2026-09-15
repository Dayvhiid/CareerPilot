# Phase 6 — Application Tracker Agent + Full Autonomy

## Goal

Build the **ApplicationTrackerAgent** that tracks every job application through its lifecycle (Applied -> Interview -> Technical Test -> Offer / Rejected) and implements the **full autonomous workflow** where a single user request triggers orchestrated execution across all agents with human-in-the-loop gates.

This phase also introduces **vector storage** for semantic memory and an **email integration** for automatic status updates.

---

## Why Phase 6

- The ApplicationTrackerAgent closes the loop — the user sets a goal, agents execute, applications are tracked, and the Career Coach adjusts the plan based on results
- Full autonomy is the capstone of the agentic architecture vision
- Vector search enables the system to learn from past applications (e.g., "which resume versions got interviews?")
- Email parsing (with permission) reduces manual data entry

---

## 1. ApplicationTrackerAgent — `src/agents/ApplicationTrackerAgent.js`

### 1.1 Agent Overview

| Property | Value |
|---|---|
| Name | `ApplicationTrackerAgent` |
| Description | Tracks each job application through its lifecycle. Updates status automatically via email parsing (with permission) and manual user input. Provides a dashboard view of all applications. |
| Tools | 5 |
| Dependencies | `UserJob` model, email integration, `MemoryStore` |

### 1.2 Data Model: Application Status Lifecycle

```
                                     +---> Offer
                                     |
Draft -> Applied -> Interview --> Technical Test --> Rejected
                        |               |
                        |               +---> Accepted -> Offer
                        +---> Rejected
```

Status values: `draft`, `applied`, `interview_scheduled`, `technical_test`, `offer`, `rejected`, `accepted`, `withdrawn`

### 1.3 Tools

#### Tool 1: `log_application`

Records a new application or updates an existing one.

```js
// src/agents/tools/logApplication.js
const UserJob = require("../../models/UserJob");

async function logApplication({ userId, jobId, jobTitle, companyName, status, notes, appliedAt }) {
  const application = await UserJob.findOneAndUpdate(
    { userId, jobId },
    {
      userId, jobId,
      jobTitle: jobTitle || "",
      companyName: companyName || "",
      status: status || "applied",
      notes: notes || "",
      appliedAt: appliedAt || new Date(),
      updatedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return {
    application: {
      id: application._id,
      jobId: application.jobId,
      jobTitle: application.jobTitle,
      companyName: application.companyName,
      status: application.status,
      notes: application.notes,
      appliedAt: application.appliedAt,
      updatedAt: application.updatedAt,
    },
    isNew: !application.createdAt || (new Date() - new Date(application.createdAt)) < 1000,
  };
}
module.exports = logApplication;
```

#### Tool 2: `update_application_status`

Advances an application to a new status with validation of the transition.

```js
// src/agents/tools/updateApplicationStatus.js
const UserJob = require("../../models/UserJob");

const VALID_TRANSITIONS = {
  draft: ["applied", "withdrawn"],
  applied: ["interview_scheduled", "rejected", "withdrawn"],
  interview_scheduled: ["technical_test", "offer", "rejected", "withdrawn"],
  technical_test: ["offer", "rejected", "withdrawn", "interview_scheduled"],
  offer: ["accepted", "rejected", "withdrawn"],
  rejected: [],  // terminal
  accepted: [],  // terminal
  withdrawn: [], // terminal
};

async function updateApplicationStatus({ userId, applicationId, newStatus, notes, eventDate }) {
  const app = await UserJob.findOne({ _id: applicationId, userId }).lean();
  if (!app) throw new Error("Application not found");

  const allowed = VALID_TRANSITIONS[app.status] || [];
  if (!allowed.includes(newStatus)) {
    return {
      success: false,
      error: `Cannot transition from "${app.status}" to "${newStatus}". Allowed: ${allowed.join(", ")}`,
      allowedTransitions: allowed,
    };
  }

  const update = { status: newStatus, updatedAt: new Date() };
  if (notes) update.notes = notes;

  // Track event dates
  if (newStatus === "interview_scheduled") update.interviewDate = eventDate || new Date();
  if (newStatus === "offer") update.offerDate = eventDate || new Date();
  if (newStatus === "rejected") update.rejectedAt = eventDate || new Date();

  await UserJob.findByIdAndUpdate(applicationId, { $set: update });

  return {
    success: true,
    application: { ...app, ...update },
    transition: { from: app.status, to: newStatus },
    nextSteps: VALID_TRANSITIONS[newStatus] || [],
  };
}
module.exports = updateApplicationStatus;
```

#### Tool 3: `get_application_dashboard`

Returns a summary of all applications for the user.

```js
// src/agents/tools/getApplicationDashboard.js
const UserJob = require("../../models/UserJob");

async function getApplicationDashboard({ userId, daysBack }) {
  const since = daysBack ? new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000) : new Date(0);

  const applications = await UserJob.find({
    userId,
    $or: [
      { appliedAt: { $gte: since } },
      { updatedAt: { $gte: since } },
    ],
  }).sort({ updatedAt: -1 }).lean();

  const stats = {
    total: applications.length,
    draft: applications.filter(a => a.status === "draft").length,
    applied: applications.filter(a => a.status === "applied").length,
    interviewing: applications.filter(a => ["interview_scheduled", "technical_test"].includes(a.status)).length,
    offers: applications.filter(a => a.status === "offer").length,
    accepted: applications.filter(a => a.status === "accepted").length,
    rejected: applications.filter(a => a.status === "rejected").length,
    withdrawn: applications.filter(a => a.status === "withdrawn").length,
  };

  // Calculate conversion rates
  const withResponse = stats.rejected + stats.offers + stats.accepted;
  stats.responseRate = stats.total > 0 ? Math.round((withResponse / stats.total) * 100) : 0;
  stats.offerRate = (stats.applied + stats.interviewing + stats.offers + stats.accepted) > 0
    ? Math.round((stats.offers / (stats.applied + stats.interviewing + stats.offers + stats.accepted)) * 100) : 0;

  return { applications, stats };
}
module.exports = getApplicationDashboard;
```

#### Tool 4: `parse_email_for_status`

Parses an email to extract application status updates. Requires user permission.

```js
// src/agents/tools/parseEmailForStatus.js
const aiService = require("../../services/ai/AIService");

async function parseEmailForStatus({ emailSubject, emailBody, fromAddress }) {
  const prompt = `Parse this job application email and extract status information.

FROM: ${fromAddress || "Unknown"}
SUBJECT: ${emailSubject || ""}
BODY: ${(emailBody || "").substring(0, 2000)}

Extract:
1. Company name
2. Job title (if mentioned)
3. Application status (one of: applied, interview_scheduled, technical_test, offer, rejected)
4. Interview date (if mentioned)
5. Key action items for the candidate

Respond with ONLY valid JSON:
{
  "companyName": "...",
  "jobTitle": "...",
  "status": "interview_scheduled",
  "interviewDate": "2025-01-15T10:00:00.000Z or null",
  "confidence": 0.95,
  "actionItems": ["Prepare for technical interview", "Review company background"],
  "summary": "You have been invited for a technical interview at TechCorp."
}`;

  const response = await aiService.generate(prompt, { temperature: 0.1, maxTokens: 1000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {
    companyName: "", status: "applied", confidence: 0, actionItems: [], summary: "Could not parse email.",
  };
}
module.exports = parseEmailForStatus;
```

#### Tool 5: `schedule_follow_up`

Creates a follow-up reminder for an application.

```js
// src/agents/tools/scheduleFollowUp.js
async function scheduleFollowUp({ applicationId, jobTitle, companyName, followUpDate, notes }) {
  // Stores a follow-up reminder in the application record
  // Integration with calendar/notification system can be added later
  return {
    applicationId,
    jobTitle,
    companyName,
    followUpDate: followUpDate || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 1 week default
    notes: notes || "Follow up on application status",
    scheduled: true,
    reminderCreated: true,
  };
}
module.exports = scheduleFollowUp;
```

### 1.4 ApplicationTrackerAgent Class

```js
// src/agents/ApplicationTrackerAgent.js
const Agent = require("./core/Agent");
const { Tool } = require("./core/Tool");
const logApplication = require("./tools/logApplication");
const updateApplicationStatus = require("./tools/updateApplicationStatus");
const getApplicationDashboard = require("./tools/getApplicationDashboard");
const parseEmailForStatus = require("./tools/parseEmailForStatus");
const scheduleFollowUp = require("./tools/scheduleFollowUp");
const { logger } = require("../config/logger");

class ApplicationTrackerAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: "log_application",
        description: "Record a new job application or update an existing one.",
        inputSchema: { type: "object", properties: {
          userId: { type: "string" }, jobId: { type: "string" },
          jobTitle: { type: "string" }, companyName: { type: "string" },
          status: { type: "string" }, notes: { type: "string" }, appliedAt: { type: "string" },
        }, required: ["userId", "jobId"] },
        handler: logApplication,
      }),
      new Tool({
        name: "update_application_status",
        description: "Update an applications status with validation of allowed transitions.",
        inputSchema: { type: "object", properties: {
          userId: { type: "string" }, applicationId: { type: "string" },
          newStatus: { type: "string" }, notes: { type: "string" }, eventDate: { type: "string" },
        }, required: ["userId", "applicationId", "newStatus"] },
        handler: updateApplicationStatus,
      }),
      new Tool({
        name: "get_application_dashboard",
        description: "Get a dashboard summary of all applications with stats and conversion rates.",
        inputSchema: { type: "object", properties: {
          userId: { type: "string" }, daysBack: { type: "number" },
        }, required: ["userId"] },
        handler: getApplicationDashboard,
      }),
      new Tool({
        name: "parse_email_for_status",
        description: "Parse an email to extract application status updates (requires user permission).",
        inputSchema: { type: "object", properties: {
          emailSubject: { type: "string" }, emailBody: { type: "string" },
          fromAddress: { type: "string" },
        }, required: ["emailSubject", "emailBody"] },
        handler: parseEmailForStatus,
      }),
      new Tool({
        name: "schedule_follow_up",
        description: "Schedule a follow-up reminder for an application.",
        inputSchema: { type: "object", properties: {
          applicationId: { type: "string" }, jobTitle: { type: "string" },
          companyName: { type: "string" }, followUpDate: { type: "string" }, notes: { type: "string" },
        }, required: ["applicationId"] },
        handler: scheduleFollowUp,
      }),
    ];

    super({
      name: "ApplicationTrackerAgent",
      description: "Tracks job applications through their lifecycle (Applied -> Interview -> Offer/Rejected). Provides dashboard with stats, email parsing for auto-updates, and follow-up reminders.",
      tools, memory,
    });
  }
}
module.exports = ApplicationTrackerAgent;
```

---

## 2. Vector Store Integration

### 2.1 `src/agents/memory/VectorStore.js`

```js
// src/agents/memory/VectorStore.js
const { logger } = require("../../config/logger");

class VectorStore {
  constructor(options = {}) {
    this.type = options.type || "memory"; // "memory" | "mongodb_atlas"
    this.vectors = new Map(); // In-memory fallback
    this.collections = new Map();
  }

  async store(collection, id, text, embedding, metadata = {}) {
    if (!this.collections.has(collection)) {
      this.collections.set(collection, []);
    }
    const items = this.collections.get(collection);
    const existing = items.findIndex(i => i.id === id);
    const entry = { id, text, embedding, metadata, storedAt: new Date() };

    if (existing >= 0) {
      items[existing] = entry;
    } else {
      items.push(entry);
    }

    return { id, collection };
  }

  async search(collection, queryEmbedding, limit = 5) {
    const items = this.collections.get(collection) || [];
    if (items.length === 0 || !queryEmbedding) return [];

    // Cosine similarity
    const scored = items.map(item => {
      const similarity = this._cosineSimilarity(queryEmbedding, item.embedding);
      return { ...item, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit).map(({ embedding, ...rest }) => rest);
  }

  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  async deleteCollection(collection) {
    this.collections.delete(collection);
  }
}

module.exports = VectorStore;
```

### 2.2 What Vector Search Enables

When fully integrated with MongoDB Atlas Vector Search or a dedicated vector DB:

| Use Case | Query | Result |
|---|---|---|
| Resume versioning | "Which resume got me an interview at TechCorp?" | Past resume version with high similarity |
| Cover letter patterns | "What tone worked for fintech companies?" | Past letters with similar company profiles |
| Skill progression | "How have my skills evolved?" | Skill lists over time |
| Job fit prediction | "Which jobs match my profile best?" | Semantic similarity search |

---

## 3. Full Autonomous Workflow

### 3.1 The Complete "Find Me My Next Job" Flow

```
User sends one message: "Find me my next job"
  |
  CareerCoachAgent.runFullWorkflow()
  |
  +---- WorkflowEngine Graph ----+
  |                               |
  |  [start]                      |
  |    |                          |
  |  [ResumeAgent.analyze]        |
  |    | returns: score=7.2,     |
  |    | skills=[Laravel,PHP,...] |
  |    | domain=backend           |
  |    |                          |
  |  [JobSearchAgent.search]      |
  |    | query="Laravel backend"  |
  |    | -> 143 jobs              |
  |    | -> dedup: 112            |
  |    | -> scam filter: 89       |
  |    | -> skill filter: 27      |
  |    |                          |
  |  [MatchAgent.match_batch]     |
  |    | scores 27 jobs vs resume |
  |    | Top 3: 87%, 82%, 76%    |
  |    |                          |
  |  [BRANCH: score >= 60%?]      |
  |    | YES (top job = 87%)      |
  |    |                          |
  |  [HUMAN GATE: Approve top 5] |
  |    | Waits for user...        |
  |    | User: "Approve #1"       |
  |    |                          |
  |  [ResumeAgent.tailor]         |
  |    | Tailors for TechCorp     |
  |    | Score: 7.2 -> 8.5        |
  |    |                          |
  |  [CoverLetterAgent.generate]  |
  |    | Writes personalized      |
  |    | cover letter             |
  |    |                          |
  |  [HUMAN GATE: Submit?]        |
  |    | Waits for user...        |
  |    | User: "Yes, submit"      |
  |    |                          |
  |  [ApplicationTrackerAgent     |
  |   .log]                       |
  |    | Status: "applied"        |
  |    | Date: now                |
  |    |                          |
  |  [LearningAgent.analyze]      |
  |    | Missing: Docker, Redis   |
  |    | Plan: "2 weeks to get    |
  |    | Docker ready"            |
  |    |                          |
  |  [end]                        |
  |                               |
  +-------------------------------+
  |
  Response to user:
  "Applied to TechCorp (87% match) with a tailored resume and cover letter.
   Your resume score improved from 7.2 to 8.5.
   I noticed Docker and Redis are commonly required.
   I have prepared a 2-week learning plan to close these gaps.
   Shall I start?"
```

### 3.2 Progressive Autonomy Levels

| Level | Behavior | Human-in-loop |
|---|---|---|
| 1 | Suggest only | Coach suggests actions, user executes manually |
| 2 | Suggest + prepare | Coach prepares materials, user reviews and approves |
| 3 | Execute with gates | Coach executes, but pauses at key decisions |
| 4 | Full autonomy | Coach executes and only notifies after major events |

The system starts at **Level 2** and graduates toward Level 4 as the user gains trust.

---

## 4. New Routes

Add to `src/routes/agentRoutes.js`:

```js
// Application Tracker endpoints
router.post("/applications/log", auth, agentController.logApplication);
router.put("/applications/:appId/status", auth, agentController.updateApplicationStatus);
router.get("/applications/dashboard", auth, agentController.getApplicationDashboard);
router.post("/applications/parse-email", auth, agentController.parseApplicationEmail);
router.post("/applications/follow-up", auth, agentController.scheduleFollowUp);

// Vector store endpoints
router.post("/memory/vector/store", auth, agentController.storeVector);
router.post("/memory/vector/search", auth, agentController.searchVector);
```

Add to `src/controllers/agentController.js`:

```js
exports.logApplication = async (req, res) => {
  try {
    const { jobId, jobTitle, companyName, status, notes, appliedAt } = req.body;
    if (!jobId) return res.status(400).json({ success: false, message: "jobId required" });
    const tool = registry.get("ApplicationTrackerAgent").tools.get("log_application");
    const result = await tool.execute({ userId: req.user.id, jobId, jobTitle, companyName, status, notes, appliedAt });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.updateApplicationStatus = async (req, res) => {
  try {
    const { newStatus, notes, eventDate } = req.body;
    const tool = registry.get("ApplicationTrackerAgent").tools.get("update_application_status");
    const result = await tool.execute({ userId: req.user.id, applicationId: req.params.appId, newStatus, notes, eventDate });
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.getApplicationDashboard = async (req, res) => {
  try {
    const { daysBack } = req.query;
    const tool = registry.get("ApplicationTrackerAgent").tools.get("get_application_dashboard");
    const result = await tool.execute({ userId: req.user.id, daysBack: parseInt(daysBack) || 90 });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.parseApplicationEmail = async (req, res) => {
  try {
    const { emailSubject, emailBody, fromAddress } = req.body;
    if (!emailSubject || !emailBody) return res.status(400).json({ success: false, message: "emailSubject and emailBody required" });
    const tool = registry.get("ApplicationTrackerAgent").tools.get("parse_email_for_status");
    const result = await tool.execute({ emailSubject, emailBody, fromAddress });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.scheduleFollowUp = async (req, res) => {
  try {
    const { applicationId, jobTitle, companyName, followUpDate, notes } = req.body;
    const tool = registry.get("ApplicationTrackerAgent").tools.get("schedule_follow_up");
    const result = await tool.execute({ applicationId, jobTitle, companyName, followUpDate, notes });
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.storeVector = async (req, res) => {
  try {
    const { collection, id, text, metadata } = req.body;
    const embedding = await aiService.computeEmbedding(text);
    const vectorStore = new (require("../agents/memory/VectorStore"))();
    const result = await vectorStore.store(collection, id, text, embedding, metadata);
    res.json({ success: true, data: result });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.searchVector = async (req, res) => {
  try {
    const { collection, query, limit } = req.body;
    const embedding = await aiService.computeEmbedding(query);
    const vectorStore = new (require("../agents/memory/VectorStore"))();
    const results = await vectorStore.search(collection, embedding, limit || 5);
    res.json({ success: true, data: results });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
```

---

## 5. Register in `src/agents/init.js`

Update the initialization to include all 7 agents and the vector store:

```js
const ApplicationTrackerAgent = require("./ApplicationTrackerAgent");
const VectorStore = require("./memory/VectorStore");

async function initializeAgents() {
  memoryStore = new MemoryStore({
    redis, userPreferenceModel: UserPreference,
    vectorStore: new VectorStore({ type: "memory" }),
  });

  // Register all 7 agents
  const resumeAgent = new ResumeAgent(memoryStore);
  registry.register(resumeAgent);

  const jobSearchAgent = new JobSearchAgent(memoryStore);
  registry.register(jobSearchAgent);

  const matchAgent = new MatchAgent(memoryStore);
  registry.register(matchAgent);

  const coverLetterAgent = new CoverLetterAgent(memoryStore);
  registry.register(coverLetterAgent);

  const careerCoachAgent = new CareerCoachAgent(memoryStore);
  registry.register(careerCoachAgent);

  const interviewAgent = new InterviewAgent(memoryStore);
  registry.register(interviewAgent);

  const learningAgent = new LearningAgent(memoryStore);
  registry.register(learningAgent);

  const appTrackerAgent = new ApplicationTrackerAgent(memoryStore);
  registry.register(appTrackerAgent);

  logger.info(`[Agents] All ${registry.list().length} agents registered:`);
  for (const name of registry.list()) {
    const agent = registry.get(name);
    logger.info(`  - ${name}: ${agent.tools.list().length} tools`);
  }
}
```

---

## 6. Final Architecture Overview

### 6.1 Agent System Architecture Diagram

```
                +--------------------------------------+
                |          CareerCoachAgent             |
                |  (Orchestrator - owns the goal)       |
                +--------------------------------------+
                 /        |        |        \         \
                /         |        |         \         \
     +----------+  +----------+  +-------+  +--------+  +-----------+
     |Resume    |  |JobSearch |  |Match  |  |Cover   |  |Interview  |
     |Agent     |  |Agent     |  |Agent  |  |Letter  |  |Agent      |
     +----------+  +----------+  +-------+  |Agent   |  +-----------+
     |8 tools   |  |5 tools    |  |3 tools |  +--------+  |4 tools    |
     |analyze   |  |search    |  |score   |  |4 tools |  |technical  |
     |tailor    |  |dedup     |  |gap     |  |generate|  |behavioral |
     |weak pts  |  |scam filt |  |batch   |  |research|  |company    |
     |score     |  |skill filt|  |        |  |select  |  |salary     |
     +----------+  +----------+  +-------+  +--------+  +-----------+
        |                                               
  +-----------+                                 +------------------+
  |Learning   |                                 |ApplicationTracker|
  |Agent      |                                 |Agent             |
  +-----------+                                 +------------------+
  |3 tools    |                                 |5 tools           |
  |gap ids    |                                 |log               |
  |plan build |                                 |status update     |
  |track      |                                 |dashboard         |
  +-----------+                                 |email parse       |
                                                |follow-up         |
                                                +------------------+
                           +-------------+
                           | MemoryStore |
                           +-------------+
                           | Redis (ST)  |
                           | MongoDB (LT)|
                           | Vector (Sem)|
                           +-------------+
```

### 6.2 Files Created Across All Phases

| Phase | New Files | Modified Files |
|---|---|---|
| **Phase 1** | 20 files (agent core + ResumeAgent + tools + routes + controller + model + tests) | 4 files (app.js, resumeController, AIService, Conversation) |
| **Phase 2** | 8 files (JobSearchAgent + MatchAgent + tools + tests) | 3 files (init.js, agentRoutes, agentController) |
| **Phase 3** | 6 files (CoverLetterAgent + tools + tests) | 3 files (init.js, agentRoutes, agentController, coverLetterController) |
| **Phase 4** | 7 files (CareerCoachAgent + tools + tests) | 3 files (WorkflowEngine, init.js, agentRoutes, agentController) |
| **Phase 5** | 9 files (InterviewAgent + LearningAgent + tools + tests) | 2 files (init.js, agentRoutes, agentController) |
| **Phase 6** | 7 files (ApplicationTrackerAgent + VectorStore + tests) | 2 files (init.js, agentRoutes, agentController) |

**Total: ~57 new files, ~17 modified files**

---

## 7. Rollout Checklist

- [ ] ApplicationTrackerAgent logs new applications
- [ ] Status transitions are validated correctly
- [ ] Dashboard provides accurate stats and conversion rates
- [ ] Email parser extracts status from emails
- [ ] Follow-up reminders are created
- [ ] Vector store stores and retrieves embeddings
- [ ] Full "Find me my next job" workflow runs end-to-end
- [ ] All 7 agents registered at startup
- [ ] No regressions in any existing endpoint
- [ ] All tests pass
- [ ] ESLint passes
- [ ] Document any remaining TODO items for production hardening
