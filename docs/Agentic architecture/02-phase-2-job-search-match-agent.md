# Phase 2 — Job Search Agent + Match Agent

## Goal

Build two agents that replace the current ad-hoc recommendation pipeline with specialized, tool-driven agents. The **JobSearchAgent** handles multi-board job discovery, deduplication, and scam filtering. The **MatchAgent** compares a resume against each job and produces a compatibility score with clear skill gaps.

By the end of this phase, the system can autonomously discover jobs, score them against the user's resume, and explain why each job is (or isn't) a good fit.

---

## Why Phase 2

- The current recommendation pipeline (`recommendationService.js` → `jobRetrievalService.js` → `jobRankingService.js`) is a simple sequential chain — perfect to demonstrate agent orchestration
- Users get immediate value: "find jobs matching my resume" becomes a transparent, reasoned process rather than a black-box score
- JobSearchAgent and MatchAgent are prerequisites for the CoverLetterAgent (Phase 3) and CareerCoachAgent (Phase 4)

---

## 1. JobSearchAgent — `src/agents/JobSearchAgent.js`

### 1.1 Agent Overview

| Property | Value |
|---|---|
| Name | `JobSearchAgent` |
| Description | Searches multiple job boards, removes duplicates, filters scams, and scores relevance. |
| Tools | 5 |
| Dependencies | `jobIngestionService.js`, `jobRetrievalService.js`, `cacheService.js` |

### 1.2 Tools

#### Tool 1: `search_job_boards`

Wraps and extends `jobIngestionService.js` to query external job APIs.

```js
// src/agents/tools/searchJobBoards.js
const jobIngestionService = require('../../services/jobIngestionService');
const { logger } = require('../../config/logger');

async function searchJobBoards({ query, location, page = 1, numPages = 1 }) {
  logger.info(`JobSearchAgent: searching boards for "${query}" in "${location}"`);

  let allJobs = [];

  // JSearch API (existing)
  try {
    const jsearchResults = await jobIngestionService.fetchJobs({
      query,
      location,
      page,
      numPages,
    });
    allJobs = allJobs.concat(jsearchResults.map(j => ({
      ...j,
      source: 'jsearch',
    })));
  } catch (err) {
    logger.warn(`JobSearchAgent: JSearch failed: ${err.message}`);
  }

  // Future: add additional job board integrations here
  // - Indeed API
  // - LinkedIn Jobs API
  // - Glassdoor API

  return {
    total: allJobs.length,
    jobs: allJobs,
    sources: ['jsearch'],  // extend as boards are added
    query: { text: query, location, page, numPages },
  };
}
```

#### Tool 2: `deduplicate_jobs`

Removes duplicate job listings based on title + company + location similarity.

```js
// src/agents/tools/deduplicateJobs.js
async function deduplicateJobs({ jobs }) {
  if (!jobs || jobs.length === 0) {
    return { jobs: [], removed: 0 };
  }

  const seen = new Map();
  const unique = [];

  for (const job of jobs) {
    // Create a fingerprint: normalized title + company + location
    const fingerprint = [
      (job.title || '').toLowerCase().trim(),
      (job.company || '').toLowerCase().trim(),
      (job.location || '').toLowerCase().trim(),
    ].join('::');

    if (!seen.has(fingerprint)) {
      seen.set(fingerprint, job);
      unique.push(job);
    }
  }

  return {
    jobs: unique,
    totalBefore: jobs.length,
    totalAfter: unique.length,
    removed: jobs.length - unique.length,
  };
}
```

#### Tool 3: `filter_scams`

Applies heuristic and AI-based scam detection to filter out suspicious listings.

