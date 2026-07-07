const Resume = require('../models/Resume');
const UserJob = require('../models/UserJob');
const JobListing = require('../models/JobListing');
const resumeQueryService = require('../services/resumeQueryService');
const jobRetrievalService = require('../services/jobRetrievalService');
const jobRankingService = require('../services/jobRankingService');
const jobIngestionService = require('../services/jobIngestionService');
const cache = require('../config/redis');

const CACHE_TTL = 18 * 60 * 60;

exports.getRecommendations = async (req, res) => {
  try {
    const userId = req.user.id;

    const cached = await cache.get(`recommendations:${userId}`);
    if (cached) {
      console.log(`recommendationController: cache HIT for userId=${userId}`);
      return res.json(cached);
    }

    const resume = await Resume.findOne({ userId });
    if (!resume || !resume.extractedData) {
      return res.status(404).json({ success: false, message: 'Upload a resume first' });
    }

    const ed = resume.extractedData;
    const query = resumeQueryService.extractQuery(ed);

    if (!query.domain) {
      console.log(`recommendationController: no domain determined for userId=${userId} — returning empty`);
      return res.json({
        success: true,
        jobs: [],
        totalResults: 0,
        domain: null,
        message: 'Could not determine job domain from resume. Update your resume with a current job title or relevant skills.',
        generatedAt: new Date().toISOString()
      });
    }

    console.log(`recommendationController: userId=${userId} domain=${query.domain} keywords=${query.keywords.join(',')}`);

    const jobs = await jobRetrievalService.retrieve(query);
    const scored = await jobRankingService.rerank(ed, jobs, query.domain);
    const sorted = scored.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

    const responseBody = {
      success: true,
      jobs: sorted,
      totalResults: sorted.length,
      domain: query.domain,
      generatedAt: new Date().toISOString()
    };

    await cache.set(`recommendations:${userId}`, responseBody, CACHE_TTL);

    return res.json(responseBody);
  } catch (error) {
    console.error(`recommendationController.getRecommendations: ${error.message}`);
    return res.status(500).json({ success: false, message: 'Failed to get recommendations' });
  }
};

exports.getJobDetails = async (req, res) => {
  try {
    const userId = req.user.id;
    const job = await jobRetrievalService.retrieveById(req.params.jobId);
    if (!job) return res.status(404).json({ success: false, message: 'Job not found' });

    await UserJob.findOneAndUpdate(
      { userId, jobId: job._id },
      { userId, jobId: job._id, status: 'viewed' },
      { upsert: true }
    );

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
    cache.del('recommendations:*').then(() => {
      console.log('recommendationController: flushed all recommendation caches after ingestion');
    });
  }).catch(err => {
    console.error(`recommendationController: manual ingestion failed — ${err.message}`);
  });
  return res.json({ success: true, message: 'Ingestion started in background' });
};
