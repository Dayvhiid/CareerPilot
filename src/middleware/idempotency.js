const cache = require('../config/redis');

module.exports = (ttlSeconds = 86400) => {
  return async (req, res, next) => {
    const key = req.headers['idempotency-key'];
    if (!key) {
      return res.status(400).json({
        success: false,
        message: 'Idempotency-Key header required for this endpoint'
      });
    }

    const cacheKey = `idempotent:${key}`;
    const existing = await cache.get(cacheKey);
    if (existing) {
      return res.status(200).json(existing);
    }

    const originalJson = res.json.bind(res);
    res.json = function(body) {
      cache.set(cacheKey, body, ttlSeconds);
      originalJson(body);
    };

    next();
  };
};