```js
// src/agents/tools/filterScams.js
async function filterScams({ jobs }) {
  if (!jobs || jobs.length === 0) {
    return { jobs: [], filtered: 0, flags: [] };
  }

  const scamIndicators = [
    // Heuristic patterns
    { field: 'salary', pattern: /\$\d{3,5}\s*(per|a|an)\s*(day|hour)/i, weight: 0.7 },
    { field: 'description', pattern: /guaranteed.*(income|salary|pay)/i, weight: 0.5 },
    { field: 'description', pattern: /no (experience|skills).*(needed|required)/i, weight: 0.4 },
    { field: 'description', pattern: /work from home.*(unlimited|unbelievable)/i, weight: 0.6 },
    { field: 'company', pattern: /^(undefined|null|none)$/i, weight: 0.8 },
    { field: 'title', pattern: /(model|actress|casting|mystery shopper)/i, weight: 0.7 },
  ];

  const safe = [];
  const flags = [];

  for (const job of jobs) {
    let scamScore = 0;
    const reasons = [];

    for (const indicator of scamIndicators) {
      const fieldValue = job[indicator.field] || '';
      if (indicator.pattern.test(fieldValue)) {
        scamScore += indicator.weight;
        reasons.push(`${indicator.field} matched: ${indicator.pattern}`);
      }
    }

    // Additional heuristic: no company name
    if (!job.company || job.company.trim().length < 2) {
      scamScore += 0.5;
      reasons.push('Missing or invalid company name');
    }

    // Additional heuristic: unrealistic salary
    if (job.salaryMax && job.salaryMin) {
      if (job.salaryMax > 500000 && job.salaryMin < 10000) {
        scamScore += 0.3;
        reasons.push('Suspicious salary range');
      }
    }

    if (scamScore >= 1.0) {
      flags.push({
        jobId: job._id || job.id,
        title: job.title,
        company: job.company,
        scamScore,
        reasons,
      });
    } else {
      safe.push(job);
    }
  }

  return {
    jobs: safe,
    totalBefore: jobs.length,
    totalAfter: safe.length,
    filtered: jobs.length - safe.length,
    flags,
  };
}
```

#### Tool 4: `filter_by_skills`

Filters jobs to only those that match the user's skill profile.

```js
// src/agents/tools/filterBySkills.js
async function filterBySkills({ jobs, userSkills, minimumMatch = 1 }) {
  if (!jobs || jobs.length === 0) return { jobs: [], matched: 0 };

  const normalizedSkills = (userSkills || []).map(s => s.toLowerCase().trim());
  const matched = [];

  for (const job of jobs) {
    const jobSkills = (job.skills || []).map(s => s.toLowerCase().trim());
    const intersection = normalizedSkills.filter(s => jobSkills.includes(s));

    if (intersection.length >= minimumMatch) {
      matched.push({
        ...job,
        matchedSkillCount: intersection.length,
        matchedSkills: intersection,
        skillOverlap: Math.round((intersection.length / Math.max(jobSkills.length, 1)) * 100),
      });
    }
  }

  // Sort by most matching skills first
  matched.sort((a, b) => b.matchedSkillCount - a.matchedSkillCount);

  return {
    jobs: matched,
    totalBefore: jobs.length,
    totalAfter: matched.length,
    minimumMatch,
  };
}
```

#### Tool 5: `get_job_details`

Fetches full details for a specific job listing.

```js
// src/agents/tools/getJobDetails.js
const JobListing = require('../../models/JobListing');

async function getJobDetails({ jobId }) {
  const job = await JobListing.findById(jobId).lean();
  if (!job) throw new Error(`Job ${jobId} not found`);

  return {
    job,
    exists: true,
  };
}
```

### 1.3 JobSearchAgent Class

