const aiService = require('../../../services/ai/AIService');
const { withRetry } = require('../../../utils/retry');

async function tailorResume({ extractedData, jobDescription, targetCompany, targetRole }) {
  if (!extractedData) throw new Error('extractedData is required');
  if (!jobDescription) throw new Error('jobDescription is required');

  const prompt = `You are a professional resume tailor. Adapt the following resume to better match the given job.

CURRENT RESUME DATA:
${JSON.stringify(extractedData, null, 2)}

JOB DESCRIPTION:
${jobDescription}

TARGET COMPANY: ${targetCompany || 'N/A'}
TARGET ROLE: ${targetRole || 'N/A'}

Return ONLY valid JSON:
{
  "originalScore": <original resume score 1-10>,
  "tailoredScore": <estimated new score 1-10>,
  "changes": [
    {
      "section": "summary|skills|experience|education",
      "original": "original content",
      "tailored": "tailored content",
      "reason": "why this change improves the match"
    }
  ],
  "addedSkills": ["skills from JD added to resume"],
  "removedSkills": ["less relevant skills removed"],
  "keyAchievementsToHighlight": ["achievements that match the role"],
  "tailoredSummary": "a 2-3 sentence summary tailored to this role"
}`;

  const response = await withRetry(() => aiService.generate(prompt, { temperature: 0.3, maxTokens: 3000 }));
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse tailoring response');

  return JSON.parse(jsonMatch[0]);
}

module.exports = tailorResume;
