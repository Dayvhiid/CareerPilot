const request = require('supertest');

describe('Health Check API', () => {
  let app;

  beforeAll(() => {
    jest.isolateModules(() => {
      app = require('../../src/app');
    });
  });

  describe('GET /api/health', () => {
    it('should return health status (degraded without DB)', async () => {
      const res = await request(app).get('/api/health');

      expect([200, 503]).toContain(res.status);
      expect(res.body.success).toBe(true);
      expect(res.body).toHaveProperty('status');
      expect(res.body).toHaveProperty('checks');
      expect(res.body.checks).toHaveProperty('uptime');
      expect(res.body.checks).toHaveProperty('timestamp');
      expect(res.body.checks).toHaveProperty('mongodb');
      expect(res.body.checks.mongodb).toHaveProperty('status');
    });
  });
});