```js
// src/agents/JobSearchAgent.js
const Agent = require('./core/Agent');
const { Tool } = require('./core/Tool');
const searchJobBoards = require('./tools/searchJobBoards');
const deduplicateJobs = require('./tools/deduplicateJobs');
const filterScams = require('./tools/filterScams');
const filterBySkills = require('./tools/filterBySkills');
const getJobDetails = require('./tools/getJobDetails');
const { logger } = require('../config/logger');

class JobSearchAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: 'search_job_boards',
        description: 'Search external job boards (JSearch API) for jobs matching a query and location',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Job search query (e.g., "Laravel developer")' },
            location: { type: 'string', description: 'Location filter (e.g., "Lagos, Nigeria")' },
            page: { type: 'number', description: 'Page number' },
            numPages: { type: 'number', description: 'Number of pages to fetch' },
          },
          required: ['query'],
        },
        handler: searchJobBoards,
      }),
      new Tool({
        name: 'deduplicate_jobs',
        description: 'Remove duplicate job listings based on title, company, and location similarity',
        inputSchema: {
          type: 'object',
          properties: {
            jobs: { type: 'array', description: 'Array of job objects to deduplicate' },
          },
          required: ['jobs'],
        },
        handler: deduplicateJobs,
      }),
      new Tool({
        name: 'filter_scams',
        description: 'Apply heuristic and pattern-based scam detection to filter suspicious job listings',
        inputSchema: {
          type: 'object',
          properties: {
            jobs: { type: 'array', description: 'Array of job objects to filter' },
          },
          required: ['jobs'],
        },
        handler: filterScams,
      }),
      new Tool({
        name: 'filter_by_skills',
        description: 'Filter jobs to only those matching the user\'s skill set',
        inputSchema: {
          type: 'object',
          properties: {
            jobs: { type: 'array', description: 'Array of job objects' },
            userSkills: { type: 'array', description: 'Array of user skill strings' },
            minimumMatch: { type: 'number', description: 'Minimum number of matching skills required' },
          },
          required: ['jobs', 'userSkills'],
        },
        handler: filterBySkills,
      }),
      new Tool({
        name: 'get_job_details',
        description: 'Fetch full details for a specific job listing from the database',
        inputSchema: {
          type: 'object',
          properties: {
            jobId: { type: 'string', description: 'MongoDB ObjectId of the job listing' },
          },
          required: ['jobId'],
        },
        handler: getJobDetails,
      }),
    ];

    super({
      name: 'JobSearchAgent',
      description: 'Searches multiple job boards, removes duplicate listings, detects potential scams, and filters jobs by skill match. Provides clean, relevant job lists for career applications.',
      tools,
      memory,
    });
  }

  /**
   * High-level method: full search pipeline.
   * Orchestrates search → deduplicate → filter scams → filter by skills.
   */
  async searchJobs(userId, query, location, options = {}) {
    logger.info(`JobSearchAgent: searchJobs("${query}", "${location}")`);

    // Get user preferences for skill filtering
    const prefs = this.memory ? await this.memory.getPreferences(userId) : {};
    const userSkills = prefs?.learnedPreferences?.topSkills?.map(s => s.skill) || options.skills || [];

    // Step 1: Search boards
    const searchResult = await searchJobBoards({
      query,
      location,
      page: options.page || 1,
      numPages: options.numPages || 1,
    });

    if (searchResult.jobs.length === 0) {
      return { success: true, data: { jobs: [], totalResults: 0, pipeline: [] } };
    }

    // Step 2: Deduplicate
    const deduped = await deduplicateJobs({ jobs: searchResult.jobs });

    // Step 3: Filter scams
    const clean = await filterScams({ jobs: deduped.jobs });

    // Step 4: Filter by skills (if user has skills)
    let filtered = { jobs: clean.jobs, totalAfter: clean.jobs.length };
    if (userSkills.length > 0) {
      filtered = await filterBySkills({
        jobs: clean.jobs,
        userSkills,
        minimumMatch: options.minimumMatch || 1,
      });
    }

    const pipeline = [
      { step: 'search', total: searchResult.total, source: searchResult.sources },
      { step: 'deduplicate', removed: deduped.removed, remaining: deduped.totalAfter },
      { step: 'scam_filter', filtered: clean.filtered, remaining: clean.totalAfter },
      { step: 'skill_filter', filtered: filtered.totalBefore - filtered.totalAfter, remaining: filtered.jobs.length },
    ];

    // Store in memory
    if (this.memory) {
      await this.memory.setContext('JobSearchAgent', userId, {
        lastSearch: {
          query,
          location,
          results: filtered.jobs.length,
          pipeline,
          searchedAt: new Date(),
        },
      });
    }

    return {
      success: true,
      data: {
        jobs: filtered.jobs,
        totalResults: filtered.jobs.length,
        pipeline,
      },
    };
  }
}

module.exports = JobSearchAgent;
```

---

## 2. MatchAgent — `src/agents/MatchAgent.js`

### 2.1 Agent Overview

| Property | Value |
|---|---|
| Name | `MatchAgent` |
| Description | Compares resume against job descriptions and produces a compatibility score with skill gap analysis. |
| Tools | 3 |
| Dependencies | `jobRankingService.js`, `resumeQueryService.js` |

