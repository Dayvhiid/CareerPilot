const Job = require('../models/Job');
const JobMatch = require('../models/JobMatch');
const Resume = require('../models/Resume');
const jSearchService = require('../services/jSearchService');
const redisService = require('../services/redisService');
const natural = require('natural');
const mongoose = require('mongoose');



// Domain category keywords for structural classification
const CATEGORY_KEYWORDS = {
  'IT/Software': {
    keywords: ['software', 'developer', 'engineer', 'frontend', 'backend', 'full stack', 'react', 'node', 'python', 'java', 'javascript', 'typescript', 'web', 'app', 'coding', 'programming', 'it', 'database', 'devops', 'cloud', 'aws', 'azure', 'tech'],
    minMatches: 1
  },
  'Design/Creative': {
    keywords: ['designer', 'design', 'ux', 'ui', 'graphic', 'creative', 'photoshop', 'figma', 'illustrator', 'branding', 'visual', 'art', 'animation'],
    minMatches: 1
  },
  'Finance/Accounting': {
    keywords: ['accountant', 'accounting', 'finance', 'financial', 'cpa', 'bookkeeper', 'auditor', 'analyst', 'tax', 'payroll', 'banking', 'investment', 'forex'],
    minMatches: 1
  },
  'Sales/Marketing': {
    keywords: ['sales', 'marketing', 'seo', 'digital marketing', 'social media', 'sales representative', 'business development', 'account executive', 'brand', 'advertising'],
    minMatches: 1
  },
  'Construction/Engineering': {
    keywords: ['construction', 'engineer', 'civil', 'structural', 'architect', 'project manager', 'contractor', 'autocad', 'bim', 'welding', 'electrical', 'mechanical', 'building'],
    minMatches: 1
  },
  'Healthcare': {
    keywords: ['nurse', 'doctor', 'physician', 'healthcare', 'medical', 'therapist', 'pharmacist', 'dentist', 'psychiatrist', 'hospital', 'clinical'],
    minMatches: 1
  },
  'Operations/Admin': {
    keywords: ['operations', 'administrator', 'admin', 'executive assistant', 'office manager', 'coordinator', 'receptionist', 'human resources', 'hr'],
    minMatches: 1
  }
};

/**
 * Classify job into domain category based on title and description
 */
const classifyJobCategory = (jobTitle, jobDescription) => {
  const text = `${jobTitle} ${jobDescription}`.toLowerCase();
  let bestCategory = 'Other';
  let bestScore = 0;

  for (const [category, config] of Object.entries(CATEGORY_KEYWORDS)) {
    let matches = 0;
    config.keywords.forEach(keyword => {
      if (text.includes(keyword)) matches++;
    });

    if (matches >= config.minMatches && matches > bestScore) {
      bestScore = matches;
      bestCategory = category;
    }
  }

  return bestCategory;
};

/**
 * Determine resume category from parsed resume data
 */
const determineResumeCategory = (resumeData) => {
  if (!resumeData) return 'Other';

  const { jobTitles = [], skills = [], summary = '' } = resumeData;
  const text = `${jobTitles.join(' ')} ${skills.join(' ')} ${summary}`.toLowerCase();
  let bestCategory = 'Other';
  let bestScore = 0;

  for (const [category, config] of Object.entries(CATEGORY_KEYWORDS)) {
    let matches = 0;
    config.keywords.forEach(keyword => {
      if (text.includes(keyword)) matches++;
    });

    if (matches >= config.minMatches && matches > bestScore) {
      bestScore = matches;
      bestCategory = category;
    }
  }

  return bestCategory;
};

/**
 * Search and fetch jobs from external APIs
 */
