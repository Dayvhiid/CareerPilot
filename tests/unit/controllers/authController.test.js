const bcrypt = require('bcryptjs');

jest.mock('../../../src/models/User');
jest.mock('../../../src/services/tokenService', () => ({
  generateAccessToken: jest.fn(() => 'access-token'),
  issueRefreshToken: jest.fn(async () => ({ token: 'refresh-token', tokenId: 'tokenId-123' })),
  verifyRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(async () => null),
  revokeAllUserTokens: jest.fn(async () => {}),
  deleteRefreshToken: jest.fn(async () => {}),
  setAccessTokenCookie: jest.fn(),
  setRefreshTokenCookie: jest.fn(),
  clearAuthCookies: jest.fn(),
}));
jest.mock('../../../src/services/emailService', () => ({
  sendEmail: jest.fn(async () => ({})),
  APP_BASE_URL: 'http://localhost:4000',
}));
jest.mock('../../../src/middleware/auditLogger', () => ({
  logAudit: jest.fn(async () => {}),
}));

const User = require('../../../src/models/User');
const tokenService = require('../../../src/services/tokenService');
const emailService = require('../../../src/services/emailService');
const authController = require('../../../src/controllers/authController');

describe('Auth Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      cookies: {},
      query: {},
      get: jest.fn(() => 'test-agent'),
      ip: '127.0.0.1',
      user: undefined,
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
      redirect: jest.fn(),
    };
  });

  describe('register', () => {
    it('should register a new user and send a verification email', async () => {
      req.body = { name: 'Test User', email: 'test@test.com', password: 'password123' };

      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@test.com',
        emailVerified: false,
      };
      User.create.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedPassword');

      await authController.register(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 12);
      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully. Please verify your email address.',
      });
    });

    it('should return 400 on duplicate email', async () => {
      req.body = { name: 'Test', email: 'existing@test.com', password: 'password123' };

      User.create.mockRejectedValue({ code: 11000 });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Registration failed. Please try again.',
      });
    });
  });

  describe('login', () => {
    it('should login with valid credentials and set cookies', async () => {
      req.body = { email: 'test@test.com', password: 'password123' };

      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@test.com',
        password: 'hashedPassword',
        emailVerified: true,
      };

      User.findOne.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

      await authController.login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(tokenService.setAccessTokenCookie).toHaveBeenCalled();
      expect(tokenService.setRefreshTokenCookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accessToken: 'access-token',
        user: { id: 'user123', name: 'Test User', email: 'test@test.com', emailVerified: true },
      });
    });

    it('should return 401 for invalid email', async () => {
      req.body = { email: 'wrong@test.com', password: 'password123' };

      User.findOne.mockResolvedValue(null);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
      });
    });

    it('should return 401 for wrong password', async () => {
      req.body = { email: 'test@test.com', password: 'wrongpassword' };

      User.findOne.mockResolvedValue({ _id: 'user123', password: 'hashedPassword' });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      await authController.login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid credentials',
      });
    });
  });

  describe('logout', () => {
    it('should revoke the refresh token and clear cookies', async () => {
      req.cookies.refreshToken = 'refresh-token';
      req.user = { _id: 'user123' };

      await authController.logout(req, res);

      expect(tokenService.revokeRefreshToken).toHaveBeenCalledWith('refresh-token');
      expect(tokenService.clearAuthCookies).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Logged out successfully',
      });
    });
  });

  describe('refreshToken', () => {
    it('should return 401 if no refresh token cookie', async () => {
      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Refresh token missing',
      });
    });

    it('should issue new tokens with a valid refresh token', async () => {
      req.cookies.refreshToken = 'validRefreshToken';

      tokenService.verifyRefreshToken.mockResolvedValue({ id: 'user123', tokenId: 'tokenId-123' });
      User.findById.mockResolvedValue({ _id: 'user123' });

      await authController.refreshToken(req, res);

      expect(tokenService.deleteRefreshToken).toHaveBeenCalledWith('tokenId-123');
      expect(tokenService.setAccessTokenCookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accessToken: 'access-token',
      });
    });

    it('should return 401 with an invalid refresh token', async () => {
      req.cookies.refreshToken = 'invalid';

      tokenService.verifyRefreshToken.mockResolvedValue(null);

      await authController.refreshToken(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('forgotPassword', () => {
    it('should send a reset link when the account exists', async () => {
      req.body = { email: 'test@test.com' };

      User.findOne.mockResolvedValue({
        _id: 'user123',
        name: 'Test User',
        email: 'test@test.com',
        save: jest.fn().mockResolvedValue(),
      });

      await authController.forgotPassword(req, res);

      expect(emailService.sendEmail).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists for that email, a password reset link has been sent.',
      });
    });

    it('should respond generically when the account does not exist', async () => {
      req.body = { email: 'missing@test.com' };

      User.findOne.mockResolvedValue(null);

      await authController.forgotPassword(req, res);

      expect(emailService.sendEmail).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'If an account exists for that email, a password reset link has been sent.',
      });
    });
  });

  describe('resetPassword', () => {
    it('should reset the password and revoke tokens', async () => {
      req.body = { token: 'valid-token-32-chars-minimum', newPassword: 'NewPassword123' };

      User.findOne.mockResolvedValue({
        _id: 'user123',
        save: jest.fn().mockResolvedValue(),
        set: jest.fn(),
      });
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('newHashed');

      await authController.resetPassword(req, res);

      expect(User.findOne).toHaveBeenCalled();
      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('user123');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password reset successfully. Please log in.',
      });
    });

    it('should return 400 for an invalid token', async () => {
      req.body = { token: 'invalid', newPassword: 'NewPassword123' };

      User.findOne.mockResolvedValue(null);

      await authController.resetPassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('changePassword', () => {
    it('should change the password and revoke tokens', async () => {
      req.user = { _id: 'user123' };
      req.body = { currentPassword: 'OldPassword123', newPassword: 'NewPassword123' };

      User.findById.mockResolvedValue({
        _id: 'user123',
        password: 'oldHashed',
        save: jest.fn().mockResolvedValue(),
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('newHashed');

      await authController.changePassword(req, res);

      expect(tokenService.revokeAllUserTokens).toHaveBeenCalledWith('user123');
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'Password changed successfully. Please log in again.',
      });
    });

    it('should return 400 when the current password is wrong', async () => {
      req.user = { _id: 'user123' };
      req.body = { currentPassword: 'WrongPassword123', newPassword: 'NewPassword123' };

      User.findById.mockResolvedValue({
        _id: 'user123',
        password: 'oldHashed',
        save: jest.fn(),
      });
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false);

      await authController.changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'Current password is incorrect',
      });
    });
  });
});
