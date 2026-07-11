# Phase 7 — Production Readiness

> **Duration**: 5–7 days
> **Priority**: 🔴 CRITICAL
> **Depends on**: Phase 0–6 complete

---

## Objective

Hardening, load testing, security validation, disaster recovery planning, and final go/no-go checklist.

---

## Tasks

### 7.1 — Load Testing

**Install k6:**
```bash
# Windows
winget install k6

# Verify
k6 version
```

**Create `load-tests/auth-flow.js`:**

```javascript
import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const registerErrorRate = new Rate('registration_errors');
const loginDuration = new Trend('login_duration');

export const options = {
  stages: [
    { duration: '2m', target: 50 },   // Ramp up to 50 users
    { duration: '5m', target: 100 },  // Stay at 100 users
    { duration: '2m', target: 200 },  // Spike to 200
    { duration: '3m', target: 200 },  // Hold at 200
    { duration: '2m', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    registration_errors: ['rate<0.05'], // <5% error rate
    http_req_failed: ['rate<0.01'],     // <1% total failures
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';

export default function () {
  group('Authentication Flow', () => {
    // Registration
    const registerPayload = JSON.stringify({
      name: `Test User ${Date.now()}`,
      email: `test${Date.now()}@example.com`,
      password: 'TestPass123',
    });

    const registerRes = http.post(`${BASE_URL}/api/auth/register`, registerPayload, {
      headers: { 'Content-Type': 'application/json' },
    });

    registerErrorRate.add(registerRes.status !== 201);
    check(registerRes, {
      'register success': (r) => r.status === 201,
    });

    // Login
    const loginStart = Date.now();
    const loginRes = http.post(`${BASE_URL}/api/auth/login`, JSON.stringify({
      email: `test${Date.now()}@example.com`,
      password: 'TestPass123',
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
    loginDuration.add(Date.now() - loginStart);

    check(loginRes, {
      'login success': (r) => r.status === 200,
      'has access token': (r) => r.json('accessToken') !== undefined,
    });

    if (loginRes.status === 200) {
      const token = loginRes.json('accessToken');

      // Get recommendations (authenticated)
      group('Authenticated Requests', () => {
        const recRes = http.get(`${BASE_URL}/api/recommendations`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        check(recRes, {
          'recommendations ok': (r) => r.status === 200 || r.status === 404,
          'recommendations fast': (r) => r.timings.duration < 1000,
        });
      });
    }
  });

  sleep(1);
}
```

**Run load tests:**
```bash
# Local test
k6 run load-tests/auth-flow.js

# Against staging
k6 run -e BASE_URL=https://staging.careerpilot.com load-tests/auth-flow.js

# Heavy test (requires high CPU instance)
k6 run --vus 500 --duration 10m load-tests/auth-flow.js
```

**Create `load-tests/resume-upload.js`:**

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 10 },
    { duration: '3m', target: 20 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000'], // Uploads can be slower
  },
};

const BASE_URL = __ENV.BASE_URL || 'http://localhost:4000';
const TOKEN = __ENV.TOKEN; // Pre-generated auth token

export default function () {
  // Generate test PDF content
  const pdfContent = `%PDF-1.4 test resume content for ${__VU} iteration ${__ITER}`;

  const uploadRes = http.post(`${BASE_URL}/api/resume/upload`,
    http.file(pdfContent, 'resume.pdf', 'application/pdf'),
    {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }
  );

  check(uploadRes, {
    'upload accepted': (r) => r.status === 200,
    'processing started': (r) => r.json('resume.processingStage') === 'queued',
  });

  sleep(2);
}
```

### 7.2 — Security Penetration Testing

```bash
# Install OWASP ZAP CLI
npm install -g zap-cli

# Run automated scan against staging
zap-cli quick-scan --self-contained --start-options '-config api.disablekey=true' \
  https://staging.careerpilot.com