exports.searchJobs = async (req, res) => {
  try {
    const {
      query = 'software developer',
      location = 'Nigeria',
      page = 1,
      jobType = 'all',
      experienceLevel = 'all',
      datePosted = 'all'
    } = req.query;

    console.log(`🔍 Job search request: "${query}" in ${location}`);

    // Search jobs using JSearch API
    const searchResult = await jSearchService.searchJobs({
      query,
      location,
      page: parseInt(page),
      jobType,
      experienceLevel,
      datePosted
    });

    if (!searchResult.success) {
      return res.status(400).json({
        success: false,
        message: 'Failed to fetch jobs',
        error: searchResult.error
      });
    }

    // Normalize job data
    const normalizedJobs = jSearchService.normalizeJobs(searchResult.data);

    // Save jobs to database (upsert to avoid duplicates)
    const savedJobs = [];
    for (const jobData of normalizedJobs) {
      try {
        // Classify job into domain category before saving
        jobData.category = classifyJobCategory(jobData.title, jobData.description);

        const job = await Job.findOneAndUpdate(
          { externalId: jobData.externalId },
          jobData,
          { 
            upsert: true, 
            new: true,
            runValidators: true
          }
        );
        savedJobs.push(job);
        console.log(`💾 Saved job: ${job.title} at ${job.company} [category: ${job.category}]`);
      } catch (saveError) {
        console.error(`❌ Failed to save job: ${jobData.title}`, saveError.message);
      }
    }

    res.json({
      success: true,
      jobs: savedJobs,
      totalResults: savedJobs.length,
      searchParams: {
        query,
        location,
        page,
        jobType,
        experienceLevel,
        datePosted
      }
    });

  } catch (error) {
    console.error('❌ Error in searchJobs:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Get Redis cache statistics
 */
exports.getCacheStats = async (req, res) => {
  try {
    const redisService = require('../services/redisService');
    const stats = await redisService.getCacheStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to get cache stats', error: error.message });
  }
};

/**
 * Clear Redis job cache
 */
exports.clearCache = async (req, res) => {
  try {
    const redisService = require('../services/redisService');
    const cleared = await redisService.clearJobsCache();
    res.json({ success: cleared, message: cleared ? 'Cache cleared' : 'Failed to clear cache' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to clear cache', error: error.message });
  }
};

/**
 * Get recommended jobs for user based on their resume
 */
exports.getRecommendedJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    console.log(` Getting recommended jobs for user: ${userId}`);

    // Get user's resume data
    const resume = await Resume.findOne({ userId });
    if (!resume || !resume.extractedData) {
    
      return await getRecentJobs(req, res);
    }

    // Find or create job matches
    await generateJobMatches(userId, resume.extractedData);

    // Get recommended jobs with match scores
    const jobMatches = await JobMatch.find({ userId })
      .populate('jobId')
      .sort({ matchScore: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const recommendedJobs = jobMatches
      .filter(match => match.jobId) // Ensure job exists
      .map(match => ({
        ...match.jobId.toObject(),
        matchScore: match.matchScore,
        matchReasons: match.matchReasons,
        skillsMatch: match.skillsMatch,
        isBookmarked: match.isBookmarked,
        status: match.status
      }));

    res.json({
      success: true,
      jobs: recommendedJobs,
      totalResults: recommendedJobs.length,
      hasMore: recommendedJobs.length === parseInt(limit),
      page: parseInt(page)
    });

  } catch (error) {
    console.error('❌ Error in getRecommendedJobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recommended jobs',
      error: error.message
    });
  }
};

/**
 * Get recent jobs when no resume data available
 */
const getRecentJobs = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    
    const jobs = await Job.find({ isActive: true })
      .sort({ postedDate: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      jobs: jobs.map(job => ({
        ...job.toObject(),
        matchScore: 0,
        matchReasons: [],
        status: 'general'
      })),
      totalResults: jobs.length,
      hasMore: jobs.length === parseInt(limit),
      page: parseInt(page)
    });

  } catch (error) {
    console.error('❌ Error in getRecentJobs:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get recent jobs',
      error: error.message
    });
  }
};

/**
 * Generate job matches based on user's resume
 * Skip irrelevant jobs (no meaningful skill/title overlap) to reduce noise
 */
const generateJobMatches = async (userId, resumeData) => {
  try {
    console.log(`🤖 Generating job matches for user: ${userId}`);

    const resumeCategory = determineResumeCategory(resumeData);
    console.log(`📂 Resume classified as: ${resumeCategory}`);

    // Get all active jobs
    const jobs = await Job.find({ isActive: true });
    console.log(`📊 Found ${jobs.length} active jobs to match against`);

    // Bulk fetch existing matches for the user to avoid N+1 lookups
    const jobIds = jobs.map(j => j._id);
    const existingMatchDocs = await JobMatch.find({ userId, jobId: { $in: jobIds } }, { jobId: 1 });
    const existingJobIds = new Set(existingMatchDocs.map(m => m.jobId.toString()));

    const newMatches = [];
    let skipped = 0;
    let categorySkipped = 0;

    for (const job of jobs) {
      if (existingJobIds.has(job._id.toString())) {
        continue;
      }

      if (resumeCategory !== 'Other' && job.category !== 'Other' && resumeCategory !== job.category) {
        console.log(`↩️ Skipped cross-domain match: resume[${resumeCategory}] ≠ job[${job.category}] - ${job.title} at ${job.company}`);
        categorySkipped++;
        continue;
      }

      const matchResult = calculateJobMatch(resumeData, job);

      if (matchResult.irrelevant) {
        console.log(`⏭️ Skipped irrelevant job: ${job.title}`);
        skipped++;
        continue;
      }

      newMatches.push({
        userId,
        jobId: job._id,
        matchScore: matchResult.totalScore,
        matchReasons: matchResult.reasons,
        skillsMatch: matchResult.skillsMatch,
        locationMatch: matchResult.locationMatch,
        experienceMatch: matchResult.experienceMatch,
        titleMatch: matchResult.titleMatch
      });
    }

    if (newMatches.length > 0) {
      await JobMatch.insertMany(newMatches, { ordered: false });
    }

    console.log(`📊 Match generation complete: ${newMatches.length} created, ${skipped} skipped as irrelevant, ${categorySkipped} skipped as cross-domain`);

  } catch (error) {
    console.error('❌ Error generating job matches:', error);
  }
};

/**
 * Calculate job match score based on resume data
 * Hard gate: zero meaningful skill/title overlap → irrelevant, don't store match
 */
const calculateJobMatch = (resumeData, job) => {
  const weights = {
    skills: 0.50,
    title: 0.30,
    experience: 0.10,
    location: 0.10
  };

  // Skills matching
  const skillsMatch = calculateSkillsMatch(resumeData.skills || [], job.skills || []);

  // Title matching
  const titleMatch = calculateTitleMatch(resumeData.jobTitles || [], job.title);

  // Experience matching
  const experienceMatch = calculateExperienceMatch(resumeData, job);

  // Location matching
  const locationMatch = calculateLocationMatch(resumeData.location || '', job.location);

  // HARD GATE: no skill overlap AND no meaningful title overlap = irrelevant.
  // Don't let location/experience defaults rescue an irrelevant job.
  const irrelevant = skillsMatch.matched.length === 0 && titleMatch < 50;

  if (irrelevant) {
    return {
      totalScore: 0,
      irrelevant: true,
      reasons: [],
      skillsMatch,
      titleMatch,
      experienceMatch,
      locationMatch
    };
  }

  // Calculate total score
  const totalScore = Math.round(
    (skillsMatch.score * weights.skills) +
    (titleMatch * weights.title) +
    (experienceMatch * weights.experience) +
    (locationMatch * weights.location)
  );

  // Generate reasons
  const reasons = [];
  if (skillsMatch.matched.length > 0) {
    reasons.push(`${skillsMatch.matched.length} matching skills: ${skillsMatch.matched.slice(0, 3).join(', ')}`);
  }
  if (titleMatch > 70) {
    reasons.push('Strong job title match');
  }
  if (locationMatch > 80) {
    reasons.push('Excellent location match');
  }
  if (skillsMatch.matched.length >= 3) {
    reasons.push('Multiple skill matches');
  }

  return {
    totalScore: Math.max(1, Math.min(100, totalScore)),
    irrelevant: false,
    reasons,
    skillsMatch,
    titleMatch,
    experienceMatch,
    locationMatch
  };
};

/**
 * Normalize skill name using Porter stemming for robust matching
 */
const normalizeSkill = (skill) => {
  return natural.PorterStemmer.tokenizeAndStem(skill.toLowerCase()).join(' ');
};

/**
 * Calculate skills matching score with stemming and Jaro-Winkler similarity
 */
const calculateSkillsMatch = (resumeSkills, jobSkills) => {
  if (!resumeSkills.length || !jobSkills.length) {
    return { score: 0, matched: [], missing: jobSkills || [] };
  }

  const resumeNormalized = resumeSkills.map(normalizeSkill);
  const matched = [];
  const missing = [];

  jobSkills.forEach(jobSkill => {
    const jobNormalized = normalizeSkill(jobSkill);
    const found = resumeNormalized.some(resumeNorm =>
      resumeNorm === jobNormalized ||
      natural.JaroWinklerDistance(resumeNorm, jobNormalized) > 0.92
    );

    if (found) {
      matched.push(jobSkill);
    } else {
      missing.push(jobSkill);
    }
  });

  const score = jobSkills.length > 0 ? (matched.length / jobSkills.length) * 100 : 0;

  return {
    score: Math.round(score),
    matched,
    missing
  };
};

/**
 * Generic title words that cause false positives across unrelated domains
 */
const GENERIC_TITLE_WORDS = new Set([
  'engineer', 'developer', 'manager', 'analyst', 'specialist',
  'officer', 'associate', 'executive', 'lead', 'consultant',
  'coordinator', 'administrator', 'assistant', 'director',
  'senior', 'junior', 'and', 'the', 'of', 'for'
]);

/**
 * Calculate title matching score (excludes generic words that cause cross-domain false positives)
 */
const calculateTitleMatch = (resumeTitles, jobTitle) => {
  if (!resumeTitles.length || !jobTitle) return 0;

  const jobTitleLower = jobTitle.toLowerCase();
  let bestMatch = 0;

  resumeTitles.forEach(resumeTitle => {
    const resumeTitleLower = resumeTitle.toLowerCase();

    // Exact match
    if (resumeTitleLower === jobTitleLower) {
      bestMatch = Math.max(bestMatch, 100);
      return;
    }

    // Partial match using non-generic words only
    const commonWords = resumeTitleLower.split(' ').filter(word =>
      jobTitleLower.includes(word) &&
      word.length > 2 &&
      !GENERIC_TITLE_WORDS.has(word)
    );

    if (commonWords.length > 0) {
      const matchScore = (commonWords.length / jobTitleLower.split(' ').length) * 80;
      bestMatch = Math.max(bestMatch, matchScore);
    }
  });

  return Math.round(bestMatch);
};

/**
 * Calculate experience matching score (missing data defaults to neutral, not a match)
 */
const calculateExperienceMatch = (resumeData, job) => {
  // If job has no experienceLevel set, it's unknown data - return neutral score, not a match.
  if (!job.experienceLevel) return 40;

  const resumeLevel = determineExperienceLevel(resumeData);
  const jobLevel = job.experienceLevel;

  if (resumeLevel === jobLevel) return 100;

  // Adjacent levels get partial credit
  const levels = ['entry', 'mid', 'senior', 'executive'];
  const resumeIndex = levels.indexOf(resumeLevel);
  const jobIndex = levels.indexOf(jobLevel);

  const difference = Math.abs(resumeIndex - jobIndex);
  return Math.max(0, 100 - (difference * 30));
};

/**
 * Calculate location matching score
 */
const calculateLocationMatch = (resumeLocation, jobLocation) => {
  if (!resumeLocation || !jobLocation) return 50; // Neutral score for missing data

  const resumeLoc = resumeLocation.toLowerCase();
  const jobLoc = jobLocation.toLowerCase();

  // Exact match
  if (resumeLoc === jobLoc) return 100;

  // Check for common Nigerian cities/states
  const nigerianStates = ['lagos', 'abuja', 'rivers', 'ogun', 'kano', 'kaduna', 'plateau', 'delta'];
  
  const resumeState = nigerianStates.find(state => resumeLoc.includes(state));
  const jobState = nigerianStates.find(state => jobLoc.includes(state));

  if (resumeState && jobState && resumeState === jobState) return 90;
  
  // Both in Nigeria
  if (resumeLoc.includes('nigeria') && jobLoc.includes('nigeria')) return 70;

  return 30; // Different locations
};

/**
 * Determine experience level from resume data
 */
const determineExperienceLevel = (resumeData) => {
  const experience = resumeData.experience || [];
  const jobTitles = resumeData.jobTitles || [];
  
  const allText = [...experience, ...jobTitles].join(' ').toLowerCase();
  
  if (allText.includes('senior') || allText.includes('lead') || allText.includes('manager')) {
    return 'senior';
  }
  
  if (allText.includes('junior') || allText.includes('entry') || allText.includes('intern')) {
    return 'entry';
  }
  
  return 'mid';
};

/**
 * Bookmark a job
 */
exports.bookmarkJob = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const { bookmark = true } = req.body;

    const jobMatch = await JobMatch.findOneAndUpdate(
      { userId, jobId },
      {
        isBookmarked: bookmark,
        status: bookmark ? 'bookmarked' : 'recommended',
        lastInteraction: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: bookmark ? 'Job bookmarked' : 'Bookmark removed',
      isBookmarked: jobMatch.isBookmarked
    });

  } catch (error) {
    console.error('❌ Error bookmarking job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to bookmark job',
      error: error.message
    });
  }
};

