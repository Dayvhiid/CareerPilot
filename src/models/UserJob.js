const mongoose = require('mongoose');

const userJobSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'JobListing', required: true },
    status: { type: String, enum: ['bookmarked', 'applied', 'viewed'], default: 'viewed' },
    appliedDate: Date,
    notes: String,
  },
  { timestamps: true }
);

userJobSchema.index({ userId: 1, jobId: 1 }, { unique: true });
userJobSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.model('UserJob', userJobSchema);
