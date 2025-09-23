const express = require('express');
const cors = require('cors');
const path = require('path');
const passport = require('./config/passport');
const session = require('express-session');
const authRoutes = require('./routes/authRoutes');
const oauthRoutes = require('./routes/oauthRoutes');
const resumeRoutes = require('./routes/resumeRoutes'); // Add this
const jobRoutes = require('./routes/jobRoutes');

const app = express();

// CORS middleware - Allow requests from frontend
app.use(cors({
  origin: ['http://localhost:5500', 'http://127.0.0.1:5500', 'http://localhost:3000', 'http://localhost:4000'], 
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Serve static files
app.use('/public', express.static(path.join(__dirname, '../public')));

// Sessions (needed for OAuth)
app.use(session({
  secret: process.env.SESSION_SECRET || "supersecret",
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

// Serve login page at root for testing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/auth/login.html'));
});

module.exports = app;