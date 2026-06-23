# CareerPilot - Engineering Audit

## Bugs

### 1. Duplicate Auth Middleware Files
Two files (`src/middleware/auth.js` and `src/middleware/authMiddleware.js`) serve the same purpose with slightly different implementations. Routes import `authMiddleware.js` (no DB lookup), while `auth.js` (with DB lookup) is unused. This creates confusion and maintenance risk.

### 2. Chatbot Progress Endpoint Uses `req.params`
`chatbotController.js:197`: `const { sessionId } = req.params;` — but the route at `chatbotRoutes.js:28` is defined as `GET /progress` with no `:sessionId` parameter. This will always be `undefined`.

### 3. Cover Letter Validator Expects Wrong Field
`validators.js:122-125`: The cover letter `generate` validator validates `jobDescription`, but the controller (`coverLetterController.js:17`) reads `customInstructions`, `tone`, and `length` from the body — NOT `jobDescription`. The validation will always fail on this field.

### 4. Chatbot URL Data Duplication
`chatbotController.js:1115-1124`: The `convertChatDataToResume()` function sets `linkedinUrl`, `githubUrl`, and `portfolioUrl` twice with different values:
```js
linkedinUrl: chatData.links?.find(link => link.type === 'linkedin')?.url || '',  // line 1115
// ...
linkedinUrl: chatData.additionalInfo?.links?.includes('linkedin') ? chatData.additionalInfo.links : '',  // line 1122
```
The second assignment overwrites the first. Similarly for `githubUrl` and `portfolioUrl`.

### 5. Inconsistent Response Formats
Some endpoints return `{ msg: "..." }`, others return `{ success: true, message: "..." }`. Auth endpoints return `{ success, message }` while resume endpoints return `{ msg }`. This forces frontend developers to handle two formats.

### 6. Test User ID Hardcoded Across Controllers
Every controller defines `const TEST_USER_ID = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011")` — this is repeated in 4+ files. When auth is bypassed (missing token), this test user is used instead.

### 7. Hanging Asynchronous Operations
`resumeController.js:190-192`: Background extraction uses a fire-and-forget pattern with `.catch()`. If an error occurs after the response is sent, the client has no way to know the extraction failed.

## Performance Bottlenecks

### 1. N+1 Job Matching Loop
`jobController.js:281-327`: The `generateJobMatches()` function fetches ALL active jobs, then iterates over each one sequentially, making a MongoDB query per job (`JobMatch.findOne`) inside the loop. With thousands of jobs, this creates hundreds of DB round-trips.

### 2. Synchronous File Operations
Throughout the codebase, `fs.unlinkSync()`, `fs.readFileSync()`, `fs.existsSync()`, and `fs.statSync()` are used instead of their async counterparts, blocking the event loop.

### 3. Unbounded In-Memory Session Store
Chatbot sessions are stored in a plain `Map` with no size limit, TTL, or eviction policy. Long-running or abandoned sessions accumulate memory indefinitely.

### 4. Puppeteer PDF Per Request
Each resume PDF download launches a full headless Chromium instance, generates HTML, converts to PDF, and closes the browser. This is extremely resource-intensive for a per-request operation.

### 5. No Pagination on Job Matching
`getRecommendedJobs` generates matches for ALL jobs before paginating. For large job databases, match generation runs on every request even if the user already has matches.

### 6. Redis `KEYS` Command
`redisService.js:175` and `redisService.js:198`: The `KEYS jobs:*` command is used, which is O(N) and blocks Redis on large datasets. Should use `SCAN` instead.

## Scalability Concerns

### 1. Single-Process Background Processing
Resume extraction runs in the main Node.js process. CPU-intensive NLP operations block the event loop. No worker threads or job queues (Bull, RabbitMQ) are used.

### 2. No Request Queue
External API calls (JSearch, HuggingFace) are made synchronously within request handlers. If external APIs are slow, all request processing threads are blocked.

