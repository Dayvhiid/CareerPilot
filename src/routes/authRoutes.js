const express = require("express");
const router = express.Router();
const cookieParser = require('cookie-parser');
const { register, login, refreshToken, logout } = require("../controllers/authController");
const { authValidators } = require("../middleware/validators");
const { authLimiter, registrationLimiter } = require("../middleware/rateLimiters");

// Parse cookies
router.use(cookieParser());

// Routes with rate limiting and validation
router.post("/register", registrationLimiter, authValidators.register, register);
router.post("/login", authLimiter, authValidators.login, login);
router.post("/refresh", refreshToken);
router.post("/logout", logout);

module.exports = router;
