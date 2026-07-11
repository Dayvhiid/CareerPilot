const { logger } = require('../config/logger');

module.exports = (req, res, next) => {
  const start = Date.now();
  const requestId = req.requestId;

  logger.info('Incoming request', {
    requestId,
    method: req.method,
    url: req.originalUrl,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    userId: req.user?._id,
  });

  res.on('finish', () => {
    const duration = Date.now() - start;
    const logLevel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';
    logger[logLevel]('Request completed', {
      requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      duration,
      userId: req.user?._id,
    });
  });

  next();
};
