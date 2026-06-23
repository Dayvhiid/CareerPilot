const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const { cacheLimiter, apiLimiter } = require('../middleware/rateLimiters');
const { jobValidators } = require('../middleware/validators');
const {
  searchJobs,
  getRecommendedJobs,
  getResumeBasedJobs,
  bookmarkJob,
  markJobApplied,
  getJobDetails,
  getCacheStats,
  clearCache
} = require('../controllers/jobController');

// Routes with authentication and rate limiting
// Specific routes must come before parameterized routes
router.get('/search', auth, apiLimiter, jobValidators.search, searchJobs);
router.get('/recommended', auth, apiLimiter, getRecommendedJobs);
router.get('/resume-based', auth, apiLimiter, getResumeBasedJobs);

// Cache management routes (admin only, rate limited)
router.get('/cache/stats', auth, cacheLimiter, getCacheStats);
router.delete('/cache/clear', auth, cacheLimiter, clearCache);

router.post('/:jobId/bookmark', auth, apiLimiter, bookmarkJob);
router.post('/:jobId/apply', auth, apiLimiter, markJobApplied);
router.get('/:jobId', auth, apiLimiter, getJobDetails); // This must come last

module.exports = router;