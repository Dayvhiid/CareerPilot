require('dotenv').config();
const mongoose = require('mongoose');
const { logger } = require('./src/config/logger');
const connectDB = require('./src/config/db');
const secrets = require('./src/config/secrets');
const { validateEnv } = require('./src/config/validateEnv');
const redis = require('./src/config/redis');
const { initializeAgents } = require('./src/agents/init');
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await secrets.initialize();
    validateEnv();
    await connectDB();
    await initializeAgents();
    await redis.connect?.();

    // Start Bull queue workers (needs DB + Redis connected)
    require('./src/workers/resumeProcessor');

    const server = app.listen(PORT, () => {
      logger.info(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    const shutdown = async (signal) => {
      logger.info(`${signal} received. Starting graceful shutdown...`);
      server.close(async () => {
        logger.info('HTTP server closed');
        await mongoose.connection.close();
        logger.info('MongoDB disconnected');
        await redis.quit?.();
        logger.info('Redis disconnected');
        process.exit(0);
      });

      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
