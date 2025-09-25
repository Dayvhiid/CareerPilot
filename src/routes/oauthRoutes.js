const express = require('express');
const passport = require('passport');
const router = express.Router();

// Step 1: Kick off Google login
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

// Step 2: Callback after Google auth
router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: '/public/auth/login.html' }),
  (req, res) => {
    // Success -> redirect to resume page
    res.redirect('/public/resume/resume.html');
  }
);

// GitHub OAuth Routes
// Step 1: Kick off GitHub login
router.get('/github',
  passport.authenticate('github', { scope: ['user:email'] })
);

// Step 2: Callback after GitHub auth
router.get('/github/callback',
  passport.authenticate('github', { failureRedirect: '/public/auth/login.html' }),
  (req, res) => {
    // Success -> redirect to resume page
    res.redirect('/public/resume/resume.html');
  }
);

// Step 3: Logout
router.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ msg: 'Logout error' });
    res.redirect('/');
  });
});

module.exports = router;
