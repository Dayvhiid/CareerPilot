# Phase 4 — Database & Performance

> **Duration**: 4–6 days
> **Priority**: 🟡 HIGH
> **Depends on**: Phase 1, 3 complete

---

## Objective

Optimize database schema, add proper indexes, implement caching strategy, improve query performance, and eliminate known bottlenecks.

---

## Tasks

### 4.1 — Add Missing Database Indexes

Audit every query pattern and add indexes:

| Collection | Current Indexes | Missing |
|-----------|----------------|---------|
| `User` | `email` (unique) | None |
| `Resume` | None | `userId`, `createdAt` |
| `JobListing` | `domain+isActive`, `skills`, `location`, `text` (title, description, company) | `isActive`, `postedDate` |
| `UserJob` | `userId+jobId` (unique), `userId+status` | `jobId` |
| `Conversation` | `lastActivity` (TTL), `userId+sessionId` (unique), `userId+lastActivity` | None |

**Create `src/models/indexes.js`:**

```javascript
/**
 * Database Index Management
 * Run: node src/models/indexes.js
 */
const mongoose = require('mongoose');

async function ensureIndexes() {
  const Resume = require('./Resume');
  const JobListing = require('./JobListing');
  const UserJob = require('./UserJob');

  console.log('Ensuring database indexes...');

  // Resume indexes
  await Resume.collection.createIndex({ userId: 1 });
  await Resume.collection.createIndex({ createdAt: -1 });

  // JobListing additional indexes
  await JobListing.collection.createIndex({ isActive: 1, postedDate: -1 });
  await JobListing.collection.createIndex({ domain: 1, isActive: 1, postedDate: -1 });
  await JobListing.collection.createIndex({ 'salary.min': 1, 'salary.max': 1 });

  // UserJob additional indexes
  await UserJob.collection.createIndex({ jobId: 1 });
  await UserJob.collection.createIndex({ userId: 1, createdAt: -1 });

  console.log('All indexes ensured');
}

module.exports = { ensureIndexes };

if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGO_URI)
    .then(() => ensureIndexes())
    .then(() => process.exit(0))
    .catch(err => { console.error(err); process.exit(1); });
}
```

### 4.2 — Add Database Migration System

**Install:**
```bash
npm install migrate
```

**Create `migrations/001-add-resume-indexes.js`:**

```javascript
module.exports = {
  up: async (db) => {
    await db.collection('resumes').createIndex({ userId: 1 }, { name: 'userId_1' });
    await db.collection('resumes').createIndex({ createdAt: -1 }, { name: 'createdAt_-1' });
  },
  down: async (db) => {
    await db.collection('resumes').dropIndex('userId_1');
    await db.collection('resumes').dropIndex('createdAt_-1');
  }
};
```

### 4.3 — Optimize MongoDB Connection

**`src/config/db.js` — Add connection pooling and retry:**

```javascript
const mongoose = require('mongoose');

const connectDB = async () => {
  const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!mongoUri) return false;

  const options = {
    // Connection pool
    maxPoolSize: process.env.NODE_ENV === 'production' ? 50 : 10,
    minPoolSize: 5,

    // Write concern
    w: 'majority',
    wtimeoutMS: 5000,

    // Read preference
    readPreference: 'primaryPreferred',

    // Retry
    retryWrites: true,
    retryReads: true,

    // Timeouts
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,

    // Keepalive
    keepAlive: true,
    keepAliveInitialDelay: 300000,

    // Compression
    compressors: ['snappy', 'zlib'],

    // Heartbeat
    heartbeatFrequencyMS: 10000,
  };

  await mongoose.connect(mongoUri, options);

  // Monitor connection events
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB runtime error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    console.log('MongoDB reconnected');
  });

  return true;
};

module.exports = connectDB;
```

### 4.4 — Implement Proper Caching Strategy

| Data | Cache Key | TTL | Invalidation |
|------|-----------|-----|-------------|
| User recommendations | `recommendations:{userId}` | 18h | On new ingestion |
| Job details | `job:{jobId}` | 1h | On job update |
| Resume data | `resume:{userId}` | 30m | On resume upload |
| Conversation state | `conversation:{sessionId}` | 24h | On new message |
| User sessions | Redis session store | See session config | On logout |

**Create `src/services/cacheService.js`:**

```javascript
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

  // For recommendations, proactively refresh cache after ingestion
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
```

**Update `recommendationController.js`:**

```javascript
const cacheService = require('../services/cacheService');

exports.getRecommendations = async (req, res) => {
  const userId = req.user.id;
  const cacheKey = `recommendations:${userId}`;

  const data = await cacheService.getOrSet(cacheKey, CACHE_TTL, async () => {
    // ... existing logic
  });

  return res.json(data);
};
```

### 4.5 — Add Pagination to All List Endpoints

**Create `src/middleware/pagination.js`:**

