const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const multer = require('multer');
const { chatbotLimiter, uploadLimiter } = require('../middleware/rateLimiters');
const { chatbotValidators } = require('../middleware/validators');
const {
  processMessage,
  startConversation,
  generateResume,
  getProgress,
  listConversations,
  getConversation,
  downloadResume,
  transcribeAudio,
  synthesizeSpeech
} = require('../controllers/chatbotController');

// Configure multer for audio file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Chatbot routes with authentication and rate limiting
router.post('/start', auth, startConversation);
router.post('/message', auth, chatbotLimiter, chatbotValidators.message, processMessage);
router.post('/generate', auth, uploadLimiter, generateResume);
// List all conversations for the user
router.get('/conversations', auth, listConversations);

// Get a specific conversation with full message history
router.get('/conversations/:sessionId', auth, getConversation);

// Get conversation progress
router.get('/progress', auth, getProgress);

// Download generated resume
router.get('/download', auth, downloadResume);

// Voice endpoints
router.post('/transcribe', auth, uploadLimiter, upload.single('audio'), transcribeAudio);
router.post('/speak', auth, synthesizeSpeech);

module.exports = router;