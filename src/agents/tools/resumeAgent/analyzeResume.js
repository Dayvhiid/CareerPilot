const aiService = require('../../../services/ai/AIService');
const { withRetry } = require('../../../utils/retry');

async function analyzeResume({ extractedText, extractedData }) {
  if (!extractedText && !extractedData) {
    throw new Error('Either extractedText or extractedData is required');
  }

  const input = extractedData || await aiService.extractResumeData(extractedText);

  const prompt = `You are a resume analyst. Review the following resume data and provide detailed analysis.

RESUME DATA:
${JSON.stringify(input, null, 2)}

Return ONLY valid JSON:
{
  "name": "candidate name",
  "currentJobTitle": "current or most recent title",
  "yearsOfExperience": <number>,
  "domain": "inferred career domain (e.g., Software Engineering, Data Science)",
  "skillCount": <number of unique skills>,
  "topSkills": ["top 5 most relevant skills"],
  "skillGaps": ["commonly expected skills that are missing"],
  "experienceLevel": "entry|mid|senior|lead",
  "strengths": ["3-5 key strengths from the resume"],
  "weaknesses": ["2-4 areas for improvement"],
  "summary": "2-3 sentence professional summary"
}`;

  const response = await withRetry(() => aiService.generate(prompt, { temperature: 0.2, maxTokens: 2000 }));
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('Failed to parse AI analysis response');

  return JSON.parse(jsonMatch[0]);
}

module.exports = analyzeResume;
