const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  filename: {
    type: String,
    required: true,
  },
  originalName: {
    type: String,
    required: true,
  },
  fileSize: {
    type: Number,
    required: true,
  },
  fileType: {
    type: String,
    required: true,
  },
  filePath: {
    type: String,
    required: true,
  },
  extractedText: {
    type: String,
  },
  processingStage: {
    type: String,
    default: 'queued',
  },
  processingProgress: {
    type: Number,
    default: 0,
    min: 0,
    max: 100,
  },
  processingMessage: {
    type: String,
    default: 'Waiting to start processing',
  },
  processingStartedAt: {
    type: Date,
  },
  processingUpdatedAt: {
    type: Date,
  },
  extractedData: {
    name: String,
    email: String,
    phone: String,
    location: String,
    summary: String,
    currentJobTitle: String,
    yearsOfExperience: Number,
    skills: [String],
    softSkills: [String],
    industryExperience: [String],
    education: [
      {
        degree: String,
        institution: String,
        year: String,
        location: String
      }
    ],
    workExperience: [
      {
        position: String,
        company: String,
        duration: String,
        location: String,
        responsibilities: String,
        contact: String
      }
    ],
    projects: [
      {
        name: String,
        description: String,
        dates: String
      }
    ],
    certificates: [
      {
        name: String,
        issuer: String,
        date: String
      }
    ],
    interests: [String],
    achievements: [String],
    languages: [String],
    // Temporarily removed links field to avoid schema conflicts
    // Will store individual URLs in linkedinUrl, githubUrl, portfolioUrl instead
    jobTitles: [String],
    companies: [String],
    linkedinUrl: String,
    githubUrl: String,
    portfolioUrl: String,
    generatedSummary: String,
  },
  processingError: String,
  isProcessed: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});
module.exports = mongoose.model("ResumeV2", resumeSchema);

