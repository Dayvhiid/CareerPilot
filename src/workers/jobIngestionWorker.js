const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const mongoose = require('mongoose');
const { runIngestionCycle } = require('../services/jobIngestionService');

async function main() {
  console.log('jobIngestionWorker: starting...');

  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) {
    console.error('jobIngestionWorker: MONGO_URI/MONGODB_URI not set — exiting');
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log('jobIngestionWorker: connected to MongoDB');

  const count = await runIngestionCycle();

  await mongoose.disconnect();
  console.log(`jobIngestionWorker: done — ${count} jobs ingested`);
  process.exit(0);
}

main().catch(err => {
  console.error(`jobIngestionWorker: fatal — ${err.message}`);
  process.exit(1);
});
