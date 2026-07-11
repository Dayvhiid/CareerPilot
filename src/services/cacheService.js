const { logger } = require('../config/logger');
const cache = require('../config/redis');

class CacheService {
  async getOrSet(key, ttl, fetchFn) {
    const cached = await cache.get(key);
    if (cached) {
      logger.debug(`[cache] HIT ${key}`);
      return cached;
    }

    logger.debug(`[cache] MISS ${key} — fetching`);
    const data = await fetchFn();
    await cache.set(key, data, ttl);
    return data;
  }

  async invalidate(pattern) {
    logger.debug(`[cache] Invalidating ${pattern}`);
    await cache.del(pattern);
  }

  async refresh(key, ttl, fetchFn) {
    try {
      const data = await fetchFn();
      await cache.set(key, data, ttl);
      return data;
    } catch (err) {
      logger.warn(`[cache] Refresh failed for ${key}: ${err.message}`);
      return null;
    }
  }
}

module.exports = new CacheService();
