# CareerPilot - Project Overview

## Application Purpose

CareerPilot is a full-stack Node.js web application that helps job seekers manage their job search pipeline. It allows users to upload and parse resumes, search for jobs via an external API, receive AI-powered job recommendations, generate cover letters via Hugging Face models, build resumes through an interactive chatbot, and download professional PDF resumes.

## Framework

**Express.js 5.x** (v5.1.0) - The latest major version of Express, using its new routing and middleware APIs.

## Entry Point

- `server.js` - Starts the server, loads environment variables (`dotenv`), connects to MongoDB, and initializes the Express app from `src/app.js`.

## Scripts

| Script | Command | Purpose |
|--------|---------|---------|
| `start` | `node server.js` | Production start |
| `dev` | `nodemon server.js` | Development with auto-restart |
| `test` | `jest --detectOpenHandles` | Run test suite |
| `test:watch` | `jest --watch` | Run tests in watch mode |
| `test:coverage` | `jest --coverage` | Run tests with coverage |

## Dependencies Categorized

### Core Framework
- `express@^5.1.0` - Web framework

### Database & Cache
- `mongoose@^8.18.1` - MongoDB ODM
- `redis@^5.8.2` - Redis client for caching

### Authentication & Security
- `jsonwebtoken@^9.0.2` - JWT generation/verification
- `bcryptjs@^3.0.2` - Password hashing
- `passport@^0.7.0` - Authentication middleware
- `passport-google-oauth20@^2.0.0` - Google OAuth strategy
- `passport-github2@^0.1.12` - GitHub OAuth strategy
- `passport-linkedin-oauth2@^2.0.0` - LinkedIn OAuth strategy (imported but unused in routes)
- `express-session@^1.18.2` - Session management for OAuth
- `cookie-parser@^1.4.6` - Cookie parsing
- `express-rate-limit@^7.1.5` - Rate limiting middleware
- `express-validator@^7.0.0` - Input validation

### File Handling
- `multer@^2.0.2` - File upload handling
- `pdf-parse@^1.1.1` - PDF text extraction
- `mammoth@^1.11.0` - DOCX text extraction
- `docx@^9.5.1` - DOCX document generation
- `docx-parser@^0.2.1` - Legacy DOCX parser (likely unused)
- `pdfkit@^0.17.2` - PDF generation (likely superseded by puppeteer)
- `puppeteer@^24.22.3` - Headless browser for PDF generation
- `fs-extra@^11.3.2` - Enhanced file system operations

### NLP / AI
- `@huggingface/inference@^4.13.15` - Hugging Face Inference API client
- `@huggingface/hub@^2.6.5` - Hugging Face Hub utilities
- `natural@^8.1.0` - NLP toolkit (stemming, similarity)
- `compromise@^14.14.4` - Lightweight NLP for entity extraction
- `@nlpjs/basic@^5.0.0-alpha.5` - NLP.js framework (likely unused)
- `@nlpjs/lang-en@^5.0.0-alpha.5` - English language plugin
- `node-nlp@^5.0.0-alpha.5` - Another NLP.js entry point

### External APIs
- `axios@^1.12.2` - HTTP client for JSearch API calls

### Utilities
- `dotenv@^17.2.2` - Environment variable loading
- `uuid@^13.0.0` - UUID generation for filenames
- `cors@^2.8.5` - CORS middleware
- `form-data@^4.0.4` - Form data handling
- `winston@^3.11.0` - Logging (configured but not in use)
- `file-saver@^2.0.5` - Client-side file saving (server-side, likely unused)

### Dev Dependencies
- `nodemon@^3.1.14` - Auto-restart during development
- `jest@^29.7.0` - Testing framework
- `supertest@^6.3.3` - HTTP assertion testing

## Project Structure

```
CareerPilot/
├── server.js                      # Entry point
├── package.json
├── jest.config.js
├── .env / .env.example
├── .gitignore
├── src/
│   ├── app.js                     # Express app setup
│   ├── config/
│   │   ├── db.js                  # MongoDB connection
│   │   ├── passport.js            # OAuth strategies
│   │   └── validateEnv.js         # Environment variable validation
│   ├── middleware/
│   │   ├── auth.js                # Full auth middleware (fetch user from DB)
│   │   ├── authMiddleware.js       # Lightweight auth middleware (token only)
│   │   ├── rateLimiters.js        # 7 rate limiter configs
│   │   └── validators.js          # Input validation rules
│   ├── routes/
│   │   ├── authRoutes.js          # POST /register, /login, /refresh, /logout
│   │   ├── oauthRoutes.js         # Google & GitHub OAuth flows
│   │   ├── resumeRoutes.js        # Resume upload, get, delete
│   │   ├── jobRoutes.js           # Job search, recommendations, bookmark, apply
│   │   ├── coverLetterRoutes.js   # Cover letter generation & download
│   │   └── chatbotRoutes.js       # Interactive resume builder chatbot
│   ├── controllers/
│   │   ├── authController.js      # Registration, login, token refresh, logout
│   │   ├── jobController.js       # Job search, matching, bookmarking
│   │   ├── resumeController.js    # Resume upload, parsing, NLP extraction
│   │   ├── HuggingFaceResumeParser.js  # AI-powered resume parsing
│   │   ├── enhancedExtraction.js  # Enhanced NLP extraction utilities
│   │   ├── coverLetterController.js  # Cover letter generation
│   │   └── chatbotController.js   # Conversational resume builder
│   ├── models/
│   │   ├── User.js                # User (email/password + OAuth)
│   │   ├── Resume.js              # Resume (V2 model name)
│   │   ├── Job.js                 # Job listing
│   │   └── JobMatch.js            # User-job match scores
│   └── services/
│       ├── jSearchService.js      # JSearch API integration
│       ├── huggingFaceService.js  # Hugging Face AI service
│       ├── redisService.js        # Redis caching
│       └── fileValidator.js       # File upload security validation
├── public/
│   ├── index.html                 # Landing page
│   ├── auth/
│   │   ├── login.html / loginmobile.html
│   │   └── signup.html / signupmobile.html
│   ├── resume/
│   │   ├── resume.html / resumemobile.html
│   ├── jobs/
│   │   ├── jobs.html / jobsmobile.html
│   ├── chatbot/
│   │   ├── chatbot.html / chatbotmobile.html
│   └── test-api.html
├── tests/
│   ├── setup.js                   # Jest setup
│   ├── auth.test.js               # Auth tests (26 cases)
│   ├── fileValidation.test.js     # File validation tests (19 cases)
│   ├── test-*.js                  # Manual/integration test scripts
├── uploads/                       # Resume file uploads
├── scripts/
│   └── backfill-job-categories.js # One-time data migration
└── docs/                          # Documentation
```

## Key Design Decisions

1. **Express 5** - Uses the latest Express 5.x with its updated routing
2. **Dual Auth Middleware** - Two auth middleware files exist: `authMiddleware.js` (lightweight, token-only) used by routes, and `auth.js` (full, DB lookup) available but unused by routes
3. **Background Processing** - Resume text extraction runs asynchronously after upload
4. **Redis as Optional Cache** - Jobs cache via Redis; server continues without it
5. **Hugging Face AI** - Cover letter generation and resume parsing via Hugging Face models
6. **In-Memory Chat Sessions** - Chatbot uses a `Map` for session state (not persisted)
7. **NLP-First Parsing** - Multiple resume parsing strategies with fallback chain
8. **Security Remediation Completed** - The codebase has undergone a security overhaul adding auth enforcement, rate limiting, input validation, and file validation
