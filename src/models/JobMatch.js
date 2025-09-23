const mongoose = require('mongoose');

const jobMatchSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  },
  matchScore: {
    type: Number,
    min: 0,
    max: 100,
    required: true
  },
  matchReasons: [{
    type: String,
    trim: true
  }],
  skillsMatch: {
    matched: [{
      type: String,
      trim: true
    }],
    missing: [{
      type: String,
      trim: true
    }],
    score: {
      type: Number,
      min: 0,
      max: 100
    }
  },
  locationMatch: {
    type: Number,
    min: 0,
    max: 100
  },
  experienceMatch: {
    type: Number,
    min: 0,
    max: 100
  },
  titleMatch: {
    type: Number,
    min: 0,
    max: 100
  },
  isBookmarked: {
    type: Boolean,
    default: false
  },
  isApplied: {
    type: Boolean,
    default: false
  },
  appliedDate: Date,
  status: {
    type: String,
    enum: ['recommended', 'viewed', 'applied', 'rejected', 'bookmarked'],
    default: 'recommended'
  },
  viewedAt: Date,
  lastInteraction: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index to prevent duplicate matches
jobMatchSchema.index({ userId: 1, jobId: 1 }, { unique: true });
jobMatchSchema.index({ userId: 1, matchScore: -1 });
jobMatchSchema.index({ userId: 1, status: 1, lastInteraction: -1 });

module.exports = mongoose.model('JobMatch', jobMatchSchema);