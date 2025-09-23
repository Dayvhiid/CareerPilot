const Job = require('../models/Job');
const JobMatch = require('../models/JobMatch');
const Resume = require('../models/Resume');
const jSearchService = require('../services/jSearchService');
const natural = require('natural');
const mongoose = require('mongoose');

// Create a test user ObjectId for when auth is disabled
const TEST_USER_ID = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");

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
        console.log(`💾 Saved job: ${job.title} at ${job.company}`);
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
 * Get recommended jobs for user based on their resume
 */
exports.getRecommendedJobs = async (req, res) => {
  try {
    const userId = req.user?.id || TEST_USER_ID;
    const { page = 1, limit = 20 } = req.query;
    
    console.log(`🎯 Getting recommended jobs for user: ${userId}`);

    // Get user's resume data
    const resume = await Resume.findOne({ userId });
    if (!resume || !resume.extractedData) {
      // If no resume, get recent jobs
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
 */
const generateJobMatches = async (userId, resumeData) => {
  try {
    console.log(`🤖 Generating job matches for user: ${userId}`);

    // Get all active jobs
    const jobs = await Job.find({ isActive: true });
    console.log(`📊 Found ${jobs.length} active jobs to match against`);

    for (const job of jobs) {
      // Check if match already exists
      const existingMatch = await JobMatch.findOne({ userId, jobId: job._id });
      if (existingMatch) {
        continue; // Skip if already matched
      }

      // Calculate match score
      const matchResult = calculateJobMatch(resumeData, job);

      // Create job match record
      await JobMatch.create({
        userId,
        jobId: job._id,
        matchScore: matchResult.totalScore,
        matchReasons: matchResult.reasons,
        skillsMatch: matchResult.skillsMatch,
        locationMatch: matchResult.locationMatch,
        experienceMatch: matchResult.experienceMatch,
        titleMatch: matchResult.titleMatch
      });

      console.log(`✅ Created match: ${job.title} (Score: ${matchResult.totalScore})`);
    }

  } catch (error) {
    console.error('❌ Error generating job matches:', error);
  }
};

/**
 * Calculate job match score based on resume data
 */
const calculateJobMatch = (resumeData, job) => {
  const weights = {
    skills: 0.35,
    title: 0.25,
    experience: 0.20,
    location: 0.20
  };

  // Skills matching
  const skillsMatch = calculateSkillsMatch(resumeData.skills || [], job.skills || []);
  
  // Title matching
  const titleMatch = calculateTitleMatch(resumeData.jobTitles || [], job.title);
  
  // Experience matching (basic implementation)
  const experienceMatch = calculateExperienceMatch(resumeData, job);
  
  // Location matching
  const locationMatch = calculateLocationMatch(resumeData.location || '', job.location);

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
    totalScore: Math.max(1, Math.min(100, totalScore)), // Ensure score is between 1-100
    reasons,
    skillsMatch,
    titleMatch,
    experienceMatch,
    locationMatch
  };
};

/**
 * Calculate skills matching score
 */
const calculateSkillsMatch = (resumeSkills, jobSkills) => {
  if (!resumeSkills.length || !jobSkills.length) {
    return { score: 0, matched: [], missing: jobSkills || [] };
  }

  const resumeSkillsLower = resumeSkills.map(s => s.toLowerCase());
  const jobSkillsLower = jobSkills.map(s => s.toLowerCase());

  const matched = [];
  const missing = [];

  jobSkillsLower.forEach(jobSkill => {
    const found = resumeSkillsLower.find(resumeSkill => 
      resumeSkill.includes(jobSkill) || jobSkill.includes(resumeSkill)
    );
    
    if (found) {
      matched.push(jobSkill);
    } else {
      missing.push(jobSkill);
    }
  });

  const score = jobSkillsLower.length > 0 ? (matched.length / jobSkillsLower.length) * 100 : 0;

  return {
    score: Math.round(score),
    matched,
    missing
  };
};

/**
 * Calculate title matching score
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

    // Partial match
    const commonWords = resumeTitleLower.split(' ').filter(word => 
      jobTitleLower.includes(word) && word.length > 2
    );
    
    if (commonWords.length > 0) {
      const matchScore = (commonWords.length / jobTitleLower.split(' ').length) * 80;
      bestMatch = Math.max(bestMatch, matchScore);
    }
  });

  return Math.round(bestMatch);
};

/**
 * Calculate experience matching score
 */
const calculateExperienceMatch = (resumeData, job) => {
  // Basic experience matching - can be enhanced
  const resumeLevel = determineExperienceLevel(resumeData);
  const jobLevel = job.experienceLevel || 'mid';

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
    const userId = req.user?.id || TEST_USER_ID;
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
    const userId = req.user?.id || TEST_USER_ID;
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
    const userId = req.user?.id || TEST_USER_ID;

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
    const userId = req.user?.id || TEST_USER_ID;
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
    
    // Try to fetch new jobs, but don't fail if API is unavailable
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
      
      // Build a regex pattern for matching job titles and descriptions
      const searchPattern = searchQueries.join('|');
      const regex = new RegExp(searchPattern, 'i');
      
      const existingJobs = await Job.find({
        $or: [
          { title: regex },
          { description: regex },
          { company: regex }
        ]
      })
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });
      
      savedJobs = existingJobs;
      console.log(`📊 Found ${savedJobs.length} existing jobs in database`);
    }
    
    console.log(`✅ Found ${savedJobs.length} jobs based on resume data`);
    
    res.json({
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
      }
    });
    
  } catch (error) {
    console.error('❌ Error in getResumeBasedJobs:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};