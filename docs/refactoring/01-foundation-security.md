# Phase 1 — Foundation & Security

> **Duration**: 5–7 days
> **Priority**: 🔴 HIGH
> **Depends on**: Phase 0 complete

---

## Objective

Establish a secure foundation: harden authentication, add baseline security middleware, fix critical auth vulnerabilities, and implement proper secrets management.

---

## Tasks

### 1.1 — Install Production Security Middleware

```bash
npm install helmet compression cookie-parser express-mongo-sanitize hpp
```

**Files to create/update:**

**`src/middleware/security.js`:**

```javascript
const helmet = require('helmet');
const compression = require('compression');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');

function setupSecurity(app) {
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],  // Remove unsafe-inline in Phase 5
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.paystack.co"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"]
      }
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    }
  }));

  // Compression
  app.use(compression());

  // Prevent NoSQL injection
  app.use(mongoSanitize());

  // Prevent HTTP parameter pollution
  app.use(hpp());

  // Trust proxy (if behind ELB)
  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }
}

module.exports = { setupSecurity };
```

**In `src/app.js`, add after line 23:**
```javascript
const { setupSecurity } = require('./middleware/security');
setupSecurity(app);
```

### 1.2 — Fix JWT Authentication Overhaul

**Separate access and refresh token secrets:**

```bash
# Add to .env.example
JWT_ACCESS_SECRET=generate-a-64-char-random-string
JWT_REFRESH_SECRET=generate-a-different-64-char-random-string
```

**Rewritten `src/controllers/authController.js`:**

```javascript
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Token configuration
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

// Store for revoked refresh tokens (use Redis in production)
const revokedTokens = new Set();

function generateAccessToken(userId) {
  return jwt.sign(
    { id: userId, type: 'access' },
    process.env.JWT_ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || ACCESS_TOKEN_EXPIRY }
  );
}

function generateRefreshToken(userId) {
  const tokenId = crypto.randomBytes(32).toString('hex');
  const token = jwt.sign(
    { id: userId, type: 'refresh', tokenId },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRY }
  );
  return { token, tokenId };
}

// Refresh token rotation:
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

    // Check if token was already revoked (rotation)
    if (revokedTokens.has(decoded.tokenId)) {
      // Possible token theft — revoke ALL tokens for this user
      await revokeAllUserTokens(decoded.id);
      return sendError(res, 401, 'Token has been revoked. Please login again.');
    }

    // Revoke old token
    revokedTokens.add(decoded.tokenId);

    // Issue new pair with rotation
    const accessToken = generateAccessToken(decoded.id);
    const { token: newRefreshToken, tokenId: newTokenId } = generateRefreshToken(decoded.id);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      accessToken,
      tokenId: newTokenId
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    sendError(res, 500, 'Server error during token refresh');
  }
};
```

### 1.3 — Fix OAuth Token Leak

**Modify `src/routes/oauthRoutes.js`:**

Replace the callback handlers (lines 31-55):

```javascript
// Google callback — set token in httpOnly cookie, not URL
router.get('/google/callback',
  ensureOAuthEnabled('google'),
  passport.authenticate('google', { failureRedirect: '/auth/login.html', session: false }),
  (req, res) => {
    const token = getOAuthAccessToken(req.user._id);
    const refreshToken = getOAuthRefreshToken(req.user._id);

    res.cookie('accessToken', token, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: true,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    // Redirect without token in URL
    res.redirect('/resume/resume.html');
  }
);
```

### 1.4 — Rewrite Auth Middleware

**`src/middleware/auth.js`:**

```javascript
const jwt = require('jsonwebtoken');
const User = require('../models/User');

function extractToken(req) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }
  return req.cookies?.accessToken || null;
}

module.exports = async (req, res, next) => {
  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET);
    } catch (err) {
      const message = err.name === 'TokenExpiredError'
        ? 'Access token expired'
        : 'Invalid access token';
      return res.status(401).json({
        success: false,
        message,
        code: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID'
      });
    }

    if (decoded.type !== 'access') {
      return res.status(401).json({
        success: false,
        message: 'Invalid token type',
        code: 'TOKEN_TYPE_INVALID'
      });
    }

    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found',
        code: 'USER_NOT_FOUND'
      });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Authentication error',
      code: 'AUTH_ERROR'
    });
  }
};
```

### 1.5 — Implement Secrets Management

**Create `src/config/secrets.js`:**

