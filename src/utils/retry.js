async function withRetry(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    shouldRetry = (err) => {
      const retryCodes = [429, 500, 502, 503, 504];
      const code = err.response?.status || err.statusCode || 0;
      return retryCodes.includes(code) || err.code === 'ECONNRESET';
    }
  } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === maxRetries || !shouldRetry(err)) {
        throw err;
      }
      const delay = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
      const jitter = Math.random() * 1000;
      console.warn(`[retry] Attempt ${attempt}/${maxRetries} failed. Retrying in ${delay + jitter}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay + jitter));
    }
  }
  throw lastError;
}

module.exports = { withRetry };
