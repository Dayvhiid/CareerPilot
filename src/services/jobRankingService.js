const axios = require('axios');

const GEMINI_MODEL = 'gemini-2.5-flash';

async function rerank(resumeData, jobs, domain) {
  if (!jobs || jobs.length === 0) {
    console.log('jobRankingService: no jobs to rerank');
    return [];
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('jobRankingService: GEMINI_API_KEY not set — returning unscored');
    return jobs.map(j => ({ ...j, matchScore: 50, matchReasons: ['AI scoring unavailable'] }));
  }

  const candidateProfile = buildProfile(resumeData);
  const jobList = jobs.map((j, i) =>
    `${i + 1}. [${j.title}] at ${j.company} — ${j.location || 'No location'} — Skills: ${(j.skills || []).join(', ')}`
  ).join('\n');

  const prompt = `You are a job matching AI. Given a candidate's resume and a list of jobs (all in the domain "${domain}"), score each job's relevance to the candidate on a scale of 0-100.

Rules:
- 90-100: Perfect match (same role type, required skills overlap heavily)
- 70-89: Strong match (good skill overlap, relevant experience)
- 50-69: Moderate match (some skill overlap, adjacent role)
- 25-49: Weak match (minimal overlap)
- 0-24: Poor match (wrong subdomain or skills)
- Be strict — a score of 100 means this job is essentially a copy of the candidate's current role

CANDIDATE PROFILE:
${candidateProfile}

JOBS (all in ${domain}):
${jobList}

Respond with ONLY a JSON array of objects, one per job, in order:
[{ "index": 1, "score": 85, "reasons": ["Strong skill overlap in React/Node", "5+ years full-stack experience matches"], "matchedSkills": ["React", "Node.js"], "missingSkills": ["TypeScript"] }]`;

  console.log(`jobRankingService: reranking ${jobs.length} jobs with ${GEMINI_MODEL}`);

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
  const start = Date.now();

  try {
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
    });

    const duration = Date.now() - start;
    const text = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    console.log(`jobRankingService: Gemini responded in ${duration}ms (${text.length} chars)`);

    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.warn('jobRankingService: no JSON array in response — returning unscored');
      return jobs.map((j, i) => ({ ...j, matchScore: 50, matchReasons: ['Failed to parse AI response'] }));
    }

    const scores = JSON.parse(jsonMatch[0]);
    console.log(`jobRankingService: parsed ${scores.length} score entries`);

    return jobs.map((job, i) => {
      const s = scores.find(sc => sc.index === i + 1) || {};
      return {
        ...job,
        matchScore: s.score || 50,
        matchReasons: s.reasons || [],
        matchedSkills: s.matchedSkills || [],
        missingSkills: s.missingSkills || [],
        careerFit: s.score >= 70 ? 'good' : s.score >= 40 ? 'moderate' : 'stretch'
      };
    });
  } catch (err) {
    const duration = Date.now() - start;
    console.error(`jobRankingService: FAILED after ${duration}ms: ${err.message}`);
    return jobs.map(j => ({ ...j, matchScore: 50, matchReasons: ['AI scoring unavailable'] }));
  }
}

function buildProfile(resumeData) {
  return [
    `Current/Most Recent Title: ${resumeData.currentJobTitle || 'N/A'}`,
    `Years of Experience: ${resumeData.yearsOfExperience || 'N/A'}`,
    `Skills: ${(resumeData.skills || []).join(', ')}`,
    `Past Titles: ${(resumeData.jobTitles || []).join(', ')}`,
    `Education: ${(resumeData.education || []).map(e => `${e.degree} in ${e.field}`).join(', ')}`,
    `Location: ${resumeData.location || 'N/A'}`,
    `Summary: ${(resumeData.summary || '').substring(0, 500)}`
  ].filter(Boolean).join('\n');
}

module.exports = { rerank };
