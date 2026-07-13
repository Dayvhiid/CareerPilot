const { logger } = require('../config/logger');
const DOMAINS = [
  'Software Engineering', 'Data / Analytics', 'Design / UX', 'Product Management',
  'Marketing', 'Sales', 'Finance / Accounting', 'Human Resources',
  'Operations / Admin', 'Healthcare', 'Education', 'Legal',
  'Construction / Engineering', 'Customer Support', 'Content / Writing', 'Other'
];

const DOMAIN_KEYWORDS = {
  'Software Engineering': ['software engineer', 'developer', 'engineer', 'programmer', 'full stack', 'frontend', 'backend', 'devops', 'sre', 'mobile developer', 'react developer', 'node developer', 'python developer', 'java developer'],
  'Data / Analytics': ['data scientist', 'data engineer', 'data analyst', 'analyst', 'machine learning', 'ml engineer', 'ai engineer', 'data'],
  'Design / UX': ['designer', 'ux', 'ui', 'product design', 'graphic design', 'figma', 'visual design'],
  'Product Management': ['product manager', 'product owner', 'program manager', 'product'],
  'Marketing': ['marketing', 'seo', 'content marketing', 'growth', 'brand manager', 'digital marketing'],
  'Sales': ['sales', 'account executive', 'bdr', 'sdr', 'business development', 'account manager'],
  'Finance / Accounting': ['finance', 'accountant', 'controller', 'auditor', 'financial analyst', 'accounting'],
  'Human Resources': ['hr', 'human resources', 'recruiter', 'talent acquisition', 'people'],
  'Operations / Admin': ['operations', 'admin', 'coordinator', 'office manager', 'administrative'],
  'Healthcare': ['nurse', 'doctor', 'medical', 'healthcare', 'clinical', 'pharma'],
  'Education': ['teacher', 'instructor', 'professor', 'education', 'lecturer'],
  'Legal': ['lawyer', 'attorney', 'legal', 'paralegal', 'counsel', 'solicitor'],
  'Construction / Engineering': ['civil engineer', 'mechanical engineer', 'construction', 'architect'],
  'Customer Support': ['customer support', 'customer service', 'support engineer', 'help desk'],
  'Content / Writing': ['writer', 'content', 'copywriter', 'editor', 'journalist']
};

function determineDomain(resumeData) {
  const title = (resumeData.currentJobTitle || '').toLowerCase();
  const titles = (resumeData.jobTitles || []).map(t => t.toLowerCase());

  if (title) {
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (title.includes(keyword)) {
          logger.debug(`resumeQueryService: domain from currentTitle="${title}" -> ${domain} (keyword="${keyword}")`);
          return domain;
        }
      }
    }
  }

  for (const t of titles) {
    for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
      for (const keyword of keywords) {
        if (t.includes(keyword)) {
          logger.debug(`resumeQueryService: domain from pastTitle="${t}" -> ${domain} (keyword="${keyword}")`);
          return domain;
        }
      }
    }
  }

  logger.debug('resumeQueryService: no domain match found for any title or skill');
  return null;
}

function extractQuery(resumeData) {
  const domain = determineDomain(resumeData);
  const location = resumeData.location || 'Nigeria';

  if (!domain) {
    logger.warn('resumeQueryService: no domain determined — returning null query');
    return { domain: null, keywords: [], location };
  }

  const topSkills = (resumeData.skills || []).slice(0, 5);
  const jobTitles = (resumeData.jobTitles || []).slice(0, 3);
  const currentTitle = resumeData.currentJobTitle || jobTitles[0] || '';

  const keywords = [...new Set([
    ...currentTitle.split(/\s+/).filter(w => w.length > 3),
    ...topSkills,
    ...jobTitles.flatMap(t => t.split(/\s+/).filter(w => w.length > 3))
  ])].slice(0, 10);

  logger.info(`resumeQueryService: extracted query — domain=${domain} keywords=[${keywords.join(', ')}] location=${location}`);
  return { domain, keywords, location };
}

module.exports = { extractQuery, determineDomain, DOMAINS, DOMAIN_KEYWORDS };
