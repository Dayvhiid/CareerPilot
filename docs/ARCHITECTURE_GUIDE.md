# CareerPilot - Architecture Guide

## Request Lifecycle

```
HTTP Request
  │
  ├─ 1. CORS Middleware (app.js:40-45)
  │     Validates origin against CORS_ORIGINS whitelist
  │
  ├─ 2. Static File Serving (app.js:48)
  │     Serves /public directory files
  │
  ├─ 3. Session Middleware (app.js:51-55)
  │     express-session (needed for Passport OAuth)
  │
  ├─ 4. Passport Initialization (app.js:58-59)
  │     passport.initialize() + passport.session()
  │
  ├─ 5. Body Parser (app.js:62)
  │     express.json() — parses JSON bodies
  │
  ├─ 6. Cookie Parser (app.js:63)
  │     Parses cookies (accessToken, refreshToken)
  │
  ├─ 7. Route Matching (app.js:66-71)
  │     │
  │     ├─ /api/auth/*     → authRoutes.js
  │     ├─ /api/oauth/*    → oauthRoutes.js
  │     ├─ /api/resume/*   → resumeRoutes.js
  │     ├─ /api/jobs/*     → jobRoutes.js
  │     ├─ /api/coverletter/* → coverLetterRoutes.js
  │     └─ /api/chatbot/*  → chatbotRoutes.js
  │
  └─ 8. Route Handler Execution
        │
        ├─ a. Rate Limiter (per-route)
        ├─ b. Validators (express-validator chain)
        ├─ c. Auth Middleware (JWT verification)
        └─ d. Controller Action
```

## Middleware Execution Order

### Global Middleware (app.js)

| Order | Middleware | Purpose |
|-------|-----------|---------|
| 1 | `cors()` | Cross-origin request handling |
| 2 | `express.static('/public')` | Serve static frontend files |
| 3 | `express-session` | OAuth session storage |
| 4 | `passport.initialize()` | OAuth initialization |
| 5 | `passport.session()` | OAuth session deserialization |
| 6 | `express.json()` | JSON body parsing |
| 7 | `cookie-parser` | Cookie parsing |

### Per-Route Middleware Chain (Typical)

```
Route Handler
  │
  ├─ auth middleware (JWT verification)
  │   └─ authMiddleware.js: checks Authorization header or cookie
  │
  ├─ rate limiter
  │   └─ e.g., authLimiter (5 req/15min), apiLimiter (200 req/hr)
  │
  ├─ validators (express-validator)
  │   └─ e.g., authValidators.login, jobValidators.search
  │
  └─ controller function
```

## Route Modules

### Auth Routes (`/api/auth`)
- **authMiddleware.js** used by routes (lightweight JWT check)
- **auth.js** exists but NOT imported by any route (full DB lookup version)

### OAuth Routes (`/api/oauth`)
- Uses Passport strategies directly
- JWT access token set as `httpOnly` cookie after OAuth success
- Supports Google and GitHub (LinkedIn strategy exists in passport.js but has no route)

### Resume Routes (`/api/resume`)
- Multer handles multipart file upload with disk storage
- Custom `validateFileMiddleware` runs magic byte verification
- Delete old resume on new upload

### Job Routes (`/api/jobs`)
- Specific routes (`/search`, `/recommended`, `/resume-based`, `/cache/stats`) before parameterized routes (`/:jobId`)
- Cache management inline (not in a controller)

### Cover Letter Routes (`/api/coverletter`)
- Hugging Face AI generates cover letter text
- `docx` library generates Word documents for download

### Chatbot Routes (`/api/chatbot`)
- State machine with in-memory session storage (`Map`)
- Conversation flows through 12 states
- Puppeteer generates professional PDF resume

## Service Layer

### Redis Service (`redisService.js`)
- Singleton class wrapping `redis` client
- Methods: `connect()`, `disconnect()`, `getJobs()`, `setJobs()`, `generateCacheKey()`, `clearJobsCache()`, `getCacheStats()`
- Graceful degradation when Redis is unavailable

### JSearch Service (`jSearchService.js`)
- Wraps RapidAPI JSearch endpoint (`https://jsearch.p.rapidapi.com/search`)
- Includes data normalization: skill extraction, salary parsing, job type normalization
- Falls back to mock data in development mode

