# Phase 5 — Interview Agent + Learning Agent

## Goal

Build two new agents that prepare the user for interviews and close skill gaps.

**InterviewAgent** generates tailored interview questions (technical + behavioral) based on the job description, company research, and the user's resume. **LearningAgent** compares current skills to target-role requirements and builds a structured learning roadmap.

---

## Why Phase 5

- These agents complete the "preparation" side of the job search cycle
- InterviewAgent delivers high-value just-in-time content (e.g., "interview tomorrow -> generate questions tonight")
- LearningAgent turns the MatchAgent's gap analysis into actionable learning plans
- Both agents are pure LLM-driven with minimal existing code to wrap

---

## 1. InterviewAgent — `src/agents/InterviewAgent.js`

### 1.1 Agent Overview

| Property | Value |
|---|---|
| Name | `InterviewAgent` |
| Description | Generates tailored interview questions (technical + behavioral) based on job description, company, and resume. Provides STAR-format answer templates and company research. |
| Tools | 4 |
| Dependencies | `AIService.js`, `MatchAgent` |

### 1.2 Tools

#### Tool 1: `generate_technical_questions`

Generates role-specific technical questions based on the job description and candidate resume.

```js
// src/agents/tools/generateTechnicalQuestions.js
const aiService = require("../../services/ai/AIService");

async function generateTechnicalQuestions({ jobTitle, jobDescription, resumeSkills, difficulty }) {
  const level = difficulty || "mixed";
  const prompt = `You are a technical interviewer at a top tech company. Generate interview questions for a ${jobTitle} role.

JOB DESCRIPTION: ${(jobDescription || "").substring(0, 2000)}
CANDIDATE SKILLS: ${(resumeSkills || []).join(", ")}
DIFFICULTY: ${level}

Generate 8 technical questions that test:
1. Core language/framework proficiency (2 questions)
2. System design / architecture (2 questions)
3. Data structures & algorithms (1-2 questions)
4. Domain-specific knowledge from the JD (2 questions)

For each question, provide: the question, what the interviewer is looking for, a model answer outline, and a follow-up question.

Respond with ONLY valid JSON:
{
  "questions": [
    {
      "id": 1,
      "category": "core_language" | "system_design" | "algorithms" | "domain",
      "question": "Full question text",
      "whatTheyLookFor": "What a good answer includes",
      "modelAnswerOutline": ["Key point 1", "Key point 2"],
      "followUp": "Possible follow-up question",
      "estimatedTime": "5 minutes"
    }
  ],
  "totalQuestions": 8,
  "focusAreas": ["area1", "area2"]
}`;

  const response = await aiService.generate(prompt, { temperature: 0.3, maxTokens: 3000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [], totalQuestions: 0, focusAreas: [] };
}
module.exports = generateTechnicalQuestions;
```

#### Tool 2: `generate_behavioral_questions`

Generates behavioral questions using the STAR method, tailored to the candidate's experience.

```js
// src/agents/tools/generateBehavioralQuestions.js
const aiService = require("../../services/ai/AIService");

async function generateBehavioralQuestions({ resumeData, companyName, companyValues }) {
  const values = (companyValues || ["Leadership", "Collaboration", "Problem-solving"]).join(", ");
  const prompt = `You are a behavioral interviewer. Generate STAR-format questions for a candidate with this background:

RESUME SUMMARY: ${resumeData.summary || "N/A"}
PAST ROLES: ${(resumeData.workExperience || []).map(e => `${e.position} at ${e.company}`).join(", ")}
COMPANY: ${companyName || "Unknown"}
COMPANY VALUES: ${values}

Generate 6 behavioral questions covering:
1. Leadership / ownership (1 question)
2. Conflict resolution (1 question)
3. Failure / learning (1 question)
4. Collaboration / teamwork (1 question)
5. Achievement / success (1 question)
6. Why this company / role (1 question)

For each question, provide a STAR template the candidate can fill in.

Respond with ONLY valid JSON:
{
  "questions": [
    {
      "id": 1,
      "category": "leadership",
      "question": "Tell me about a time you led a project...",
      "starTemplate": {
        "situation": "Describe the context...",
        "task": "What needed to be done...",
        "action": "What you did...",
        "result": "What happened..."
      },
      "whatTheyLookFor": "Takes ownership, drives results"
    }
  ]
}`;

  const response = await aiService.generate(prompt, { temperature: 0.3, maxTokens: 3000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { questions: [] };
}
module.exports = generateBehavioralQuestions;
```

