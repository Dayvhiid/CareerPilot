require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/db');
const secrets = require('./src/config/secrets');
const { validateEnv } = require('./src/config/validateEnv');
const redis = require('./src/config/redis');
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await secrets.initialize();
    validateEnv();
    await connectDB();
    await redis.connect?.();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      server.close(async () => {
        console.log('HTTP server closed');
        await mongoose.connection.close();
        console.log('MongoDB disconnected');
        await redis.quit?.();
        console.log('Redis disconnected');
        process.exit(0);
      });

      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
