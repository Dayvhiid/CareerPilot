const helmet = require('helmet');
const compression = require('compression');

function sanitizeValue(value) {
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value);
    for (const key of keys) {
      if (key.startsWith('$') || key.includes('.')) {
        delete value[key];
      } else {
        sanitizeValue(value[key]);
      }
    }
  }
  return value;
}

function mongoSanitize() {
  return function (req, res, next) {
    ['body', 'params', 'headers', 'query'].forEach(function (key) {
      if (req[key]) {
        sanitizeValue(req[key]);
      }
    });
    next();
  };
}

function hpp() {
  return function (req, res, next) {
    if (req.query) {
      const params = Object.keys(req.query);
      for (const param of params) {
        const val = req.query[param];
        if (Array.isArray(val)) {
          req.query[param] = val[val.length - 1];
        }
      }
    }
    next();
  };
}

function setupSecurity(app) {
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'", 'https://api.paystack.co'],
          frameSrc: ["'none'"],
          objectSrc: ["'none'"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    })
  );

  app.use(compression());

  app.use(mongoSanitize());

  app.use(hpp());

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
}

module.exports = { setupSecurity };
