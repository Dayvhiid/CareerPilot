const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: {
      type: String,
      required: function () {
        return !this.googleId && !this.githubId;
      },
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true,
    },
    emailVerified: {
      type: Boolean,
      default: true,
    },
    emailVerificationToken: {
      type: String,
      select: false,
    },
    emailVerificationExpires: {
      type: Date,
      select: false,
    },
    passwordResetToken: {
      type: String,
      select: false,
    },
    passwordResetExpires: {
      type: Date,
      select: false,
    },
    premium: {
      active: { type: Boolean, default: false },
      billing: { type: String, enum: ['monthly', 'annual', null], default: null },
      paystackReference: { type: String },
      activatedAt: { type: Date },
      expiresAt: { type: Date },
    },
  },
  { timestamps: true }
);

userSchema.pre('deleteOne', { document: true, query: false }, async function (next) {
  const userId = this._id;
  try {
    await Promise.all([
      mongoose.model('Resume').deleteMany({ userId }),
      mongoose.model('Conversation').deleteMany({ userId }),
      mongoose.model('UserJob').deleteMany({ userId }),
    ]);
  } catch (err) {
    console.error('Cascade delete error:', err);
  }
  next();
});

userSchema.pre('deleteMany', async function (next) {
  const filter = this.getFilter();
  const userIds = filter._id ? (Array.isArray(filter._id.$in) ? filter._id.$in : [filter._id]) : [];
  if (userIds.length > 0) {
    try {
      await Promise.all([
        mongoose.model('Resume').deleteMany({ userId: { $in: userIds } }),
        mongoose.model('Conversation').deleteMany({ userId: { $in: userIds } }),
        mongoose.model('UserJob').deleteMany({ userId: { $in: userIds } }),
      ]);
    } catch (err) {
      console.error('Cascade delete error:', err);
    }
  }
  next();
});

module.exports = mongoose.model('User', userSchema);
