const { logger } = require('../config/logger');
const redis = require('../config/redis');

const PREFIX = 'rt:';
const USER_PREFIX = 'rtu:';
const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

const memoryStore = new Map();
const memoryUserTokens = new Map();

async function storeRefreshToken(tokenId, userId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const value = { tokenId, userId: String(userId), createdAt: Date.now() };
  const client = redis.getClient();

  if (client) {
    try {
      await client.setex(`${PREFIX}${tokenId}`, ttlSeconds, JSON.stringify(value));
      await client.sadd(`${USER_PREFIX}${userId}`, tokenId);
      await client.expire(`${USER_PREFIX}${userId}`, ttlSeconds);
      return;
    } catch (err) {
      logger.error('tokenStore redis set error:', err.message);
    }
  }

  memoryStore.set(tokenId, { ...value, expiresAt: Date.now() + ttlSeconds * 1000 });
  if (!memoryUserTokens.has(String(userId))) {
    memoryUserTokens.set(String(userId), new Set());
  }
  memoryUserTokens.get(String(userId)).add(tokenId);
}

async function getRefreshToken(tokenId) {
  const client = redis.getClient();

  if (client) {
    try {
      const raw = await client.get(`${PREFIX}${tokenId}`);
      if (raw) return JSON.parse(raw);
      return null;
    } catch (err) {
      logger.error('tokenStore redis get error:', err.message);
    }
  }

  const entry = memoryStore.get(tokenId);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memoryStore.delete(tokenId);
    memoryUserTokens.get(entry.userId)?.delete(tokenId);
    return null;
  }
  return entry;
}

async function deleteRefreshToken(tokenId) {
  const client = redis.getClient();

  if (client) {
    try {
      const raw = await client.get(`${PREFIX}${tokenId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        await client.del(`${PREFIX}${tokenId}`);
        await client.srem(`${USER_PREFIX}${parsed.userId}`, tokenId);
      }
      return;
    } catch (err) {
      logger.error('tokenStore redis del error:', err.message);
    }
  }

  const entry = memoryStore.get(tokenId);
  if (entry) {
    memoryStore.delete(tokenId);
    memoryUserTokens.get(entry.userId)?.delete(tokenId);
  }
}

async function revokeAllUserTokens(userId) {
  userId = String(userId);
  const client = redis.getClient();

  if (client) {
    try {
      const keys = await client.smembers(`${USER_PREFIX}${userId}`);
      if (keys.length > 0) {
        await client.del(...keys.map((k) => `${PREFIX}${k}`));
      }
      await client.del(`${USER_PREFIX}${userId}`);
      return;
    } catch (err) {
      logger.error('tokenStore redis revoke error:', err.message);
    }
  }

  const set = memoryUserTokens.get(userId);
  if (set) {
    for (const tokenId of set) {
      memoryStore.delete(tokenId);
    }
    set.clear();
    memoryUserTokens.delete(userId);
  }
}

module.exports = {
  storeRefreshToken,
  getRefreshToken,
  deleteRefreshToken,
  revokeAllUserTokens,
  DEFAULT_TTL_SECONDS,
};
