const Resume = require('../models/Resume');
const Job = require('../models/Job');
const huggingFaceService = require('../services/huggingFaceService');
const mongoose = require('mongoose');

// Create a test user ObjectId for when auth is disabled
const TEST_USER_ID = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");

/**
 * Generate cover letter for a specific job
 */
exports.generateCoverLetter = async (req, res) => {
  try {
    const userId = req.user?.id || TEST_USER_ID;
    const { jobId } = req.params;
    const { customInstructions, tone = 'professional', length = 'medium' } = req.body;

    console.log(`📝 Generating cover letter for job ${jobId} and user ${userId}`);

    // Get job details
    const job = await Job.findById(jobId);
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Get user's latest resume
    const resume = await Resume.findOne({ userId }).sort({ createdAt: -1 });
    if (!resume || !resume.extractedData) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please upload a resume first.'
      });
    }

    console.log('📄 Found resume and job data');
    console.log('🏢 Job:', job.title, 'at', job.company);
    console.log('👤 Applicant:', resume.extractedData.name || 'Unknown');

    // Prepare job data for cover letter generation
    const jobData = {
      title: job.title,
      company: job.company,
      description: job.description,
      requirements: job.requirements || [],
      location: job.location,
      jobType: job.jobType,
      experienceLevel: job.experienceLevel
    };

    // Prepare resume data
    const resumeData = {
      name: resume.extractedData.name,
      email: resume.extractedData.email,
      phone: resume.extractedData.phone,
      skills: resume.extractedData.skills || [],
      jobTitles: resume.extractedData.jobTitles || [],
      currentJobTitle: resume.extractedData.currentJobTitle,
      yearsOfExperience: resume.extractedData.yearsOfExperience,
      education: resume.extractedData.education || [],
      experience: resume.extractedData.experience || []
    };

    // User preferences
    const userPreferences = {
      customInstructions,
      tone,
      length
    };

    // Generate cover letter using Hugging Face
    const coverLetterResult = await huggingFaceService.generateCoverLetter(
      jobData, 
      resumeData, 
      userPreferences
    );

    if (!coverLetterResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Failed to generate cover letter',
        error: coverLetterResult.error
      });
    }

    console.log('✅ Cover letter generated successfully');

    res.json({
      success: true,
      coverLetter: coverLetterResult.coverLetter,
      jobData: {
        title: job.title,
        company: job.company,
        id: job._id
      },
      resumeData: {
        name: resumeData.name,
        email: resumeData.email
      },
      generatedAt: coverLetterResult.generatedAt,
      model: coverLetterResult.model,
      isTemplate: coverLetterResult.isTemplate || false
    });

  } catch (error) {
    console.error('❌ Error generating cover letter:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};

/**
 * Test Hugging Face connection
 */
exports.testHuggingFace = async (req, res) => {
  try {
    console.log('🧪 Testing Hugging Face service...');
    
    const testResult = await huggingFaceService.testConnection();
    
    res.json({
      success: testResult.success,
      message: testResult.success ? 'Hugging Face connection successful' : 'Hugging Face connection failed',
      error: testResult.error || undefined,
      response: testResult.response || undefined
    });

  } catch (error) {
    console.error('❌ Error testing Hugging Face:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Hugging Face connection',
      error: error.message
    });
  }
};