# Phase 2 — Infrastructure & DevOps

> **Duration**: 5–7 days
> **Priority**: 🔴 HIGH
> **Depends on**: Phase 1 complete (security baseline)

---

## Objective

Build a proper deployment pipeline with staging/production environments, secure AWS infrastructure, and automated quality gates.

---

## Tasks

### 2.1 — Create Staging Environment

**New AWS Elastic Beanstalk environment:**

```bash
# Create from CLI or AWS Console
eb create careerpilot-staging --cfg staging
eb create careerpilot-production --cfg production
```

**`.ebextensions/environment.config`:**

```yaml
option_settings:
  aws:elasticbeanstalk:application:environment:
    NODE_ENV: 'production'
    PORT: '8080'
    AWS_REGION: 'us-east-1'
    AWS_SSM_PATH: '/careerpilot/'

  aws:elasticbeanstalk:environment:
    EnvironmentType: 'LoadBalanced'
    LoadBalancerType: 'application'

  aws:autoscaling:launchconfiguration:
    InstanceType: 't3.small'
    IamInstanceProfile: 'aws-elasticbeanstalk-ec2-role'
    SecurityGroups: 'careerpilot-web-sg'

  aws:autoscaling:asg:
    MinSize: '2'
    MaxSize: '6'
    Availability Zones: 'us-east-1a, us-east-1b, us-east-1c'
```

### 2.2 — Fix CI/CD Pipeline

**`.github/workflows/ci.yml` — Complete rewrite:**

```yaml
name: CI/CD Pipeline

on:
  push:
    branches: [develop, main, production]
  pull_request:
    branches: [main, production]

env:
  NODE_VERSION: '20'

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npx eslint src/ --max-warnings=0
      - run: npx prettier --check src/

  test:
    name: Tests
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: actions/upload-artifact@v4
        with:
          name: coverage
          path: coverage/

  security:
    name: Security Scan
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - run: npm audit --audit-level=high
      - name: SAST Scan
        uses: github/codeql-action/init@v3
        with:
          languages: javascript
      - uses: github/codeql-action/analyze@v3
      - name: Secret scan
        uses: trufflesecurity/trufflehog@v3
        with:
          path: ./

  build:
    name: Build & Package
    needs: [lint, test, security]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main' || github.ref == 'refs/heads/production'
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci --production
      - run: |
          mkdir -p deploy
          cp -r node_modules/src src package.json server.js deploy/
          cp -r .ebextensions deploy/ 2>/dev/null || true
          cd deploy && zip -r ../deployment.zip .
      - uses: actions/upload-artifact@v4
        with:
          name: deployment-package
          path: deployment.zip

  deploy-staging:
    name: Deploy to Staging
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    environment: staging
    concurrency: staging
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: deployment-package
      - name: Deploy to Elastic Beanstalk
        uses: einaregilsson/beanstalk-deploy@v21
        with:
          aws_access_key: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws_secret_key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          application_name: careerpilot
          environment_name: Careerpilot-staging
          version_label: ${{ github.sha }}-staging-${{ github.run_id }}
          region: us-east-1
          deployment_package: deployment.zip
          use_existing_version_if_available: false
          wait_for_deployment: true
          wait_for_environment_recovery: 120

  test-e2e:
    name: E2E Tests
    needs: deploy-staging
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'npm'
      - run: npm ci
      - name: Run E2E tests against staging
        run: npm run test:e2e
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
          CI: true

  deploy-production:
    name: Deploy to Production
    needs: test-e2e
    if: github.ref == 'refs/heads/production'
    runs-on: ubuntu-latest
    environment: production
    concurrency: production
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: deployment-package
      - name: Deploy to Elastic Beanstalk
        uses: einaregilsson/beanstalk-deploy@v21
        with:
          aws_access_key: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws_secret_key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          application_name: careerpilot
          environment_name: Careerpilot-env
          version_label: ${{ github.sha }}-prod-${{ github.run_id }}
          region: us-east-1
          deployment_package: deployment.zip
          use_existing_version_if_available: false
          wait_for_deployment: true
          wait_for_environment_recovery: 180
```

### 2.3 — AWS IAM Roles (Not Long-Lived Keys)

Use OIDC instead of static AWS keys:

```yaml
# In the deploy job, replace aws_access_key/aws_secret_key with:
permissions:
  id-token: write
  contents: read

# Then assume role
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: arn:aws:iam::${{ secrets.AWS_ACCOUNT_ID }}:role/GitHubActionsDeployRole
    aws-region: us-east-1
```

### 2.4 — Create VPC and Security Groups

**Terraform or CloudFormation template — `infrastructure/vpc.yaml`:**

```yaml
AWSTemplateFormatVersion: '2010-09-09'
Resources:
  CareerPilotVPC:
    Type: AWS::EC2::VPC
    Properties:
      CidrBlock: 10.0.0.0/16
      EnableDnsSupport: true
      EnableDnsHostnames: true
      Tags:
        - Key: Name
          Value: careerpilot-vpc

  WebSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Web tier security group
      VpcId: !Ref CareerPilotVPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 443
          ToPort: 443
          CidrIp: 0.0.0.0/0
        - IpProtocol: tcp
          FromPort: 80
          ToPort: 80
          CidrIp: 0.0.0.0/0
      SecurityGroupEgress:
        - IpProtocol: -1
          CidrIp: 0.0.0.0/0

  DatabaseSecurityGroup:
    Type: AWS::EC2::SecurityGroup
    Properties:
      GroupDescription: Database access from web tier only
      VpcId: !Ref CareerPilotVPC
      SecurityGroupIngress:
        - IpProtocol: tcp
          FromPort: 27017
          ToPort: 27017
          SourceSecurityGroupId: !Ref WebSecurityGroup
```

