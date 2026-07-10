const request = require('supertest');
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
      expect(res.body.success).toBe(true);
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
      await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test', email: 'test@test.com', password: 'Password123' });
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
