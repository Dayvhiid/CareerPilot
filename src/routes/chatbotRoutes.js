const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  processMessage,
  startConversation,
  generateResume,
  getProgress,
  downloadResume
} = require('../controllers/chatbotController');

// Chatbot routes - Temporarily removing auth for testing
router.post('/start', startConversation);
router.post('/message', processMessage);
router.post('/generate', generateResume);
// Get conversation progress
router.get('/progress', getProgress);

// Download generated resume
router.get('/download', downloadResume);

module.exports = router;

// Original routes with auth (uncomment when ready):
// router.post('/start', auth, startConversation);
// router.post('/message', auth, processMessage);
// router.post('/generate', auth, generateResume);
// router.get('/progress/:sessionId', auth, getProgress);

module.exports = router;