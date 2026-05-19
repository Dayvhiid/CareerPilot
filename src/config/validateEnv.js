/**
 * Environment Variable Validation
 * Validates required environment variables on application startup
 * Fails fast in production if critical variables are missing
 */

const requiredVars = ['MONGODB_URI', 'JWT_SECRET'];

const optionalVars = [
  'NODE_ENV',
  'SESSION_SECRET',
  'JSEARCH_API_KEY',
  'HUGGINGFACE_API_KEY',
  'CORS_ORIGINS',
  'REDIS_URL',
  'PORT'
];

/**
 * Validate environment variables
 * @throws {Error} If required variables are missing in production
 */
function validateEnv() {
  const nodeEnv = process.env.NODE_ENV || 'development';
  const missing = [];

  // Check required variables
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }

  // In production, fail if any required vars are missing
  if (nodeEnv === 'production' && missing.length > 0) {
    throw new Error(
      `❌ CRITICAL: Missing required environment variables in production:\n${missing.map(v => `  - ${v}`).join('\n')}\n\nPlease set these variables before starting the server.`
    );
  }

  // In development, warn about missing required vars
  if (nodeEnv !== 'production' && missing.length > 0) {
    console.warn(`⚠️  Development: Missing recommended environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}`);
  }

  // Validate specific variable formats
  if (process.env.MONGODB_URI && !process.env.MONGODB_URI.startsWith('mongodb')) {
    console.warn('⚠️  MONGODB_URI should be a valid MongoDB connection string');
  }

  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length < 8) {
    throw new Error('❌ SESSION_SECRET must be at least 8 characters long');
  }

  if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 16) {
    throw new Error('❌ JWT_SECRET must be at least 16 characters long for security');
  }

  // Validate JWT expiration format if set
  if (process.env.JWT_EXPIRATION && !isValidExpiration(process.env.JWT_EXPIRATION)) {
    throw new Error(`❌ Invalid JWT_EXPIRATION format. Use formats like "15m", "7d", "24h"`);
  }

  console.log('✅ Environment variables validated successfully');
}

/**
 * Check if expiration format is valid
 * @param {string} expiration - Expiration string like "15m", "7d", "24h"
 * @returns {boolean}
 */
function isValidExpiration(expiration) {
  return /^\d+[smhd]$/.test(expiration);
}

module.exports = {
  validateEnv,
  requiredVars,
  optionalVars
};
