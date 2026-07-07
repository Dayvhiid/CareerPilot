const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiters');
const {
  getRecommendations,
  getJobDetails,
  bookmarkJob,
  markApplied,
  triggerIngestion
} = require('../controllers/recommendationController');

router.get(['/', ''], auth, apiLimiter, getRecommendations);
router.get('/recommended', auth, apiLimiter, getRecommendations);
router.post('/ingest', auth, triggerIngestion);
router.get('/:jobId', auth, apiLimiter, getJobDetails);
router.post('/:jobId/bookmark', auth, apiLimiter, bookmarkJob);
router.post('/:jobId/apply', auth, apiLimiter, markApplied);

module.exports = router;
