# Disaster Recovery Plan

## Recovery Objectives

| Metric | Target |
|--------|--------|
| Recovery Point Objective (RPO) | 1 hour |
| Recovery Time Objective (RTO) | 4 hours |

---

## Failure Scenarios

### 1. Database Corruption / Data Loss

**Detection**: Health check alerts (MongoDB unhealthy), error rate spike on query-heavy endpoints, Sentry error surge.

**Immediate**:
1. Scale environment to zero: `eb scale careerpilot-env 0`
2. Verify scope of corruption from application logs (via CloudWatch)
3. Notify engineering team via PagerDuty

**Restore**:
1. Identify the latest valid MongoDB Atlas snapshot
2. Restore snapshot to a new MongoDB Atlas cluster
3. Update `MONGO_URI` in AWS SSM Parameter Store (`/careerpilot/production/MONGO_URI`)
4. Redeploy: `eb deploy careerpilot-env`
5. Verify data integrity via health endpoint: `GET /api/health/detailed`
6. If corruption is partial, restore from the most recent `mongodump` backup instead

**Prevention**:
- Daily automated MongoDB Atlas snapshots (retention: 7 days)
- `mongodump` every 6 hours to S3 (via cron job or Lambda)
- Read preference `secondary` for non-critical reads to reduce primary load
- Validation on all write operations at the application layer

---

### 2. Full Region Outage

**Detection**: CloudWatch alarm on ELB health, all instances unreachable, inability to reach AWS Console for us-east-1.

**Immediate**:
1. Activate cross-region disaster recovery plan
2. Deploy Elastic Beanstalk environment in us-west-2
3. Point to cross-region MongoDB Atlas replica
4. Update Route53 DNS to failover to us-west-2

**Restore**:
1. Deploy EB environment in us-west-2 using the same deployment package
2. Configure environment with us-west-2 SSM Parameter Store values
3. Connect to MongoDB Atlas cross-region replica
4. Verify all services pass health checks
5. Update Route53 DNS record to point to the new environment
6. Monitor error rate and latency for 30 minutes

**Prevention**:
- Multi-region deployment strategy (planned for future phase)
- MongoDB Atlas global clusters for cross-region replication
- Deployment packages versioned and stored in S3 across regions
- Infrastructure-as-code (CloudFormation) enables rapid environment recreation

---

### 3. Security Breach

**Detection**:
- Sentry alert on unusual error patterns
- CloudWatch alarm on traffic anomalies
- WAF block rate spike
- Unauthorized access reported by users

**Immediate**:
1. Lock environment: `eb scale careerpilot-env 0`
2. Rotate ALL secrets in AWS SSM Parameter Store:
   - JWT access/refresh secrets
   - MongoDB credentials
   - Redis credentials
   - PayStack secret key
   - OAuth client secrets
3. Revoke all user sessions by incrementing `tokenVersion` in the User collection
4. Enable WAF in block mode with strict rules

**Investigation**:
1. Review CloudTrail logs for unusual API activity
2. Review application logs for the affected period (CloudWatch Logs)
3. Review Sentry error traces for suspicious patterns
4. Identify scope of compromised data
5. Check for unauthorized access to S3, database, or admin endpoints

**Notification**:
1. Notify legal team
2. Notify affected users within 72 hours (GDPR compliance)
3. File breach report with relevant authorities if required
4. Post-incident review within 5 business days

**Prevention**:
- WAF with AWS Managed Rules and rate limiting
- Secrets never stored in code or environment files (SSM Parameter Store only)
- Short-lived JWT access tokens (15 minutes)
- Input validation on all user-facing routes
- Rate limiting on auth endpoints (5 requests per 15 minutes)
- Magic byte + MIME validation on all file uploads

---

### 4. Payment System Failure

**Detection**:
- PayStack webhook failure rate >5%
- Payment initialization errors >2%
- Sentry alert on payment endpoint exceptions
- User reports of failed payments