/**
 * Mark job as applied
 */
exports.markJobApplied = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;

    const jobMatch = await JobMatch.findOneAndUpdate(
      { userId, jobId },
      {
        isApplied: true,
        appliedDate: new Date(),
        status: 'applied',
        lastInteraction: new Date()
      },
      { upsert: true, new: true }
    );

    res.json({
      success: true,
      message: 'Job marked as applied',
      appliedDate: jobMatch.appliedDate
    });

  } catch (error) {
    console.error('❌ Error marking job as applied:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to mark job as applied',
      error: error.message
    });
  }
};

/**
 * Get job details by ID
 */
exports.getJobDetails = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user.id;

    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Get match data if available
    const jobMatch = await JobMatch.findOne({ userId, jobId });

    // Mark as viewed
    if (jobMatch) {
      jobMatch.viewedAt = new Date();
      jobMatch.status = 'viewed';
      jobMatch.lastInteraction = new Date();
      await jobMatch.save();
    }

    res.json({
      success: true,
      job: {
        ...job.toObject(),
        matchScore: jobMatch?.matchScore || 0,
        matchReasons: jobMatch?.matchReasons || [],
        skillsMatch: jobMatch?.skillsMatch || {},
        isBookmarked: jobMatch?.isBookmarked || false,
        isApplied: jobMatch?.isApplied || false,
        status: jobMatch?.status || 'general'
      }
    });

  } catch (error) {
    console.error('❌ Error getting job details:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get job details',
      error: error.message
    });
  }
};

