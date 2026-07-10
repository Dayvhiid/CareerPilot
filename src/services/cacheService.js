const cache = require('../config/redis');

class CacheService {
  async getOrSet(key, ttl, fetchFn) {
    const cached = await cache.get(key);
    if (cached) {
      console.log(`[cache] HIT ${key}`);
      return cached;
    }

    console.log(`[cache] MISS ${key} — fetching`);
    const data = await fetchFn();
    await cache.set(key, data, ttl);
    return data;
  }

  async invalidate(pattern) {
    console.log(`[cache] Invalidating ${pattern}`);
    await cache.del(pattern);
  }

  async refresh(key, ttl, fetchFn) {
    try {
      const data = await fetchFn();
      await cache.set(key, data, ttl);
      return data;
    } catch (err) {
      console.warn(`[cache] Refresh failed for ${key}: ${err.message}`);
      return null;
    }
  }
}

module.exports = new CacheService();
