# Changelog

All notable changes to CareerPilot will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added

- **Validation**: Cover letter `generate` endpoint now validates `customInstructions`, `tone`, and `length` fields, matching the controller's actual expectations.
- **Error handling**: Token extraction now verifies `Authorization` header is a string before performing regex operations (`auth.js`).

### Changed

- **Auth middleware**: Consolidated duplicate middleware. `authMiddleware.js` (no DB lookup) removed. `auth.js` (with `User.findById` DB lookup) is now the single authentication middleware used across all routes.
- **Auth enforcement**: All protected routes now **require** a valid JWT. Removed the `TEST_USER_ID` fallback pattern from all 4 controllers (`resumeController`, `jobController`, `chatbotController`, `coverLetterController`). The `req.user.id` is guaranteed by the auth middleware; routes will return 401 if no valid token is present.

### Fixed

- **Chatbot `/progress` endpoint** (`chatbotController.js`): Changed `sessionId` extraction from `req.params` to `req.query`. The route was defined as `GET /progress` (no `:sessionId` path parameter), so `req.params` was always `undefined`.
- **Chatbot URL duplication** (`convertChatDataToResume` in `chatbotController.js`): Removed conflicting duplicate assignments where `linkedinUrl`, `githubUrl`, and `portfolioUrl` were set twice, with the second set overwriting the first. The link extraction from `chatData.links` is now the single source of truth.

### Added

- **Error handler middleware** (`src/middleware/errorHandler.js`): Centralized Express 5 error handler that handles Mongoose `ValidationError`, `CastError`, duplicate key (11000) errors, JWT errors, Multer errors, and unhandled exceptions with consistent `{ success, message, errors? }` response format.
- **PDF template** (`src/templates/resume-template.ejs`): Extracted the 600+ line inline HTML/CSS template from `chatbotController.js` into a standalone EJS template file. Uses `ejs.renderFile` for proper template engine rendering, making the template independently maintainable and editable.
- **Winston logger** (`src/config/logger.js`): Configured structured logging with console (colorized) and file transports (error.log, combined.log). `console.log/error/warn` are globally patched to route through Winston, enabling log level filtering and file-based log aggregation without touching existing code.
- **Health check endpoint** (`GET /api/health`): Created `src/routes/healthRoutes.js` that checks MongoDB connection state, Redis connectivity, process memory, and uptime. Returns `{ status: 'healthy'|'degraded', checks: {...} }`.

### Changed

- **Cache routes** (`jobRoutes.js`, `jobController.js`): Moved inline `GET /cache/stats` and `DELETE /cache/clear` route handlers from `jobRoutes.js` into dedicated `getCacheStats` and `clearCache` controller methods in `jobController.js`. Routes now reference controller methods instead of defining inline logic.

### Removed

- **`src/middleware/authMiddleware.js`**: Deleted in favor of `src/middleware/auth.js`.
- **`TEST_USER_ID` constant**: Removed from `resumeController.js`, `jobController.js`, `chatbotController.js`, and `coverLetterController.js`. This hardcoded ObjectId (`507f1f77bcf86cd799439011`) was used as a fallback when authentication was missing, allowing unauthenticated access to protected routes.

### Changed

- **Response format**: Standardized all API responses to use `{ success: boolean, message: string }` instead of the inconsistent `{ msg }` format. Updated `auth.js` middleware (x3), `resumeController.js` (x7), and `oauthRoutes.js` (x1) to match. Error responses include optional `errors: [...]` array for validation/multiple error details.
- **File operations**: Replaced all synchronous `fs.*Sync` calls with async `fs.promises` equivalents across `resumeController.js` (unlink, readFile), `fileValidator.js` (access, stat), and `resumeRoutes.js` (unlink, mkdir), preventing event loop blockage during file I/O.
- **Job matching** (`jobController.js`): Refactored `generateJobMatches` from N+1 query pattern (one `JobMatch.findOne` per job) to bulk operations. Existing matches are now fetched in a single query via `JobMatch.find({ userId, jobId: { $in: jobIds } })` and new matches are inserted with `JobMatch.insertMany`. This reduces DB round-trips from O(N) to O(2) regardless of job count.
- **Redis cache** (`redisService.js`): Replaced blocking `KEYS jobs:*` command with non-blocking `SCAN` iterator in both `clearJobsCache()` and `getCacheStats()`. Deletions are batched in chunks of 100 to avoid large multi-key operations.
- **Chatbot sessions** (`chatbotController.js`): Added memory safeguards to the in-memory session store - 24-hour TTL with hourly background cleanup (`setInterval`), and a limit of 10 concurrent sessions per user with oldest-first eviction.

### Removed

- **Unused dependencies** (`package.json`): Removed 9 unused packages (`docx-parser`, `file-saver`, `@nlpjs/basic`, `@nlpjs/lang-en`, `node-nlp`, `passport-linkedin-oauth2`, `textract`, `pdfkit`, `@huggingface/hub`). Consolidated `optionalDependencies` into `dependencies` to eliminate duplicates. Added `ejs` as a new dependency for template rendering.

### Added

- **Resume extractor service** (`src/services/resumeExtractor.js`): Extracted 20+ NLP/text extraction helper functions from `resumeController.js` (1041 → 382 lines, 66% reduction) into a dedicated service. Includes: `normalizeExtractedData`, `cleanTextForNLP`, `extractContactInfo`, `extractNameEnhanced`, `extractLocationEnhanced`, `extractUrls`, `extractSkills`, `extractSoftSkills`, `extractJobExperience`, `extractEducation`, `extractLanguages`, `extractCertifications`, `extractSummary`, `generateProfessionalSummary`, and `getEmptyResumeData`.
- **`extractContactInfoEnhanced`** (`enhancedExtraction.js`): Added missing enhanced contact info extraction function with phone number length validation. Exported alongside existing enhanced functions.
- **`resumeExtractor` + `enhancedExtraction` imports** (`resumeController.js`): Wired `extractStructuredDataWithNLP` to properly reference namespaced functions from both modules, fixing latent `ReferenceError` bugs where `extractContactInfoEnhanced` and `extractUrlsEnhanced` were called without being defined in scope.

---

## [1.0.0] - 2026-06-23

### Added

- Initial release with resume upload/processing, job search/matching, cover letter generation, chatbot resume builder, OAuth (Google/GitHub), and PDF generation.
