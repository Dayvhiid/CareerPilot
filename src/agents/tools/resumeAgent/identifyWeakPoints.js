const aiService = require('../../../services/ai/AIService');
const { withRetry } = require('../../../utils/retry');

async function identifyWeakPoints({ extractedData }) {
  if (!extractedData) throw new Error('extractedData is required');

  const prompt = `You are a career coach reviewing a resume. Identify the weakest areas and provide actionable feedback.

RESUME DATA:
${JSON.stringify(extractedData, null, 2)}

Return ONLY valid JSON:
{
  "weakPoints": [
    {
      "area": "e.g., Work Experience, Skills, Summary",
      "severity": "critical|major|minor",
      "issue": "description of the problem",
      "impact": "how this affects job applications",
      "suggestion": "specific actionable fix"
    }
  ],
  "overallAssessment": "2-3 sentence summary of the main weaknesses"
}`;

  const response = await withRetry(() => aiService.generate(prompt, { temperature: 0.3, maxTokens: 2000 }));
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse weak points analysis');

  return JSON.parse(jsonMatch[0]);
}

module.exports = identifyWeakPoints;
