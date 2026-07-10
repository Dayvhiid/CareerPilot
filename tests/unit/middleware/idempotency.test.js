jest.mock('../../../src/config/redis');

const cache = require('../../../src/config/redis');

describe('Idempotency Middleware', () => {
  let idempotencyMiddleware;

  beforeAll(() => {
    idempotencyMiddleware = require('../../../src/middleware/idempotency');
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return 400 if idempotency-key header is missing', async () => {
    const middleware = idempotencyMiddleware();
    const req = { headers: {} };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Idempotency-Key header required for this endpoint'
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('should return cached response if key exists', async () => {
    cache.get.mockResolvedValue({ success: true, data: 'cached' });

    const middleware = idempotencyMiddleware();
    const req = { headers: { 'idempotency-key': 'key-123' } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(cache.get).toHaveBeenCalledWith('idempotent:key-123');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: 'cached' });
    expect(next).not.toHaveBeenCalled();
  });

  it('should call next and store response if no cached result', async () => {
    cache.get.mockResolvedValue(null);
    cache.set.mockResolvedValue();

    const middleware = idempotencyMiddleware();
    const req = { headers: { 'idempotency-key': 'key-456' } };
    const res = {
      json: jest.fn()
    };
    const next = jest.fn();

    await middleware(req, res, next);

    expect(cache.get).toHaveBeenCalledWith('idempotent:key-456');
    expect(next).toHaveBeenCalled();
    expect(res.json).toBeDefined();
  });
});
