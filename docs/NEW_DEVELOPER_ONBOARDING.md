# CareerPilot - New Developer Onboarding

## Prerequisites

- **Node.js** 14+ (v18+ recommended)
- **npm** (comes with Node.js)
- **MongoDB** 6+ (local or Atlas)
- **Redis** (optional, for caching)
- **Git**

## Quick Start (10 minutes)

```bash
# 1. Clone the repository
git clone <repo-url>
cd CareerPilot

# 2. Install dependencies
npm install --legacy-peer-deps

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your own values (see Environment Variables section below)

# 4. Start MongoDB (if running locally)
mongod

# 5. Run tests to verify setup
npm test

# 6. Start development server
npm run dev
# Server starts on http://localhost:4000
```

## Environment Variables

Copy `.env.example` to `.env` and configure:

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 4000 | Server port |
| `NODE_ENV` | No | development | `development`, `production`, or `test` |
| `MONGO_URI` | Yes* | mongodb://127.0.0.1:27017/careerpilot | MongoDB connection string |
| `MONGODB_URI` | Yes* | — | Alternate MongoDB URI (fallback) |
| `JWT_SECRET` | Yes | — | Min 16 chars, used for signing tokens |
| `SESSION_SECRET` | No | — | Min 8 chars, for OAuth sessions |
| `CORS_ORIGINS` | No | localhost:5500,3000,4000 | Comma-separated allowed origins |
| `REDIS_URL` | No | — | Redis connection string (optional) |
| `JSEARCH_API_KEY` | No | — | RapidAPI key for job search |
| `HUGGINGFACE_API_KEY` | No | — | Hugging Face API token |
| `GOOGLE_CLIENT_ID` | No | — | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | No | — | Google OAuth client secret |
| `GITHUB_CLIENT_ID` | No | — | GitHub OAuth client ID |
| `GITHUB_CLIENT_SECRET` | No | — | GitHub OAuth client secret |

\* At least one of `MONGO_URI` or `MONGODB_URI` is required.

## Project Tour

### Entry Point
- **`server.js`** — Loads dotenv, connects to MongoDB, starts Express server
- **`src/app.js`** — Express app configuration, middleware registration, route mounting

### Source Directory (`src/`)

| Directory | Purpose | Key Files |
|-----------|---------|-----------|
| `config/` | App configuration | `db.js` (MongoDB), `passport.js` (OAuth), `validateEnv.js` |
| `middleware/` | Request middleware | `authMiddleware.js` (JWT), `rateLimiters.js`, `validators.js` |
| `routes/` | API route definitions | 6 route files, one per domain |
| `controllers/` | Business logic | Request handlers per domain |
| `models/` | Mongoose schemas | 4 models: User, Resume, Job, JobMatch |
| `services/` | External integrations | JSearch, HuggingFace, Redis, FileValidator |

### Frontend Files (`public/`)
- Static HTML/CSS/JS files served directly
- Mobile-responsive versions exist for each page (e.g., `resume.html` + `resumemobile.html`)
- Files are served at `/public/*` URL path

### Tests (`tests/`)
- **`auth.test.js`** — 26 test cases covering registration, login, token refresh, protected routes
- **`fileValidation.test.js`** — 19 test cases for filename sanitization, magic byte verification
- Other `test-*.js` files — Manual integration test scripts (not part of Jest suite)

## Understanding the Codebase

### Request Flow
```
Request → CORS → Static Files → Session → Passport → Body Parser → Cookie Parser
   → Route Matching → [Rate Limiter → Validators → Auth → Controller]
```

### Auth System
- **JWT-based** with access tokens (15-min) and refresh tokens (7-day httpOnly cookie)
- **OAuth** support for Google and GitHub (Passport.js)
- **Auth middleware** (`src/middleware/authMiddleware.js`) checks `Authorization: Bearer <token>` header, falls back to `accessToken` cookie

### Key Architecture Decisions
1. **Two auth middleware files exist.** Routes use `authMiddleware.js` (lightweight, no DB lookup). The heavier `auth.js` (with DB lookup) is unused.
2. **Chatbot sessions are in-memory.** Server restart loses all in-progress conversations.
3. **Background resume processing.** After upload, extraction runs asynchronously; check `resume.isProcessed` field for completion.
4. **Redis is optional.** Server works without it; caching is best-effort.
5. **Express 5.x is used.** Be aware of breaking changes from Express 4 (e.g., req.body parsing, error middleware).

