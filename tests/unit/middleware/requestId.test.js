describe('Request ID Middleware', () => {
  let requestIdMiddleware;

  beforeAll(() => {
    requestIdMiddleware = require('../../../src/middleware/requestId');
  });

  it('should generate a UUID if no x-request-id header', () => {
    const req = { headers: {} };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBeDefined();
    expect(req.requestId.length).toBeGreaterThan(0);
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', req.requestId);
    expect(next).toHaveBeenCalled();
  });

  it('should use x-request-id header if present', () => {
    const req = { headers: { 'x-request-id': 'custom-id-123' } };
    const res = { setHeader: jest.fn() };
    const next = jest.fn();

    requestIdMiddleware(req, res, next);

    expect(req.requestId).toBe('custom-id-123');
    expect(res.setHeader).toHaveBeenCalledWith('X-Request-Id', 'custom-id-123');
    expect(next).toHaveBeenCalled();
  });
});
