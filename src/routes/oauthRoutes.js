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

// Step 3: Logout
router.get('/logout', (req, res) => {
  req.logout(err => {
    if (err) return res.status(500).json({ msg: 'Logout error' });
    res.redirect('/');
  });
});

module.exports = router;
