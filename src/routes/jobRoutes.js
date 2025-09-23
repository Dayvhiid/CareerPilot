const express = require('express');
const router = express.Router();
const auth = require('../middleware/authMiddleware');
const {
  searchJobs,
  getRecommendedJobs,
  getResumeBasedJobs,
  bookmarkJob,
  markJobApplied,
  getJobDetails
} = require('../controllers/jobController');

// Routes - Temporarily removing auth for testing
// Note: Specific routes must come before parameterized routes
router.get('/search', searchJobs);
router.get('/recommended', getRecommendedJobs);
router.get('/resume-based', getResumeBasedJobs);
router.post('/:jobId/bookmark', bookmarkJob);
router.post('/:jobId/apply', markJobApplied);
router.get('/:jobId', getJobDetails); // This must come last

// Original routes with auth (uncomment when ready):
// router.get('/search', auth, searchJobs);
// router.get('/recommended', auth, getRecommendedJobs);
// router.get('/:jobId', auth, getJobDetails);
// router.post('/:jobId/bookmark', auth, bookmarkJob);
// router.post('/:jobId/apply', auth, markJobApplied);

module.exports = router;