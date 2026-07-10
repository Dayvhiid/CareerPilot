# Phase 6 — Observability

> **Duration**: 3–5 days
> **Priority**: 🟡 HIGH
> **Depends on**: Phase 1–2 complete

---

## Objective

Implement structured logging, metrics, distributed tracing, error tracking, and dashboards so the team can understand system behavior in production.

---

## Tasks

### 6.1 — Upgrade Winston to Structured JSON Logging

**`src/config/logger.js` — Rewrite:**

```javascript
const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Custom format for structured JSON logging
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'ISO' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    // Ensure standard fields
    info.environment = process.env.NODE_ENV || 'development';
    info.service = 'careerpilot-api';
    return info;
  })(),
  winston.format.json()
);

// Human-readable for development
const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...rest }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(rest).length > 0
      ? ` ${JSON.stringify(rest, null, 0).substring(0, 500)}`
      : '';
    return `${timestamp}${rid} ${level}: ${message}${extra}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels,
  format: process.env.NODE_ENV === 'production' ? jsonFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB
      maxFiles: 10,
      format: jsonFormat,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 20,
      format: jsonFormat,
    }),
  ],
  // Don't exit on uncaught exceptions — let the process handle them
  exitOnError: false,
});

// Stream for Morgan HTTP request logging
logger.stream = {
  write: (message) => logger.http(message.trim()),
};

module.exports = logger;
```

### 6.2 — Add Morgan for HTTP Request Logging

```bash
npm install morgan
```

**In `src/app.js`:**
```javascript
const morgan = require('morgan');
const logger = require('./config/logger');

// Log HTTP requests
app.use(morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream: { write: (message) => logger.http(message.trim()) } }
));
```

### 6.3 — Add Request Context Logger

**Create `src/middleware/requestLogger.js`:**

```javascript
const logger = require('../config/logger');

module.exports = (req, res, next) => {
  const start = Date.now();
  const requestId = req.requestId;

  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?._id,
  });

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 400 ? 'warn' : res.statusCode >= 500 ? 'error' : 'info';
    logger[logLevel]('Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?._id,
    });
  });

  next();
};
```

### 6.4 — Add OpenTelemetry Tracing (Optional)

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node \
  @opentelemetry/auto-instrumentations-node
```

**Create `src/tracing.js`:**

```javascript
const { NodeSDK } = require('@opentelemetry/sdk-node');
const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node');
const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http');

const sdk = new NodeSDK({
  traceExporter: new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start()
  .then(() => console.log('OpenTelemetry tracing initialized'))
  .catch(err => console.error('OpenTelemetry init failed:', err));

process.on('SIGTERM', () => {
  sdk.shutdown()
    .then(() => console.log('OpenTelemetry shut down'))
    .catch(err => console.error('OpenTelemetry shutdown error:', err));
});
```

### 6.5 — Add Error Tracking (Sentry)

```bash
npm install @sentry/node
```

**Create `src/config/sentry.js`:**

```javascript
const Sentry = require('@sentry/node');

function initializeSentry(app) {
  if (!process.env.SENTRY_DSN) {
    console.warn('[sentry] SENTRY_DSN not configured — skipping Sentry initialization');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version || '1.0.0',
    // Capture 100% of errors in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 1.0 : 0.1,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
    ],
  });

  // Request handler
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
}

function errorHandler() {
  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only send 5xx errors to Sentry
      return error.status >= 500 || !error.status;
    },
  });
}

module.exports = { initializeSentry, errorHandler, Sentry };
```

**In `src/app.js`:**
```javascript
const { initializeSentry } = require('./config/sentry');
initializeSentry(app);

// Before the existing error handler
const { errorHandler: sentryErrorHandler } = require('./config/sentry');
app.use(sentryErrorHandler());
```

### 6.6 — Add Metrics Endpoint (Prometheus)

```bash
npm install prom-client
```

**Create `src/config/metrics.js`:**

