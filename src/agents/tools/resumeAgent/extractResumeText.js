const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const { logger } = require('../../../config/logger');

async function extractResumeText({ filePath, mimeType }) {
  if (!filePath) throw new Error('filePath is required');

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
      logger.warn('Error extracting DOC file:', err);
      extractedText = '';
    }
  } else if (mimeType === 'text/plain') {
    extractedText = await fs.readFile(filePath, 'utf8');
  } else {
    throw new Error(`Unsupported file type: ${mimeType}`);
  }

  logger.debug(`Extracted ${extractedText.length} characters from resume`);
  return { text: extractedText, length: extractedText.length };
}

module.exports = extractResumeText;
