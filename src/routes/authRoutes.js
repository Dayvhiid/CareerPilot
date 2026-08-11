const express = require('express');
const router = express.Router();
const cookieParser = require('cookie-parser');
const {
  register,
  login,
  refreshToken,
  logout,
  changePassword,
  verifyEmail,
  resendVerification,
  forgotPassword,
  resetPassword,
} = require('../controllers/authController');
const auth = require('../middleware/auth');
const { authValidators } = require('../middleware/validators');
const {
  authLimiter,
  refreshLimiter,
  forgotPasswordLimiter,
  resetPasswordLimiter,
  registrationLimiter,
} = require('../middleware/rateLimiters');

// Parse cookies
router.use(cookieParser());

// Routes with rate limiting and validation
router.post('/register', registrationLimiter, authValidators.register, register);
router.post('/login', authLimiter, authValidators.login, login);
router.post('/refresh', refreshLimiter, refreshToken);
router.post('/logout', authLimiter, logout);
router.post('/change-password', auth, authLimiter, authValidators.changePassword, changePassword);

// Email verification
router.get('/verify-email', verifyEmail);
router.post('/resend-verification', forgotPasswordLimiter, authValidators.verifyEmail, resendVerification);

// Password reset
router.post('/forgot-password', forgotPasswordLimiter, authValidators.forgotPassword, forgotPassword);
router.post('/reset-password', resetPasswordLimiter, authValidators.resetPassword, resetPassword);

module.exports = router;
