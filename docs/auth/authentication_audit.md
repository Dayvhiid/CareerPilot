# CareerPilot — Authentication Module Review

Date: 2026-08-11

## 1. Current Architecture (what exists)

- **Local auth**: `POST /api/auth/register`, `/login`, `/refresh`, `/logout` (`src/controllers/authController.js`, `src/routes/authRoutes.js`)
- **Token model**: JWT access token (15m, in response body) + JWT refresh token (7d, httpOnly cookie, SameSite=strict), with in-memory refresh-token rotation (`revokedTokens` `Set`)
- **OAuth**: Google + GitHub via Passport (`src/config/passport.js`, `src/routes/oauthRoutes.js`), sets both access+refresh tokens as httpOnly cookies
- **Auth middleware**: `src/middleware/auth.js` verifies JWT + DB lookup per request
- **Supporting layer**: bcryptjs (cost 10), express-validator, rate limiters, Helmet, mongo-sanitize, double-submit CSRF cookie, Redis-backed sessions for OAuth
- **No password reset, no email verification, no change-password flow** anywhere

---

## 2. Findings vs. Industry Standards (OWASP ASVS / NIST 800-63B)

### Critical

| # | Finding | Std reference |
|---|---------|---------------|
| C1 | **No password reset / forgot-password / email verification / change-password flows.** Users with forgotten passwords or OAuth-only accounts have no recovery path. | ASVS 2.1.1, NIST 800-63B §5 |
| C2 | **Access token stored in `localStorage`** (`login.html:723`, consumed across all pages) → stolen by any XSS. CSP allows `scriptSrc 'unsafe-inline'`, amplifying this. | ASVS 3.4.1, OWASP Top-10 A05 |
| C3 | **Refresh-token revocation is non-functional.** `revokedTokens` is an in-process `Set` — lost on restart, not shared across instances; `logout` revokes nothing server-side; `revokeAllUserTokens()` adds a marker (`user_<id>_all`) that is **never checked** (`authController.js:110` only checks exact `tokenId`); OAuth refresh tokens carry no `tokenId` at all, so rotation logic never applies to them. | ASVS 3.3.1–3.3.3, 6.2.1 |

### High

| # | Finding |
|---|---------|
| H1 | **OAuth login is CSRF-vulnerable** — no `state` parameter passed to Google/GitHub strategies. | ASVS 3.5.1, 11.1.1 |
| H2 | **Broken OAuth integration**: callback sets an httpOnly `accessToken` cookie, but every frontend call always sends an `Authorization: Bearer <localStorage>` header (`resume.html:1033`). `extractToken` (`src/middleware/auth.js:5-11`) returns immediately when that header exists, so the cookie fallback is never reached — and an empty `Bearer ` blocks the cookie path entirely. OAuth sessions effectively don't work with the current frontend. | |
| H3 | **`/api/auth/refresh` and `/logout` have no rate limiting** — an attacker with a stolen refresh cookie gets unlimited token issuance; brute-force of refresh tokens is unthrottled. | ASVS 4.3.2 |
| H4 | **Email enumeration**: register returns `"User already exists"` (HTTP 400) distinguishing registered vs. unregistered emails. | ASVS 2.1.4 (soft) |
| H5 | **Hardcoded Paystack secret committed** in `.env.example:42` (`PAYSTACK_SECRET_KEY=sk_test_...`). Even as a test key, real credentials should never be in the repo. | |

### Medium

| # | Finding |
|---|---------|
| M1 | **CSRF double-submit cookie is ineffective for actual flows** — frontend never sends `X-CSRF-Token`, and any request with a `Bearer` header is skipped, so it's effectively dead code; cookie lacks `__Host-` prefix/path scoping. |
| M2 | **OAuth callback for local registration**: linking an existing email account to Google/GitHub happens on first login without re-authentication of the local password — account-takeover vector via email-preverify checks (mitigated only by provider `verified` flag, not cryptographically). |
| M3 | **Refresh endpoint issues new tokens for deleted users** (no DB existence check; only the access middleware catches it later). |
| M4 | **No global/API-wide rate limit** — `generalLimiter` (100/15min) is defined but never mounted; only select routes are throttled. |
| M5 | **`SESSION_SECRET` is listed optional** (`validateEnv.js:10`) but `express-session` hard-requires it → potential startup crash in prod if unset; session secret also should not share entropy with JWT secrets. |
| M6 | **Register-then-save race** — `User.findOne` + `save` can throw a duplicate-key error → 500 instead of 400 under concurrency. |
| M7 | **No auth event audit logging** (logins, failures, OAuth links) despite `auditMiddleware` existing and unused on auth routes. |

### Low / Strengths to keep