```javascript
const promClient = require('prom-client');

// Collect default metrics
const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.01, 0.05, 0.1, 0.2, 0.5, 1, 2, 5],
});

const httpRequestsTotal = new promClient.Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
});

const activeUsers = new promClient.Gauge({
  name: 'active_users',
  help: 'Number of active users (with valid JWT)',
});

const resumeProcessingDuration = new promClient.Histogram({
  name: 'resume_processing_duration_seconds',
  help: 'Resume processing duration in seconds',
  buckets: [1, 5, 10, 30, 60, 120],
});

const externalApiCalls = new promClient.Counter({
  name: 'external_api_calls_total',
  help: 'Total number of external API calls',
  labelNames: ['provider', 'endpoint', 'status'],
});

// Middleware to record metrics
function metricsMiddleware(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.originalUrl;
    httpRequestDuration.observe({ method: req.method, route, status_code: res.statusCode }, duration);
    httpRequestsTotal.inc({ method: req.method, route, status_code: res.statusCode });
  });
  next();
}

// Metrics endpoint
function metricsRouter(router) {
  router.get('/metrics', async (req, res) => {
    res.set('Content-Type', promClient.register.contentType);
    res.end(await promClient.register.metrics());
  });
  return router;
}

module.exports = {
  metricsMiddleware,
  metricsRouter,
  activeUsers,
  resumeProcessingDuration,
  externalApiCalls,
};
```

**In `src/app.js`:**
```javascript
// Add after other middleware
const { metricsMiddleware } = require('./config/metrics');
app.use(metricsMiddleware);

// Create metrics route
const metricsRoute = require('express').Router();
const { metricsRouter: addMetricsRoute } = require('./config/metrics');
app.use('/api', addMetricsRoute(metricsRoute));
```

### 6.7 — Add Health Dashboard Data

**`src/routes/healthRoutes.js` — Add version and dependency info:**

```javascript
router.get('/health/detailed', auth, async (req, res) => {
  const start = Date.now();

  const [mongoHealth, redisHealth, diskHealth] = await Promise.allSettled([
    checkMongoDB(),
    checkRedis(),
    checkDisk(),
  ]);

  return res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version,
    uptime: process.uptime(),
    responseTime: Date.now() - start,
    checks: {
      mongodb: extractResult(mongoHealth),
      redis: extractResult(redisHealth),
      disk: extractResult(diskHealth),
    },
    memory: {
      heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + 'MB',
      rss: Math.round(process.memoryUsage().rss / 1024 / 1024) + 'MB',
    },
  });
});
```

### 6.8 — CloudWatch Setup

**Create `src/config/cloudwatch.js`:**

```javascript
const { CloudWatchLogs } = require('@aws-sdk/client-cloudwatch-logs');
const Transport = require('winston-transport');

class CloudWatchTransport extends Transport {
  constructor(opts) {
    super(opts);
    this.logGroup = opts.logGroup || '/careerpilot/api';
    this.logStream = opts.logStream || `api-${new Date().toISOString().split('T')[0]}`;
    this.client = new CloudWatchLogs({ region: opts.region || 'us-east-1' });
    this.sequenceToken = null;
    this.logEvents = [];
    this.flushInterval = setInterval(() => this.flush(), 5000);
  }

  async log(info, callback) {
    setImmediate(() => this.emit('logged', info));

    this.logEvents.push({
      timestamp: new Date(info.timestamp).getTime(),
      message: JSON.stringify(info),
    });

    if (this.logEvents.length >= 25) {
      await this.flush();
    }

    callback();
  }

  async flush() {
    if (this.logEvents.length === 0) return;
    const events = this.logEvents.splice(0);
    try {
      const params = {
        logGroupName: this.logGroup,
        logStreamName: this.logStream,
        logEvents: events,
      };
      if (this.sequenceToken) params.sequenceToken = this.sequenceToken;
      const result = await this.client.putLogEvents(params);
      this.sequenceToken = result.nextSequenceToken;
    } catch (err) {
      console.error('CloudWatch flush error:', err);
      this.logEvents.unshift(...events);
    }
  }
}

// Add to winston logger transports
// new CloudWatchTransport({ level: 'info', region: process.env.AWS_REGION })
```

---

## Verification

```bash
# Test structured logging
curl http://localhost:4000/api/health
# Check logs/combined.log for JSON output

# Test metrics endpoint
curl http://localhost:4000/api/metrics

# Test Sentry integration (manual trigger)
curl -X POST http://localhost:4000/api/test-error

# Check CloudWatch logs (if configured)
aws logs describe-log-streams --log-group-name /careerpilot/api
```

---

## Definition of Done

- [ ] Winston configured for structured JSON logs in production
- [ ] Morgan HTTP request logging active
- [ ] Request context (requestId, userId) in all log entries
- [ ] Prometheus metrics endpoint `/api/metrics`
- [ ] Custom metrics: HTTP request duration, total requests, active users
- [ ] Sentry error tracking initialized
- [ ] Health endpoint returns detailed dependency status
- [ ] CloudWatch transport configured (optional but recommended)
- [ ] All existing `console.log`/`console.error` calls replaced with logger

---

## Next Phase

➡️ Proceed to [Phase 7 — Production Readiness](./07-production-readiness.md)