/**
 * Get jobs based on user's resume data automatically
 */
exports.getResumeBasedJobs = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 20 } = req.query;
    
    console.log(`🎯 Getting resume-based jobs for user: ${userId}`);
    
    // Find user's latest resume
    const resume = await Resume.findOne({ userId }).sort({ createdAt: -1 });
    
    if (!resume || !resume.extractedData) {
      return res.json({
        success: true,
        jobs: [],
        message: 'No resume data found. Please upload a resume first.',
        totalResults: 0,
        searchParams: {}
      });
    }
    
    const { extractedData } = resume;
    console.log('📄 Found resume with extracted data');
    
    // Build search queries from resume data
    const searchQueries = [];
    
    // Use current job title if available
    if (extractedData.currentJobTitle) {
      searchQueries.push(extractedData.currentJobTitle);
    }
    
    // Use most recent job titles
    if (extractedData.jobTitles && extractedData.jobTitles.length > 0) {
      searchQueries.push(...extractedData.jobTitles.slice(0, 3)); // Top 3 job titles
    }
    
    // Use top skills as search terms
    if (extractedData.skills && extractedData.skills.length > 0) {
      // Combine top skills into a search query
      const topSkills = extractedData.skills.slice(0, 5).join(' ');
      searchQueries.push(topSkills);
    }
    
    // Default fallback if no specific data found
    if (searchQueries.length === 0) {
      searchQueries.push('software developer'); // Default search
    }
    
    console.log(`🔍 Search queries: ${searchQueries.join(', ')}`);
    
    // Always use Nigeria as location as requested by user
    const location = 'Nigeria';
    
    // Search for jobs using the first/primary query
    const primaryQuery = searchQueries[0];
    
    // Generate cache key based on resume data and search parameters
    console.log('📋 Preparing cache key generation...');
    console.log('   - extractedData.currentJobTitle:', extractedData.currentJobTitle);
    console.log('   - extractedData.skills:', extractedData.skills);
    console.log('   - location:', location);
    console.log('   - page:', page);
    console.log('   - primaryQuery:', primaryQuery);
    
    const resumeDataForCache = {
      currentJobTitle: extractedData.currentJobTitle,
      topSkills: extractedData.skills?.slice(0, 5) || []
    };
    const searchParamsForCache = { location, page, query: primaryQuery };
    
    console.log('📦 Cache data prepared:');
    console.log('   - resumeDataForCache:', JSON.stringify(resumeDataForCache));
    console.log('   - searchParamsForCache:', JSON.stringify(searchParamsForCache));
    
    let cacheKey;
    try {
      cacheKey = redisService.generateCacheKey(resumeDataForCache, searchParamsForCache);
      console.log(`🔑 Generated cache key: ${cacheKey}`);
    } catch (error) {
      console.error('❌ Failed to generate cache key:', error.message);
      cacheKey = 'jobs:fallback:' + Date.now();
    }
    
    // Try to get cached results first
    console.log('🔍 Attempting to retrieve cached jobs...');
    let cachedJobs = null;
    try {
      cachedJobs = await redisService.getJobs(cacheKey);
    } catch (error) {
      console.error('❌ Failed to retrieve cached jobs:', error.message);
      console.error('❌ Cache retrieval error stack:', error.stack);
    }
    if (cachedJobs) {
      console.log(`🚀 Cache HIT! Returning ${cachedJobs.jobs?.length || 0} cached jobs`);
      console.log('✅ Cache data structure:', Object.keys(cachedJobs));
      return res.json({
        ...cachedJobs,
        fromCache: true,
        cacheKey: cacheKey,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('💫 Cache MISS - proceeding to fetch fresh data');
    }
    
    // Cache miss - fetch from API
    console.log('💫 Cache miss, fetching fresh data from API...');
    let savedJobs = [];
    let fetchError = null;
    
    try {
      const searchResult = await jSearchService.searchJobs({
        query: primaryQuery,
        location: location,
        page: parseInt(page),
        jobType: 'all',
        experienceLevel: 'all',
        datePosted: 'all'
      });
      
      if (searchResult.success) {
        // Normalize and save jobs from API
        const normalizedJobs = jSearchService.normalizeJobs(searchResult.data);
        
        for (const jobData of normalizedJobs) {
          try {
            const job = await Job.findOneAndUpdate(
              { externalId: jobData.externalId },
              jobData,
              { 
                upsert: true, 
                new: true,
                runValidators: true
              }
            );
            savedJobs.push(job);
          } catch (saveError) {
            console.error(`❌ Failed to save job: ${jobData.title}`, saveError.message);
          }
        }
      } else {
        fetchError = searchResult.error;
      }
    } catch (apiError) {
      console.log('⚠️ API unavailable, using existing jobs from database');
      fetchError = apiError.message;
    }
    
    // If no new jobs were fetched, try to return relevant existing jobs from database
    if (savedJobs.length === 0) {
      console.log('🔍 Searching existing jobs in database...');

      // Safely escape resume-derived queries for use in RegExp
      const escapeRegex = (s = '') => String(s).replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&');
      const cleanedQueries = searchQueries
        .map(q => (q || '').toString().trim())
        .filter(Boolean)
        .map(q => escapeRegex(q));

      let existingJobs = [];

      if (cleanedQueries.length > 0) {
        try {
          const searchPattern = cleanedQueries.join('|');
          const regex = new RegExp(searchPattern, 'i');

          existingJobs = await Job.find({
            $or: [
              { title: regex },
              { description: regex },
              { company: regex }
            ]
          })
          .limit(parseInt(limit))
          .sort({ createdAt: -1 });

          console.log(`📊 Regex search used (pattern=${searchPattern}) — found ${existingJobs.length} jobs`);
        } catch (regexError) {
          console.error('❌ Regex search failed, falling back to broader DB query:', regexError.message);
        }
      }

      // If regex search returned nothing, fall back to recent active jobs to avoid empty UX
      if (!existingJobs || existingJobs.length === 0) {
        console.log('💡 Falling back to recent active jobs');
        existingJobs = await Job.find({ isActive: true })
          .limit(parseInt(limit))
          .sort({ postedDate: -1 });
      }

      savedJobs = existingJobs;
      console.log(`📊 Returning ${savedJobs.length} existing jobs from database`);
    }
    
    console.log(`✅ Found ${savedJobs.length} jobs based on resume data`);
    
    const responseData = {
      success: true,
      jobs: savedJobs,
      totalResults: savedJobs.length,
      resumeData: {
        currentJobTitle: extractedData.currentJobTitle,
        topSkills: extractedData.skills?.slice(0, 5) || [],
        jobTitles: extractedData.jobTitles || [],
        location: location
      },
      searchParams: {
        query: primaryQuery,
        location: location,
        page,
        basedOnResume: true
      },
      fromCache: false,
      fetchError: fetchError
    };
    
    // Cache the results for future requests (TTL: 2 hours = 7200 seconds)
    if (savedJobs.length > 0) {
      console.log(`💾 Attempting to cache ${savedJobs.length} jobs with key: ${cacheKey}`);
      try {
        const cacheSuccess = await redisService.setJobs(cacheKey, responseData, 7200);
        console.log(`📦 Cache operation result: ${cacheSuccess ? 'SUCCESS' : 'FAILED'}`);
      } catch (error) {
        console.error('❌ Failed to cache jobs:', error.message);
        console.error('❌ Cache error stack:', error.stack);
      }
    } else {
      console.log('⚠️ No jobs to cache (empty result set)');
    }
    
    res.json(responseData);
    
  } catch (error) {
    console.error('❌ Error in getResumeBasedJobs:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};