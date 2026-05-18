const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const multer = require('multer');
const {
  processMessage,
  startConversation,
  generateResume,
  getProgress,
  downloadResume,
  transcribeAudio,
  synthesizeSpeech
} = require('../controllers/chatbotController');

// Configure multer for audio file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Chatbot routes - Temporarily removing auth for testing
router.post('/start', startConversation);
router.post('/message', processMessage);
router.post('/generate', generateResume);
// Get conversation progress
router.get('/progress', getProgress);

// Download generated resume
router.get('/download', downloadResume);

// Voice endpoints
router.post('/transcribe', upload.single('audio'), transcribeAudio);
router.post('/speak', synthesizeSpeech);

module.exports = router;

// Original routes with auth (uncomment when ready):
// router.post('/start', auth, startConversation);
// router.post('/message', auth, processMessage);
// router.post('/generate', auth, generateResume);
// router.get('/progress/:sessionId', auth, getProgress);

module.exports = router;