const { logger } = require('../config/logger');
const axios = require('axios');
const JobListing = require('../models/JobListing');
const { computeEmbedding } = require('./embeddingService');
const { DOMAIN_KEYWORDS } = require('./resumeQueryService');

const JSEARCH_API_KEY = process.env.JSEARCH_API_KEY;
const JSEARCH_BASE_URL = 'https://jsearch.p.rapidapi.com';

function determineDomainFromTitle(title) {
  const lower = (title || '').toLowerCase();
  let bestDomain = null;
  let bestLen = 0;
  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw) && kw.length > bestLen) {
        bestDomain = domain;
        bestLen = kw.length;
      }
    }
  }
  logger.debug(`jobIngestionService: title="${title}" -> domain=${bestDomain} (matched ${bestLen} chars)`);
  return bestDomain;
}

function normalizeJob(raw) {
  const title = raw.job_title || raw.title || '';
  const description = raw.job_description || raw.description || '';
  const domain = determineDomainFromTitle(title);

  return {
    title,
    company: raw.employer_name || raw.company || '',
    location: [raw.job_city, raw.job_state, raw.job_country].filter(Boolean).join(', ') || raw.location || '',
    description: (description || '').substring(0, 10000),
    domain,
    skills: [],
    externalId: String(raw.job_id || raw.id || `ingest_${Date.now()}_${Math.random()}`),
    source: 'jsearch',
    jobUrl: raw.job_apply_link || raw.jobUrl || '',
    companyLogo: raw.employer_logo || '',
    salary: {
      min: raw.job_min_salary || null,
      max: raw.job_max_salary || null,
      currency: raw.job_salary_currency || 'USD',
    },
    jobType: normalizeJobType(raw.job_employment_type || raw.jobType),
    experienceLevel: normalizeExpLevel(raw),
    workType: raw.job_is_remote ? 'remote' : 'onsite',
    postedDate: raw.job_posted_at_datetime_utc || raw.postedDate || new Date(),
    isActive: true,
  };
}

function normalizeJobType(type) {
  const map = {
    fulltime: 'full-time',
    parttime: 'part-time',
    contractor: 'contract',
    temporary: 'temporary',
    internship: 'internship',
  };
  return map[(type || '').toLowerCase().replace(/[^a-z]/g, '')] || 'full-time';
}

function normalizeExpLevel(raw) {
  const title = (raw.job_title || '').toLowerCase();
  if (/senior|sr\.|lead|principal|head|director|manager/.test(title)) return 'senior';
  if (/junior|jr\.|entry|graduate|intern/.test(title)) return 'entry';
  if (/mid|intermediate/.test(title)) return 'mid';
  return 'mid';
}

async function ingestJob(raw) {
  const jobData = normalizeJob(raw);

  if (!jobData.domain) {
    logger.debug(`jobIngestionService: skipping "${jobData.title}" — no domain match`);
    return null;
  }

  const embedText = `${jobData.title} ${jobData.description}`.substring(0, 8000);
  jobData.embedding = await computeEmbedding(embedText);

  try {
    const job = await JobListing.findOneAndUpdate(
      { externalId: jobData.externalId },
      { $set: jobData },
      { upsert: true, new: true }
    );
    logger.info(`jobIngestionService: saved "${jobData.title}" (${jobData.domain}) [${jobData.externalId}]`);
    return job;
  } catch (err) {
    logger.error(`jobIngestionService: failed to save "${jobData.title}": ${err.message}`);
    return null;
  }
}

async function searchAndIngest(query, location = 'Nigeria', numPages = 1) {
  if (!JSEARCH_API_KEY) {
    logger.warn('jobIngestionService: JSEARCH_API_KEY not set, skipping');
    return [];
  }

  const results = [];
  for (let page = 1; page <= numPages; page++) {
    logger.info(`jobIngestionService: searching query="${query}" location="${location}" page=${page}`);
    try {
      const response = await axios.get(`${JSEARCH_BASE_URL}/search`, {
        params: { query, location, page, num_pages: 1 },
        headers: {
          'X-RapidAPI-Key': JSEARCH_API_KEY,
          'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
        },
      });

      const jobs = response.data?.data || [];
      logger.info(`jobIngestionService: found ${jobs.length} results for "${query}"`);

      for (const raw of jobs) {
        const job = await ingestJob(raw);
        if (job) results.push(job);
      }
    } catch (err) {
      logger.error(`jobIngestionService: query "${query}" failed: ${err.message}`);
    }
  }
  return results;
}

async function runIngestionCycle() {
  logger.info('jobIngestionService: === STARTING INGESTION CYCLE ===');

  const QUERIES_BY_DOMAIN = {
    'Software Engineering': [
      'software engineer',
      'developer',
      'backend developer',
      'frontend developer',
      'full stack developer',
      'devops engineer',
    ],
    'Data / Analytics': ['data scientist', 'data engineer', 'data analyst'],
    'Design / UX': ['ui designer', 'ux designer', 'product designer'],
    'Product Management': ['product manager'],
    Marketing: ['marketing manager', 'digital marketing manager'],
    Sales: ['sales representative', 'account executive', 'business development'],
    'Finance / Accounting': ['accountant', 'financial analyst', 'finance manager'],
    'Human Resources': ['hr manager', 'recruiter', 'human resources'],
    'Operations / Admin': ['operations manager', 'office manager', 'administrative assistant'],
    Healthcare: ['registered nurse', 'nurse', 'healthcare', 'medical assistant', 'pharmacist'],
    Education: ['teacher', 'instructor', 'professor', 'education coordinator'],
    Legal: ['lawyer', 'paralegal', 'legal assistant', 'attorney'],
    'Construction / Engineering': ['civil engineer', 'mechanical engineer', 'construction manager'],
    'Customer Support': ['customer support', 'customer service representative', 'support specialist'],
    'Content / Writing': ['content writer', 'copywriter', 'editor', 'journalist'],
  };

  let total = 0;
  for (const [domain, queries] of Object.entries(QUERIES_BY_DOMAIN)) {
    logger.info(`Domain: ${domain}`);
    for (const query of queries) {
      const jobs = await searchAndIngest(query, 'Nigeria', 1);
      total += jobs.length;
    }
  }

  logger.info(`jobIngestionService: === CYCLE COMPLETE: ${total} jobs ingested ===`);
  return total;
}

module.exports = { ingestJob, searchAndIngest, runIngestionCycle, normalizeJob, determineDomainFromTitle };
