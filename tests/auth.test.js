/**
 * Authentication Tests
 * Tests for user registration, login, JWT tokens, and refresh token flow
 */

const request = require('supertest');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const app = require('../../src/app');
const User = require('../../src/models/User');

describe('Authentication Tests', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }
  });

  afterEach(async () => {
    // Clean up test data
    await User.deleteMany({});
  });

  afterAll(async () => {
    // Close database connection
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });

  describe('POST /api/auth/register', () => {
    it('should successfully register a new user with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'SecurePass123'
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('successfully');

      // Verify user was created
      const user = await User.findOne({ email: 'john@example.com' });
      expect(user).toBeDefined();
      expect(user.name).toBe('John Doe');
    });

    it('should reject registration with existing email', async () => {
      // Create first user
      await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'SecurePass123'
        });

      // Try to register with same email
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Jane Doe',
          email: 'john@example.com',
          password: 'AnotherPass123'
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('already exists');
    });

    it('should reject registration with weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'john@example.com',
          password: 'weak'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject registration with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'John Doe',
          email: 'invalid-email',
          password: 'SecurePass123'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });

    it('should reject registration with invalid name', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'J',
          email: 'john@example.com',
          password: 'SecurePass123'
        });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('TestPass123', 10);
      await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: hashedPassword
      });
    });

    it('should successfully login with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'TestPass123'
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe('john@example.com');

      // Verify access token is valid JWT
      const decoded = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
      expect(decoded.id).toBeDefined();
    });

    it('should return refresh token in httpOnly cookie', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'TestPass123'
        });

      expect(res.status).toBe(200);
      const cookies = res.headers['set-cookie'];
      expect(cookies).toBeDefined();
      
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('HttpOnly');
    });

    it('should reject login with invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'john@example.com',
          password: 'WrongPassword'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('Invalid credentials');
    });

    it('should reject login with non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: 'TestPass123'
        });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'invalid-email',
          password: 'TestPass123'
        });

      expect(res.status).toBe(400);
      expect(res.body.errors).toBeDefined();
    });
  });

  describe('POST /api/auth/refresh', () => {
    let refreshToken;
    let userId;

    beforeEach(async () => {
      // Create a test user and generate tokens
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('TestPass123', 10);
      const user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: hashedPassword
      });
      userId = user._id;

      // Generate a valid refresh token
      refreshToken = jwt.sign({ id: userId }, process.env.JWT_SECRET, {
        expiresIn: '7d'
      });
    });

    it('should successfully refresh access token with valid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${refreshToken}`])
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.accessToken).toBeDefined();

      // Verify new access token is valid
      const decoded = jwt.verify(res.body.accessToken, process.env.JWT_SECRET);
      expect(decoded.id).toBe(userId.toString());
    });

    it('should reject refresh without refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .send();

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toContain('missing');
    });

    it('should reject refresh with invalid refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', ['refreshToken=invalid.token.here'])
        .send();

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should reject refresh for non-existent user', async () => {
      const fakeToken = jwt.sign(
        { id: new mongoose.Types.ObjectId() },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const res = await request(app)
        .post('/api/auth/refresh')
        .set('Cookie', [`refreshToken=${fakeToken}`])
        .send();

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('not found');
    });
  });

  describe('POST /api/auth/logout', () => {
    it('should successfully logout and clear refresh token', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify refresh token cookie is cleared
      const cookies = res.headers['set-cookie'];
      const refreshCookie = cookies.find(c => c.startsWith('refreshToken='));
      expect(refreshCookie).toBeDefined();
      expect(refreshCookie).toContain('expires');
    });
  });

  describe('JWT Token Expiration', () => {
    it('should generate access tokens with 15 minute expiration', () => {
      const token = jwt.sign(
        { id: 'test-user-id' },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );

      const decoded = jwt.decode(token);
      const expiresIn = decoded.exp - decoded.iat;

      // Should be approximately 15 minutes (900 seconds)
      expect(expiresIn).toBe(900);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit excessive login attempts', async () => {
      const responses = [];

      // Try to login 6 times (limit is 5)
      for (let i = 0; i < 6; i++) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            email: 'test@example.com',
            password: 'wrong'
          });
        responses.push(res.status);
      }

      // Last request should be rate limited
      expect(responses[5]).toBe(429);
    });

    it('should rate limit excessive registration attempts', async () => {
      const responses = [];

      // Try to register 4 times (limit is 3)
      for (let i = 0; i < 4; i++) {
        const res = await request(app)
          .post('/api/auth/register')
          .send({
            name: `User${i}`,
            email: `user${i}@example.com`,
            password: 'TestPass123'
          });
        responses.push(res.status);
      }

      // Last request should be rate limited (429)
      expect(responses[3]).toBe(429);
    }).timeout(5000);
  });

  describe('Protected Routes', () => {
    let accessToken;
    let user;

    beforeEach(async () => {
      const bcrypt = require('bcryptjs');
      const hashedPassword = await bcrypt.hash('TestPass123', 10);
      user = await User.create({
        name: 'John Doe',
        email: 'john@example.com',
        password: hashedPassword
      });

      accessToken = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
        expiresIn: '15m'
      });
    });

    it('should allow access with valid JWT token', async () => {
      // Test with a protected route (resume GET)
      const res = await request(app)
        .get('/api/resume')
        .set('Authorization', `Bearer ${accessToken}`);

      // Should not return 401 (unauthorized)
      expect(res.status).not.toBe(401);
    });

    it('should deny access without JWT token', async () => {
      const res = await request(app)
        .get('/api/resume');

      expect(res.status).toBe(401);
    });

    it('should deny access with invalid JWT token', async () => {
      const res = await request(app)
        .get('/api/resume')
        .set('Authorization', 'Bearer invalid.token.here');

      expect(res.status).toBe(401);
    });

    it('should deny access with expired JWT token', async () => {
      const expiredToken = jwt.sign(
        { id: user._id },
        process.env.JWT_SECRET,
        { expiresIn: '0s' }
      );

      // Wait a moment to ensure token is expired
      await new Promise(resolve => setTimeout(resolve, 100));

      const res = await request(app)
        .get('/api/resume')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
    });
  });
});
