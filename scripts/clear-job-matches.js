require('dotenv').config();
const mongoose = require('mongoose');

const run = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) {
      console.error('MONGO_URI / MONGODB_URI not set in .env');
      process.exit(1);
    }
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    const result = await mongoose.connection.db.collection('jobmatches').deleteMany({});
    console.log(`Cleared ${result.deletedCount} JobMatch documents`);

    await mongoose.disconnect();
    console.log('Done');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
};
run();