- bcrypt cost 10 — fine but consider 12 (`bcryptjs` is pure-JS, slow).
- JWT claims minimal — no `iss`/`aud`/`jti`; recommend setting them.
- Password policy is composition-based (8+ chars + upper/lower/digit) — NIST 800-63B favors length > 8 with no composition rules; current policy is acceptable but dated.
- **Good**: httpOnly+SameSite=strict refresh cookie, separate access/refresh secrets, env validation that fails fast on placeholder secrets, Helmet/CSP/HSTS, mongo-sanitize, express-validator, per-endpoint rate limiters, Redis-backed sessions, graceful OAuth-disable when creds missing.

---

## 3. Recommended priority plan

1. **Persistent, revocable refresh tokens** — store tokenId + userId + expiry in Redis/Mongo; server-side revocation on logout; make `logout` revoke; check user existence in refresh; add `jti`/`iss`/`aud`.
2. **Fix OAuth** — add `state` param, move access token to httpOnly cookie flow that the frontend actually uses (drop `Bearer`-always header), or return access token via `postMessage`/redirect query consumed into memory (not localStorage); align OAuth refresh tokens with the rotation/revocation model.
3. **Add password reset + email verification** (tokenized, expiring links; OAuth accounts get an email-recovery path).
4. **Stop storing access tokens in localStorage** — use httpOnly cookie for access token too (or short-lived in-memory); remove `'unsafe-inline'` scriptSrc.
5. **Remove `.env.example` secrets**, add `generalLimiter` globally, rate-limit `/refresh`.
6. **Wire audit logging** onto auth routes; add account-lockout/attempt tracking; make register responses uniform to reduce enumeration.

---

## 4. Remediation Status (2026-08-11)

Implemented in this pass:

| # | Fix | Files |
|---|-----|-------|
| C3 | Persistent, revocable refresh tokens (Redis store with in-memory fallback); server-side revocation on logout; refresh endpoint checks store + user existence; tokens now carry `jti`/`iss`/`aud` | `src/services/tokenStore.js`, `src/services/tokenService.js`, `src/controllers/authController.js` |
| H1 | OAuth CSRF mitigated with `state: true` on Google/GitHub strategies | `src/config/passport.js` |
| H2 | Fixed broken cookie/Bearer fallback in auth middleware; OAuth tokens now use the same rotation/revocation model; frontend no longer sends empty `Bearer ` headers | `src/middleware/auth.js`, `src/routes/oauthRoutes.js`, all `public/` pages |
| C1 | Added password reset (`forgot-password`, `reset-password`), email verification (`verify-email`, `resend-verification`), and change-password flows with hashed, expiring tokens | `src/controllers/authController.js`, `src/routes/authRoutes.js`, `src/middleware/validators.js`, `public/auth/reset-password.html` |
| C2 | Access token moved to httpOnly cookie; frontend no longer persists tokens in `localStorage` | `src/services/tokenService.js`, `public/auth/login.html`, `public/resume/resume.html`, `public/jobs/jobs.html`, `public/chatbot/chatbot.html`, `public/upgrade/upgrade.html` |
| H3 | Rate-limited `/refresh`; added forgot/reset password limiters | `src/middleware/rateLimiters.js`, `src/routes/authRoutes.js` |
| H4 | Register returns a generic message on duplicate email | `src/controllers/authController.js` |
| H5 | Removed hardcoded Paystack keys from `.env.example` | `.env.example` |
| M1 | Removed the broken double-submit CSRF middleware that blocked login/register; CSRF is now mitigated via `SameSite=strict` on all auth cookies | `src/app.js` |
| M3 | Refresh endpoint now rejects tokens for deleted users | `src/controllers/authController.js` |
| M4 | Mounted `generalLimiter` globally on `/api` | `src/app.js` |
| M5 | `SESSION_SECRET` promoted to a required variable | `src/config/validateEnv.js` |
| M6 | Duplicate-key race handled via `User.create` + `code === 11000` | `src/controllers/authController.js` |
| M7 | Auth events (register/login/logout/oauth-link/password-change) logged via `Audit` model | `src/controllers/authController.js`, `src/routes/oauthRoutes.js`, `src/models/Audit.js` |

Still open / follow-ups:

- **Email delivery** — `src/services/emailService.js` only logs emails. Wire a real provider (SES, SendGrid, etc.) for production verification/reset emails.
- **OAuth account linking (M2)** — linking an existing email/password account to a provider happens on first login without re-entering the local password. Consider requiring a one-time confirmation.
- **bcrypt cost 10** → consider raising to 12 (`BCRYPT_ROUNDS` in `authController.js` is already 12 for new hashes).
- **`.env`** uses the same value for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` — rotate to two distinct secrets.
- **Password policy** remains composition-based; NIST 800-63B prefers length-only rules.
- **`generalLimiter`** is per-IP; fine for now but consider a Redis-backed store across instances.

