const UserJob = require('../models/UserJob');
const JobListing = require('../models/JobListing');
const resumeQueryService = require('../services/resumeQueryService');
const jobRetrievalService = require('../services/jobRetrievalService');
const jobRankingService = require('../services/jobRankingService');
const jobIngestionService = require('../services/jobIngestionService');
const cacheService = require('../services/cacheService');
const recommendationService = require('../services/recommendationService');

const CACHE_TTL = {
  recommendations: 18 * 60 * 60,
  jobDetails: 60 * 60,
};

exports.getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;
    const cacheKey = `recommendations:${userId}`;

    const result = await cacheService.getOrSet(cacheKey, CACHE_TTL.recommendations, async () => {
      const data = await recommendationService.getRecommendations(userId);
      if (data.message === 'Upload a resume first') {
        return data;
      }
      return data;
    });

    if (result.message === 'Upload a resume first') {
      return res.status(404).json({ success: false, message: result.message });
    }

    return res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error(`recommendationController.getRecommendations: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to get recommendations' });
  }
};

exports.getJobDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const jobId = req.params.jobId;

    const [job] = await Promise.all([
      jobRetrievalService.retrieveById(jobId),
      UserJob.findOneAndUpdate(
        { userId, jobId },
        { userId, jobId, status: 'viewed' },
        { upsert: true }
      )
    ]);

    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    return res.json({ success: true, job });
  } catch (err) {
    console.error(`recommendationController.getJobDetails: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.bookmarkJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const existing = await UserJob.findOne({ userId, jobId: req.params.jobId });
    const newStatus = !existing || existing.status !== 'bookmarked' ? 'bookmarked' : 'viewed';

    await UserJob.findOneAndUpdate(
      { userId, jobId: req.params.jobId },
      { userId, jobId: req.params.jobId, status: newStatus },
      { upsert: true }
    );

    return res.json({ success: true, bookmarked: newStatus === 'bookmarked' });
  } catch (err) {
    console.error(`recommendationController.bookmarkJob: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.markApplied = async (req, res) => {
  try {
    const userId = req.user.id;
    await UserJob.findOneAndUpdate(
      { userId, jobId: req.params.jobId },
      { userId, jobId: req.params.jobId, status: 'applied', appliedDate: new Date() },
      { upsert: true }
    );
    return res.json({ success: true, message: 'Marked as applied' });
  } catch (err) {
    console.error(`recommendationController.markApplied: ${err.message}`);
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.triggerIngestion = async (req, res) => {
  jobIngestionService.runIngestionCycle().then(count => {
    console.log(`recommendationController: manual ingestion complete — ${count} jobs`);
    cacheService.invalidate('recommendations:*').then(() => {
      console.log('recommendationController: flushed all recommendation caches after ingestion');
    });
  }).catch(err => {
    console.error(`recommendationController: manual ingestion failed — ${err.message}`);
  });
  return res.json({ success: true, message: 'Ingestion started in background' });
};