### Hugging Face Service (`huggingFaceService.js`)
- Uses `@huggingface/inference` SDK
- Features: cover letter generation (GPT-2), speech-to-text (Whisper), text-to-speech (VITS)
- Template-based fallback when AI generation fails

### File Validator (`fileValidator.js`)
- Magic byte verification for PDF/DOC/DOCX
- Filename sanitization (path traversal protection)
- Extension-to-MIME type enforcement

## Data Flow

### Resume Upload Flow
```
Client Upload (multipart)
  → Multer (disk storage to /uploads)
  → validateFileMiddleware (magic bytes + sanitization)
  → uploadResume controller
     → Save Resume document to MongoDB
     → Background: extractTextFromFile()
        → pdf-parse / mammoth (text extraction)
        → HuggingFaceResumeParser (AI NER extraction)
        → Fallback: NLP.js + compromise parsing
        → Normalize extracted data
        → Update Resume document with extractedData
```

### Job Search & Recommendation Flow
```
Client Request
  → Auth middleware (JWT verification)
  → searchJobs / getResumeBasedJobs
     → jSearchService.searchJobs() (external API call)
     → normalizeJobs() (data transformation)
     → Job.findOneAndUpdate() (upsert to MongoDB)
     → generateJobMatches() (score jobs vs resume)
        → classifyJobCategory() (domain classification)
        → calculateJobMatch() (skills/title/experience/location)
        → JobMatch.create() (store match)
  → Response with scored jobs
```

### Cover Letter Generation Flow
```
Client Request (jobId + preferences)
  → Auth middleware
  → Job.findById() + Resume.findOne()
  → HuggingFaceService.generateCoverLetter()
     → buildCoverLetterPrompt() (construct AI prompt)
     → hf.textGeneration() (GPT-2 via Hugging Face API)
     → cleanAndFormatCoverLetter()
     → Fallback: generateTemplateCoverLetter()
  → Response with generated text
```

### Chatbot Resume Builder Flow
```
Client sends message
  → Auth middleware
  → processMessage() controller
     → getUserSession() (in-memory Map)
     → isResumeRelated() (keyword check)
     → processStateMessage() (state machine dispatch)
        → handle[State]() functions
        → State transitions: WELCOME → PERSONAL_INFO → ... → COMPLETED
  → generateResume() (when COMPLETED)
     → convertChatDataToResume() (transform to schema)
     → Resume.findOneAndUpdate() or Resume.create()
  → downloadResume() → generateProfessionalPDF() via Puppeteer
```

## Auth Data Flow

### JWT Authentication
```
Login/Register
  → bcrypt.compare/hash password
  → generateAccessToken() (JWT, 15-min expiry)
  → generateRefreshToken() (JWT, 7-day expiry)
  → Set refreshToken as httpOnly cookie
  → Return accessToken in response body

Protected Route
  → authMiddleware.js
     → Parse Authorization: Bearer <token> header
     → Fallback to req.cookies.accessToken
     → jwt.verify(token, JWT_SECRET)
     → req.user = decoded (contains { id })

Token Refresh
  → POST /api/auth/refresh
  → Read refreshToken from cookie
  → jwt.verify() and User.findById()
  → Return new accessToken
```

### OAuth Flow
```
GET /api/oauth/google
  → passport.authenticate('google')
  → Redirect to Google consent screen
  → User authorizes → callback to /api/oauth/google/callback
  → Passport strategy: find-or-create user
     → Match by googleId
     → Match by email (link accounts)
     → Create new user
  → setOAuthAccessTokenCookie() (JWT in httpOnly cookie)
  → Redirect to /public/resume/resume.html
```

## Critical Architectural Notes

1. **Two auth middleware files** (`auth.js` and `authMiddleware.js`) exist with different implementations. Routes use `authMiddleware.js` which only decodes the JWT without a DB lookup. The `auth.js` file does a DB lookup but is unused.

2. **In-memory chat sessions** are not persisted. Server restart loses all in-progress resume building conversations.

3. **Background processing** for resume extraction runs as a fire-and-forget promise with no retry logic or queue management.

4. **LinkedIn OAuth** strategy is registered in `passport.js` but no routes exist for it.

5. **Winston** is listed as a dependency but not configured/used anywhere in application code.

6. **Express 5.x** is used, which has breaking changes from Express 4.x (e.g., `req.body` parsing, error handling differences).
