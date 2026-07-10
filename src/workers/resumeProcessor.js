const { resumeProcessingQueue } = require('./queue');

resumeProcessingQueue.process(async (job) => {
  const { resumeId, filePath, mimeType } = job.data;
  const controller = require('../controllers/resumeController');
  await controller.extractTextFromFile(resumeId, filePath, mimeType);
});

console.log('Resume processor worker started');
