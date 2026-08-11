const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

// Initialize logger (replaces console.log/error/warn globally)
const { logger } = require('./config/logger');
const requestId = require('./middleware/requestId');
const passport = require('./config/passport');
const session = require('express-session');
const RedisSessionStore = require('./config/sessionStore');
const { setupSecurity } = require('./middleware/security');
const { initializeSentry } = require('./config/sentry');
const { metricsMiddleware, metricsRouter: addMetricsRoute } = require('./config/metrics');
const requestLogger = require('./middleware/requestLogger');
const { generalLimiter } = require('./middleware/rateLimiters');
const authRoutes = require('./routes/authRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const resumeRoutes = require('./routes/resumeRoutes');
const recommendationRoutes = require('./routes/recommendationRoutes');
const coverLetterRoutes = require('./routes/coverLetterRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');
const healthRoutes = require('./routes/healthRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const agentRoutes = require('./routes/agentRoutes');

const app = express();

// Sentry error tracking (must be first)
initializeSentry(app);

// Security middleware (helmet, compression, mongo-sanitize, hpp)
setupSecurity(app);

// CORS middleware - Allow requests from frontend
const allowedOrigins = (
  process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://localhost:4000'
)
  .split(',')
  .map((s) => s.trim());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  })
);

// Serve static files
app.use('/public', express.static(path.join(__dirname, '../public')));

// PayStack webhook needs raw body for signature verification (must be before express.json)
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), paymentRoutes.webhookHandler);

// HTTP request logging (morgan)
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: { write: (message) => logger.http(message.trim()) },
  })
);

// Metrics collection
app.use(metricsMiddleware);

// Request context logger
app.use(requestLogger);

// Body parsing
app.use(express.json());
app.use(cookieParser());
app.use(requestId);

// Global rate limit (per IP) for all API traffic
app.use('/api', generalLimiter);

// Sessions (needed for OAuth) — Redis-backed if available
const redisClient = require('./config/redis').getClient();
const sessionConfig = {
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000,
  },
  name: 'careerpilot.sid',
};
if (redisClient) {
  sessionConfig.store = new RedisSessionStore({ client: redisClient });
}
app.use(session(sessionConfig));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// CSRF protection relies on SameSite=strict on all auth cookies (accessToken,
// refreshToken, and the session cookie). Cross-site requests cannot carry
// these cookies, so state-changing cookie-authenticated endpoints are safe
// without a double-submit token. See docs/auth/authentication_audit.md (M1).

// Routes
const metricsRoute = require('express').Router();
app.use('/api', addMetricsRoute(metricsRoute));

app.use('/api/payments', paymentRoutes.router);
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/recommendations', recommendationRoutes);
app.use('/api/coverletter', coverLetterRoutes);
app.use('/api/chatbot', chatbotRoutes);
app.use('/api/health', healthRoutes);
app.use('/api/agents', agentRoutes);

// Serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve static files from root (for direct access to HTML files)
app.use(
  express.static(path.join(__dirname, '../public'), {
    setHeaders(res, filePath) {
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      }
    },
  })
);

// Sentry error handler (must be before the app error handler)
const { errorHandler: sentryErrorHandler } = require('./config/sentry');
app.use(sentryErrorHandler());

// Error handler must be registered after all routes
const errorHandler = require('./middleware/errorHandler');
app.use(errorHandler);

module.exports = app;