#### Tool 3: `research_company_for_interview`

Produces company research tailored for interview preparation.

```js
// src/agents/tools/researchCompanyForInterview.js
const aiService = require("../../services/ai/AIService");

async function researchCompanyForInterview({ companyName, jobDescription }) {
  const prompt = `Research this company for interview preparation.

COMPANY: ${companyName || "Unknown"}
JOB DESCRIPTION: ${(jobDescription || "").substring(0, 2000)}

Provide structured company research:

Respond with ONLY valid JSON:
{
  "companyName": "...",
  "industry": "...",
  "likelyProducts": ["product1"],
  "recentNews": ["What to mention to show you follow the company"],
  "culture": "Inferred culture from JD",
  "competitors": ["competitor1"],
  "interviewTips": [
    "What they likely value in candidates",
    "What to emphasize from your background"
  ],
  "questionsToAsk": [
    "Good questions the candidate can ask the interviewer"
  ]
}`;

  const response = await aiService.generate(prompt, { temperature: 0.2, maxTokens: 1500 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { companyName };
}
module.exports = researchCompanyForInterview;
```

#### Tool 4: `salary_expectations`

Provides salary benchmarking based on role, location, and experience.

```js
// src/agents/tools/salaryExpectations.js
async function salaryExpectations({ role, location, yearsExperience, targetCurrency }) {
  const currency = targetCurrency || "USD";
  const benchmarks = {
    "Nigeria": { junior: "150000-300000", mid: "300000-600000", senior: "600000-1500000" },
    "UK": { junior: "30000-45000", mid: "45000-75000", senior: "75000-120000" },
    "Canada": { junior: "50000-70000", mid: "70000-100000", senior: "100000-150000" },
    "Remote": { junior: "30000-50000", mid: "50000-90000", senior: "90000-150000" },
  };

  const loc = location || "Remote";
  const exp = yearsExperience || 3;
  const level = exp < 2 ? "junior" : exp < 5 ? "mid" : "senior";
  const band = benchmarks[loc] || benchmarks["Remote"];

  return {
    role, location: loc, yearsExperience: exp,
    estimatedRange: band[level] || band.mid,
    currency,
    level,
    note: `Based on market data for ${loc}. Adjust based on company size and benefits.`,
  };
}
module.exports = salaryExpectations;
```

### 1.3 InterviewAgent Class

```js
// src/agents/InterviewAgent.js
const Agent = require("./core/Agent");
const { Tool } = require("./core/Tool");
const generateTechnicalQuestions = require("./tools/generateTechnicalQuestions");
const generateBehavioralQuestions = require("./tools/generateBehavioralQuestions");
const researchCompanyForInterview = require("./tools/researchCompanyForInterview");
const salaryExpectations = require("./tools/salaryExpectations");
const { logger } = require("../config/logger");

class InterviewAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: "generate_technical_questions",
        description: "Generate role-specific technical interview questions with model answers.",
        inputSchema: { type: "object", properties: {
          jobTitle: { type: "string" }, jobDescription: { type: "string" },
          resumeSkills: { type: "array" }, difficulty: { type: "string" },
        }, required: ["jobTitle"] },
        handler: generateTechnicalQuestions,
      }),
      new Tool({
        name: "generate_behavioral_questions",
        description: "Generate STAR-format behavioral interview questions tailored to the candidates experience.",
        inputSchema: { type: "object", properties: {
          resumeData: { type: "object" }, companyName: { type: "string" },
          companyValues: { type: "array" },
        }, required: ["resumeData"] },
        handler: generateBehavioralQuestions,
      }),
      new Tool({
        name: "research_company_for_interview",
        description: "Research a company for interview preparation: products, culture, competitors, and questions to ask.",
        inputSchema: { type: "object", properties: {
          companyName: { type: "string" }, jobDescription: { type: "string" },
        }, required: ["companyName"] },
        handler: researchCompanyForInterview,
      }),
      new Tool({
        name: "salary_expectations",
        description: "Estimate salary expectations based on role, location, and experience.",
        inputSchema: { type: "object", properties: {
          role: { type: "string" }, location: { type: "string" },
          yearsExperience: { type: "number" }, targetCurrency: { type: "string" },
        }, required: ["role"] },
        handler: salaryExpectations,
      }),
    ];
    super({
      name: "InterviewAgent",
      description: "Prepares candidates for interviews with tailored technical and behavioral questions, company research, and salary benchmarking.",
      tools, memory,
    });
  }

  async prepare(userId, jobTitle, companyName, jobDescription, options = {}) {
    logger.info(`InterviewAgent: prepare(${jobTitle} @ ${companyName})`);

    const Resume = require("../models/Resume");
    const resume = await Resume.findOne({ userId }).lean();
    const skills = resume?.extractedData?.skills || [];
    const resumeData = resume?.extractedData || {};

    const [technical, behavioral, companyResearch, salary] = await Promise.all([
      generateTechnicalQuestions({
        jobTitle, jobDescription, resumeSkills: skills,
        difficulty: options.difficulty || "mixed",
      }),
      generateBehavioralQuestions({
        resumeData, companyName,
        companyValues: options.companyValues,
      }),
      researchCompanyForInterview({ companyName, jobDescription }),
      salaryExpectations({
        role: jobTitle, location: options.location,
        yearsExperience: resumeData.yearsOfExperience,
        targetCurrency: options.currency,
      }),
    ]);

    if (this.memory) {
      await this.memory.setContext("InterviewAgent", userId, {
        lastPreparation: { jobTitle, companyName, generatedAt: new Date() },
      });
    }

    return {
      success: true,
      data: { technical, behavioral, companyResearch, salary },
    };
  }
}
module.exports = InterviewAgent;
```

