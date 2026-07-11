const { logger } = require('../config/logger');
const Resume = require('../models/Resume');
const JobListing = require('../models/JobListing');
const huggingFaceService = require('../services/huggingFaceService');
const mongoose = require('mongoose');
const { Document, Packer, Paragraph, TextRun, AlignmentType, HeadingLevel } = require('docx');



/**
 * Generate cover letter for a specific job
 */
exports.generateCoverLetter = async (req, res) => {
  try {
    const userId = req.user.id;
    const { jobId } = req.params;
    const { customInstructions, tone = 'professional', length = 'medium' } = req.body;

    logger.info(`Generating cover letter for job ${jobId} and user ${userId}`);

    // Get job details
    const job = await JobListing.findById(jobId).lean();
    if (!job) {
      return res.status(404).json({
        success: false,
        message: 'Job not found'
      });
    }

    // Get user's latest resume
    const resume = await Resume.findOne({ userId }).sort({ createdAt: -1 }).lean();
    if (!resume || !resume.extractedData) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please upload a resume first.'
      });
    }

    logger.info('Found resume and job data');
    logger.info('Job:', job.title, 'at', job.company);
    logger.info('Applicant:', resume.extractedData.name || 'Unknown');

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

    logger.info('Cover letter generated successfully');

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
    logger.error('Error generating cover letter:', error);
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
    logger.info('Testing Hugging Face service...');
    
    const testResult = await huggingFaceService.testConnection();
    
    res.json({
      success: testResult.success,
      message: testResult.success ? 'Hugging Face connection successful' : 'Hugging Face connection failed',
      error: testResult.error || undefined,
      response: testResult.response || undefined
    });

  } catch (error) {
    logger.error('Error testing Hugging Face:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to test Hugging Face connection',
      error: error.message
    });
  }
};

/**
 * Download cover letter as Word document
 */
exports.downloadCoverLetter = async (req, res) => {
  try {
    const { coverLetterText, jobTitle, company, applicantName } = req.body;
    
    if (!coverLetterText) {
      return res.status(400).json({
        success: false,
        message: 'Cover letter text is required'
      });
    }

    logger.info(`Generating Word document for ${jobTitle} at ${company}`);

    // Split cover letter into paragraphs
    const paragraphs = coverLetterText.split('\n\n').filter(p => p.trim().length > 0);
    
    // Create Word document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: paragraphs.map(paragraphText => {
            const trimmedText = paragraphText.trim();
            
            // Check if this is the date
            if (trimmedText.match(/\w+\s+\d{1,2},\s+\d{4}/)) {
              return new Paragraph({
                children: [
                  new TextRun({
                    text: trimmedText,
                    size: 22
                  })
                ],
                alignment: AlignmentType.RIGHT,
                spacing: { after: 200 }
              });
            }
            
            // Check if this is a greeting
            if (trimmedText.startsWith('Dear ')) {
              return new Paragraph({
                children: [
                  new TextRun({
                    text: trimmedText,
                    size: 22
                  })
                ],
                spacing: { after: 200 }
              });
            }
            
            // Check if this is the signature
            if (trimmedText.startsWith('Sincerely,') || trimmedText.startsWith('Best regards,')) {
              return new Paragraph({
                children: [
                  new TextRun({
                    text: trimmedText,
                    size: 22
                  })
                ],
                spacing: { before: 200 }
              });
            }
            
            // Regular paragraph
            return new Paragraph({
              children: [
                new TextRun({
                  text: trimmedText,
                  size: 22
                })
              ],
              spacing: { after: 200 },
              alignment: AlignmentType.JUSTIFIED
            });
          })
        }
      ]
    });

    // Generate the document buffer
    const buffer = await Packer.toBuffer(doc);
    
    // Set response headers for file download
    const fileName = `Cover_Letter_${(jobTitle || 'Job').replace(/[^a-zA-Z0-9]/g, '_')}_${(company || 'Company').replace(/[^a-zA-Z0-9]/g, '_')}.docx`;
    
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Length', buffer.length);
    
    res.send(buffer);
    
    logger.info(`Word document generated successfully: ${fileName}`);

  } catch (error) {
    logger.error('Error generating Word document:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate Word document',
      error: error.message
    });
  }
};