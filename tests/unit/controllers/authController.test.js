const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

jest.mock('../../../src/models/User');

const User = require('../../../src/models/User');
const authController = require('../../../src/controllers/authController');

describe('Auth Controller', () => {
  let req, res;

  beforeEach(() => {
    jest.clearAllMocks();

    req = {
      body: {},
      cookies: {},
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      cookie: jest.fn(),
      clearCookie: jest.fn(),
    };
  });

  describe('register', () => {
    it('should register a new user', async () => {
      req.body = { name: 'Test User', email: 'test@test.com', password: 'password123' };

      User.findOne.mockResolvedValue(null);
      User.prototype.save = jest.fn().mockResolvedValue();
      jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashedPassword');

      await authController.register(req, res);

      expect(bcrypt.hash).toHaveBeenCalledWith('password123', 10);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        message: 'User registered successfully',
      });
    });

    it('should return 400 if user already exists', async () => {
      req.body = { name: 'Test User', email: 'existing@test.com', password: 'password123' };

      User.findOne.mockResolvedValue({ email: 'existing@test.com' });

      await authController.register(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        message: 'User already exists',
      });
    });
  });

  describe('login', () => {
    it('should login with valid credentials', async () => {
      req.body = { email: 'test@test.com', password: 'password123' };

      const mockUser = {
        _id: 'user123',
        name: 'Test User',
        email: 'test@test.com',
        password: 'hashedPassword',
      };

      User.findOne.mockResolvedValue(mockUser);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);
      jest.spyOn(jwt, 'sign').mockReturnValue('token123');

      await authController.login(req, res);

      expect(bcrypt.compare).toHaveBeenCalledWith('password123', 'hashedPassword');
      expect(res.cookie).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accessToken: 'token123',
        user: { id: 'user123', name: 'Test User', email: 'test@test.com' },
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
    it('should clear refresh token cookie', async () => {
      await authController.logout(req, res);

      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
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

    it('should issue new access token with valid refresh token', async () => {
      req.cookies.refreshToken = 'validRefreshToken';

      jest.spyOn(jwt, 'verify').mockReturnValue({ id: 'user123' });
      User.findById.mockResolvedValue({ _id: 'user123' });
      jest.spyOn(jwt, 'sign').mockReturnValue('newAccessToken');

      await authController.refreshToken(req, res);

      expect(jwt.verify).toHaveBeenCalledWith('validRefreshToken', process.env.JWT_REFRESH_SECRET);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        accessToken: 'newAccessToken',
        tokenId: expect.any(String),
      });
    });
  });
});