### 2.2 Tools

#### Tool 1: `score_job_match`

Wraps and improves upon `jobRankingService.rerank()` — but for a single job rather than a batch.

```js
// src/agents/tools/scoreJobMatch.js
const axios = require('axios');
const { logger } = require('../../config/logger');

async function scoreJobMatch({ resumeData, job }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // Fallback: rule-based scoring
    return fallbackScore(resumeData, job);
  }

  // Build candidate profile
  const profile = [
    `Current/Most Recent Title: ${resumeData.currentJobTitle || 'N/A'}`,
    `Years of Experience: ${resumeData.yearsOfExperience || 'N/A'}`,
    `Skills: ${(resumeData.skills || []).join(', ')}`,
    `Past Titles: ${(resumeData.jobTitles || []).join(', ')}`,
    `Education: ${(resumeData.education || []).map(e => `${e.degree} in ${e.field}`).join(', ')}`,
    `Location: ${resumeData.location || 'N/A'}`,
    `Summary: ${(resumeData.summary || '').substring(0, 500)}`,
  ].join('\n');

  const jobInfo = [
    `Title: ${job.title}`,
    `Company: ${job.company}`,
    `Location: ${job.location || 'N/A'}`,
    `Skills Required: ${(job.skills || []).join(', ')}`,
    `Description: ${(job.description || '').substring(0, 1500)}`,
  ].join('\n');

  const prompt = `You are a job matching AI. Analyze how well this candidate fits the job.

CANDIDATE PROFILE:
${profile}

JOB:
${jobInfo}

Score the match on a scale of 0-100. Consider:
- Skill overlap (most important)
- Experience level match
- Location compatibility
- Industry relevance

Respond with ONLY valid JSON:
{
  "score": 85,
  "strengths": ["Strong Laravel experience", "5+ years backend"],
  "weaknesses": ["Missing Docker experience"],
  "matchedSkills": ["Laravel", "PHP", "MySQL"],
  "missingSkills": ["Docker", "Redis", "AWS"],
  "verdict": "good_match" | "possible_match" | "poor_match"
}`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 1000 },
    });

    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (err) {
    logger.warn(`MatchAgent: AI scoring failed: ${err.message}`);
  }

  return fallbackScore(resumeData, job);
}

function fallbackScore(resumeData, job) {
  const resumeSkills = (resumeData.skills || []).map(s => s.toLowerCase());
  const jobSkills = (job.skills || []).map(s => s.toLowerCase());

  const matched = resumeSkills.filter(s => jobSkills.includes(s));
  const missing = jobSkills.filter(s => !resumeSkills.includes(s));
  const overlap = jobSkills.length > 0 ? (matched.length / jobSkills.length) * 100 : 50;

  return {
    score: Math.round(overlap),
    strengths: matched.length > 0 ? [`${matched.length} matching skills`] : [],
    weaknesses: missing.length > 0 ? [`Missing ${missing.length} required skills`] : [],
    matchedSkills: matched,
    missingSkills: missing,
    verdict: overlap >= 60 ? 'good_match' : overlap >= 30 ? 'possible_match' : 'poor_match',
  };
}

module.exports = scoreJobMatch;
```

#### Tool 2: `batch_score_jobs`

Wraps the existing `jobRankingService.rerank()` for batch scoring multiple jobs.

```js
// src/agents/tools/batchScoreJobs.js
const jobRankingService = require('../../services/jobRankingService');

async function batchScoreJobs({ resumeData, jobs, domain }) {
  if (!jobs || jobs.length === 0) {
    return { scored: [], total: 0 };
  }

  const scored = await jobRankingService.rerank(resumeData, jobs, domain);
  return { scored, total: scored.length };
}
```

#### Tool 3: `analyze_gap`

Takes a match result and produces actionable recommendations.

