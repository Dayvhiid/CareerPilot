/**
 * Rate Limiting Middleware
 * Different rate limits for different endpoints to prevent abuse
 */

const rateLimit = require('express-rate-limit');

/**
 * General rate limiter for development
 */
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Strict rate limiter for authentication endpoints
 * 5 attempts per 15 minutes
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many authentication attempts. Please try again after 15 minutes.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'test',
});

const registrationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many registration attempts. Please try again after 1 hour.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'test',
});

const chatbotLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: 'Too many messages. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (_req) => process.env.NODE_ENV === 'test',
});

/**
 * File upload limiter
 * 10 uploads per day per user
 */
const uploadLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  max: 10,
  message: 'Upload limit exceeded. Max 10 uploads per day.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  skip: (_req) => process.env.NODE_ENV === 'test',
});

/**
 * API endpoint limiter
 * 200 requests per hour per user
 */
const apiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 200,
  message: 'Too many requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
});

/**
 * Cache clearing limiter (very strict)
 * 1 request per hour
 */
const cacheLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 1,
  message: 'Cache operations are rate limited. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
  skip: (_req) => process.env.NODE_ENV === 'test',
});

module.exports = {
  generalLimiter,
  authLimiter,
  registrationLimiter,
  chatbotLimiter,
  uploadLimiter,
  apiLimiter,
  cacheLimiter,
};
