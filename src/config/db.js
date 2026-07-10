const mongoose = require("mongoose");
const { logger } = require('./logger');

function formatConnectionError(error) {
  const details = [];

  if (error?.name) {
    details.push(`name: ${error.name}`);
  }

  if (error?.message) {
    details.push(`message: ${error.message}`);
  }

  if (error?.code !== undefined) {
    details.push(`code: ${error.code}`);
  }

  if (error?.codeName) {
    details.push(`codeName: ${error.codeName}`);
  }

  if (error?.reason) {
    details.push(`reason: ${error.reason}`);
  }

  if (error?.cause) {
    details.push(`cause: ${error.cause?.message || error.cause}`);
  }

  if (error?.errorLabels?.length) {
    details.push(`errorLabels: ${error.errorLabels.join(', ')}`);
  }

  if (error?.stack) {
    details.push(`stack: ${error.stack}`);
  }

  return details.join('\n   - ');
}

function logPoolStats() {
  const pool = mongoose.connection.client?.topology?.s?.pool;
  if (pool) {
    logger.info('MongoDB Pool', {
      total: pool.totalConnectionCount,
      active: pool.activeConnectionCount,
      available: pool.availableConnectionCount,
      pending: pool.pendingConnectionCount
    });
  }
}

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!mongoUri) {
      console.warn("⚠️ MongoDB connection skipped because MONGO_URI/MONGODB_URI is missing.");
      console.warn("⚠️ The server will start, but database-backed features will be unavailable until MongoDB is configured.");
      return false;
    }

    const options = {
      maxPoolSize: process.env.NODE_ENV === 'production' ? 50 : 10,
      minPoolSize: 5,
      w: 'majority',
      wtimeoutMS: 5000,
      readPreference: 'primaryPreferred',
      retryWrites: true,
      retryReads: true,
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      keepAlive: true,
      keepAliveInitialDelay: 300000,
      compressors: ['snappy', 'zlib'],
      heartbeatFrequencyMS: 10000,
    };

    await mongoose.connect(mongoUri, options);
    console.log("✅ MongoDB connected");

    mongoose.connection.on('error', (err) => {
      console.error('MongoDB runtime error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected');
    });

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected');
    });

    setInterval(logPoolStats, 300000);

    return true;
  } catch (error) {
    console.error("❌ MongoDB connection error details:");
    console.error(`   - ${formatConnectionError(error)}`);
    throw error;
  }
};

module.exports = connectDB;