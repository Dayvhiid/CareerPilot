const jwt = require('jsonwebtoken');

jest.mock('../../../src/models/User');
jest.mock('../../../src/services/tokenService', () => ({
  ISSUER: 'careerpilot',
  AUDIENCE: 'careerpilot-app',
  verifyRefreshToken: jest.fn(),
  deleteRefreshToken: jest.fn(),
  generateAccessToken: jest.fn(),
  issueRefreshToken: jest.fn(),
  setAccessTokenCookie: jest.fn(),
  setRefreshTokenCookie: jest.fn(),
}));

const User = require('../../../src/models/User');
const auth = require('../../../src/middleware/auth');
const tokenService = require('../../../src/services/tokenService');

const ACCESS_SECRET = 'test-access-secret-1234567890';
process.env.JWT_ACCESS_SECRET = ACCESS_SECRET;

function makeAccessToken() {
  return jwt.sign(
    { id: 'user123', type: 'access', iss: 'careerpilot', aud: 'careerpilot-app', jti: 'jti1' },
    ACCESS_SECRET,
    { expiresIn: '15m' }
  );
}

describe('Auth Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    jest.clearAllMocks();
    req = { headers: {}, cookies: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    next = jest.fn();
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user123', name: 'Test' }),
    });
  });

  it('should reject requests with no token', async () => {
    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('should authenticate with a valid Bearer token', async () => {
    req.headers.authorization = `Bearer ${makeAccessToken()}`;

    await auth(req, res, next);

    expect(User.findById).toHaveBeenCalledWith('user123');
    expect(next).toHaveBeenCalled();
  });

  it('should fall back to the accessToken cookie when Bearer header is empty', async () => {
    req.headers.authorization = 'Bearer ';
    req.cookies.accessToken = makeAccessToken();

    await auth(req, res, next);

    expect(User.findById).toHaveBeenCalledWith('user123');
    expect(next).toHaveBeenCalled();
  });

  it('should authenticate purely via the accessToken cookie', async () => {
    req.cookies.accessToken = makeAccessToken();

    await auth(req, res, next);

    expect(User.findById).toHaveBeenCalledWith('user123');
    expect(next).toHaveBeenCalled();
  });

  it('should reject an invalid token', async () => {
    req.headers.authorization = 'Bearer not-a-real-token';

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_INVALID' }));
  });

  it('should reject a refresh token presented as an access token', async () => {
    const refresh = jwt.sign(
      { id: 'user123', type: 'refresh', tokenId: 'x', iss: 'careerpilot', aud: 'careerpilot-app' },
      ACCESS_SECRET,
      { expiresIn: '7d' }
    );
    req.headers.authorization = `Bearer ${refresh}`;

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'TOKEN_TYPE_INVALID' }));
  });

  it('should reject a token for a deleted user', async () => {
    req.headers.authorization = `Bearer ${makeAccessToken()}`;
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(null) });

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'USER_NOT_FOUND' }));
  });

  it('should silently refresh an expired access token via the refresh cookie', async () => {
    const expired = jwt.sign(
      { id: 'user123', type: 'access', iss: 'careerpilot', aud: 'careerpilot-app', jti: 'jti1' },
      ACCESS_SECRET,
      { expiresIn: '-1m' }
    );
    req.cookies.accessToken = expired;
    req.cookies.refreshToken = 'refresh-cookie';

    tokenService.verifyRefreshToken.mockResolvedValue({ id: 'user123', tokenId: 'tok1', type: 'refresh' });
    tokenService.generateAccessToken.mockReturnValue('new-access');
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user123', name: 'Test' }),
    });

    await auth(req, res, next);

    expect(tokenService.deleteRefreshToken).not.toHaveBeenCalled();
    expect(tokenService.issueRefreshToken).not.toHaveBeenCalled();
    expect(tokenService.setAccessTokenCookie).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ _id: 'user123' }));
  });

  it('should silently refresh when no access token but a valid refresh cookie exists', async () => {
    req.cookies.refreshToken = 'refresh-cookie';

    tokenService.verifyRefreshToken.mockResolvedValue({ id: 'user123', tokenId: 'tok2', type: 'refresh' });
    tokenService.generateAccessToken.mockReturnValue('new-access');
    User.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ _id: 'user123', name: 'Test' }),
    });

    await auth(req, res, next);

    expect(res.status).not.toHaveBeenCalled();
    expect(tokenService.setAccessTokenCookie).toHaveBeenCalled();
    expect(next).toHaveBeenCalled();
    expect(req.user).toEqual(expect.objectContaining({ _id: 'user123' }));
  });

  it('should reject when no access token and the refresh cookie is invalid', async () => {
    req.cookies.refreshToken = 'refresh-cookie';

    tokenService.verifyRefreshToken.mockResolvedValue(null);

    await auth(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'AUTH_REQUIRED' }));
    expect(next).not.toHaveBeenCalled();
  });
});
