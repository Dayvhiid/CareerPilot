const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const redisService = require('../services/redisService');

router.get('/', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    mongodb: { status: 'unknown' },
    redis: { status: 'unknown' }
  };

  try {
    const dbState = mongoose.connection.readyState;
    checks.mongodb = {
      status: dbState === 1 ? 'healthy' : 'degraded',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown'
    };
  } catch (err) {
    checks.mongodb = { status: 'unhealthy', error: err.message };
  }

  checks.redis = {
    status: redisService.isConnected ? 'healthy' : 'degraded',
    connected: redisService.isConnected
  };

  const isHealthy = checks.mongodb.status === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    success: true,
    status: isHealthy ? 'healthy' : 'degraded',
    checks
  });
});

module.exports = router;
