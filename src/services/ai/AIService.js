const { logger } = require('../../config/logger');
const { withRetry } = require('../../utils/retry');

class AIService {
  constructor() {
    this.primaryExtractor = null;
    this.fallbackExtractor = null;
    this.embeddingService = null;
    this.initialize();
  }

  initialize() {
    if (process.env.GEMINI_API_KEY) {
      const GeminiProvider = require('./providers/gemini');
      this.primaryExtractor = new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
      });
      this.embeddingService = this.primaryExtractor;
    }

    if (process.env.GROQ_API_KEY) {
      const GroqProvider = require('./providers/groq');
      this.fallbackExtractor = new GroqProvider({
        apiKey: process.env.GROQ_API_KEY,
        model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
      });
      if (!this.embeddingService && process.env.GEMINI_API_KEY) {
        const GeminiProvider = require('./providers/gemini');
        this.embeddingService = new GeminiProvider({
          apiKey: process.env.GEMINI_API_KEY,
          model: 'gemini-embedding-2',
        });
      }
    }

    if (!this.fallbackExtractor && process.env.XAI_API_KEY) {
      const XaiProvider = require('./providers/xai');
      this.fallbackExtractor = new XaiProvider({
        apiKey: process.env.XAI_API_KEY,
        model: process.env.XAI_MODEL || 'grok-4.3',
      });
    }
  }

  async extractResumeData(text) {
    const providers = [this.primaryExtractor, this.fallbackExtractor].filter(Boolean);

    let lastError;
    for (const provider of providers) {
      try {
        const response = await withRetry(() => provider.generate(this.buildExtractionPrompt(text)));
        return this.parseJSONResponse(response);
      } catch (err) {
        lastError = err;
        logger.warn(`[ai] Extractor failed: ${err.message}`);
      }
    }

    throw lastError || new Error('All AI providers failed');
  }

  async computeEmbedding(text) {
    if (!this.embeddingService) {
      logger.warn('[ai] No embedding service available, returning zero vector');
      return null;
    }

    const embedding = await this.embeddingService.embed(text);
    return embedding;
  }

  buildExtractionPrompt(text) {
    return `You are a resume parsing engine. Extract structured data from the resume text below and return ONLY valid JSON with no additional text, explanation, or markdown formatting.

The JSON must follow this exact schema:
{
  "name": "string (full name of the candidate)",
  "email": "string",
  "phone": "string",
  "location": "string (city, state, country)",
  "summary": "string (brief professional summary from resume)",
  "currentJobTitle": "string (most recent or current job title)",
  "yearsOfExperience": "number (total years of professional experience)",
  "skills": ["array of technical/professional skills"],
  "softSkills": ["array of soft skills like leadership, communication, etc."],
  "industryExperience": ["array of industries the candidate has worked in"],
  "jobTitles": ["array of all job titles mentioned"],
  "companies": ["array of companies worked at"],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string",
      "location": "string"
    }
  ],
  "workExperience": [
    {
      "position": "string",
      "company": "string",
      "duration": "string",
      "location": "string",
      "responsibilities": "string (brief description of responsibilities)",
      "contact": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "dates": "string"
    }
  ],
  "certificates": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string"
    }
  ],
  "interests": ["array of interests"],
  "achievements": ["array of achievements"],
  "languages": ["array of languages"],
  "linkedinUrl": "string",
  "githubUrl": "string",
  "portfolioUrl": "string",
  "generatedSummary": "string (write a 2-3 sentence professional summary based on the resume)"

Return ONLY the JSON object. No markdown, no code fences, no extra text.

Resume text:
${text}`;
  }

  parseJSONResponse(response) {
    const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  }
}

module.exports = new AIService();
