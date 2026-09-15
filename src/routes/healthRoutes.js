const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

router.get('/', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    mongodb: { status: 'unknown' },
    redis: { status: 'unknown' },
    disk: { status: 'unknown' },
  };

  try {
    const dbState = mongoose.connection.readyState;
    checks.mongodb = {
      status: dbState === 1 ? 'healthy' : 'degraded',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState],
    };
  } catch (err) {
    checks.mongodb = { status: 'unhealthy', error: err.message };
  }

  const redisClient = require('../config/redis').getClient();
  if (redisClient && redisClient.status === 'ready') {
    try {
      await redisClient.ping();
      checks.redis = { status: 'healthy' };
    } catch {
      checks.redis = { status: 'unhealthy' };
    }
  } else {
    checks.redis = { status: 'disconnected', note: 'Redis not configured' };
  }

  try {
    require('fs').accessSync('uploads');
    checks.disk = { status: 'healthy' };
  } catch {
    checks.disk = { status: 'degraded' };
  }

  const isHealthy = checks.mongodb.status === 'healthy';
  res.status(isHealthy ? 200 : 503).json({
    success: true,
    status: isHealthy ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    checks,
  });
});

router.get('/detailed', async (req, res) => {
  const start = Date.now();
  const checkMongoDB = async () => {
    const dbState = mongoose.connection.readyState;
    return {
      status: dbState === 1 ? 'healthy' : 'degraded',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState],
    };
  };

  const checkRedis = async () => {
    const client = require('../config/redis').getClient();
    if (client && client.status === 'ready') {
      await client.ping();
      return { status: 'healthy' };
    }
    return { status: 'disconnected', note: 'Redis not configured' };
  };

  const checkDisk = async () => {
    require('fs').accessSync('uploads');
    return { status: 'healthy' };
  };

  const [mongoHealth, redisHealth, diskHealth] = await Promise.allSettled([checkMongoDB(), checkRedis(), checkDisk()]);

  const extractResult = (result) =>
    result.status === 'fulfilled' ? result.value : { status: 'unhealthy', error: result.reason?.message };

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    responseTimeMs: Date.now() - start,
    checks: {
      mongodb: extractResult(mongoHealth),
      redis: extractResult(redisHealth),
      disk: extractResult(diskHealth),
    },
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    },
  });
});

module.exports = router;
