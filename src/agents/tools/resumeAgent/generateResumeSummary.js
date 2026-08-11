const aiService = require('../../../services/ai/AIService');
const { withRetry } = require('../../../utils/retry');

async function generateResumeSummary({ extractedData, style, maxLength }) {
  if (!extractedData) throw new Error('extractedData is required');

  const styleGuide = style === 'brief'
    ? 'Write a very concise 1-2 sentence summary.'
    : style === 'detailed'
      ? 'Write a comprehensive 4-5 sentence summary with specific achievements.'
      : 'Write a professional 2-3 sentence summary.';

  const prompt = `${styleGuide}

RESUME DATA:
${JSON.stringify(extractedData, null, 2)}

MAX LENGTH: ${maxLength || 200} characters

Return ONLY the summary text as a plain string, no JSON formatting.`;

  const response = await withRetry(() => aiService.generate(prompt, { temperature: 0.4, maxTokens: 500 }));
  return { summary: response.trim(), style: style || 'professional', length: response.trim().length };
}

module.exports = generateResumeSummary;