---

## 2. LearningAgent — `src/agents/LearningAgent.js`

### 2.1 Agent Overview

| Property | Value |
|---|---|
| Name | `LearningAgent` |
| Description | Compares current skills to target-role requirements and builds a structured learning roadmap with resources. |
| Tools | 3 |
| Dependencies | `AIService.js`, `MatchAgent` |

### 2.2 Tools

#### Tool 1: `identify_skill_gaps`

Compares current skills against target role requirements.

```js
// src/agents/tools/identifySkillGaps.js
const aiService = require("../../services/ai/AIService");

async function identifySkillGaps({ currentSkills, targetRole, targetIndustry, jobDescriptions }) {
  const jdContext = (jobDescriptions || []).slice(0, 5).join("\n---\n");
  const prompt = `You are a career development advisor. Analyze skill gaps for someone targeting a specific role.

CURRENT SKILLS: ${currentSkills.join(", ")}
TARGET ROLE: ${targetRole || "Unknown"}
TARGET INDUSTRY: ${targetIndustry || "Unknown"}

SAMPLE JOB DESCRIPTIONS:
${jdContext || "Not provided"}

Identify skill gaps and categorize them:

Respond with ONLY valid JSON:
{
  "currentSkills": ["array of current skills"],
  "requiredSkills": ["all skills commonly required for this role"],
  "gaps": {
    "critical": { "skills": ["must-have missing skills"], "estimatedTime": "2-4 weeks" },
    "recommended": { "skills": ["nice-to-have missing skills"], "estimatedTime": "4-8 weeks" },
    "bonus": { "skills": ["differentiating skills"], "estimatedTime": "8-12 weeks" }
  },
  "readinessScore": number 0-100,
  "summary": "One-paragraph assessment"
}`;

  const response = await aiService.generate(prompt, { temperature: 0.2, maxTokens: 2000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : {
    currentSkills, requiredSkills: [], gaps: { critical: { skills: [] }, recommended: { skills: [] }, bonus: { skills: [] } },
    readinessScore: 50, summary: "Could not analyze skill gaps.",
  };
}
module.exports = identifySkillGaps;
```

#### Tool 2: `build_learning_plan`

Creates a structured learning plan with resources for each skill gap.

```js
// src/agents/tools/buildLearningPlan.js
const aiService = require("../../services/ai/AIService");

async function buildLearningPlan({ skillGaps, timeframe, learningStyle }) {
  const style = learningStyle || "mixed";
  const prompt = `You are a learning path designer. Create a learning plan to acquire these skills.

CRITICAL GAPS: ${skillGaps.critical?.skills?.join(", ") || "None"}
RECOMMENDED GAPS: ${skillGaps.recommended?.skills?.join(", ") || "None"}
TIMEFRAME: ${timeframe || "flexible"}
LEARNING STYLE: ${style}

For each skill, provide:
1. A learning objective
2. Recommended resources (free and paid)
3. Practice project idea
4. Success metric

