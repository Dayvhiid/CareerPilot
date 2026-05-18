const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

    if (!mongoUri) {
      console.warn("⚠️ MongoDB connection skipped because MONGO_URI/MONGODB_URI is missing.");
      console.warn("⚠️ The server will start, but database-backed features will be unavailable until MongoDB is configured.");
      return false;
    }

    await mongoose.connect(mongoUri);
    console.log("✅ MongoDB connected");
    return true;
  } catch (error) {
    console.error("❌ MongoDB connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;