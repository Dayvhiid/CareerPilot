const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');
const session = require('express-session');
const redisService = require('./services/redisService');
const { validateEnv } = require('./config/validateEnv');
const authRoutes = require('./routes/authRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const resumeRoutes = require('./routes/resumeRoutes'); // Add this
const jobRoutes = require('./routes/jobRoutes');
const coverLetterRoutes = require('./routes/coverLetterRoutes');
const chatbotRoutes = require('./routes/chatbotRoutes');

// Validate environment variables on startup
validateEnv();

const app = express();

// Initialize Redis connection (non-blocking)
console.log('🔧 Initializing Redis connection if configured...');
redisService.connect().then(success => {
  if (success) {
    console.log('🎉 Redis connection established successfully');
  } else {
    console.warn('⚠️ Redis not configured or unavailable; server will continue without cache');
  }
}).catch(err => {
  console.error('❌ Redis connection error details:');
  console.error('   - Error message:', err.message);
  console.error('   - Error code:', err.code);
  console.error('   - Error stack:', err.stack);
  console.warn('⚠️ Server continuing without Redis cache');
});

// CORS middleware - Allow requests from frontend
// Allow origins via environment variable (comma-separated) for easy deployment. Defaults include common localhost dev origins
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5500,http://127.0.0.1:5500,http://localhost:3000,http://localhost:4000').split(',').map(s => s.trim());
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use('/public', express.static(path.join(__dirname, '../public')));

// Sessions (needed for OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || process.env.JWT_SECRET,
  resave: false,
  saveUninitialized: false,
}));

// Initialize Passport
app.use(passport.initialize());
app.use(passport.session());

// Body parsing
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/oauth', oauthRoutes);
app.use('/api/resume', resumeRoutes); // Add this
app.use('/api/jobs', jobRoutes);
app.use('/api/coverletter', coverLetterRoutes);
app.use('/api/chatbot', chatbotRoutes);

// Serve landing page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Serve static files from root (for direct access to HTML files)
app.use(express.static(path.join(__dirname, '../public')));

module.exports = app;