```js
// src/agents/tools/analyzeGap.js
async function analyzeGap({ matchResult, resumeData }) {
  const { missingSkills = [], score, verdict } = matchResult;

  if (!missingSkills || missingSkills.length === 0) {
    return {
      hasGaps: false,
      recommendations: [],
      estimatedTimeToFill: '0 days',
    };
  }

  // Categorize missing skills by estimated learning time
  const quickWins = [];    // 1-2 days
  const mediumTerm = [];   // 1-2 weeks
  const longTerm = [];     // 1+ months

  for (const skill of missingSkills) {
    const lower = skill.toLowerCase();
    // Quick wins: tools, frameworks the user likely has adjacent experience with
    if (['docker', 'redis', 'ci/cd', 'git', 'linux'].some(k => lower.includes(k))) {
      quickWins.push(skill);
    }
    // Medium: adjacent technologies
    else if (['aws', 'gcp', 'azure', 'kubernetes', 'rabbitmq', 'graphql'].some(k => lower.includes(k))) {
      mediumTerm.push(skill);
    }
    // Long: new paradigms
    else {
      longTerm.push(skill);
    }
  }

  const recommendations = [
    ...quickWins.map(s => ({
      skill: s,
      effort: 'quick',
      estimatedDays: 2,
      suggestion: `Spend 2 days learning ${s} basics — tutorials and hands-on practice`,
    })),
    ...mediumTerm.map(s => ({
      skill: s,
      effort: 'medium',
      estimatedDays: 14,
      suggestion: `Dedicate 2 weeks to ${s} — online course + small project`,
    })),
    ...longTerm.map(s => ({
      skill: s,
      effort: 'long',
      estimatedDays: 30,
      suggestion: `Plan a 1-month roadmap for ${s} — structured learning path`,
    })),
  ];

  const totalDays = recommendations.reduce((sum, r) => sum + r.estimatedDays, 0);

  return {
    hasGaps: true,
    quickWins: quickWins.length,
    mediumTerm: mediumTerm.length,
    longTerm: longTerm.length,
    recommendations,
    estimatedTimeToFill: `${Math.min(totalDays, 90)} days`,
    priorityOrder: [...quickWins, ...mediumTerm, ...longTerm],
  };
}

module.exports = analyzeGap;
```

### 2.3 MatchAgent Class

```js
// src/agents/MatchAgent.js
const Agent = require('./core/Agent');
const { Tool } = require('./core/Tool');
const scoreJobMatch = require('./tools/scoreJobMatch');
const batchScoreJobs = require('./tools/batchScoreJobs');
const analyzeGap = require('./tools/analyzeGap');
const { logger } = require('../config/logger');

class MatchAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: 'score_job_match',
        description: 'Score a single job against a candidate\'s resume. Returns a compatibility score (0-100), strengths, weaknesses, and matched/missing skills.',
        inputSchema: {
          type: 'object',
          properties: {
            resumeData: { type: 'object', description: 'Normalized resume extracted data' },
            job: { type: 'object', description: 'Job listing object' },
          },
          required: ['resumeData', 'job'],
        },
        handler: scoreJobMatch,
      }),
      new Tool({
        name: 'batch_score_jobs',
        description: 'Score multiple jobs against a resume in one batch call. More efficient for large job lists.',
        inputSchema: {
          type: 'object',
          properties: {
            resumeData: { type: 'object', description: 'Normalized resume data' },
            jobs: { type: 'array', description: 'Array of job objects to score' },
            domain: { type: 'string', description: 'Job domain (e.g., "backend", "frontend")' },
          },
          required: ['resumeData', 'jobs'],
        },
        handler: batchScoreJobs,
      }),
      new Tool({
        name: 'analyze_gap',
        description: 'Analyze missing skills from a match result and produce actionable learning recommendations with estimated time to fill each gap.',
        inputSchema: {
          type: 'object',
          properties: {
            matchResult: { type: 'object', description: 'Result from score_job_match tool' },
            resumeData: { type: 'object', description: 'Normalized resume data' },
          },
          required: ['matchResult', 'resumeData'],
        },
        handler: analyzeGap,
      }),
    ];

    super({
      name: 'MatchAgent',
      description: 'Compares resumes against job descriptions to produce compatibility scores with detailed skill gap analysis and learning recommendations.',
      tools,
      memory,
    });
  }

  /**
   * Score a single job against the user's resume.
   */
  async matchJob(userId, job, resumeData) {
    logger.info(`MatchAgent: matchJob(${job.title} at ${job.company})`);

    const matchResult = await scoreJobMatch({ resumeData, job });
    const gapAnalysis = await analyzeGap({ matchResult, resumeData });

    if (this.memory) {
      await this.memory.setContext('MatchAgent', userId, {
        lastMatch: {
          jobId: job._id,
          score: matchResult.score,
          missingSkills: matchResult.missingSkills,
          matchedAt: new Date(),
        },
      });

      // Learn about missing skills for this user
      for (const skill of (matchResult.missingSkills || [])) {
        await this.memory.learnPreference(userId, 'commonWeaknesses', skill);
      }
    }

    return {
      success: true,
      data: {
        match: matchResult,
        gapAnalysis,
        resumeScore: resumeData.score || null,
      },
    };
  }

  /**
   * Batch-score multiple jobs and return sorted results.
   */
  async matchJobs(userId, jobs, domain) {
    logger.info(`MatchAgent: matchJobs(${jobs.length} jobs, domain=${domain})`);

    // Load resume
    const Resume = require('../models/Resume');
    const resume = await Resume.findOne({ userId }).lean();
    if (!resume || !resume.extractedData) {
      return { success: false, message: 'No processed resume found' };
    }

    const scoredResult = await batchScoreJobs({
      resumeData: resume.extractedData,
      jobs,
      domain,
    });

    // Sort by score descending
    scoredResult.scored.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    return {
      success: true,
      data: {
        jobs: scoredResult.scored,
        total: scoredResult.total,
        domain,
        topScore: scoredResult.scored[0]?.matchScore || 0,
        averageScore: scoredResult.total > 0
          ? Math.round(scoredResult.scored.reduce((s, j) => s + (j.matchScore || 0), 0) / scoredResult.total)
          : 0,
      },
    };
  }
}

module.exports = MatchAgent;
```

