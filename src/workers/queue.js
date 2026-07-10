const Queue = require('bull');
const redisConfig = process.env.REDIS_URL
  ? { redis: process.env.REDIS_URL }
  : { redis: { host: '127.0.0.1', port: 6379 } };

const resumeProcessingQueue = new Queue('resume-processing', redisConfig);
const jobIngestionQueue = new Queue('job-ingestion', redisConfig);

resumeProcessingQueue.on('failed', (job, err) => {
  console.error(`[queue] Resume ${job.id} failed: ${err.message}`);
});

module.exports = { resumeProcessingQueue, jobIngestionQueue };
