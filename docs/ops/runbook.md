# Production Runbook

## Access

| Resource | Access Method | Who |
|----------|--------------|-----|
| AWS Console | SSO via IAM Identity Center | Engineering team |
| AWS Elastic Beanstalk | AWS Console / EB CLI | Engineering team |
| MongoDB Atlas | IP whitelist + database credentials | SRE team only |
| Redis (ElastiCache) | AWS Console | SRE team |
| Sentry | Sentry dashboard | Engineering team |
| CloudWatch | AWS Console | Engineering team |
| PayStack Dashboard | PayStack login | Finance + Admin |
| GitHub | org-based access | Engineering team |
| SSM Parameter Store | AWS Console / AWS CLI | SRE team |

---

## Deployment

### Normal Deployment
1. Developer creates PR targeting `main`
2. GitHub Actions CI runs: lint → test → security scan
3. PR merged to `main`
4. CI pipeline builds and packages deployment artifact
5. Manual approval for production deploy (via GitHub Environments)
6. Production deployment via Elastic Beanstalk with rolling update
7. Monitor error rate and latency for 10 minutes post-deploy

### Rollback
```bash
# List available versions
eb list careerpilot-env --versions

# Rollback to specific version
eb deploy careerpilot-env --version <previous-version-label>

# Quick rollback to last good version
eb deploy careerpilot-env --version $(aws elasticbeanstalk describe-application-versions \
  --application-name careerpilot --query 'ApplicationVersions[-2].VersionLabel' --output text)
```

### Manual Deployment
```bash
# Build deployment package
npm ci --production
mkdir -p deploy
cp -r node_modules src package.json server.js deploy/
cp -r .ebextensions deploy/ 2>/dev/null || true
cd deploy && zip -r ../deployment.zip .
cd ..

# Deploy to staging
eb deploy Careerpilot-staging --label v1.2.3-staging

# Deploy to production
eb deploy careerpilot-env --label v1.2.3
```

---

## Monitoring

### Key Metrics and Alarms

| Metric | Warning | Critical | Action |
|--------|---------|----------|--------|
| p95 response time | >500ms | >2s | Investigate DB queries, cache hit ratio |
| Error rate (5xx) | >1% | >5% | Rollback or scale out |
| CPU utilization | >70% | >90% | Scale up/out |
| Memory utilization | >80% | >95% | Scale up instance size |
| MongoDB connections | >80% of pool (40) | >95% (47) | Increase pool size |
| MongoDB query time | >100ms p95 | >500ms p95 | Add missing indexes |
| Redis cache hit rate | <80% | <50% | Review caching strategy |
| Payment failure rate | >2% | >5% | Alert finance + engineering |
| Elastic Beanstalk health | Degraded | Severe | Restart or rollback |
| WAF blocked requests | >100/min | >500/min | Investigate attack pattern |

### Dashboards
- **CloudWatch Dashboard**: `CareerPilot-Production` — overview of all key metrics
- **Sentry Dashboard**: Error trends by route, user impact, release health
- **MongoDB Atlas**: Real-time performance insights, slow queries, index usage

### Logging
```bash
# Stream EB logs
eb logs careerpilot-enl

# CloudWatch Logs (real-time tail)
aws logs tail /careerpilot/api --follow

# Search for errors in last hour
aws logs filter-log-events --log-group-name /careerpilot/api \
  --filter-pattern 'ERROR' --start-time $(date -d '1 hour ago' +%s)000

# Export logs for analysis
aws logs export-task --log-group-name /careerpilot/api \
  --from $(date -d '24 hours ago' +%s) --to $(date +%s) \
  --destination s3://careerpilot-logs-export
```

---

## On-Call Rotation

| Role | Primary | Secondary | Escalation |
|------|---------|-----------|------------|
| SRE Engineer | Week A | Week B | Engineering Manager |
| Backend Engineer | Week B | Week A | Engineering Manager |

- **Handoff**: Every Monday at 10:00 AM EST
- **Response SLA**: 15 minutes for critical alerts, 1 hour for warning alerts
- **PagerDuty schedule**: `careerpilot-oncall`

---

## Common Procedures

### Restart Application
```bash
# Restart all instances (rolling)
eb deploy careerpilot-env --version $(aws elasticbeanstalk describe-application-versions \
  --application-name careerpilot --query 'ApplicationVersions[-1].VersionLabel' --output text)

# Restart single instance
eb ssh careerpilot-env # then: pm2 restart all
```

### Scale Up/Down
```bash
# Scale to specific instance count
eb scale careerpilot-env 10

# Modify auto-scaling limits (via .ebextensions)
# MinSize: 2, MaxSize: 6
```

### Database Operations
```bash
# Check connection count
mongosh "$MONGO_URI" --eval "db.serverStatus().connections"

# List slow queries
mongosh "$MONGO_URI" --eval "db.currentOp({ 'secs_running': { '$gte': 5 } })"

# Kill slow query
mongosh "$MONGO_URI" --eval "db.killOp(<opid>)"

# Check index usage
mongosh "$MONGO_URI" --eval "db.<collection>.aggregate([{ \$indexStats: {} }])"
```

### Clear Redis Cache
```bash
# Flush all caches (caution: will clear sessions)
redis-cli -h <redis-endpoint> FLUSHALL

# Clear only application cache (SCAN-based deletion)
# Trigger via: curl -X POST https://api.careerpilot.com/api/admin/cache/clear \
#   -H "Authorization: Bearer <admin-token>"
```

### Rotate Secrets
1. Generate new secret values (use `openssl rand -hex 64` for JWT secrets)
2. Update values in AWS SSM Parameter Store:
   ```bash
   aws ssm put-parameter --name /careerpilot/production/JWT_ACCESS_SECRET \
     --value "<new-secret>" --type SecureString --overwrite
   ```
3. Redeploy application: `eb deploy careerpilot-env`
4. Verify health check passes: `curl https://api.careerpilot.com/api/health`
5. Revoke old sessions by incrementing `tokenVersion` on all users (if JWT secret changed)
6. Document rotation in the change log

### View Health Status
```bash
# Basic health check
curl https://api.careerpilot.com/api/health

# Detailed health with all dependencies
curl https://api.careerpilot.com/api/health/detailed

# Prometheus metrics
curl https://api.careerpilot.com/api/metrics
```

---

## Incident Response Flow

1. **Detection**: Alert from PagerDuty, CloudWatch alarm, or user report
2. **Acknowledge**: Acknowledge alert in PagerDuty within 15 minutes
3. **Assess**: Determine severity (Critical / Major / Minor)
4. **Respond**: Execute the relevant procedure from this runbook
5. **Communicate**: Post status update in #incidents Slack channel every 30 minutes
6. **Resolve**: Confirm fix, verify health checks, close incident
7. **Review**: Schedule post-incident review within 5 business days

---

## Environment Information

| Property | Value |
|----------|-------|
| Application Name | `careerpilot` |
| Production Environment | `Careerpilot-env` |
| Staging Environment | `Careerpilot-staging` |
| Region | `us-east-1` |
| Instance Type | `t3.small` |
| Min/Max Instances | 2 / 6 |
| Platform | Node.js 20 |
| Deployment Type | Rolling |
| Health Check Path | `/api/health` |