---

## 3. Deprecating the Old Pipeline

The existing pipeline in `src/services/recommendationService.js` is replaced by the agent-based approach:

| Old Function | Replaced By |
|---|---|
| `recommendationService.getRecommendations()` | `MatchAgent.matchJobs()` + `JobSearchAgent.searchJobs()` |
| `jobRetrievalService.retrieve()` | `JobSearchAgent.searchJobBoards` tool |
| `jobRankingService.rerank()` | `MatchAgent.batchScoreJobs` tool |
| `resumeQueryService.extractQuery()` | `ResumeAgent.tools.extractDomainKeywords` |

### Backward Compatibility

Keep `recommendationService.js` but have it delegate to the agents:

```js
// src/services/recommendationService.js — updated
const registry = require('../agents/core/AgentRegistry');

async function getRecommendations(userId) {
  const matchAgent = registry.get('MatchAgent');
  const jobSearchAgent = registry.get('JobSearchAgent');

  // Load resume to get domain
  const Resume = require('../models/Resume');
  const resume = await Resume.findOne({ userId }).lean();
  if (!resume || !resume.extractedData) {
    return { jobs: [], totalResults: 0, domain: null, message: 'Upload a resume first' };
  }

  // Search jobs (from existing DB, not external API — to maintain current behavior)
  const JobListing = require('../models/JobListing');
  const ed = resume.extractedData;
  const resumeQueryService = require('./resumeQueryService');
  const query = resumeQueryService.extractQuery(ed);

  if (!query.domain) {
    return { jobs: [], totalResults: 0, domain: null, message: 'Could not determine job domain' };
  }

  const jobs = await JobListing.find({
    domain: query.domain,
    $text: { $search: query.keywords.join(' ') },
  }).limit(50).lean();

  // Delegate scoring to MatchAgent
  const result = await matchAgent.matchJobs(userId, jobs, query.domain);
  return {
    jobs: result.data?.jobs || [],
    totalResults: result.data?.total || 0,
    domain: query.domain,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getRecommendations };
```

---

## 4. New Routes

Add to `src/routes/agentRoutes.js`:

```js
// Job Search Agent endpoints
router.post('/jobs/search', auth, agentController.searchJobs);
router.post('/jobs/match', auth, agentController.matchJobs);
router.post('/jobs/match-single', auth, agentController.matchSingleJob);
router.get('/jobs/:jobId', auth, agentController.getJobDetails);
```

