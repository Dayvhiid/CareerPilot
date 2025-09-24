const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  generateCoverLetter,
  testHuggingFace
} = require('../controllers/coverLetterController');

// Cover letter routes - Temporarily removing auth for testing
router.post('/generate/:jobId', generateCoverLetter);
router.get('/test', testHuggingFace);

// Original routes with auth (uncomment when ready):
// router.post('/generate/:jobId', auth, generateCoverLetter);
// router.get('/test', auth, testHuggingFace);

module.exports = router;