const Resume = require('../models/Resume');
const resumeQueryService = require('./resumeQueryService');
const jobRetrievalService = require('./jobRetrievalService');
const jobRankingService = require('./jobRankingService');

async function getRecommendations(userId) {
  const resume = await Resume.findOne({ userId }).lean();
  if (!resume || !resume.extractedData) {
    return { jobs: [], totalResults: 0, domain: null, message: 'Upload a resume first' };
  }

  const ed = resume.extractedData;
  const query = resumeQueryService.extractQuery(ed);

  if (!query.domain) {
    return {
      jobs: [],
      totalResults: 0,
      domain: null,
      message: 'Could not determine job domain from resume. Update your resume with a current job title or relevant skills.',
      generatedAt: new Date().toISOString()
    };
  }

  const jobs = await jobRetrievalService.retrieve(query);
  const scored = await jobRankingService.rerank(ed, jobs, query.domain);
  const sorted = scored.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return {
    jobs: sorted,
    totalResults: sorted.length,
    domain: query.domain,
    generatedAt: new Date().toISOString()
  };
}

module.exports = { getRecommendations };
