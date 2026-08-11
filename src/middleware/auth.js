const jwt = require('jsonwebtoken');
const { logger } = require('../config/logger');
const User = require('../models/User');
const tokenService = require('../services/tokenService');
const { ISSUER, AUDIENCE } = tokenService;

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7).trim();
    if (token) {
      return token;
    }
  }
  return req.cookies?.accessToken || null;
}

/**
 * Silent token refresh: when the access token cookie is missing/expired but a
 * valid refreshToken cookie is present, issue a fresh access cookie and resolve
 * the user. The refresh token is NOT rotated here (parallel requests would race
 * to revoke it); rotation happens on explicit /api/auth/refresh instead.
 * Returns the user, or null when no refresh is possible.
 */
async function trySilentRefresh(req, res) {
  const refreshToken = req.cookies?.refreshToken;
  if (!refreshToken) return null;

  try {
    const decoded = await tokenService.verifyRefreshToken(refreshToken);
    if (!decoded) return null;

    const user = await User.findById(decoded.id).select('-password');
    if (!user) return null;

    const accessToken = tokenService.generateAccessToken(user._id);
    tokenService.setAccessTokenCookie(res, accessToken);

    return user;
  } catch (error) {
    logger.warn('Silent token refresh failed:', error.message);
    return null;
  }
}

module.exports = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      const user = await trySilentRefresh(req, res);
      if (user) {
        req.user = user;
        return next();
      }
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
        issuer: ISSUER,
        audience: AUDIENCE,
      });
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        const user = await trySilentRefresh(req, res);
        if (user) {
          req.user = user;
          return next();
        }
      }
      const message = err.name === 'TokenExpiredError' ? 'Access token expired' : 'Invalid access token';
      return res.status(401).json({
        success: false,
        message,
        code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
      });
    }

    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        code: 'TOKEN_TYPE_INVALID',
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    logger.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR',
    });
  }
};