**Immediate**:
1. Disable premium upgrade flow by setting `PAYMENTS_DISABLED=true` in SSM Parameter Store
2. Display maintenance banner on the upgrade page
3. Set up manual payment processing via PayStack dashboard invoices

**Restore**:
1. Identify payment records in "pending" state from the database
2. Verify each pending payment against PayStack dashboard
3. Process pending payments manually or via PayStack API
4. Fix the root cause (deploy fix through standard CI/CD pipeline)
5. Re-enable upgrade flow after fix is verified on staging

**Prevention**:
- Idempotency keys on all payment endpoints (24h TTL via Redis)
- Webhook retry with exponential backoff (Bull queue, 3 retries)
- Dead letter queue for failed webhooks
- Dual verification: webhook + callback reconciliation
- Payment event logging with full request/response context
- Monitoring alert on payment failure rate

---

### 5. Redis Cache / Queue Failure

**Detection**:
- Health check reports Redis unhealthy
- Bull queue jobs stuck in "waiting" or "failed" state
- Error rate increase on cached endpoints

**Immediate**:
1. Set `REDIS_ENABLED=false` in SSM Parameter Store
2. Redeploy: `eb deploy careerpilot-env` (app degrades gracefully without Redis)
3. Verify core functionality (auth, resume, payments) still works

**Restore**:
1. Restart Redis instance or provision a new one
2. Verify Redis connection from the application
3. Set `REDIS_ENABLED=true` and redeploy
4. Verify queue workers are processing jobs again

**Prevention**:
- Redis deployed with replication (primary + replica)
- Application-level graceful degradation when Redis is unavailable
- Queue job persistence with retry mechanism
- Redis health check as part of the application health endpoint

---

### 6. Application Performance Degradation

**Detection**:
- p95 response time exceeds 2 seconds
- CPU utilization >90% for 5+ minutes
- Error rate >5%
- Memory utilization >95%

**Immediate**:
1. Scale out: `eb scale careerpilot-env 10` (increase instance count)
2. If caused by recent deploy: `eb deploy careerpilot-env --version <previous-version>`
3. Enable WAF rate limiting if traffic surge is suspected

**Investigation**:
1. Check CloudWatch metrics for CPU, memory, and network
2. Review recent deployments for code changes
3. Check MongoDB Atlas performance insights
4. Review Redis cache hit ratio
5. Check for slow queries in MongoDB logs

**Restore**:
1. Scale back after issue is resolved
2. Implement fix and deploy through CI/CD pipeline
3. Update auto-scaling thresholds if needed

**Prevention**:
- Auto-scaling (2-6 instances based on CPU)
- Caching layer (Redis) for frequently accessed data
- Database indexing strategy
- Load testing before production deployments
- Gradual rollout via rolling deployments

---

## Backup Procedures

### Database
```bash
# Manual backup
mongodump --uri="$MONGO_URI" --gzip --archive=backup-$(date +%Y%m%d-%H%M%S).gz

# Restore from backup
mongorestore --gzip --archive=backup-20250701-120000.gz

# Automated backup (cron - every 6 hours)
0 */6 * * * mongodump --uri="$MONGO_URI" --gzip --archive=/backups/mongo-$(date +\%Y\%m\%d-\%H\%M\%S).gz && aws s3 cp /backups/ s3://careerpilot-backups/ --recursive
```

### Application Logs
```bash
# CloudWatch Logs retention: 30 days
aws logs describe-log-groups --log-group-name-prefix /careerpilot

# Export logs for analysis
aws logs export-task --log-group-name /careerpilot/api --from 24h ago --to now --destination s3://careerpilot-logs-export
```

---

## Disaster Recovery Test Schedule

| Scenario | Frequency | Last Test | Next Test |
|----------|-----------|-----------|-----------|
| Database restore from backup | Quarterly | — | — |
| Environment rebuild from CloudFormation | Quarterly | — | — |
| Secrets rotation drill | Quarterly | — | — |
| WAF rule testing | Bi-annually | — | — |
| Full DR scenario walkthrough | Annually | — | — |