### 2.5 — S3 for File Uploads

**Move from local `uploads/` to S3:**

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

**Create `src/services/fileStorage.js`:**

```javascript
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { v4: uuidv4 } = require('uuid');

const s3 = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
const BUCKET = process.env.S3_BUCKET || 'careerpilot-uploads';

async function uploadFile(file, userId) {
  const key = `uploads/${userId}/${uuidv4()}-${Date.now()}`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: file.buffer,
    ContentType: file.mimetype
  }));
  return key;
}

async function getSignedDownloadUrl(key, expiresIn = 3600) {
  const command = new GetObjectCommand({ Bucket: BUCKET, Key: key });
  return getSignedUrl(s3, command, { expiresIn });
}

async function deleteFile(key) {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}

module.exports = { uploadFile, getSignedDownloadUrl, deleteFile };
```

### 2.6 — Configure AWS WAF

**`infrastructure/waf.yaml`:**

```yaml
Resources:
  WebACL:
    Type: AWS::WAFv2::WebACL
    Properties:
      Name: careerpilot-waf
      Scope: REGIONAL
      DefaultAction:
        Allow: {}
      Rules:
        - Name: AWS-AWSManagedRulesCommonRuleSet
          Priority: 1
          OverrideAction:
            Count: {}
          Statement:
            ManagedRuleGroupStatement:
              VendorName: AWS
              Name: AWSManagedRulesCommonRuleSet
          VisibilityConfig:
            CloudWatchMetricsEnabled: true
            MetricName: AWSManagedRulesCommonRuleSetMetric
            SampledRequestsEnabled: true

        - Name: RateLimit
          Priority: 2
          Action:
            Block: {}
          Statement:
            RateBasedStatement:
              Limit: 2000
              AggregateKeyType: IP
          VisibilityConfig:
            CloudWatchMetricsEnabled: true
            MetricName: RateLimitMetric
```

### 2.7 — Set Up AWS Secrets Manager

```bash
aws secretsmanager create-secret --name /careerpilot/production/jwt-access-secret --secret-string "..."

# Load in .ebextensions
```

### 2.8 — Add Health Check with Dependencies

**`src/routes/healthRoutes.js` — Enhanced:**

```javascript
const mongoose = require('mongoose');
const redis = require('../config/redis').getClient();

router.get('/', async (req, res) => {
  const checks = {
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    memory: process.memoryUsage(),
    cpu: process.cpuUsage(),
    mongodb: { status: 'unknown' },
    redis: { status: 'unknown' },
    disk: { status: 'unknown' }
  };

  try {
    const dbState = mongoose.connection.readyState;
    checks.mongodb = {
      status: dbState === 1 ? 'healthy' : 'degraded',
      state: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState]
    };
  } catch (err) {
    checks.mongodb = { status: 'unhealthy', error: err.message };
  }

  if (redis && redis.status === 'ready') {
    try {
      await redis.ping();
      checks.redis = { status: 'healthy' };
    } catch {
      checks.redis = { status: 'unhealthy' };
    }
  } else {
    checks.redis = { status: 'disconnected', note: 'Redis not configured' };
  }

  // Basic disk check
  try {
    const { statfs } = require('fs');
    // Simple check — does uploads dir exist
    require('fs').accessSync('uploads');
    checks.disk = { status: 'healthy' };
  } catch {
    checks.disk = { status: 'degraded' };
  }

  const isHealthy = checks.mongodb.status === 'healthy';
  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    version: process.env.npm_package_version || '1.0.0',
    checks
  });
});
```

### 2.9 — Add Graceful Shutdown

**`server.js` — Complete rewrite:**

```javascript
const dotenv = require('dotenv');
dotenv.config();

const connectDB = require('./src/config/db');
const redis = require('./src/config/redis');
const app = require('./src/app');

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await connectDB();
    await redis.connect?.();

    const server = app.listen(PORT, () => {
      console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n${signal} received. Starting graceful shutdown...`);
      server.close(async () => {
        console.log('HTTP server closed');
        await mongoose.connection.close();
        console.log('MongoDB disconnected');
        await redis.quit?.();
        console.log('Redis disconnected');
        process.exit(0);
      });

      // Force shutdown after 30s
      setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    return server;
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
```

---

## Verification

```bash
# Test deployment locally
npm ci --production
zip -r deploy.zip node_modules src package.json server.js .ebextensions

# Verify health endpoint includes all checks
curl http://localhost:4000/api/health | jq .

# Test graceful shutdown
kill -TERM $(lsof -ti:4000)
```

---

## Definition of Done

- [ ] Staging environment created and deployed
- [ ] CI pipeline runs lint → test → security → build → deploy
- [ ] Security scans (npm audit, CodeQL, trufflehog) in pipeline
- [ ] E2E tests run against staging before production deploy
- [ ] OIDC role assumption instead of long-lived keys
- [ ] VPC with security groups for web and database tiers
- [ ] S3 for file storage (uploads migrated)
- [ ] WAF with rate limiting and managed rule sets
- [ ] Production secrets in AWS Secrets Manager/Parameter Store
- [ ] Health check covers MongoDB, Redis, disk
- [ ] Graceful shutdown handles SIGTERM/SIGINT
- [ ] Staging URL verified working
- [ ] Deployment to production succeeds

---

## Next Phase

➡️ Proceed to [Phase 3 — Backend Refactoring](./03-backend-refactoring.md)
