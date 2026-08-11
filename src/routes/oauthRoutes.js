const express = require('express');
const passport = require('passport');
const router = express.Router();
const tokenService = require('../services/tokenService');
const { logAudit } = require('../middleware/auditLogger');

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

function oauthCallback(provider) {
  return async (req, res) => {
    if (!req.user) {
      return res.redirect('/public/auth/login.html?oauth=0');
    }

    const accessToken = tokenService.generateAccessToken(req.user._id);
    const { token } = await tokenService.issueRefreshToken(req.user._id);

    tokenService.setAccessTokenCookie(res, accessToken);
    tokenService.setRefreshTokenCookie(res, token);

    await logAudit({
      userId: req.user._id,
      action: 'oauth.link',
      resource: 'user',
      resourceId: req.user._id,
      details: { provider, success: true },
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    }).catch(() => {});

    res.redirect('/public/resume/resume.html');
  };
}

// Step 1: Kick off Google login
router.get('/google', ensureOAuthEnabled('google'), passport.authenticate('google', { scope: ['profile', 'email'] }));

// Step 2: Callback after Google auth — set tokens in httpOnly cookies, not URL
router.get(
  '/google/callback',
  ensureOAuthEnabled('google'),
  passport.authenticate('google', { failureRedirect: '/public/auth/login.html?oauth=0', session: false }),
  oauthCallback('google')
);

// Step 1: Kick off GitHub login
router.get('/github', ensureOAuthEnabled('github'), passport.authenticate('github', { scope: ['user:email'] }));

// Step 2: Callback after GitHub auth — set tokens in httpOnly cookies, not URL
router.get(
  '/github/callback',
  ensureOAuthEnabled('github'),
  passport.authenticate('github', { failureRedirect: '/public/auth/login.html?oauth=0', session: false }),
  oauthCallback('github')
);

// Step 3: Logout
router.get('/logout', async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken);
    }
    if (req.user?._id) {
      await logAudit({
        userId: req.user._id,
        action: 'user.logout',
        resource: 'user',
        resourceId: req.user._id,
        details: { success: true },
        ip: req.ip,
        userAgent: req.get('User-Agent'),
      });
    }
  } catch (err) {
    // Best-effort revocation; still clear cookies.
  }

  req.logout((err) => {
    tokenService.clearAuthCookies(res);
    if (err) return res.redirect('/');
    res.redirect('/');
  });
});

module.exports = router;
