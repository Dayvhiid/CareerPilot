const { logger } = require('../config/logger');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const tokenService = require('../services/tokenService');
const emailService = require('../services/emailService');
const { logAudit } = require('../middleware/auditLogger');

const BCRYPT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 30;

function sendError(res, status, message) {
  res.status(status).json({
    success: false,
    message: message,
  });
}

function createOpaqueToken() {
  return crypto.randomBytes(32).toString('hex');
}

function hashOpaqueToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function buildUserPayload(user) {
  return {
    id: user._id,
    name: user.name,
    email: user.email,
    emailVerified: user.emailVerified,
  };
}

function safeIp(req) {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const emailVerificationToken = createOpaqueToken();

    let user;
    try {
      user = await User.create({
        name,
        email,
        password: hashedPassword,
        emailVerified: false,
        emailVerificationToken: hashOpaqueToken(emailVerificationToken),
        emailVerificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      });
    } catch (err) {
      if (err.code === 11000) {
        return sendError(res, 400, 'Registration failed. Please try again.');
      }
      throw err;
    }

    await emailService.sendEmail({
      to: email,
      subject: 'Verify your CareerPilot email',
      text: `Hi ${name},\n\nPlease verify your email address by clicking the link below:\n\n${emailService.APP_BASE_URL}/api/auth/verify-email?token=${emailVerificationToken}\n\nThis link expires in 24 hours.\n\nIf you did not create a CareerPilot account, you can ignore this email.`,
    });

    await logAudit({
      userId: user._id,
      action: 'user.register',
      resource: 'user',
      resourceId: user._id,
      details: { method: 'local' },
      ip: safeIp(req),
      userAgent: req.get('User-Agent'),
    });

    res.status(201).json({
      success: true,
      message: 'User registered successfully. Please verify your email address.',
    });
  } catch (error) {
    logger.error('Registration error:', error.message);
    sendError(res, 500, 'Server error during registration');
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !user.password) {
      await logAudit({
        userId: user?._id,
        action: 'user.login',
        resource: 'user',
        resourceId: user?._id,
        details: { success: false, reason: user ? 'oauth-account' : 'not-found' },
        ip: safeIp(req),
        userAgent: req.get('User-Agent'),
      }).catch(() => {});
      return sendError(res, 401, 'Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      await logAudit({
        userId: user._id,
        action: 'user.login',
        resource: 'user',
        resourceId: user._id,
        details: { success: false, reason: 'bad-password' },
        ip: safeIp(req),
        userAgent: req.get('User-Agent'),
      }).catch(() => {});
      return sendError(res, 401, 'Invalid credentials');
    }

    const accessToken = tokenService.generateAccessToken(user._id);
    const { token: refreshToken } = await tokenService.issueRefreshToken(user._id);

    tokenService.setAccessTokenCookie(res, accessToken);
    tokenService.setRefreshTokenCookie(res, refreshToken);

    await logAudit({
      userId: user._id,
      action: 'user.login',
      resource: 'user',
      resourceId: user._id,
      details: { success: true, method: 'local' },
      ip: safeIp(req),
      userAgent: req.get('User-Agent'),
    });

    res.json({
      success: true,
      accessToken,
      user: buildUserPayload(user),
    });
  } catch (error) {
    logger.error('Login error:', error.message);
    sendError(res, 500, 'Server error during login');
  }
};

