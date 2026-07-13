const winston = require('winston');
const path = require('path');

const logDir = path.join(__dirname, '../../logs');

const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'ISO' }),
  winston.format.errors({ stack: true }),
  winston.format((info) => {
    info.environment = process.env.NODE_ENV || 'development';
    info.service = 'careerpilot-api';
    return info;
  })(),
  winston.format.json()
);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, requestId, ...rest }) => {
    const rid = requestId ? ` [${requestId}]` : '';
    const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest, null, 0).substring(0, 500)}` : '';
    return `${timestamp}${rid} ${level}: ${message}${extra}`;
  })
);

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  levels,
  format: process.env.NODE_ENV === 'production' ? jsonFormat : devFormat,
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({
      filename: path.join(logDir, 'error.log'),
      level: 'error',
      maxsize: 50 * 1024 * 1024,
      maxFiles: 10,
      format: jsonFormat,
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'combined.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 20,
      format: jsonFormat,
    }),
  ],
  exitOnError: false,
});

logger.stream = {
  write: (message) => logger.http(message.trim()),
};

const originalConsole = {
  log: console.log.bind(console),
  error: console.error.bind(console),
  warn: console.warn.bind(console),
};

console.log = (...args) => logger.info(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' '));
console.error = (...args) => logger.error(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' '));
console.warn = (...args) => logger.warn(args.map((a) => (typeof a === 'object' ? JSON.stringify(a) : a)).join(' '));

module.exports = { logger, originalConsole };
