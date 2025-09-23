const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  company: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true
  },
  requirements: [{
    type: String,
    trim: true
  }],
  salary: {
    min: Number,
    max: Number,
    currency: {
      type: String,
      default: 'NGN'
    },
    display: String // "₦500,000 - ₦800,000 per month"
  },
  jobType: {
    type: String,
    enum: ['full-time', 'part-time', 'contract', 'temporary', 'internship'],
    default: 'full-time'
  },
  experienceLevel: {
    type: String,
    enum: ['entry', 'mid', 'senior', 'executive'],
    default: 'mid'
  },
  skills: [{
    type: String,
    trim: true
  }],
  postedDate: {
    type: Date,
    default: Date.now
  },
  externalId: {
    type: String,
    unique: true,
    required: true
  },
  source: {
    type: String,
    enum: ['indeed', 'linkedin', 'glassdoor', 'ziprecruiter', 'other'],
    required: true
  },
  jobUrl: {
    type: String,
    required: true
  },
  companyLogo: String,
  isActive: {
    type: Boolean,
    default: true
  },
  industry: String,
  benefits: [String],
  workType: {
    type: String,
    enum: ['remote', 'onsite', 'hybrid'],
    default: 'onsite'
  }
}, {
  timestamps: true
});

// Index for better query performance
jobSchema.index({ title: 'text', description: 'text', company: 'text' });
jobSchema.index({ location: 1, postedDate: -1 });
jobSchema.index({ skills: 1 });
jobSchema.index({ externalId: 1 });

module.exports = mongoose.model('Job', jobSchema);