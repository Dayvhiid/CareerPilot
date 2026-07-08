const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { 
      type: String, 
      required: function() {
        return !this.googleId && !this.githubId;
      }
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true
    },
    premium: {
      active: { type: Boolean, default: false },
      billing: { type: String, enum: ['monthly', 'annual', null], default: null },
      paystackReference: { type: String },
      activatedAt: { type: Date },
      expiresAt: { type: Date }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);