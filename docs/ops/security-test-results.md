# Security Penetration Test Results

> **Target**: CareerPilot Application
> **Date**: _______________
> **Tester**: _______________
> **Tools**: OWASP ZAP, curl, manual testing

---

## Automated Scan

### OWASP ZAP

```bash
# Run automated scan against staging
zap-cli quick-scan --self-contained --start-options '-config api.disablekey=true' \
  https://staging.careerpilot.com
```

**Results**:
| Alert Type | Risk Level | Count | Notes |
|-----------|-----------|-------|-------|
| — | — | — | — |

---

## Manual Penetration Test Checklist

| # | Test | Expected | Actual | Pass/Fail | Notes |
|---|------|----------|--------|-----------|-------|
| 1 | NoSQL injection in email field | Rejected with 400 | | | |
| 2 | XSS in name field | Rejected or escaped | | | |
| 3 | Path traversal in resume download | Rejected | | | |
| 4 | JWT token tampering | 401 Unauthorized | | | |
| 5 | Refresh token replay | 401 after reuse | | | |
| 6 | CSRF on payment init | 403 Forbidden | | | |
| 7 | Malformed PDF upload | Rejected with 400 | | | |
| 8 | Rate limit bypass (100 req/min) | 429 after limit | | | |
| 9 | IDOR (access other user's resume) | 404 or 403 | | | |
| 10 | OAuth state parameter mismatch | Redirect with error | | | |

---

## Test Payloads

### SQL/NoSQL Injection
```bash
curl -X POST https://staging.careerpilot.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":{"$ne":""},"password":{"$ne":""}}'
```

### XSS
```bash
curl -X POST https://staging.careerpilot.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"<script>alert(1)</script>","email":"xss@test.com","password":"Test123!"}'
```

### Path Traversal
```bash
curl https://staging.careerpilot.com/api/resume/download/../../../etc/passwd
```

### JWT Tampering
```bash
# Modify payload in an existing JWT token
# Change "userId" to a different user's ID
curl -H "Authorization: Bearer <tampered-token>" \
  https://staging.careerpilot.com/api/resume
```

### Malformed File Upload
```bash
echo "not a pdf" > test.pdf
curl -X POST -F "resume=@test.pdf" \
  -H "Authorization: Bearer <valid-token>" \
  https://staging.careerpilot.com/api/resume/upload
```

---

## Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 0 | — |
| High | 0 | — |
| Medium | 0 | — |
| Low | 0 | — |
| Informational | 0 | — |

---

## Remediation Plan

| Finding | Severity | Fix | Owner | Due Date |
|---------|----------|-----|-------|----------|
| — | — | — | — | — |
