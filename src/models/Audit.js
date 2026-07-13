const mongoose = require('mongoose');

const auditSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    action: {
      type: String,
      required: true,
      enum: [
        'user.register',
        'user.login',
        'user.logout',
        'user.delete',
        'user.premium.upgrade',
        'user.premium.downgrade',
        'resume.upload',
        'resume.delete',
        'resume.process',
        'payment.init',
        'payment.success',
        'payment.failure',
        'payment.refund',
        'oauth.link',
        'oauth.unlink',
        'admin.action',
      ],
    },
    resource: {
      type: String,
      required: true,
    },
    resourceId: {
      type: mongoose.Schema.Types.ObjectId,
    },
    details: {
      type: mongoose.Schema.Types.Mixed,
    },
    ip: {
      type: String,
    },
    userAgent: {
      type: String,
    },
  },
  {
    timestamps: true,
  }
);

auditSchema.index({ userId: 1, createdAt: -1 });
auditSchema.index({ action: 1, createdAt: -1 });
auditSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model('Audit', auditSchema);
