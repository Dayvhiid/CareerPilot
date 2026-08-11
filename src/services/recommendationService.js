const Resume = require('../models/Resume');
const resumeQueryService = require('./resumeQueryService');
const jobRetrievalService = require('./jobRetrievalService');
const jobRankingService = require('./jobRankingService');

function toJobCard(job) {
  const salary = job.salary || {};
  return {
    _id: job._id,
    title: job.title,
    company: job.company,
    companyLogo: job.companyLogo,
    location: job.location,
    jobUrl: job.jobUrl,
    applyUrl: job.jobUrl,
    jobType: job.jobType,
    employmentType: job.jobType,
    experienceLevel: job.experienceLevel,
    workType: job.workType,
    postedDate: job.postedDate,
    salary,
    salaryMin: salary.min || null,
    salaryMax: salary.max || null,
    skills: (job.skills || []).slice(0, 10),
    description: (job.description || '').substring(0, 500),
    matchScore: job.matchScore,
    matchReasons: job.matchReasons || [],
    matchedSkills: job.matchedSkills || [],
    missingSkills: job.missingSkills || [],
    careerFit: job.careerFit,
  };
}

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
      message:
        'Could not determine job domain from resume. Update your resume with a current job title or relevant skills.',
      generatedAt: new Date().toISOString(),
    };
  }

  const jobs = await jobRetrievalService.retrieve(query);
  const scored = await jobRankingService.rerank(ed, jobs, query.domain);
  const sorted = scored.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  return {
    jobs: sorted.map(toJobCard),
    totalResults: sorted.length,
    domain: query.domain,
    generatedAt: new Date().toISOString(),
  };
}

module.exports = { getRecommendations };