```javascript
/**
 * Secrets Manager — loads secrets from the correct source
 * based on environment:
 *   development: .env file
 *   production: AWS Secrets Manager or Parameter Store
 */

const AWS = require('@aws-sdk/client-ssm');

class SecretsManager {
  constructor() {
    this.cache = new Map();
    this.ssm = null;
  }

  async initialize() {
    if (process.env.NODE_ENV !== 'production') {
      // In development, dotenv already loaded the .env
      console.log('[secrets] Using .env for development');
      return;
    }

    // In production, load from AWS Parameter Store
    console.log('[secrets] Loading from AWS Parameter Store');
    this.ssm = new AWS.SSM({
      region: process.env.AWS_REGION || 'us-east-1'
    });

    const params = {
      Path: '/careerpilot/production/',
      WithDecryption: true,
      Recursive: true
    };

    try {
      const response = await this.ssm.getParametersByPath(params);
      for (const param of response.Parameters || []) {
        const name = param.Name.split('/').pop();
        this.cache.set(name, param.Value);
        process.env[name] = param.Value;
      }
      console.log(`[secrets] Loaded ${this.cache.size} secrets`);
    } catch (err) {
      console.error('[secrets] Failed to load production secrets:', err);
      throw err;
    }
  }

  get(key) {
    return this.cache.get(key) || process.env[key];
  }
}

module.exports = new SecretsManager();
```

Update `src/app.js` to initialize secrets before anything else:

```javascript
const secrets = require('./config/secrets');

async function init() {
  await secrets.initialize();
  // ... rest of app setup
}
```

### 1.6 — Add CSRF Protection

```bash
npm install csurf
```

**Add to `src/app.js`:**
```javascript
const csrf = require('csurf');
app.use(csrf({ cookie: true }));
app.use((req, res, next) => {
  res.cookie('XSRF-TOKEN', req.csrfToken());
  next();
});
```

### 1.7 — Replace MemoryStore with Redis Session Store

```bash
npm install connect-redis
```

```javascript
// In app.js, replace the express-session config:
const RedisStore = require('connect-redis')(session);
const redisClient = require('./config/redis').getClient();

app.use(session({
  store: redisClient ? new RedisStore({ client: redisClient }) : undefined,
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'strict',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  },
  name: 'careerpilot.sid'  // Don't use default 'connect.sid'
}));
```

### 1.8 — Add Input Validation to All Endpoints

Create a centralized validation schema for every route that accepts user input:

**`src/middleware/validators.js` — Add these new validators:**

```javascript
const paymentValidators = {
  initialize: [
    body('billing')
      .isIn(['monthly', 'annual'])
      .withMessage('Billing must be monthly or annual'),
    handleValidationErrors
  ]
};

const jobValidators = {
  bookmark: [
    param('jobId')
      .isMongoId()
      .withMessage('Invalid job ID'),
    handleValidationErrors
  ]
};
```

### 1.9 — Standardize API Error Responses

**Create `src/utils/apiResponse.js`:**

```javascript
class ApiResponse {
  static success(res, data, statusCode = 200) {
    return res.status(statusCode).json({
      success: true,
      ...data
    });
  }

  static error(res, message, statusCode = 500, errors = null) {
    const response = {
      success: false,
      message,
      code: `ERR_${statusCode}`
    };
    if (errors) response.errors = errors;
    return res.status(statusCode).json(response);
  }

  static paginated(res, data, total, page, limit) {
    return res.status(200).json({
      success: true,
      data,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  }
}
```

---

## Verification

```bash
# Run security scan
npm audit

# Run tests (once they exist)
npm test

# Manual security checks:
# 1. Verify all security headers present
curl -sI http://localhost:4000 | grep -i -E "x-frame|strict-transport|x-content-type|x-xss"

# 2. Verify no token in redirect URL
curl -v http://localhost:4000/api/oauth/google 2>&1 | grep -i token

# 3. Verify CSRF token returned
curl -v http://localhost:4000 | grep XSRF-TOKEN
```

---

## Definition of Done

- [ ] Helmet, compression, mongo-sanitize, HPP installed
- [ ] CSP headers configured
- [ ] Access and refresh tokens use separate secrets
- [ ] Refresh token rotation implemented
- [ ] OAuth no longer passes tokens in URL
- [ ] Auth middleware validates token type
- [ ] Secrets load from AWS Parameter Store in production
- [ ] CSRF protection enabled
- [ ] Redis session store configured (with fallback warning)
- [ ] All routes have input validation
- [ ] Unified API response helpers created
- [ ] Security headers verified with curl

---

## Next Phase

➡️ Proceed to [Phase 2 — Infrastructure & DevOps](./02-infrastructure-devops.md)
