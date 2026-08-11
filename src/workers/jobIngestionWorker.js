const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const { logger } = require('../config/logger');
const mongoose = require('mongoose');
const { runIngestionCycle } = require('../services/jobIngestionService');

async function main() {
  logger.info('jobIngestionWorker: starting...');

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    logger.error('jobIngestionWorker: MONGO_URI/MONGODB_URI not set — exiting');
    process.exit(1);
  }

  await mongoose.connect(uri);
  logger.info('jobIngestionWorker: connected to MongoDB');

  const count = await runIngestionCycle();

  await mongoose.disconnect();
  logger.info(`jobIngestionWorker: done — ${count} jobs ingested`);
  process.exit(0);
}

main().catch((err) => {
  logger.error(`jobIngestionWorker: fatal — ${err.message}`);
  process.exit(1);
});