# Manual penetration test checklist:
```

**Security Test Checklist:**

| Test | Expected | Tool |
|------|----------|------|
| SQL/NoSQL injection in email field | Rejected with 400 | Manual |
| XSS in name field | Rejected or escaped | `curl -X POST -d '{"name":"<script>alert(1)</script>"}'` |
| Path traversal in resume download | Rejected | `curl /api/resume/../../../etc/passwd` |
| JWT token tampering | 401 | Modify token payload |
| Refresh token replay | 401 | Use same token twice |
| CSRF on payment init | 403 | Request without CSRF token |
| File upload: malformed PDF | Rejected with 400 | `echo "not a pdf" > test.pdf` |
| Rate limit bypass | 429 after limit | Send 100 requests/min |
| IDOR (access other user's resume) | 404 or 403 | Change userId in request |
| OAuth state parameter mismatch | Redirect with error | Modify state param |

### 7.3 — Disaster Recovery Plan

**Create `docs/ops/disaster-recovery.md`:**

```markdown
# Disaster Recovery Plan

## Recovery Point Objective (RPO): 1 hour
## Recovery Time Objective (RTO): 4 hours

## Failure Scenarios

### 1. Database Corruption / Data Loss
**Detection**: Health check alerts, error rate spike on queries
**Immediate**: `eb scale careerpilot-env 0` (stop traffic)
**Restore**:
  1. Identify latest valid snapshot
  2. Restore MongoDB Atlas snapshot to new cluster
  3. Update MONGO_URI in Parameter Store
  4. Deploy with new connection string
  5. Verify data integrity
**Prevention**: Daily automated snapshots, `mongodump` every 6 hours

### 2. Full Region Outage
**Detection**: CloudWatch alarm on ELB health
**Immediate**: 
  1. Activate cross-region replica in us-west-2
  2. Update Route53 DNS to failover
**Restore**: 
  1. Deploy EB environment in us-west-2
  2. Point to cross-region MongoDB Atlas replica
  3. Verify all services
**Prevention**: Multi-region deployment (Phase 8)

### 3. Security Breach
**Detection**: Sentry alert, unusual traffic pattern
**Immediate**:
  1. Lock environment: `eb scale careerpilot-env 0`
  2. Rotate ALL secrets
  3. Revoke all user sessions
  4. Enable WAF in block mode
**Investigation**:
  1. Review CloudTrail logs
  2. Review application logs for the affected period
  3. Identify scope of compromised data
**Notification**:
  1. Notify legal team
  2. Notify affected users within 72 hours (GDPR)
  3. File breach report with relevant authorities

### 4. Payment System Failure
**Detection**: PayStack webhook failures >5%
**Immediate**:
  1. Disable premium upgrade flow
  2. Display maintenance banner
  3. Set up manual payment processing
**Restore**:
  1. Identify payment records in "pending" state
  2. Process manually or via PayStack dashboard
  3. Re-enable upgrade flow after fix
**Prevention**: Idempotency keys, webhook retry with dead letter queue
```

### 7.4 — Production Runbook

**Create `docs/ops/runbook.md`:**

```markdown
# Production Runbook

## Access

| Resource | Access Method | Who |
|----------|--------------|-----|
| AWS Console | SSO via IAM Identity Center | Engineering team |
| MongoDB Atlas | IP whitelist + credentials | SRE team only |
| Sentry | Sentry dashboard | Engineering team |
| CloudWatch | AWS Console | SRE team |
| PayStack Dashboard | PayStack login | Finance + Admin |
| GitHub | org-based access | Engineering team |

## Deployment

### Normal Deployment
1. PR merged to `main`
2. CI runs: lint → test → security → build
3. Auto-deploy to staging
4. E2E tests run against staging
5. If green for 5 minutes → auto-approve production
6. Production deploy with rolling update
7. Monitor error rate and latency for 10 minutes

### Rollback
```bash
# Rollback Elastic Beanstalk to previous version
eb deploy careerpilot-env --version <previous-version-label>
```

## Monitoring

### Key Metrics and Alarms

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| p95 response time | >500ms | >2s | Investigate DB/cache |
| Error rate | >1% | >5% | Rollback or scale |
| CPU utilization | >70% | >90% | Scale up/out |
| Memory utilization | >80% | >95% | Scale up |
| MongoDB connections | >80% of pool | >95% | Increase pool |
| 5xx error count | >10/min | >50/min | Alert SRE |
| Payment failure rate | >2% | >5% | Alert finance team |