```javascript
module.exports = (defaultLimit = 20, maxLimit = 100) => {
  return (req, res, next) => {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(maxLimit, Math.max(1, parseInt(req.query.limit) || defaultLimit));
    const offset = (page - 1) * limit;

    req.pagination = { page, limit, offset };
    next();
  };
};
```

**Usage in routes:**

```javascript
const pagination = require('../middleware/pagination');

router.get('/', auth, pagination(20, 50), async (req, res) => {
  const { limit, offset } = req.pagination;
  const [items, total] = await Promise.all([
    Model.find({}).skip(offset).limit(limit).lean(),
    Model.countDocuments({})
  ]);
  return ApiResponse.paginated(res, items, total, req.pagination.page, limit);
});
```

### 4.6 — Replace Puppeteer with Lighter PDF Solution

Puppeteer is too heavy. Use `pdf-lib` or `@react-pdf/renderer`:

```bash
npm install pdf-lib
```

**Create `src/services/pdfGenerator.js`:**

```javascript
const PDFDocument = require('pdf-lib').PDFDocument;
const fontkit = require('@pdf-lib/fontkit');
const fs = require('fs');

async function generateResumePDF(resumeData) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  // Embed fonts
  const fontBytes = fs.readFileSync('src/templates/fonts/Inter-Regular.ttf');
  const fontBoldBytes = fs.readFileSync('src/templates/fonts/Inter-Bold.ttf');
  const font = await doc.embedFont(fontBytes);
  const fontBold = await doc.embedFont(fontBoldBytes);

  const page = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();

  let y = height - 50;

  // Name
  page.drawText(resumeData.name || 'Your Name', {
    x: 50, y, size: 24, font: fontBold
  });
  y -= 30;

  // Email
  page.drawText(resumeData.email || '', {
    x: 50, y, size: 10, font
  });
  y -= 20;

  // ... rest of layout

  return await doc.save();
}

module.exports = { generateResumePDF };
```

### 4.7 — Add Data Compression for Network

Add to `app.js` (if not done in Phase 1):

```javascript
const compression = require('compression');
app.use(compression({
  level: 6,           // Default compression level
  threshold: 1024,    // Only compress responses >1KB
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));
```

### 4.8 — Add Connection Pool Monitoring

**`src/config/db.js` — Add pool metrics:**

```javascript
function logPoolStats() {
  const pool = mongoose.connection.client?.topology?.s?.pool;
  if (pool) {
    logger.info('MongoDB Pool', {
      total: pool.totalConnectionCount,
      active: pool.activeConnectionCount,
      available: pool.availableConnectionCount,
      pending: pool.pendingConnectionCount
    });
  }
}

// Log pool stats every 5 minutes
setInterval(logPoolStats, 300000);
```

### 4.9 — N+1 Query Fixes

**Audit all `.populate()` and `.lean()` usage:**

**`resumeController.js:108`:**
```javascript
// BEFORE:
const resume = await Resume.findOne({ userId });
// AFTER:
const resume = await Resume.findOne({ userId }).lean();
```

**`chatbotController.js:241-253`**: `.lean()` already used — good.

**`recommendationController.js:68-75`**: Two queries where one would do:
```javascript
// BEFORE:
const job = await jobRetrievalService.retrieveById(req.params.jobId);
await UserJob.findOneAndUpdate({ userId, jobId: job._id }, ...);

// AFTER:
const [job] = await Promise.all([
  jobRetrievalService.retrieveById(req.params.jobId),
  UserJob.findOneAndUpdate({ userId, jobId: req.params.jobId }, ...)
]);
```

---

## Verification

```bash
# Run index creation
node src/models/indexes.js

# Verify indexes
mongosh --eval 'db.resumes.getIndexes()' careerpilot

# Profile queries
mongosh --eval 'db.setProfilingLevel(1, { slowms: 100 })' careerpilot

# Test pagination
curl "http://localhost:4000/api/recommendations?page=1&limit=10"

# Test cache
curl -H "Authorization: Bearer $TOKEN" "http://localhost:4000/api/recommendations" -w "\nTime: %{time_total}s\n"
# First request: miss. Second request: hit (should be 10x faster)

# Verify PDF generation (no Puppeteer)
node -e "require('./src/services/pdfGenerator').generateResumePDF({ name: 'Test' })"
```

---

## Definition of Done

- [ ] All missing indexes created on User, Resume, JobListing, UserJob
- [ ] Migration system in place with `001-add-resume-indexes`
- [ ] MongoDB connection configured with pooling, retry, compression
- [ ] Cache service implemented with getOrSet + invalidation
- [ ] Recommendations cached with 18h TTL
- [ ] All list endpoints support pagination
- [ ] Puppeteer replaced with `pdf-lib`
- [ ] Compression middleware enabled
- [ ] Connection pool monitoring in place
- [ ] N+1 queries identified and fixed
- [ ] Response times verified (cache hit <50ms, cache miss <500ms)

---

## Next Phase

➡️ Proceed to [Phase 5 — Frontend Architecture](./05-frontend-architecture.md)
