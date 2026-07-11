const { logger } = require('../config/logger');
const ApiResponse = require('../utils/apiResponse');

const handleMongooseError = (err) => {
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => ({
      field: e.path,
      message: e.message
    }));
    return { status: 400, message: 'Validation failed', errors };
  }

  if (err.name === 'CastError') {
    return { status: 400, message: `Invalid ${err.path}: ${err.value}` };
  }

  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern)[0];
    return { status: 409, message: `Duplicate value for ${field}` };
  }

  return null;
};

const handleJwtError = (err) => {
  if (err.name === 'JsonWebTokenError') {
    return { status: 401, message: 'Invalid token' };
  }

  if (err.name === 'TokenExpiredError') {
    return { status: 401, message: 'Token expired' };
  }

  return null;
};

const errorHandler = (err, req, res, _next) => {
  const mongooseError = handleMongooseError(err);
  if (mongooseError) {
    return ApiResponse.error(res, mongooseError.message, mongooseError.status, mongooseError.errors);
  }

  const jwtError = handleJwtError(err);
  if (jwtError) {
    return ApiResponse.error(res, jwtError.message, jwtError.status);
  }

  if (err.name === 'MulterError') {
    return ApiResponse.error(res, `File upload error: ${err.message}`, 400);
  }

  logger.error('Unhandled error:', err);
  ApiResponse.error(res, err.message || 'Internal server error', err.status || 500);
};

module.exports = errorHandler;
