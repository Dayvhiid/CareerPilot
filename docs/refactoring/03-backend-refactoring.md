# Phase 3 — Backend Refactoring

> **Duration**: 7–10 days
> **Priority**: 🟡 HIGH
> **Depends on**: Phase 1 complete

---

## Objective

Eliminate code duplication, extract business logic from controllers, implement proper error handling, add retry mechanisms, and build a comprehensive test suite.

---

## Tasks

### 3.1 — Consolidate AI Extractor Duplication

`geminiExtractor.js`, `groqExtractor.js`, `xaiExtractor.js` are ~95% identical. Combine into a single provider pattern.

**Create `src/services/ai/providers/gemini.js`:**

```javascript
const axios = require('axios');

class GeminiProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.5-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
    this.timeout = config.timeout || 30000;
  }

  async generate(prompt, options = {}) {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await axios.post(url, {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: options.temperature || 0.1,
        maxOutputTokens: options.maxTokens || 4000
      }
    }, { timeout: this.timeout });
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  async embed(text) {
    const url = `${this.baseUrl}/${this.model}:embedContent?key=${this.apiKey}`;
    const response = await axios.post(url, {
      content: { parts: [{ text: text.substring(0, 8000) }] }
    }, { timeout: this.timeout });
    return response.data?.embedding?.values;
  }
}

module.exports = GeminiProvider;
```

**Create `src/services/ai/providers/groq.js`:**
```javascript
// Same interface, different provider
```

**Create `src/services/ai/AIService.js`:**
```javascript
/**
 * Unified AI Service — provider-agnostic interface
 * Usage:
 *   const ai = require('./ai/AIService');
 *   const result = await ai.extractResumeData(text);
 *   const embedding = await ai.computeEmbedding(text);
 */
class AIService {
  constructor() {
    this.primaryExtractor = null;
    this.fallbackExtractor = null;
    this.embeddingService = null;
    this.initialize();
  }

  initialize() {
    // Priority: Gemini > Groq > xAI
    if (process.env.GEMINI_API_KEY) {
      const GeminiProvider = require('./providers/gemini');
      this.primaryExtractor = new GeminiProvider({
        apiKey: process.env.GEMINI_API_KEY,
        model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
      });
    }
    // ... setup fallbacks
  }

  async extractResumeData(text) {
    const providers = [this.primaryExtractor, this.fallbackExtractor]
      .filter(Boolean);

    let lastError;
    for (const provider of providers) {
      try {
        const response = await provider.generate(this.buildExtractionPrompt(text));
        return this.parseJSONResponse(response);
      } catch (err) {
        lastError = err;
        console.warn(`[ai] Extractor failed: ${err.message}`);
      }
    }

    throw lastError || new Error('All AI providers failed');
  }

  buildExtractionPrompt(text) { /* moved from geminiExtractor.js */ }

  parseJSONResponse(response) {
    const cleaned = response.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  }
}

module.exports = new AIService();
```

### 3.2 — Consolidate Resume Extraction Logic

`resumeExtractor.js` and `enhancedExtraction.js` duplicate a lot of logic. Merge into `resumeExtractor.js` and remove `enhancedExtraction.js`.

**Delete `src/controllers/enhancedExtraction.js`** — it's never imported by anything.

**Delete `src/services/groqExtractor.js`** — unused.
**Delete `src/services/xaiExtractor.js`** — unused.

### 3.3 — Add Retry Mechanism for External API Calls

**Create `src/utils/retry.js`:**

```javascript
/**
 * Retry wrapper with exponential backoff
 */
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
```

**Use in `geminiExtractor.js` (or new AIService):**
```javascript
const { withRetry } = require('../utils/retry');
response = await withRetry(() => axios.post(url, data, config));
```

### 3.4 — Extract Business Logic from Controllers

**`chatbotController.js` is 1313 lines.** Extract:
1. State machine → `src/services/chatbot/stateMachine.js`
2. PDF generation → `src/services/chatbot/pdfGenerator.js`
3. Resume data conversion → `src/services/chatbot/resumeConverter.js`
4. Speech/audio → `src/services/chatbot/audioService.js`

**`recommendationController.js`** — Extract:
1. Caching logic → already in `redis.js`
2. Domain-specific logic → `src/services/recommendationService.js`

### 3.5 — Refactor Background Processing

Use a proper job queue instead of fire-and-forget promises:

```bash
npm install bull
```

**Create `src/workers/queue.js`:**

```javascript
const Queue = require('bull');
const redisConfig = process.env.REDIS_URL
  ? { redis: process.env.REDIS_URL }
  : { redis: { host: '127.0.0.1', port: 6379 } };

const resumeProcessingQueue = new Queue('resume-processing', redisConfig);
const jobIngestionQueue = new Queue('job-ingestion', redisConfig);

// Retry configuration
resumeProcessingQueue.on('failed', (job, err) => {
  console.error(`[queue] Resume ${job.id} failed: ${err.message}`);
  // Store error in resume record for user feedback
});

module.exports = { resumeProcessingQueue, jobIngestionQueue };
```

