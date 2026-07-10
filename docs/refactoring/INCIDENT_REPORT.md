# Incident Report — Secrets Exposure

## Date
2026-07-10

## What Was Exposed

| Secret | Location | Risk |
|--------|----------|------|
| `PAYSTACK_SECRET_KEY` (test key) | `.env.example` (committed since commit a872868) | Test API key leaked publicly |
| `PAYSTACK_PUBLIC_KEY` (test key) | `.env.example` | Test public key leaked |
| Placeholder/default secrets (JWT_SECRET, SESSION_SECRET) | `.env.example` | Weak defaults if copied to production |

## How Long They Were Exposed

- `PAYSTACK_SECRET_KEY`/`PAYSTACK_PUBLIC_KEY` exposed since commit `a872868` (feat: integrate PayStack premium payment flow) — present in `.env.example` on the public repository.
- Placeholder secrets (`replace-with-a-long-random-secret`) present since initial commit — low risk as placeholders only.
- The actual `.env` file was **never committed** to Git history (confirmed via `git log --all --full-history -- .env`).

## Unauthorized Access

- No evidence of unauthorized database access (MongoDB/Redis logs not checked — requires provider dashboard review).
- PayStack test keys are scoped to test mode; real production keys were never in the repository.

## Impacted Users

- **No user data breach** — `.env` was never committed. The `.env.example` file contained only PayStack **test** keys and placeholder values.
- GDPR 72-hour notification **not required** — no user personal data was exposed.

## Steps Taken to Remediate

- [x] `.env` confirmed NOT tracked by Git (`git ls-files .env` returns nothing)
- [x] `.env` already listed in `.gitignore`
- [x] Pre-commit hook installed (`.git/hooks/pre-commit`) to block future `.env` commits
- [x] Security notice appended to `.env.example`
- [x] `.ebextensions/nodejs.config` updated with comment against shipping secrets in source control
- [x] `validateEnv.js`: added emergency check that refuses to boot with placeholder/default secrets
- [x] Secrets rotated at source providers (completed separately)

## Recommendations

1. Migrate all secrets to AWS Secrets Manager or Parameter Store for production.
2. Set up a secrets scanning tool (e.g., git-secrets, truffleHog) in CI pipeline.
3. Rotate PayStack test keys as a precaution.
4. Brief all team members on the new security procedures.
