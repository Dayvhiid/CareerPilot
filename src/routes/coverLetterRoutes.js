const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { uploadLimiter, apiLimiter } = require('../middleware/rateLimiters');
const { coverLetterValidators } = require('../middleware/validators');
const {
  generateCoverLetter,
  testHuggingFace,
  downloadCoverLetter
} = require('../controllers/coverLetterController');

// Cover letter routes with authentication and rate limiting
router.post('/generate/:jobId', auth, uploadLimiter, coverLetterValidators.generate, generateCoverLetter);
router.post('/download', auth, downloadCoverLetter);
router.get('/test', auth, apiLimiter, testHuggingFace);

module.exports = router;