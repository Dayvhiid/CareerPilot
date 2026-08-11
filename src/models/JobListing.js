const mongoose = require('mongoose');

const jobListingSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    company: { type: String, required: true },
    location: String,
    description: String,
    domain: { type: String, required: true, index: true },
    skills: [String],
    embedding: [Number],
    externalId: { type: String, unique: true, sparse: true },
    source: { type: String, default: 'jsearch' },
    jobUrl: String,
    companyLogo: String,
    salary: {
      min: Number,
      max: Number,
      currency: String,
    },
    jobType: { type: String, enum: ['full-time', 'part-time', 'contract', 'temporary', 'internship'] },
    experienceLevel: { type: String, enum: ['entry', 'mid', 'senior', 'executive'] },
    workType: { type: String, enum: ['remote', 'onsite', 'hybrid'] },
    postedDate: Date,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

jobListingSchema.index({ domain: 1, isActive: 1 });
jobListingSchema.index({ skills: 1 });
jobListingSchema.index({ location: 1 });
jobListingSchema.index({ title: 'text', description: 'text', company: 'text' });

module.exports = mongoose.model('JobListing', jobListingSchema);
