const express = require('express');
const passport = require('passport');
const jwt = require('jsonwebtoken');
const router = express.Router();

function getOAuthAccessToken(userId) {
  return jwt.sign({ id: userId, type: 'access' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m',
  });
}

function getOAuthRefreshToken(userId) {
  return jwt.sign({ id: userId, type: 'refresh' }, process.env.JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

function ensureOAuthEnabled(provider) {
  return (req, res, next) => {
    if (passport.oauthProviders?.[provider]) {
      return next();
    }
    return res.status(503).json({
      msg: `${provider} OAuth is not configured on this server.`,
    });
  };
}

// Step 1: Kick off Google login
router.get('/google', ensureOAuthEnabled('google'), passport.authenticate('google', { scope: ['profile', 'email'] }));

// Step 2: Callback after Google auth — set tokens in httpOnly cookies, not URL
router.get(
  '/google/callback',
  ensureOAuthEnabled('google'),
  passport.authenticate('google', { failureRedirect: '/public/auth/login.html', session: false }),
  (req, res) => {
    const token = getOAuthAccessToken(req.user._id);
    const refreshToken = getOAuthRefreshToken(req.user._id);

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect('/public/resume/resume.html');
  }
);

// Step 1: Kick off GitHub login
router.get('/github', ensureOAuthEnabled('github'), passport.authenticate('github', { scope: ['user:email'] }));

// Step 2: Callback after GitHub auth — set tokens in httpOnly cookies, not URL
router.get(
  '/github/callback',
  ensureOAuthEnabled('github'),
  passport.authenticate('github', { failureRedirect: '/public/auth/login.html', session: false }),
  (req, res) => {
    const token = getOAuthAccessToken(req.user._id);
    const refreshToken = getOAuthRefreshToken(req.user._id);

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.redirect('/public/resume/resume.html');
  }
);

// Step 3: Logout
router.get('/logout', (req, res) => {
  req.logout((err) => {
    if (err) return res.status(500).json({ success: false, message: 'Logout error' });
    res.clearCookie('accessToken');
    res.clearCookie('refreshToken');
    res.redirect('/');
  });
});

module.exports = router;
