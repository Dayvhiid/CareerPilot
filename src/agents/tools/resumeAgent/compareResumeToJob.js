const aiService = require('../../../services/ai/AIService');
const { withRetry } = require('../../../utils/retry');

async function compareResumeToJob({ extractedData, jobDescription, jobTitle }) {
  if (!extractedData) throw new Error('extractedData is required');
  if (!jobDescription) throw new Error('jobDescription is required');

  const prompt = `Compare this resume to the job description and provide a detailed match analysis.

RESUME DATA:
${JSON.stringify(extractedData, null, 2)}

JOB TITLE: ${jobTitle || 'N/A'}
JOB DESCRIPTION:
${jobDescription}

Return ONLY valid JSON:
{
  "matchScore": <number 0-100>,
  "matchedSkills": ["skills from resume that match the job"],
  "missingSkills": ["skills required by the job but missing from resume"],
  "matchedExperience": ["experience entries relevant to the role"],
  "overallFit": "excellent|good|fair|poor",
  "strengthsForRole": ["3-5 reasons this candidate fits"],
  "gapsForRole": ["2-4 gaps to address"],
  "recommendation": "apply|prepare|improve|skip",
  "preparationTips": ["actionable tips to improve fit before applying"]
}`;

  const response = await withRetry(() => aiService.generate(prompt, { temperature: 0.2, maxTokens: 2500 }));
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse comparison response');

  return JSON.parse(jsonMatch[0]);
}

module.exports = compareResumeToJob;
