const axios = require('axios');

const GEMINI_EMBEDDING_MODEL = 'gemini-embedding-2';
const EMBEDDING_DIMENSION = 768;

async function computeEmbedding(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('EmbeddingService: GEMINI_API_KEY not set, returning zero vector');
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }

  const url = `https://generativelanguage.googleapis.com/v1/models/${GEMINI_EMBEDDING_MODEL}:embedContent?key=${apiKey}`;
  const inputLength = text.length;
  console.log(`EmbeddingService: computing embedding for ${inputLength} chars using ${GEMINI_EMBEDDING_MODEL}`);

  const start = Date.now();
  try {
    const response = await axios.post(url, {
      model: `models/${GEMINI_EMBEDDING_MODEL}`,
      content: { parts: [{ text: text.substring(0, 8000) }] }
    });

    const duration = Date.now() - start;
    const values = response.data?.embedding?.values;
    const dim = values ? values.length : 'unknown';
    console.log(`EmbeddingService: response in ${duration}ms | dimension: ${dim} | input: ${inputLength} chars`);

    if (!values || !Array.isArray(values)) {
      console.error('EmbeddingService: unexpected response structure:', JSON.stringify(response.data).substring(0, 300));
      return new Array(EMBEDDING_DIMENSION).fill(0);
    }

    return values;
  } catch (err) {
    const duration = Date.now() - start;
    const status = err.response?.status || 'network';
    const detail = err.response?.data?.error?.message || err.message;
    console.error(`EmbeddingService: FAILED after ${duration}ms | status=${status} | model=${GEMINI_EMBEDDING_MODEL} | error=${detail}`);
    return new Array(EMBEDDING_DIMENSION).fill(0);
  }
}

async function computeBatchEmbeddings(texts) {
  console.log(`EmbeddingService: batch computing ${texts.length} embeddings`);
  const results = [];
  for (let i = 0; i < texts.length; i++) {
    results.push(await computeEmbedding(texts[i]));
  }
  console.log(`EmbeddingService: batch complete — ${results.length} embeddings`);
  return results;
}

module.exports = { computeEmbedding, computeBatchEmbeddings, EMBEDDING_DIMENSION, GEMINI_EMBEDDING_MODEL };
