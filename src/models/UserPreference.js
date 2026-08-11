const mongoose = require('mongoose');

const userPreferenceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    preferredJobTypes: [String],
    preferredLocations: [String],
    preferredIndustries: [String],
    salaryRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
      currency: { type: String, default: 'USD' },
    },
    jobSearchStatus: {
      type: String,
      enum: ['active', 'passive', 'not_looking', null],
      default: null,
    },
    targetRoles: [String],
    excludedCompanies: [String],
    preferredWorkMode: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', null],
      default: null,
    },
    willingToRelocate: {
      type: Boolean,
      default: false,
    },
    notificationPreferences: {
      email: { type: Boolean, default: true },
      jobAlerts: { type: Boolean, default: true },
      applicationUpdates: { type: Boolean, default: true },
    },
    agentPreferences: {
      autonomyLevel: {
        type: Number,
        default: 2,
        min: 1,
        max: 4,
      },
      enabledAgents: [String],
      approvalRequired: {
        type: Boolean,
        default: true,
      },
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('UserPreference', userPreferenceSchema);