Respond with ONLY valid JSON:
{
  "plan": [
    {
      "skill": "Docker",
      "priority": "critical" | "recommended" | "bonus",
      "estimatedHours": 20,
      "objective": "Be able to containerize a Laravel application",
      "resources": [
        { "type": "course", "name": "Docker Mastery", "url": "", "cost": "free" }
      ],
      "practiceProject": "Containerize an existing Laravel app with MySQL + Redis",
      "successMetric": "Can deploy a multi-container app with docker-compose"
    }
  ],
  "totalEstimatedHours": 60,
  "recommendedOrder": ["skill1", "skill2"],
  "weeklySchedule": "Suggested weekly breakdown"
}`;

  const response = await aiService.generate(prompt, { temperature: 0.3, maxTokens: 3000 });
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  return jsonMatch ? JSON.parse(jsonMatch[0]) : { plan: [], totalEstimatedHours: 0 };
}
module.exports = buildLearningPlan;
```

#### Tool 3: `track_learning_progress`

Tracks progress on the learning plan.

```js
// src/agents/tools/trackLearningProgress.js
async function trackLearningProgress({ plan, completedSkills, hoursSpent }) {
  const total = plan.length;
  const completed = completedSkills.filter(s => plan.find(p => p.skill === s)).length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;
  const hoursLogged = hoursSpent || 0;

  const inProgress = plan.filter(p => !completedSkills.includes(p.skill));
  const nextUp = inProgress[0] || null;

  return {
    totalSkills: total,
    completedSkills: completed,
    inProgressSkills: inProgress.length,
    percentComplete,
    hoursLogged,
    estimatedRemaining: inProgress.reduce((sum, p) => sum + (p.estimatedHours || 0), 0),
    nextUp: nextUp ? { skill: nextUp.skill, estimatedHours: nextUp.estimatedHours } : null,
    status: percentComplete === 100 ? "completed" : percentComplete > 0 ? "in_progress" : "not_started",
  };
}
module.exports = trackLearningProgress;
```

### 2.3 LearningAgent Class

```js
// src/agents/LearningAgent.js
const Agent = require("./core/Agent");
const { Tool } = require("./core/Tool");
const identifySkillGaps = require("./tools/identifySkillGaps");
const buildLearningPlan = require("./tools/buildLearningPlan");
const trackLearningProgress = require("./tools/trackLearningProgress");
const { logger } = require("../config/logger");

class LearningAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: "identify_skill_gaps",
        description: "Compare current skills against target role requirements and identify critical, recommended, and bonus skill gaps.",
        inputSchema: { type: "object", properties: {
          currentSkills: { type: "array" }, targetRole: { type: "string" },
          targetIndustry: { type: "string" }, jobDescriptions: { type: "array" },
        }, required: ["currentSkills", "targetRole"] },
        handler: identifySkillGaps,
      }),
      new Tool({
        name: "build_learning_plan",
        description: "Create a structured learning plan with resources, practice projects, and success metrics for each skill gap.",
        inputSchema: { type: "object", properties: {
          skillGaps: { type: "object" }, timeframe: { type: "string" },
          learningStyle: { type: "string" },
        }, required: ["skillGaps"] },
        handler: buildLearningPlan,
      }),
      new Tool({
        name: "track_learning_progress",
        description: "Track progress on a learning plan.",
        inputSchema: { type: "object", properties: {
          plan: { type: "array" }, completedSkills: { type: "array" },
          hoursSpent: { type: "number" },
        }, required: ["plan", "completedSkills"] },
        handler: trackLearningProgress,
      }),
    ];
    super({
      name: "LearningAgent",
      description: "Identifies skill gaps for target roles, builds structured learning plans with resources, and tracks progress.",
      tools, memory,
    });
  }

  async analyze(userId, targetRole, options = {}) {
    logger.info(`LearningAgent: analyze(${targetRole})`);

    const Resume = require("../models/Resume");
    const resume = await Resume.findOne({ userId }).lean();
    const skills = resume?.extractedData?.skills || [];
    const resumeData = resume?.extractedData || {};

    const gaps = await identifySkillGaps({
      currentSkills: skills,
      targetRole,
      targetIndustry: options.targetIndustry || "",
      jobDescriptions: options.jobDescriptions || [],
    });

    const plan = await buildLearningPlan({
      skillGaps: gaps.gaps,
      timeframe: options.timeframe || "8 weeks",
      learningStyle: options.learningStyle || "mixed",
    });

    if (this.memory) {
      await this.memory.setContext("LearningAgent", userId, {
        lastAnalysis: { targetRole, readinessScore: gaps.readinessScore, planSkills: plan.plan.length, analyzedAt: new Date() },
      });
    }

    return { success: true, data: { gaps, plan } };
  }
}
module.exports = LearningAgent;
```

