const mongoose = require('mongoose');
require('dotenv').config();

async function testConnection() {
  try {
    console.log('Testing database connection...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected successfully');
    
    // List all collections
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📊 Collections found:', collections.map(c => c.name));
    
    // Check resumes collection specifically
    const Resume = mongoose.model('Resume', new mongoose.Schema({}, { strict: false }));
    const count = await Resume.countDocuments();
    console.log(`📄 Resume documents count: ${count}`);
    
    if (count > 0) {
      const sample = await Resume.findOne();
      console.log('📋 Sample resume structure:', Object.keys(sample.toObject()));
    }
    
  } catch (error) {
    console.error('❌ Database error:', error.message);
  } finally {
    await mongoose.disconnect();
  }
}

testConnection();