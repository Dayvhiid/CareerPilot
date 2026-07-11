const promClient = require('prom-client');

const collectDefaultMetrics = promClient.collectDefaultMetrics;
collectDefaultMetrics({ timeout: 5000 });

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