exports.refreshToken = async (req, res) => {
  try {
    const oldRefreshToken = req.cookies.refreshToken;
    if (!oldRefreshToken) {
      return sendError(res, 401, 'Refresh token missing');
    }

    const decoded = await tokenService.verifyRefreshToken(oldRefreshToken);
    if (!decoded) {
      return sendError(res, 401, 'Invalid or expired refresh token');
    }

    const user = await User.findById(decoded.id);
    if (!user) {
      await tokenService.revokeAllUserTokens(decoded.id);
      return sendError(res, 401, 'User not found');
    }

    await tokenService.deleteRefreshToken(decoded.tokenId);

    const accessToken = tokenService.generateAccessToken(user._id);
    const { token: newRefreshToken } = await tokenService.issueRefreshToken(user._id);

    tokenService.setAccessTokenCookie(res, accessToken);
    tokenService.setRefreshTokenCookie(res, newRefreshToken);

    res.json({
      success: true,
      accessToken,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    sendError(res, 500, 'Server error during token refresh');
  }
};

exports.logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (refreshToken) {
      await tokenService.revokeRefreshToken(refreshToken);
    }

    const userId = req.user?._id || req.user?.id;
    if (userId) {
      await logAudit({
        userId,
        action: 'user.logout',
        resource: 'user',
        resourceId: userId,
        details: { success: true },
        ip: safeIp(req),
        userAgent: req.get('User-Agent'),
      });
    }

    tokenService.clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    logger.error('Logout error:', error);
    tokenService.clearAuthCookies(res);
    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
      return sendError(res, 401, 'Authentication required');
    }

    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(userId);
    if (!user) {
      return sendError(res, 404, 'User not found');
    }

    if (!user.password) {
      return sendError(res, 400, 'This account uses social login and has no password');
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return sendError(res, 400, 'Current password is incorrect');
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await user.save();

    await tokenService.revokeAllUserTokens(user._id);
    tokenService.clearAuthCookies(res);

    await logAudit({
      userId: user._id,
      action: 'user.password.change',
      resource: 'user',
      resourceId: user._id,
      details: { success: true },
      ip: safeIp(req),
      userAgent: req.get('User-Agent'),
    }).catch(() => {});

    res.json({ success: true, message: 'Password changed successfully. Please log in again.' });
  } catch (error) {
    logger.error('Change password error:', error.message);
    sendError(res, 500, 'Server error during password change');
  }
};

exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res.redirect('/public/auth/login.html?verified=0');
    }

    const hashed = hashOpaqueToken(token);
    const user = await User.findOne({
      emailVerificationToken: hashed,
      emailVerificationExpires: { $gt: new Date() },
    });

    if (!user) {
      return res.redirect('/public/auth/login.html?verified=0');
    }

    user.emailVerified = true;
    user.emailVerificationToken = undefined;
    user.emailVerificationExpires = undefined;
    await user.save();

    res.redirect('/public/auth/login.html?verified=1');
  } catch (error) {
    logger.error('Email verification error:', error.message);
    res.redirect('/public/auth/login.html?verified=0');
  }
};

exports.resendVerification = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user || user.emailVerified) {
      return sendError(res, 200, 'If the account exists and is unverified, a verification email has been sent.');
    }

    const token = createOpaqueToken();
    user.emailVerificationToken = hashOpaqueToken(token);
    user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await user.save();

    await emailService.sendEmail({
      to: email,
      subject: 'Verify your CareerPilot email',
      text: `Please verify your email address by clicking the link below:\n\n${emailService.APP_BASE_URL}/api/auth/verify-email?token=${token}\n\nThis link expires in 24 hours.`,
    });

    res.json({ success: true, message: 'Verification email sent.' });
  } catch (error) {
    logger.error('Resend verification error:', error.message);
    sendError(res, 500, 'Server error');
  }
};

exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (user) {
      const token = createOpaqueToken();
      user.passwordResetToken = hashOpaqueToken(token);
      user.passwordResetExpires = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      await user.save();

      await emailService.sendEmail({
        to: email,
        subject: 'Reset your CareerPilot password',
        text: `Hi ${user.name},\n\nWe received a request to reset your password. Click the link below to choose a new password:\n\n${emailService.APP_BASE_URL}/public/auth/reset-password.html?token=${token}\n\nThis link expires in ${RESET_TOKEN_TTL_MINUTES} minutes.\n\nIf you did not request this, you can safely ignore this email.`,
      });
    }

    res.json({
      success: true,
      message: 'If an account exists for that email, a password reset link has been sent.',
    });
  } catch (error) {
    logger.error('Forgot password error:', error.message);
    sendError(res, 500, 'Server error');
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
      return sendError(res, 400, 'Token and new password are required');
    }

    const hashed = hashOpaqueToken(token);
    const user = await User.findOne({
      passwordResetToken: hashed,
      passwordResetExpires: { $gt: new Date() },
    });

    if (!user) {
      return sendError(res, 400, 'Invalid or expired reset token');
    }

    user.password = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    user.emailVerified = true;
    await user.save();

    await tokenService.revokeAllUserTokens(user._id);

    await logAudit({
      userId: user._id,
      action: 'user.password.change',
      resource: 'user',
      resourceId: user._id,
      details: { success: true, method: 'reset' },
      ip: safeIp(req),
      userAgent: req.get('User-Agent'),
    }).catch(() => {});

    res.json({ success: true, message: 'Password reset successfully. Please log in.' });
  } catch (error) {
    logger.error('Reset password error:', error.message);
    sendError(res, 500, 'Server error');
  }
};
