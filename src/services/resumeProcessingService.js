const { logger } = require('../config/logger');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const extractor = require('./resumeExtractor');
const aiService = require('./ai/AIService');
const { withRetry } = require('../utils/retry');
const { calculateScore } = require('./resumeScoringService');

async function extractTextFromFile(filePath, mimeType) {
  let extractedText = '';

  if (mimeType === 'application/pdf') {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdfParse(dataBuffer);
    extractedText = data.text;
  } else if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    const result = await mammoth.extractRawText({ path: filePath });
    extractedText = result.value;
  } else if (mimeType === 'application/msword') {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } catch (err) {
      logger.warn('Error with DOC file, using fallback:', err);
      extractedText = '';
    }
  } else if (mimeType === 'text/plain') {
    extractedText = await fs.readFile(filePath, 'utf8');
  }

  return extractedText;
}

async function extractDataWithAI(extractedText) {
  let extractedData = null;
  let processingMethod = 'unknown';

  try {
    extractedData = await withRetry(() => aiService.extractResumeData(extractedText), {
      maxRetries: 2,
      baseDelay: 2000,
    });
    if (extractedData && typeof extractedData === 'object') {
      processingMethod = 'AI Service';
      logger.info('Successfully processed with AI Service');
    }
  } catch (aiError) {
    logger.warn('AI extraction failed:', aiError.message);
    extractedData = null;
  }

  if (extractedData && typeof extractedData === 'object') {
    const hasContent =
      extractedData.name ||
      extractedData.skills?.length > 0 ||
      extractedData.jobTitles?.length > 0 ||
      extractedData.summary;
    if (!hasContent) {
      logger.warn('AI returned valid JSON but all fields are empty');
      extractedData = null;
    }
  }

  if (!extractedData && extractedText) {
    logger.info('Attempting text-based fallback extraction');
    const basic = extractor.getEmptyResumeData();
    basic.name = extractor.extractNameEnhanced(extractedText.split('\n').filter(Boolean), extractedText);
    basic.email = (extractedText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/) || [])[0] || '';
    const phoneMatch = extractedText.match(/(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/);
    basic.phone = phoneMatch ? phoneMatch[0].trim() : '';
    basic.location = extractor.extractLocationEnhanced(extractedText);
    const cleaned = extractedText.replace(/\s+/g, ' ').trim();
    basic.summary = cleaned.substring(0, 400);
    const titleMatch = cleaned.match(/(?:^|\n)([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/);
    if (titleMatch) basic.currentJobTitle = titleMatch[1];
    basic.skills = extractor.extractSkills(extractedText);
    const experience = extractor.extractJobExperience(extractedText);
    basic.jobTitles = experience.titles || [];
    basic.companies = experience.companies || [];
    extractedData = basic;
    processingMethod = 'Text fallback';
  }

  if (!extractedData) {
    extractedData = extractor.getEmptyResumeData();
    processingMethod = 'Empty fallback';
  }

  extractedData.processingMethod = processingMethod;
  extractedData.processedAt = new Date().toISOString();
  extractedData = extractor.normalizeExtractedData(extractedData);
  extractedData.score = calculateScore(extractedData);

  return { extractedData, extractedText, processingMethod };
}

module.exports = { extractTextFromFile, extractDataWithAI };
