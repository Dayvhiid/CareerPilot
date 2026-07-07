const { EMBEDDING_DIMENSION, GEMINI_EMBEDDING_MODEL } = require('../../../src/services/embeddingService');

describe('Embedding Service', () => {
  describe('constants', () => {
    it('should have correct embedding dimension', () => {
      expect(EMBEDDING_DIMENSION).toBe(768);
    });

    it('should have correct model name', () => {
      expect(GEMINI_EMBEDDING_MODEL).toBe('gemini-embedding-2');
    });
  });
});
