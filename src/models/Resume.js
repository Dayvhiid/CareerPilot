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
  extractedData: {
    name: String,
    email: String,
    phone: String,
    location: String,
    skills: [String],
    jobTitles: [String],
    companies: [String],
    experience: [String],
    education: [String],
    languages: [String],
    certifications: [String],
    summary: String,
    generatedSummary: String, // AI-generated professional summary
    yearsOfExperience: Number,
    currentJobTitle: String,
    linkedinUrl: String,
    githubUrl: String,
    portfolioUrl: String,
    softSkills: [String],
    industryExperience: [String],
  },
  processingError: String,
  isProcessed: {
    type: Boolean,
    default: false,
  },
}, {
  timestamps: true,
});
module.exports = mongoose.model("Resume", resumeSchema);

