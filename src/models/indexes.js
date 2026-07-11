const { logger } = require('../config/logger');
const mongoose = require('mongoose');

async function ensureIndexes() {
  const Resume = require('./Resume');
  const JobListing = require('./JobListing');
  const UserJob = require('./UserJob');

  logger.info('Ensuring database indexes...');

  // Resume indexes
  await Resume.collection.createIndex({ userId: 1 });
  await Resume.collection.createIndex({ createdAt: -1 });

  // JobListing additional indexes
  await JobListing.collection.createIndex({ isActive: 1, postedDate: -1 });
  await JobListing.collection.createIndex({ domain: 1, isActive: 1, postedDate: -1 });
  await JobListing.collection.createIndex({ 'salary.min': 1, 'salary.max': 1 });

  // UserJob additional indexes
  await UserJob.collection.createIndex({ jobId: 1 });
  await UserJob.collection.createIndex({ userId: 1, createdAt: -1 });

  logger.info('All indexes ensured');
}

module.exports = { ensureIndexes };

if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGO_URI)
    .then(() => ensureIndexes())
    .then(() => process.exit(0))
    .catch(err => { logger.error(err); process.exit(1); });
}
