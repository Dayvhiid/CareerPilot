# CareerPilot - Security Review

## Authentication Flow

### Login/Register
- Passwords are hashed with **bcryptjs** (salt rounds: 10)
- **JWT access tokens** expire in 15 minutes (configurable via `JWT_EXPIRATION`)
- **JWT refresh tokens** expire in 7 days, stored as httpOnly cookies
- Refresh tokens can be rotated via `POST /api/auth/refresh`
- Passwords validated: min 8 chars, must contain uppercase + lowercase + number

### Auth Middleware
Two middleware files exist:
- **`authMiddleware.js`** (in use by all routes): Decodes JWT from `Authorization` header or `accessToken` cookie. Does NOT verify user exists in DB. Sets `req.user = { id: decoded.id }`.
- **`auth.js`** (unused): Same logic plus `User.findById()` DB lookup. Sets `req.user = fullUserDocument`.

**Fallback logic** in both: if `Authorization` header token is invalid but `accessToken` cookie is valid, it accepts the cookie token.

### OAuth Flow
- Google and GitHub OAuth via Passport strategies
- On success: JWT set as httpOnly cookie, redirect to resume page
- `ensureOAuthEnabled` middleware returns 503 if provider not configured
- OAuth does NOT create a password for the user (password field is conditional)

## Token Handling

| Token | Storage | Expiry | httpOnly | SameSite |
|-------|---------|--------|----------|----------|
| accessToken | Response body (login) + optional cookie (OAuth) | 15 min | Yes (cookie) | Strict |
| refreshToken | httpOnly cookie | 7 days | Yes | Strict |

**Note:** The access token is also set as a cookie during OAuth flows, but returned in the response body during login. The `token` field in login response is a duplicate of `accessToken` (legacy compatibility).

## Environment Variables & Secrets

### Validation (`validateEnv.js`)
- **Required**: `MONGODB_URI`, `JWT_SECRET`
- **Optional**: `NODE_ENV`, `SESSION_SECRET`, `JSEARCH_API_KEY`, `HUGGINGFACE_API_KEY`, `CORS_ORIGINS`, `REDIS_URL`, `PORT`
- Production: throws error if required vars are missing
- Development: logs warning
- `JWT_SECRET` must be ≥ 16 characters
- `SESSION_SECRET` must be ≥ 8 characters
- `MONGODB_URI` must start with `mongodb`

### Exposure Risk
- `JSEARCH_API_KEY` has a fallback placeholder `'your-jsearch-api-key'` in `jSearchService.js:6` — if `.env` is missing, this placeholder is sent to RapidAPI and will fail, but it could leak in logs
- `process.env.JWT_SECRET` falls back to `process.env.SESSION_SECRET` in session config (app.js:52): `secret: process.env.SESSION_SECRET || process.env.JWT_SECRET`

## Rate Limiting

| Limiter | Window | Max | Scope |
|---------|--------|-----|-------|
| `authLimiter` | 15 min | 5 | IP-based |
| `registrationLimiter` | 1 hour | 3 | IP-based |
| `chatbotLimiter` | 1 hour | 50 | User ID or IP |
| `uploadLimiter` | 24 hours | 10 | User ID or IP |
| `apiLimiter` | 1 hour | 200 | User ID or IP |
| `cacheLimiter` | 1 hour | 1 | User ID or IP |
| `generalLimiter` | 15 min | 100 | IP-based |

All limiters skip in test environment (`NODE_ENV === 'test'`).

## Input Validation

### express-validator Rules
- **Registration**: name (2-100 chars, alpha+spaces), email (valid, normalized), password (8+ chars, upper+lower+number)
- **Login**: email (valid), password (not empty)
- **Chatbot**: message (1-5000 chars, HTML-escaped), sessionId (max 100 chars)
- **Job search**: query (max 100 chars), location (max 100 chars), page (positive int)
- **Cover letter**: jobDescription (10-10000 chars), tone (in: professional/casual/formal)

**Note:** Many routes apply validators but missing validators exist for resume search query params, bookmark payloads, and chatbot/speak body.

## File Upload Security

### Protection Layers
1. **MIME type filter** (multer fileFilter): Only PDF, DOC, DOCX allowed
2. **Size limit**: 10MB maximum
3. **Magic byte verification**: Reads first 4 bytes and validates against known signatures
   - PDF: `%PDF` (0x25 0x50 0x44 0x46)
   - DOCX: ZIP header (0x50 0x4B 0x03 0x04)
   - DOC: OLE2 header (0xD0 0xCF 0x11 0xE0)
4. **Filename sanitization**: Removes path separators, null bytes, leading dots, non-alphanumeric chars
5. **Extension enforcement**: Ensures file extension matches declared MIME type

### Upload Path
- Files stored in `uploads/` directory with UUID-based names
- Old resume files are deleted on new upload
- Invalid files are deleted immediately after failed validation

## Potential Security Concerns

### 1. Duplicate Auth Middleware
Two auth middleware files with different behavior. The lighter `authMiddleware.js` (used in routes) does NOT verify the user exists in the database. A valid JWT for a deleted user would still be accepted.

### 2. JWT Secret Fallback in Session
`app.js:52`: `secret: process.env.SESSION_SECRET || process.env.JWT_SECRET` — if `SESSION_SECRET` is not set, the JWT signing secret is reused as the session secret, reducing cryptographic separation.

### 3. Mock Data in Production
`jSearchService.js:68-71`: If `NODE_ENV === 'development'`, returns mock data. If `NODE_ENV` is accidentally set to `development` in production, mock data is served instead of real API results.

### 4. No Helmet.js
The app does not use `helmet` for standard security headers (X-Content-Type-Options, X-Frame-Options, CSP, etc.).

### 5. In-Memory Session Data
Chatbot sessions are stored in a `Map` with no TTL/eviction. A memory leak is possible if sessions are never completed. No rate limiting on session creation.

### 6. Duplicate Token Fields
Login response includes both `accessToken` and `token` with the same value. This is inconsistent but not a security issue — just a code smell.

### 7. Error Message Verbosity
Some error responses include `error: error.message` which may leak internal details (e.g., `src/controllers/jobController.js:172`). Others only return generic messages.

### 8. No CSRF Protection
While cookies use `sameSite: 'strict'`, there's no explicit CSRF token mechanism. The JWT-in-header pattern is the primary protection.

### 9. Weak Password Reset
No password reset flow exists. Users who forget their password or signed up via OAuth have no recovery path.

### 10. LinkedIn OAuth Unused
`passport-linkedin-oauth2` strategy is imported but no routes or callback handlers exist for LinkedIn.

### 11. Console Logging
The application uses `console.log`/`console.error` extensively instead of structured logging (winston is installed but not configured). Sensitive data could appear in logs.

### 12. No HSTS
No `strict-transport-security` header is set for HTTPS enforcement.
