const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { apiLimiter } = require('../middleware/rateLimiters');
const { jobValidators } = require('../middleware/validators');
const {
  getRecommendations,
  getJobDetails,
  bookmarkJob,
  markApplied,
  triggerIngestion,
} = require('../controllers/recommendationController');

router.get(['/', ''], auth, apiLimiter, getRecommendations);
router.get('/recommended', auth, apiLimiter, getRecommendations);
router.post('/ingest', auth, triggerIngestion);
router.get('/:jobId', auth, apiLimiter, jobValidators.getJobDetails, getJobDetails);
router.post('/:jobId/bookmark', auth, apiLimiter, jobValidators.bookmark, bookmarkJob);
router.post('/:jobId/apply', auth, apiLimiter, jobValidators.markApplied, markApplied);

module.exports = router;
