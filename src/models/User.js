const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { 
      type: String, 
      required: function() {
        // Password is required only if no OAuth provider is used
        return !this.googleId && !this.githubId;
      }
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true // Allows multiple null values
    },
    githubId: {
      type: String,
      unique: true,
      sparse: true // Allows multiple null values
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);