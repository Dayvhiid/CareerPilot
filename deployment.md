# Deployment Guide

## Overview

CareerPilot is deployed on **AWS Elastic Beanstalk** with **MongoDB Atlas** for the database and **Redis Cloud** (or Upstash) for caching/queueing.

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| AWS CLI | Interact with AWS services |
| Elastic Beanstalk CLI (`eb`) | Manage EB environments |
| Node.js 20+ | Runtime |
| Git | Version control |

Install the EB CLI:
```bash
pip install awsebcli
```

---

## Environment Variables

Set these in the Elastic Beanstalk environment (under **Configuration > Software > Environment Properties**):

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `production` |
| `PORT` | `8080` (Elastic Beanstalk expects this) |
| `MONGO_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Random 64-char string |
| `SESSION_SECRET` | Random 32-char string |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| `REDIS_URL` | Upstash or Redis Cloud URL |
| `JSEARCH_API_KEY` | RapidAPI key for JSearch |
| `HUGGINGFACE_API_KEY` | Hugging Face API token |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID (optional) |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret (optional) |
| `GOOGLE_CALLBACK_URL` | `https://your-domain.com/api/oauth/google/callback` |
| `GITHUB_CLIENT_ID` | GitHub OAuth client ID (optional) |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth client secret (optional) |
| `GITHUB_CALLBACK_URL` | `https://your-domain.com/api/oauth/github/callback` |

---

## AWS Deployment

### 1. Create the Elastic Beanstalk application

```bash
eb init careerpilot --platform node.js-20 --region us-east-1
```

### 2. Create a production environment

```bash
eb create CareerPilot-prod --single --instance-type t3.small
```

### 3. Set environment variables

```bash
eb setenv \
  NODE_ENV=production \
  MONGO_URI=mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/careerpilot \
  JWT_SECRET=<random-64-chars> \
  SESSION_SECRET=<random-32-chars> \
  CORS_ORIGINS=https://yourdomain.com \
  REDIS_URL=redis://...
```

### 4. Deploy

```bash
eb deploy
```

---

## CI/CD (GitHub Actions)

The `.github/workflows/ci.yml` workflow:

1. **Tests** — runs `npm test` on every push/PR to `main`
2. **Lint** — runs ESLint (if configured)
3. **Deploy** — auto-deploys to Elastic Beanstalk when merged to `main`

### GitHub Secrets Required

| Secret | Description |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | IAM user access key |
| `AWS_SECRET_ACCESS_KEY` | IAM user secret key |

> **IAM permissions needed:** `AWSElasticBeanstalkFullAccess` (or a custom policy with EB deploy actions).

---

## Manual Deployment

```bash
# 1. Install production dependencies
npm ci --production

# 2. Create deployment zip
zip -r deploy.zip node_modules src server.js package.json .ebextensions

# 3. Upload to Elastic Beanstalk via AWS Console or CLI
aws s3 cp deploy.zip s3://elasticbeanstalk-us-east-1-<account-id>/deploy.zip
aws elasticbeanstalk create-application-version \
  --application-name careerpilot \
  --version-label v1.0.0 \
  --source-bundle S3Bucket="elasticbeanstalk-us-east-1-<account-id>",S3Key="deploy.zip"
aws elasticbeanstalk update-environment \
  --environment-name CareerPilot-prod \
  --version-label v1.0.0
```

---

## Database (MongoDB Atlas)

1. Create a free cluster at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Whitelist the Elastic Beanstalk security group's IP (or `0.0.0.0/0` for dev)
3. Create a database user and copy the connection string
4. Set `MONGO_URI` in EB environment properties

---

## Redis (Upstash)

1. Create a free Redis database at [Upstash](https://upstash.com/)
2. Copy the `UPSTASH_REDIS_REST_URL` (prepend `redis://` or use directly)
3. Set `REDIS_URL` in EB environment properties

---

## Logs & Monitoring

### Elastic Beanstalk logs
```bash
eb logs
```

### CloudWatch (if enabled)
Metrics for CPU, memory, request count, and 5xx errors are available in the AWS CloudWatch console.

---

## Domain & SSL

1. Register a domain in Route 53 (or use any registrar)
2. Request a certificate in **AWS Certificate Manager (ACM)** (us-east-1)
3. In the EB environment: **Configuration > Load Balancer > Listeners**:
   - Add HTTPS listener on port 443
   - Select the ACM certificate
4. Point a CNAME (e.g. `api.yourdomain.com`) to the EB environment URL

---

## Rollback

```bash
eb deploy --version <previous-version-label>
```

Or via AWS Console: **Elastic Beanstalk > Application versions** → select version → **Deploy**.

---

## Health Check

The app exposes `GET /api/health` which returns:
```json
{
  "success": true,
  "status": "healthy",
  "checks": {
    "uptime": 12345,
    "timestamp": "2025-01-01T00:00:00.000Z",
    "mongodb": { "status": "healthy", "state": "connected" }
  }
}
```

Elastic Beanstalk is configured to use this endpoint for health monitoring (see `.ebextensions/nodejs.config`).

---

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# With coverage
npm run test:coverage
```

Tests are located in the `tests/` directory:
- `tests/unit/` — unit tests for models, controllers, services
- `tests/integration/` — API integration tests
