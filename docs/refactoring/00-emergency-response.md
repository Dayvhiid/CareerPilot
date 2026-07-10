# Phase 0 — Emergency Response Plan

> **Duration**: 1–2 days
> **Risk Level**: 🔴 CRITICAL — Stop everything and execute this NOW.

---

## Objective

Neutralize the most dangerous vulnerabilities that expose user data, infrastructure, and financial systems. The `.env` file with 15+ live secrets has been committed to Git. Assume all credentials are compromised.

---

## Tasks

### 0.1 — Rotate ALL Secrets Immediately

Every credential in `.env` must be rotated. This is non-negotiable.

**Inventory of compromised secrets:**

| Secret | Location | Impact |
|--------|----------|--------|
| `MONGO_URI` | `.env` | Full database access (users, resumes, conversations, payment records) |
| `REDIS_URL` | `.env` | Cache access, session manipulation |
| `JWT_SECRET` | `.env` | Forge any user's JWT token |
| `SESSION_SECRET` | `.env` | Decrypt Express sessions |
| `GOOGLE_CLIENT_ID/SECRET` | `.env` | Impersonate OAuth app |
| `GITHUB_CLIENT_ID/SECRET` | `.env` | Impersonate OAuth app |
| `PAYSTACK_SECRET_KEY` | `.env` | Initiate/verify payments fraudulently |
| `PAYSTACK_PUBLIC_KEY` | `.env` | Accept payments on attacker's behalf |
| `JSEARCH_API_KEY` | `.env` | Use paid API at app's expense |
| `GEMINI_API_KEY` | `.env` | Use paid AI API at app's expense |
| `HUGGINGFACE_API_KEY` | `.env.example` | Not active, but still rotate |

**Steps:**

```bash
# 1. Remove .env from Git tracking immediately
git rm --cached .env

# 2. Add .env to .gitignore (already there, confirm)
echo ".env" >> .gitignore

# 3. FORCE PUSH to remove from history
#    Coordinate with ALL team members before this step
git add .gitignore
git commit -m "chore: remove .env from tracking"
git push origin --force --all

# 4. WARNING: force push does NOT remove from reflog/GitHub.
#    Use GitHub support or BFG Repo-Cleaner for full scrub:
#    java -jar bfg.jar --delete-files .env careerpilot.git
#    git reflog expire --expire=now --all
#    git gc --prune=now --aggressive

# 5. Rotate every secret at their respective providers:
#    - MongoDB Atlas: rotate database user password
#    - Redis Cloud: rotate password
#    - Google Cloud Console: rotate OAuth client secret
#    - GitHub OAuth Apps: regenerate client secret
#    - PayStack: regenerate secret key
#    - RapidAPI (JSearch): regenerate API key
#    - Google AI Studio: regenerate Gemini API key
```

### 0.2 — Prevent .env From Being Committed Again

```bash
# Add to .env.example a note about this incident
cat >> .env.example << 'EOF'

# ⚠ IMPORTANT SECURITY NOTICE
# Never commit .env to version control.
# The production .env must be loaded via AWS Secrets Manager or Parameter Store.
EOF

# Create a pre-commit hook
cat > .git/hooks/pre-commit << 'SCRIPT'
#!/bin/sh
if git diff --cached --name-only | grep -q '\.env$'; then
  echo "ERROR: .env file is staged for commit. This is a security risk."
  echo "Use .env.example for documentation and load secrets via environment."
  exit 1
fi
SCRIPT
chmod +x .git/hooks/pre-commit
```

### 0.3 — Audit Git History for Secret Exposure

```bash
# Check if secrets appear in commit history
git log --all --full-history -- .env

# Search for any leaked secrets in commit messages or diffs
git log --all -p | grep -i "mongodb\|paystack\|secret\|password\|api_key" | head -20
```

### 0.4 — Add .env to .ebextensions Blacklist

Modify `.ebextensions/nodejs.config` to reject `.env` files at the platform level:

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    # Set these via AWS Console → Configuration → Software → Environment Properties
    # NEVER ship them in source control
```

### 0.5 — Emergency Credential Validation Middleware

Add a startup check that **refuses to boot** if `.env` contains placeholder/default secrets in production:

```javascript
// src/config/validateEnv.js — ADD this check
if (process.env.JWT_SECRET === 'replace-with-a-long-random-secret') {
  throw new Error('CRITICAL: JWT_SECRET still set to default value. Rotate immediately.');
}
```

### 0.6 — Incident Report

Document:
- What was exposed (full list of secrets)
- How long they were exposed (check commit dates)
- Whether any unauthorized access detected (check MongoDB/Redis logs)
- Whether impacted users need to be notified (GDPR 72-hour breach notification)
- Steps taken to remediate

---

## Verification

```bash
# Confirm .env is no longer tracked
git ls-files .env
# Should return nothing

# Confirm no secrets in index
git diff --cached --name-only | grep env

# Confirm server refuses to start with default secrets
NODE_ENV=production JWT_SECRET=replace-with-a-long-random-secret node server.js
# Should exit with error
```

---

## Definition of Done

- [ ] All secrets rotated at source providers
- [ ] `.env` removed from Git history
- [ ] Pre-commit hook installed
- [ ] `.ebextensions` configured to reject env file drops
- [ ] Startup validation added for default secrets
- [ ] Incident report written and filed
- [ ] All team members aware of severity and new procedures

---

## Next Phase

➡️ Proceed to [Phase 1 — Foundation & Security](./01-foundation-security.md)
