const { logger } = require('../config/logger');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

const revokedTokens = new Set();

function generateAccessToken(userId) {
  return jwt.sign({ id: userId, type: 'access' }, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRY || ACCESS_TOKEN_EXPIRY,
  });
}

function generateRefreshToken(userId) {
  const tokenId = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign({ id: userId, type: 'refresh', tokenId }, process.env.JWT_REFRESH_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
  });
  return { token, tokenId };
}

function sendError(res, status, message) {
  res.status(status).json({
    success: false,
    message: message,
  });
}

exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return sendError(res, 400, 'User already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({ name, email, password: hashedPassword });
    await user.save();

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
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
    if (!user) {
      return sendError(res, 401, 'Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return sendError(res, 401, 'Invalid credentials');
    }

    const accessToken = generateAccessToken(user._id);
    const { token: refreshToken } = generateRefreshToken(user._id);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
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

    let decoded;
    try {
      decoded = jwt.verify(oldRefreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (err) {
      return sendError(res, 401, 'Invalid or expired refresh token');
    }

    if (revokedTokens.has(decoded.tokenId)) {
      await revokeAllUserTokens(decoded.id);
      return sendError(res, 401, 'Token has been revoked. Please login again.');
    }

    revokedTokens.add(decoded.tokenId);

    const accessToken = generateAccessToken(decoded.id);
    const { token: newRefreshToken, tokenId: newTokenId } = generateRefreshToken(decoded.id);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      tokenId: newTokenId,
    });
  } catch (error) {
    logger.error('Token refresh error:', error);
    sendError(res, 500, 'Server error during token refresh');
  }
};

async function revokeAllUserTokens(userId) {
  revokedTokens.add(`user_${userId}_all`);
}

exports.logout = (req, res) => {
  res.clearCookie('refreshToken');
  res.clearCookie('XSRF-TOKEN');
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
};
