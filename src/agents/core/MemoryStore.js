const { logger } = require('../../config/logger');
const redis = require('../../config/redis');

class MemoryStore {
  constructor(options = {}) {
    this.redis = options.redis || redis;
    this.userPreferenceModel = options.userPreferenceModel || null;
    this.vectorStore = options.vectorStore || null;
  }

  async getShortTerm(userId, key) {
    return this.redis.get(`st:${userId}:${key}`);
  }

  async setShortTerm(userId, key, value, ttlSeconds = 3600) {
    await this.redis.set(`st:${userId}:${key}`, value, ttlSeconds);
  }

  async deleteShortTerm(userId, key) {
    await this.redis.del(`st:${userId}:${key}`);
  }

  async getLongTerm(userId, key) {
    if (!this.userPreferenceModel) return null;
    try {
      const pref = await this.userPreferenceModel.findOne({ userId }).lean();
      return pref ? pref[key] : null;
    } catch (err) {
      logger.error(`[MemoryStore] getLongTerm error: ${err.message}`);
      return null;
    }
  }

  async setLongTerm(userId, key, value) {
    if (!this.userPreferenceModel) return;
    try {
      await this.userPreferenceModel.findOneAndUpdate(
        { userId },
        { $set: { [key]: value } },
        { upsert: true, new: true }
      );
    } catch (err) {
      logger.error(`[MemoryStore] setLongTerm error: ${err.message}`);
    }
  }

  async storeEmbedding(collection, id, text, embedding, metadata) {
    if (!this.vectorStore) return null;
    return this.vectorStore.store(collection, id, text, embedding, metadata);
  }

  async searchEmbeddings(collection, queryEmbedding, limit) {
    if (!this.vectorStore) return [];
    return this.vectorStore.search(collection, queryEmbedding, limit);
  }
}

module.exports = { MemoryStore };