---

## 3. New Routes

Add to `src/routes/agentRoutes.js`:

```js
router.post("/interview/prepare", auth, agentController.prepareInterview);
router.post("/learning/analyze", auth, agentController.analyzeSkillGaps);
router.post("/learning/plan", auth, agentController.buildLearningPlan);
router.get("/learning/progress", auth, agentController.learningProgress);
```

Add to `src/controllers/agentController.js`:

```js
exports.prepareInterview = async (req, res) => {
  try {
    const { jobTitle, companyName, jobDescription, difficulty, companyValues, location, currency } = req.body;
    if (!jobTitle || !companyName) return res.status(400).json({ success: false, message: "jobTitle and companyName required" });
    const agent = registry.get("InterviewAgent");
    const result = await agent.prepare(req.user.id, jobTitle, companyName, jobDescription, { difficulty, companyValues, location, currency });
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.analyzeSkillGaps = async (req, res) => {
  try {
    const { targetRole, targetIndustry, jobDescriptions } = req.body;
    if (!targetRole) return res.status(400).json({ success: false, message: "targetRole required" });
    const agent = registry.get("LearningAgent");
    const result = await agent.analyze(req.user.id, targetRole, { targetIndustry, jobDescriptions });
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.buildLearningPlan = async (req, res) => {
  try {
    const { targetRole, timeframe, learningStyle, jobDescriptions } = req.body;
    if (!targetRole) return res.status(400).json({ success: false, message: "targetRole required" });
    const agent = registry.get("LearningAgent");
    const result = await agent.analyze(req.user.id, targetRole, { timeframe, learningStyle, jobDescriptions });
    res.json(result);
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};

exports.learningProgress = async (req, res) => {
  try {
    const context = await memoryStore.getContext("LearningAgent", req.user.id);
    res.json({ success: true, data: context.lastAnalysis || { message: "No learning data yet" } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
};
```

---

## 4. Register in `src/agents/init.js`

```js
const InterviewAgent = require("./InterviewAgent");
const LearningAgent = require("./LearningAgent");

const interviewAgent = new InterviewAgent(memoryStore);
registry.register(interviewAgent);
const learningAgent = new LearningAgent(memoryStore);
registry.register(learningAgent);
```

---

## 5. Files Created / Modified Summary

### New files (9):

| File | Purpose |
|---|---|
| `src/agents/InterviewAgent.js` | Interview preparation agent |
| `src/agents/tools/generateTechnicalQuestions.js` | Technical question generation |
| `src/agents/tools/generateBehavioralQuestions.js` | Behavioral STAR question generation |
| `src/agents/tools/researchCompanyForInterview.js` | Company research for interviews |
| `src/agents/tools/salaryExpectations.js` | Salary benchmarking |
| `src/agents/LearningAgent.js` | Skill gap and learning plan agent |
| `src/agents/tools/identifySkillGaps.js` | Skill gap analysis |
| `src/agents/tools/buildLearningPlan.js` | Learning plan builder |
| `src/agents/tools/trackLearningProgress.js` | Learning progress tracker |
| `tests/unit/agents/InterviewAgent.test.js` | Unit tests |
| `tests/unit/agents/LearningAgent.test.js` | Unit tests |

### Modified files (2):

| File | Change |
|---|---|
| `src/agents/init.js` | Register both new agents |
| `src/routes/agentRoutes.js` | Add interview and learning endpoints |
| `src/controllers/agentController.js` | Add interview and learning handlers |

---

## 6. Rollout Checklist

- [ ] InterviewAgent generates relevant technical questions
- [ ] InterviewAgent generates STAR behavioral questions
- [ ] Company research provides interview-useful context
- [ ] Salary expectations return reasonable ranges
- [ ] LearningAgent identifies accurate skill gaps
- [ ] Learning plan includes resources + practice projects
- [ ] Progress tracking correctly reports completion
- [ ] All endpoints work with auth
- [ ] All existing tests pass
- [ ] ESLint passes