### 3. Stateless Session Design Missing
Chatbot state lives in server memory, preventing horizontal scaling. A distributed cache (Redis) or database-backed sessions would be needed for multi-instance deployment.

### 4. No Database Connection Pool Tuning
Default Mongoose connection pool settings are used. Under load, connection starvation could occur.

### 5. File Storage on Local Disk
Resume uploads are stored on the local filesystem. This doesn't scale across multiple server instances and creates data loss risk. Object storage (S3, Cloudinary) would be needed.

## Code Smells

### 1. Magic Strings for Test User
The same ObjectId string appears in 4+ controller files. It should be a shared constant.

### 2. Inline Cache Logic in Routes
`jobRoutes.js:22-34`: Cache management endpoints (`/cache/stats`, `/cache/clear`) have logic inline in the route file instead of in a controller or service.

### 3. Duplicated NLP Parsing Logic
Both `resumeController.js` and `controllers/enhancedExtraction.js` contain similar NLP extraction code. The chatbot controller also has its own data conversion logic.

### 4. Large Controllers
- `resumeController.js`: 1126 lines
- `jobController.js`: 926 lines
- `chatbotController.js`: 1200+ lines

These combine multiple concerns (data transformation, business logic, state management, PDF generation) in single files.

### 5. Express 4 Patterns in Express 5
The codebase uses Express 5.x but employs Express 4 error handling patterns. Express 5 has different error handling semantics (rejected promises in async handlers are automatically forwarded to error middleware, but no error middleware exists).

### 6. Non-Standard Logger
Winston is installed but `console.log`/`console.error` is used everywhere. This makes log aggregation and level-based filtering impossible without code changes.

### 7. Unused Imports
- `docx-parser` in package.json — likely unused
- `file-saver` in package.json — client-side library on server
- `@nlpjs/basic`, `@nlpjs/lang-en`, `node-nlp` — likely superseded by `natural` + `compromise`
- LinkedIn passport strategy registered but no routes

### 8. Optional Dependencies in Wrong Section
`express-rate-limit`, `express-validator`, `cookie-parser`, and `winston` are listed under both `dependencies` and `optionalDependencies` in `package.json`. This is redundant and could cause install issues.

### 9. Background Tasks Without Error Recovery
Resume extraction errors are caught but there's no retry mechanism. Failed extractions stay in an error state permanently.

### 10. Direct HTML String Construction
The resume PDF template is a massive template literal string (800+ lines of inline CSS/HTML) inside `chatbotController.js`. This is unmaintainable and should be a separate template file.

## Refactoring Opportunities

### High Priority
1. **Consolidate auth middleware** — Remove the duplicate `auth.js` or `authMiddleware.js`
2. **Fix chatbot progress endpoint** — Change `req.params` to `req.query` for `sessionId`
3. **Fix cover letter validator** — Align validated field name with controller usage
4. **Fix chatbot URL duplication** — Remove conflicting duplicate assignments
5. **Extract test user constant** — Move `TEST_USER_ID` to a shared config

### Medium Priority
6. **Standardize response format** — Choose `{ success, message }` or `{ msg }` and apply everywhere
7. **Move inline route logic to controllers** — Extract cache management from `jobRoutes.js`
8. **Replace sync file operations** — Use `fs.promises` API throughout
9. **Add session TTL to chatbot** — Implement session expiry and cleanup
10. **Extract PDF template** — Move the Puppeteer HTML template to a separate file
11. **Add error middleware** — Create a centralized Express error handler

### Low Priority
12. **Optimize job matching loop** — Use bulk operations and batch queries
13. **Replace Redis `KEYS` with `SCAN`** — Non-blocking key iteration
14. **Remove unused dependencies** — Audit and prune `package.json`
15. **Configure Winston** — Replace `console.log` with structured logging
16. **Add job queue** — Extract background processing to Bull/BullMQ
17. **Add health check endpoint** — `/api/health` for monitoring
