const { logger } = require('../config/logger');
const Resume = require('../models/Resume');
const fs = require('fs').promises;
const resumeProcessing = require('../services/resumeProcessingService');

async function updateProcessingState(resumeId, { stage, progress, message }) {
  const update = {
    processingUpdatedAt: new Date(),
  };

  if (stage) update.processingStage = stage;
  if (typeof progress === 'number') update.processingProgress = Math.max(0, Math.min(100, progress));
  if (message) update.processingMessage = message;

  logger.info(
    `Resume ${resumeId} -> ${stage || 'status'} (${typeof progress === 'number' ? progress + '%' : 'n/a'}): ${message || ''}`
  );
  await Resume.findByIdAndUpdate(resumeId, update);
}

// Upload and process resume
exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const userId = req.user.id;
    const { filename, originalname, size, mimetype, path: filePath } = req.file;

    // Create new resume record first
    const resume = new Resume({
      userId,
      filename,
      originalName: originalname,
      fileSize: size,
      fileType: mimetype,
      filePath,
      processingStage: 'queued',
      processingProgress: 0,
      processingMessage: 'Resume uploaded and waiting to be processed',
      processingStartedAt: new Date(),
      processingUpdatedAt: new Date(),
    });

    await resume.save();

    // Verify new file exists on disk before cleaning up old one
    try {
      await fs.access(filePath);
    } catch (err) {
      await Resume.findByIdAndDelete(resume._id);
      return res.status(400).json({ success: false, message: 'Uploaded file is not accessible' });
    }

    // Delete old resume after new one is safely saved
    const existingResume = await Resume.findOne({ userId, _id: { $ne: resume._id } });
    if (existingResume) {
      try {
        await fs.unlink(existingResume.filePath);
      } catch (err) {
        logger.error('Error deleting old file:', err);
      }
      await Resume.findByIdAndDelete(existingResume._id);
    }

    // Start text extraction in background via Bull queue
    logger.info(`Scheduling resume extraction for ${resume._id}`);
    try {
      const { resumeProcessingQueue } = require('../workers/queue');
      await resumeProcessingQueue.add(
        {
          resumeId: resume._id,
          filePath,
          mimeType: mimetype,
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
        }
      );
    } catch (queueErr) {
      logger.warn(`Queue unavailable, falling back to inline processing: ${queueErr.message}`);
      extractTextFromFile(resume._id, filePath, mimetype).catch((error) => {
        logger.error(`Background resume extraction failed for ${resume._id}:`, error);
      });
    }

    res.json({
      success: true,
      message: 'Resume uploaded successfully',
      resume: {
        id: resume._id,
        filename: resume.originalName,
        size: resume.fileSize,
        uploadedAt: resume.createdAt,
        isProcessed: resume.isProcessed,
        processingStage: resume.processingStage,
        processingProgress: resume.processingProgress,
        processingMessage: 'Processing has started',
      },
    });
  } catch (error) {
    logger.error('Upload error:', error);
    res.status(500).json({ success: false, message: 'Server error', errors: [{ message: error.message }] });
  }
};

// Get user's resume
exports.getResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resume = await Resume.findOne({ userId }).lean();

    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    res.json({
      success: true,
      resume: {
        id: resume._id,
        filename: resume.originalName,
        size: resume.fileSize,
        uploadedAt: resume.createdAt,
        isProcessed: resume.isProcessed,
        processingStage: resume.processingStage,
        processingProgress: resume.processingProgress,
        processingMessage: resume.processingMessage,
        processingError: resume.processingError,
        extractedData: resume.extractedData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', errors: [{ message: error.message }] });
  }
};

// Delete resume
exports.deleteResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resume = await Resume.findOne({ userId });

    if (!resume) {
      return res.status(404).json({ success: false, message: 'Resume not found' });
    }

    // Delete file
    try {
      await fs.unlink(resume.filePath);
    } catch (err) {
      logger.error('Error deleting file:', err);
    }

    await Resume.findByIdAndDelete(resume._id);

    res.json({ success: true, message: 'Resume deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error', errors: [{ message: error.message }] });
  }
};

async function extractTextFromFile(resumeId, filePath, mimeType) {
  try {
    logger.info(`extractTextFromFile invoked for ${resumeId} (${mimeType})`);
    await updateProcessingState(resumeId, {
      stage: 'reading-file',
      progress: 10,
      message: 'Reading uploaded file',
    });

    const extractedText = await resumeProcessing.extractTextFromFile(filePath, mimeType);

    await updateProcessingState(resumeId, {
      stage: 'text-extracted',
      progress: 25,
      message: 'Text extracted successfully, analyzing content',
    });

    logger.info('Extracted text length:', extractedText.length);

    await updateProcessingState(resumeId, {
      stage: 'ai-extraction',
      progress: 45,
      message: 'Running AI extraction',
    });

    const { extractedData, processingMethod } = await resumeProcessing.extractDataWithAI(extractedText);
    const resumeScore = extractedData.score;

    await updateProcessingState(resumeId, {
      stage: 'finalizing',
      progress: 85,
      message: 'Finalizing extracted profile data',
    });

    try {
      await Resume.findByIdAndUpdate(resumeId, {
        extractedText,
        extractedData,
        resumeScore,
        isProcessed: true,
        processingStage: 'completed',
        processingProgress: 100,
        processingMessage: 'Resume processing complete',
        processingUpdatedAt: new Date(),
      });
    } catch (saveError) {
      logger.error('Failed to save extracted data:', saveError);
      await Resume.findByIdAndUpdate(resumeId, {
        extractedText,
        extractedData: { score: resumeScore },
        resumeScore,
        isProcessed: true,
        processingStage: 'completed',
        processingProgress: 100,
        processingMessage: 'Resume processing complete with fallback data',
        processingUpdatedAt: new Date(),
      });
    }

    logger.info(`Resume ${resumeId} processed successfully with ${processingMethod}`);
  } catch (error) {
    logger.error('Text extraction error:', error);
    await Resume.findByIdAndUpdate(resumeId, {
      isProcessed: false,
      extractedText: 'Error extracting text: ' + error.message,
      processingError: error.message,
      processingStage: 'error',
      processingProgress: 100,
      processingMessage: 'Processing failed: ' + error.message,
      processingUpdatedAt: new Date(),
    });
  }
}

exports.extractTextFromFile = extractTextFromFile;