## Common Development Tasks

### Adding a New API Endpoint
1. Add route in appropriate route file under `src/routes/`
2. Add controller function in `src/controllers/`
3. Add any middleware (auth, rate limiter, validators)
4. Update validation rules in `src/middleware/validators.js` if needed

### Adding a New Model
1. Create schema file in `src/models/`
2. Register with `mongoose.model()`
3. Add routes and controller logic
4. Add indexes for query performance

### Working with External APIs
- JSearch: Modify `src/services/jSearchService.js`
- Hugging Face: Modify `src/services/huggingFaceService.js`
- Add new services in `src/services/`

### Running Tests
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Run specific test file
npx jest tests/auth.test.js
```

## Debugging Tips

### Server Startup Issues
- Check MongoDB is running: `mongosh`
- Check `.env` file exists and has required variables
- Look for `❌` prefixed error messages in console
- The server will start WITHOUT MongoDB, Redis, or external APIs — features degrade gracefully

### Authentication Issues
- Token format: `Authorization: Bearer <token>`
- Tokens expire in 15 minutes — use `/api/auth/refresh` to get new ones
- Check that `JWT_SECRET` is set and consistent across server restarts

### Common Gotchas
- On Windows, use `npm run dev` (nodemon) for auto-restart
- File uploads go to `uploads/` directory (created automatically)
- The Resume model is named `ResumeV2` in MongoDB but referenced as `Resume` in code
- Express 5 handles async errors differently — wrap handlers if needed

## Key Testing Patterns

```js
// Example: Testing a protected endpoint
const response = await request(app)
  .get('/api/resume')
  .set('Authorization', `Bearer ${token}`)
  .expect(200);

// Example: Testing file upload
const response = await request(app)
  .post('/api/resume/upload')
  .set('Authorization', `Bearer ${token}`)
  .attach('resume', 'path/to/test.pdf')
  .expect(200);
```

## Deployment Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Generate strong `JWT_SECRET` (64+ chars)
- [ ] Configure MongoDB (Atlas or managed)
- [ ] Set up Redis (optional, for caching)
- [ ] Configure CORS origins for your domain
- [ ] Set up JSearch API key (RapidAPI)
- [ ] Set up Hugging Face API key
- [ ] Configure OAuth credentials (optional)
- [ ] Run `npm test` — all must pass
- [ ] Run `npm start` — verify server starts cleanly
- [ ] Set up process manager (PM2) for production
- [ ] Configure reverse proxy (nginx) for SSL termination

## Reference: Key Files Summary

| File | Lines | Purpose |
|------|-------|---------|
| `src/app.js` | 81 | Express app setup and middleware |
| `server.js` | 19 | Server entry point |
| `src/config/db.js` | 61 | MongoDB connection |
| `src/config/passport.js` | 143 | OAuth strategies |
| `src/config/validateEnv.js` | 80 | Environment validation |
| `src/middleware/authMiddleware.js` | 43 | JWT auth middleware |
| `src/middleware/rateLimiters.js` | 107 | 7 rate limiter configs |
| `src/middleware/validators.js` | 141 | Input validation rules |
| `src/controllers/authController.js` | 153 | Auth logic |
| `src/controllers/jobController.js` | 926 | Job search + matching |
| `src/controllers/resumeController.js` | 1126 | Resume upload + NLP parsing |
| `src/controllers/chatbotController.js` | 1200+ | Chatbot + PDF generation |
| `src/controllers/coverLetterController.js` | 249 | Cover letter AI generation |
| `src/services/jSearchService.js` | 348 | JSearch API integration |
| `src/services/huggingFaceService.js` | 417 | HuggingFace AI service |
| `src/services/redisService.js` | 216 | Redis caching |
| `src/services/fileValidator.js` | 177 | File security validation |
| `tests/auth.test.js` | — | Auth test suite (26 tests) |
| `tests/fileValidation.test.js` | — | File validation tests (19 tests) |
