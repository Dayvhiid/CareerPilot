const { logger } = require('../config/logger');
const { resumeProcessingQueue } = require('./queue');

resumeProcessingQueue.process(async (job) => {
  const { resumeId, filePath, mimeType } = job.data;
  const controller = require('../controllers/resumeController');
  await controller.extractTextFromFile(resumeId, filePath, mimeType);
});

logger.info('Resume processor worker started');
