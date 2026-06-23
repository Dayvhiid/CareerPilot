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
    return res.status(mongooseError.status).json({
      success: false,
      message: mongooseError.message,
      errors: mongooseError.errors
    });
  }

  const jwtError = handleJwtError(err);
  if (jwtError) {
    return res.status(jwtError.status).json({
      success: false,
      message: jwtError.message
    });
  }

  if (err.name === 'MulterError') {
    return res.status(400).json({
      success: false,
      message: `File upload error: ${err.message}`
    });
  }

  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
};

module.exports = errorHandler;