Add to `src/controllers/agentController.js`:

```js
// ── Job Search Agent ──

exports.searchJobs = async (req, res) => {
  try {
    const { query, location, page, numPages, minimumMatch, skills } = req.body;
    if (!query) {
      return res.status(400).json({ success: false, message: 'Search query is required' });
    }

    const agent = registry.get('JobSearchAgent');
    const result = await agent.searchJobs(req.user.id, query, location, {
      page, numPages, minimumMatch, skills,
    });
    res.json(result);
  } catch (err) {
    logger.error(`agentController.searchJobs: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.matchJobs = async (req, res) => {
  try {
    const { jobs, domain } = req.body;
    if (!jobs || !domain) {
      return res.status(400).json({ success: false, message: 'jobs array and domain are required' });
    }

    const agent = registry.get('MatchAgent');
    const result = await agent.matchJobs(req.user.id, jobs, domain);
    res.json(result);
  } catch (err) {
    logger.error(`agentController.matchJobs: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.matchSingleJob = async (req, res) => {
  try {
    const { job } = req.body;
    if (!job) {
      return res.status(400).json({ success: false, message: 'Job data is required' });
    }

    const Resume = require('../models/Resume');
    const resume = await Resume.findOne({ userId: req.user.id }).lean();
    if (!resume || !resume.extractedData) {
      return res.status(400).json({ success: false, message: 'No processed resume found' });
    }

    const agent = registry.get('MatchAgent');
    const result = await agent.matchJob(req.user.id, job, resume.extractedData);
    res.json(result);
  } catch (err) {
    logger.error(`agentController.matchSingleJob: ${err.message}`);
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getJobDetails = async (req, res) => {
  try {
    const { jobId } = req.params;
    const agent = registry.get('JobSearchAgent');
    const tool = agent.tools.get('get_job_details');
    const result = await tool.execute({ jobId });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
```

---

## 5. Register in `src/agents/init.js`

```js
// Add to initializeAgents():
const JobSearchAgent = require('./JobSearchAgent');
const MatchAgent = require('./MatchAgent');

const jobSearchAgent = new JobSearchAgent(memoryStore);
registry.register(jobSearchAgent);
logger.info(`[Agents] Registered: ${jobSearchAgent.name}`);

const matchAgent = new MatchAgent(memoryStore);
registry.register(matchAgent);
logger.info(`[Agents] Registered: ${matchAgent.name}`);
```

---

## 6. Tests

### Unit: `tests/unit/agents/JobSearchAgent.test.js`

```js
const JobSearchAgent = require('../../../src/agents/JobSearchAgent');

describe('JobSearchAgent', () => {
  let agent;

  beforeEach(() => {
    agent = new JobSearchAgent({});
  });

  it('is created with 5 tools', () => {
    expect(agent.tools.list()).toHaveLength(5);
    expect(agent.tools.has('search_job_boards')).toBe(true);
    expect(agent.tools.has('deduplicate_jobs')).toBe(true);
    expect(agent.tools.has('filter_scams')).toBe(true);
    expect(agent.tools.has('filter_by_skills')).toBe(true);
    expect(agent.tools.has('get_job_details')).toBe(true);
  });

  describe('deduplicate_jobs', () => {
    it('removes exact duplicates', async () => {
      const tool = agent.tools.get('deduplicate_jobs');
      const jobs = [
        { title: 'Developer', company: 'Acme', location: 'Lagos' },
        { title: 'Developer', company: 'Acme', location: 'Lagos' },
        { title: 'Designer', company: 'Beta', location: 'Abuja' },
      ];
      const result = await tool.execute({ jobs });
      expect(result.jobs).toHaveLength(2);
      expect(result.removed).toBe(1);
    });
  });

  describe('filter_scams', () => {
    it('flags suspicious listings', async () => {
      const tool = agent.tools.get('filter_scams');
      const jobs = [
        { title: 'Software Engineer', company: 'Real Corp', salary: '100000' },
        { title: 'Model needed urgently', company: '', salary: '5000 per day' },
      ];
      const result = await tool.execute({ jobs });
      expect(result.jobs).toHaveLength(1);
      expect(result.filtered).toBe(1);
      expect(result.flags[0].title).toBe('Model needed urgently');
    });
  });

  describe('filter_by_skills', () => {
    it('keeps jobs with matching skills', async () => {
      const tool = agent.tools.get('filter_by_skills');
      const jobs = [
        { title: 'Laravel Dev', skills: ['Laravel', 'PHP', 'MySQL'] },
        { title: 'React Dev', skills: ['React', 'TypeScript', 'CSS'] },
      ];
      const result = await tool.execute({
        jobs,
        userSkills: ['Laravel', 'PHP'],
        minimumMatch: 1,
      });
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].title).toBe('Laravel Dev');
    });
  });
});
```

### Unit: `tests/unit/agents/MatchAgent.test.js`

```js
const MatchAgent = require('../../../src/agents/MatchAgent');

describe('MatchAgent', () => {
  let agent;

  beforeEach(() => {
    agent = new MatchAgent({});
  });

  it('is created with 3 tools', () => {
    expect(agent.tools.list()).toHaveLength(3);
    expect(agent.tools.has('score_job_match')).toBe(true);
    expect(agent.tools.has('batch_score_jobs')).toBe(true);
    expect(agent.tools.has('analyze_gap')).toBe(true);
  });

  describe('analyze_gap', () => {
    it('returns no gaps when no missing skills', async () => {
      const tool = agent.tools.get('analyze_gap');
      const result = await tool.execute({
        matchResult: { score: 90, missingSkills: [] },
        resumeData: {},
      });
      expect(result.hasGaps).toBe(false);
    });

    it('categorizes missing skills by learning time', async () => {
      const tool = agent.tools.get('analyze_gap');
      const result = await tool.execute({
        matchResult: { score: 60, missingSkills: ['Docker', 'Kubernetes', 'AWS', 'Machine Learning'] },
        resumeData: {},
      });
      expect(result.hasGaps).toBe(true);
      expect(result.quickWins).toBe(1);  // Docker
      expect(result.mediumTerm).toBe(2); // Kubernetes, AWS
      expect(result.longTerm).toBe(1);   // Machine Learning
    });
  });
});
```

---

## 7. Files Created / Modified Summary

### New files (8):

| File | Purpose |
|---|---|
| `src/agents/JobSearchAgent.js` | Job search agent class |
| `src/agents/tools/searchJobBoards.js` | Tool: query external job APIs |
| `src/agents/tools/deduplicateJobs.js` | Tool: remove duplicate listings |
| `src/agents/tools/filterScams.js` | Tool: scam detection |
| `src/agents/tools/filterBySkills.js` | Tool: skill-based filtering |
| `src/agents/tools/getJobDetails.js` | Tool: fetch job details |
| `src/agents/MatchAgent.js` | Match agent class |
| `src/agents/tools/scoreJobMatch.js` | Tool: single job scoring |
| `src/agents/tools/batchScoreJobs.js` | Tool: batch job scoring |
| `src/agents/tools/analyzeGap.js` | Tool: skill gap analysis |
| `tests/unit/agents/JobSearchAgent.test.js` | Unit tests |
| `tests/unit/agents/MatchAgent.test.js` | Unit tests |

### Modified files (3):

| File | Change |
|---|---|
| `src/agents/init.js` | Register JobSearchAgent + MatchAgent |
| `src/routes/agentRoutes.js` | Add job search and match endpoints |
| `src/controllers/agentController.js` | Add job search/match handlers |
| `src/services/recommendationService.js` | Delegate to agents (backward compat) |

---

## 8. Rollout Checklist

- [ ] JobSearchAgent can search external APIs and return jobs
- [ ] Duplicate detection correctly removes duplicates
- [ ] Scam filter catches suspicious listings
- [ ] Skill filter correctly filters jobs
- [ ] MatchAgent scores a single job against resume
- [ ] MatchAgent batch-scores multiple jobs
- [ ] Gap analysis produces categorized recommendations
- [ ] `/api/agents/jobs/search` endpoint works
- [ ] `/api/agents/jobs/match` endpoint works
- [ ] `/api/agents/jobs/match-single` endpoint works
- [ ] Existing `GET /api/jobs/recommended` still works (backward compat)
- [ ] All existing tests pass
- [ ] ESLint passes
