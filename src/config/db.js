const mongoose = require("mongoose");

function formatConnectionError(error) {
  const details = [];

  if (error?.name) {
    details.push(`name: ${error.name}`);
  }

  if (error?.message) {
    details.push(`message: ${error.message}`);
  }

  if (error?.code !== undefined) {
    details.push(`code: ${error.code}`);
  }

  if (error?.codeName) {
    details.push(`codeName: ${error.codeName}`);
  }

  if (error?.reason) {
    details.push(`reason: ${error.reason}`);
  }

  if (error?.cause) {
    details.push(`cause: ${error.cause?.message || error.cause}`);
  }

  if (error?.errorLabels?.length) {
    details.push(`errorLabels: ${error.errorLabels.join(', ')}`);
  }

  if (error?.stack) {
    details.push(`stack: ${error.stack}`);
  }

  return details.join('\n   - ');
}

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
    console.error("❌ MongoDB connection error details:");
    console.error(`   - ${formatConnectionError(error)}`);
    throw error;
  }
};

module.exports = connectDB;