**In `resumeController.js`:**
```javascript
const { resumeProcessingQueue } = require('../workers/queue');

// Instead of: extractTextFromFile(resume._id, filePath, mimetype).catch(...)
// Do:
await resumeProcessingQueue.add({
  resumeId: resume._id,
  filePath,
  mimeType: mimetype
}, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000
  }
});
```

**Create `src/workers/resumeProcessor.js`:**

```javascript
const { resumeProcessingQueue } = require('./queue');

resumeProcessingQueue.process(async (job) => {
  const { resumeId, filePath, mimeType } = job.data;
  const controller = require('../controllers/resumeController');
  await controller.extractTextFromFile(resumeId, filePath, mimeType);
});

console.log('Resume processor worker started');
```

### 3.6 — Add Request ID Middleware

**Create `src/middleware/requestId.js`:**

```javascript
const { v4: uuidv4 } = require('uuid');

module.exports = (req, res, next) => {
  req.requestId = req.headers['x-request-id'] || uuidv4();
  res.setHeader('X-Request-Id', req.requestId);
  next();
};
```

Add to logger context: `logger.info('...', { requestId: req.requestId })`

### 3.7 — Add Idempotency for Critical Endpoints

**Create `src/middleware/idempotency.js`:**

```javascript
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

    // Store response after it's sent
    const originalJson = res.json.bind(res);
    res.json = function(body) {
      cache.set(cacheKey, body, ttlSeconds);
      originalJson(body);
    };

    next();
  };
};
```

Add to payment initialization: `router.post('/initialize', auth, idempotency(), ...)`

### 3.8 — Build Comprehensive Test Suite

**Test targets — minimum coverage:**

| Area | Files | Tests Required |
|------|-------|----------------|
| Auth | authController.js | Full coverage: register, login, refresh, logout, edge cases |
| Resume | resumeController.js | Upload, get, delete, extraction pipeline |
| Recommendations | recommendationController.js | Get recs, bookmark, apply, caching |
| Chatbot | chatbotController.js | State transitions, PDF gen, edge cases |
| Payments | paymentRoutes.js | Initialize, webhook verification, callback |
| Middleware | auth.js, validators.js, rateLimiters.js | All code paths |
| Services | All service files | Each service in isolation |
| Integration | API endpoints | All routes, auth flows, error scenarios |

**Example — `tests/integration/auth.test.js`:**

```javascript
const request = require('supertest');
const app = require('../../src/app');
const User = require('../../src/models/User');

describe('Auth API', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          password: 'Password123'
        });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
    });

    it('should reject duplicate email', async () => {
      await User.create({
        name: 'Existing',
        email: 'test@test.com',
        password: 'hashed'
      });
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'test@test.com',
          password: 'Password123'
        });
      expect(res.status).toBe(400);
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'test@test.com',
          password: '123'
        });
      expect(res.status).toBe(400);
    });

    it('should rate limit after 3 attempts', async () => {
      const payload = {
        name: 'Test',
        email: 'test@test.com',
        password: 'Password123'
      };
      await request(app).post('/api/auth/register').send(payload);
      await request(app).post('/api/auth/register').send(payload);
      await request(app).post('/api/auth/register').send(payload);
      const res = await request(app).post('/api/auth/register').send(payload);
      expect(res.status).toBe(429);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@test.com', password: 'Password123' });
    });

    it('should login and return tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'Password123' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/refresh', () => {
    it('should rotate refresh token', async () => {
      // Login to get cookies
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'Password123' });
      const cookies = loginRes.headers['set-cookie'];

      // Use refresh
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookies);
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();

      // Old refresh token should be revoked
      const res2 = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', cookies);
      expect(res2.status).toBe(401);
    });
  });
});
```

---

## Verification

```bash
# Check no dead code remains
grep -r "require.*enhancedExtraction" src/
grep -r "require.*groqExtractor" src/
grep -r "require.*xaiExtractor" src/
# Should all return nothing

# Run full test suite
npm test -- --coverage

# Verify extraction still works
curl -X POST http://localhost:4000/api/resume/upload \
  -H "Authorization: Bearer $TOKEN" \
  -F "resume=@test-resume.pdf"
```

---

## Definition of Done

- [ ] AI providers consolidated into single interface with fallback chain
- [ ] `enhancedExtraction.js`, `groqExtractor.js`, `xaiExtractor.js` deleted
- [ ] Retry wrapper with exponential backoff applied to all external API calls
- [ ] `chatbotController.js` broken into at least 4 files
- [ ] Bull queue for background resume processing (with retries)
- [ ] Request ID middleware added
- [ ] Idempotency middleware for payment endpoints
- [ ] Test coverage >50% across all modules
- [ ] Integration tests for all major API endpoints
- [ ] Auth tests: register, login, refresh, token rotation, rate limiting
- [ ] All tests pass in CI
- [ ] No regressions detected in manual testing

---

## Next Phase

➡️ Proceed to [Phase 4 — Database & Performance](./04-database-performance.md)
