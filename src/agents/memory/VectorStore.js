const { logger } = require('../../config/logger');

class VectorStore {
  constructor(options = {}) {
    this.type = options.type || 'memory';
    this.collections = new Map();
  }

  async store(collection, id, text, embedding, metadata = {}) {
    if (!this.collections.has(collection)) {
      this.collections.set(collection, []);
    }
    const items = this.collections.get(collection);
    const existing = items.findIndex((i) => i.id === id);
    const entry = { id, text, embedding, metadata, storedAt: new Date() };

    if (existing >= 0) {
      items[existing] = entry;
    } else {
      items.push(entry);
    }

    logger.debug(`[VectorStore] Stored in "${collection}": ${id}`);
    return { id, collection };
  }

  async search(collection, queryEmbedding, limit = 5) {
    const items = this.collections.get(collection) || [];
    if (items.length === 0 || !queryEmbedding) return [];

    const scored = items.map((item) => {
      const similarity = this._cosineSimilarity(queryEmbedding, item.embedding);
      return { ...item, similarity };
    });

    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, limit).map(({ embedding: _embedding, ...rest }) => rest);
  }

  _cosineSimilarity(a, b) {
    if (!a || !b || a.length !== b.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
  }

  async deleteCollection(collection) {
    this.collections.delete(collection);
  }
}

module.exports = { VectorStore };