### On-Call Rotation
- Primary: SRE engineer (PagerDuty)
- Secondary: Backend lead
- Escalation: Engineering manager

## Common Procedures

### Restart Application
```bash
eb deploy careerpilot-env
```

### Scale Up
```bash
eb scale careerpilot-env 10
```

### View Logs
```bash
# Stream recent logs
eb logs careerpilot-env

# CloudWatch
aws logs tail /careerpilot/api --follow
```

### Database Backup
```bash
# Manual backup
mongodump --uri="$MONGO_URI" --gzip --archive=backup-$(date +%Y%m%d).gz

# Restore
mongorestore --gzip --archive=backup-20250101.gz
```

### Rotate Secrets
Follow Phase 0 procedure. Update Parameter Store entries, then redeploy.
```

### 7.5 — Final Production Checklist

| # | Item | Status | Verified By |
|---|------|--------|-------------|
| 1 | All secrets rotated and in Secrets Manager / Parameter Store | ✅ | `src/config/secrets.js` loads from SSM |
| 2 | .env not in Git history (BFG cleanup complete) | ✅ | Phase 0 complete |
| 3 | Helmet, compression, CSRF, mongo-sanitize enabled | ✅ | `src/middleware/security.js` + `app.js:34` |
| 4 | JWT access/refresh tokens use different secrets | ✅ | Separate env vars |
| 5 | Refresh token rotation implemented | ✅ | `authController.js` |
| 6 | OAuth tokens not in URLs | ✅ | Server-side flow only |
| 7 | HTTPS enforced (HTTP→HTTPS redirect) | ⏳ | Requires AWS ALB + ACM cert (infra) |
| 8 | HSTS header configured | ✅ | Via Helmet in `security.js` |
| 9 | Content Security Policy configured | ✅ | Via Helmet in `security.js` |
| 10 | WAF deployed with rate limiting | ⏳ | `infrastructure/waf.yaml` exists, needs deploy |
| 11 | Rate limiting on all endpoints (distributed via Redis) | ✅ | `src/middleware/rateLimiters.js` (7 configs) |
| 12 | Input validation on all user-facing routes | ✅ | `src/middleware/validators.js` |
| 13 | File uploads validated by MIME, magic bytes, and stored in S3 | ✅ | `src/services/fileValidator.js` + `fileStorage.js` |
| 14 | NoSQL injection prevention active | ✅ | `express-mongo-sanitize` in `security.js` |
| 15 | Payment webhook HMAC verification working | ✅ | `paymentRoutes.js:58` |
| 16 | Idempotency keys for payment endpoints | ✅ | `src/middleware/idempotency.js` |
| 17 | Graceful shutdown implemented | ✅ | `server.js:23-41` |
| 18 | Health check covers MongoDB, Redis, disk | ✅ | `src/routes/healthRoutes.js` |
| 19 | Load test passed (100 concurrent users, p95 <500ms) | 🆕 | `load-tests/auth-flow.js` created, ready to run |
| 20 | Penetration test completed with no critical findings | 🆕 | `docs/ops/security-test-results.md` template created |
| 21 | E2E tests pass against staging | ⏳ | `test:e2e` script placeholder added, requires Playwright/Cypress setup |
| 22 | Unit/Integration test coverage >50% | ✅ | Jest config enforces 50% threshold |
| 23 | CI/CD pipeline green | 🆕 | `.github/workflows/ci.yml` fixed — eslint/prettier configs added |
| 24 | Staging environment deployed and verified | ⏳ | Requires AWS EB environment provisioning |
| 25 | Production deployment pipeline configured | 🆕 | `.github/workflows/ci.yml` + `deploy.yml` exist |
| 26 | Blue-green or rolling deployment configured | ⏳ | EB rolling update configured in `.ebextensions/environment.config` |
| 27 | Database backups automated | ⏳ | Procedure documented in `docs/ops/runbook.md`, requires cron/Lambda |
| 28 | Monitoring dashboards configured (CloudWatch) | ⏳ | Requires AWS CloudWatch setup |
| 29 | Error tracking (Sentry) configured | ✅ | `src/config/sentry.js` |
| 30 | Metrics (Prometheus) endpoint active | ✅ | `src/config/metrics.js` → `GET /api/metrics` |
| 31 | Runbook documented | 🆕 | `docs/ops/runbook.md` created |
| 32 | Disaster recovery plan documented | 🆕 | `docs/ops/disaster-recovery.md` created |
| 33 | On-call rotation established | 🆕 | Documented in `docs/ops/runbook.md` |
| 34 | PagerDuty/OpsGenie alerts configured | ⏳ | Documented in runbook, requires PagerDuty setup |
| 35 | GDPR/CCPA compliance (data deletion, export APIs) | ⏩ | Deferred per scope decision |
| 36 | Terms of Service and Privacy Policy linked | ⏩ | Deferred per scope decision |
| 37 | `test-api.html` and debug endpoints removed | ✅ | Removed (`public/test-api.html` deleted) |

### 7.6 — Business Logic Hardening

| Vulnerability | Fix | File |
|--------------|-----|------|
| Resume upload deletes old file before verifying new one | Fix order: save new → verify → delete old | `resumeController.js` |
| Payment race condition (webhook + callback) | Use MongoDB transactions or idempotency key | `paymentRoutes.js` |
| OAuth account linking (email takeover) | Verify OAuth email is verified before linking | `passport.js` |
| No audit trail for sensitive operations | Add Audit model: `{ userId, action, resource, details, ip }` | New file |
| User data deletion leaves orphan records | Add cascade delete middleware | New middleware |
| Chatbot unlimited message history | Add conversation message limit (max 500 messages) | `chatbotController.js` |

### 7.7 — Final Load and Stress Test

```bash
# Run comprehensive load test
k6 run load-tests/full-scenario.js --vus 200 --duration 30m

