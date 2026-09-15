const request = require('supertest');
const bcrypt = require('bcryptjs');
jest.mock('../../src/models/User', () => {
  const usersByEmail = new Map();

  return {
    create: jest.fn(async (data) => {
      if (usersByEmail.has(data.email)) {
        const err = new Error('Duplicate key');
        err.code = 11000;
        throw err;
      }

      const created = {
        _id: `user-${usersByEmail.size + 1}`,
        ...data,
      };
      usersByEmail.set(created.email, created);
      return created;
    }),
    findOne: jest.fn(async (query) => usersByEmail.get(query.email) || null),
    deleteMany: jest.fn(async () => {
      usersByEmail.clear();
    }),
  };
});
const User = require('../../src/models/User');

describe('Auth API', () => {
  let app;

  beforeAll(() => {
    jest.isolateModules(() => {
      app = require('../../src/app');
    });
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /api/auth/register', () => {
    it('should register a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test User',
          email: 'test@test.com',
          password: 'Password123'
        });
      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        success: true,
        message: 'Account created. Please verify your email.',
        email: 'test@test.com',
      });
    });

    it('should reject duplicate email', async () => {
      await User.create({
        name: 'Existing',
        email: 'test@test.com',
        password: 'hashed'
      });
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'test@test.com',
          password: 'Password123'
        });
      expect(res.status).toBe(400);
    });

    it('should reject weak password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test',
          email: 'test@test.com',
          password: '123'
        });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await User.create({
        name: 'Test',
        email: 'test@test.com',
        password: await bcrypt.hash('Password123', 12),
        emailVerified: true,
      });
    });

    it('should login and return tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'Password123' });
      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test@test.com', password: 'wrong' });
      expect(res.status).toBe(401);
    });
  });
});
