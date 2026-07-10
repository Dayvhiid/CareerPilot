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
    disk: { status: 'unknown' }
  };

  try {
    const dbState = mongoose.connection.readyState;
    checks.mongodb = {
      status: dbState === 1 ? 'healthy' : 'degraded',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState]
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
    status: isHealthy ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    checks
  });
});

module.exports = router;