# Expected results:
# - Auth endpoints: p95 <300ms, error rate <1%
# - Recommendation endpoints: p95 <500ms, error rate <1% (cache hit)
# - Resume upload: p95 <2000ms, error rate <2%
# - Payment init: p95 <1000ms, error rate <1%

# Memory test: simulate 50 concurrent PDF generations
k6 run load-tests/pdf-generation.js --vus 50 --duration 5m
# Expected: memory <500MB, no OOM
```

---

## Definition of Done

- [ ] Load tests pass all thresholds
- [ ] Security penetration test has no critical findings
- [ ] Disaster recovery plan documented and tested
- [ ] Runbook accessible to on-call team
- [ ] All 37 production checklist items verified
- [ ] Business logic vulnerabilities fixed
- [ ] Final stress test passed
- [ ] Go/no-go meeting held with team sign-off

---

## Go / No-Go Decision

```markdown
# Production Launch Decision

Date: _______________

## Pre-flight Checks (all must pass)
- [ ] Load test: PASS / FAIL — Scripts ready in `load-tests/`, run against staging
- [ ] Security scan: PASS / FAIL — Template in `docs/ops/security-test-results.md`
- [ ] E2E tests: PASS / FAIL — Placeholder script, requires Playwright/Cypress setup
- [ ] Staging environment: HEALTHY — AWS EB env not yet provisioned
- [ ] Monitoring: CONFIGURED — Sentry ✅, Prometheus ✅, CloudWatch ❌ (needs AWS)
- [ ] Runbook: DOCUMENTED ✅ — `docs/ops/runbook.md`

## Required Infrastructure (AWS EB)
Before production launch, provision:
1. Elastic Beanstalk staging + production environments
2. ACM SSL certificate + Route53 DNS
3. WAF deployment from `infrastructure/waf.yaml`
4. CloudWatch dashboards + alarms
5. MongoDB Atlas backup automation
6. PagerDuty on-call rotation

## Decision
☐ **GO** — Deploy to production
☐ **NO-GO** — Reason: ________________________

## Signatures
- Engineering Lead: _________________
- DevOps Lead: _________________
- Product Manager: _________________
- QA Lead: _________________
- CTO / VP Engineering: _________________
```
