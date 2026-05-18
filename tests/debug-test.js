const axios = require('axios');
const mongoose = require('mongoose');
require('dotenv').config();

async function comprehensiveDebugTest() {
  console.log('🔍 COMPREHENSIVE DEBUG TEST STARTING...');
  console.log('='.repeat(60));
  
  // Step 1: Test server connectivity
  console.log('\n📡 STEP 1: Testing server connectivity');
  try {
    const healthResponse = await axios.get('http://localhost:4000/', { timeout: 5000 });
    console.log('✅ Server is responding');
    console.log('📋 Server response status:', healthResponse.status);
  } catch (error) {
    console.error('❌ Server is not responding:', error.message);
    return;
  }
  
  // Step 2: Test database connection
  console.log('\n🗄️ STEP 2: Testing database connection');
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Database connected successfully');
    
    const collections = await mongoose.connection.db.listCollections().toArray();
    console.log('📊 Available collections:', collections.map(c => c.name));
    
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    return;
  }
  
  // Step 3: Check for resumes in database
  console.log('\n📄 STEP 3: Checking resume data');
  try {
    const Resume = mongoose.model('Resume', new mongoose.Schema({}, { strict: false }));
    const resumeCount = await Resume.countDocuments();
    console.log('📊 Total resumes in database:', resumeCount);
    
    if (resumeCount > 0) {
      const latestResume = await Resume.findOne().sort({ createdAt: -1 });
      console.log('📋 Latest resume found:');
      console.log('  - ID:', latestResume._id);
      console.log('  - User ID:', latestResume.userId);
      console.log('  - Has extractedData:', !!latestResume.extractedData);
      
      if (latestResume.extractedData) {
        console.log('  - Current Job Title:', latestResume.extractedData.currentJobTitle || 'NOT SET');
        console.log('  - Skills count:', latestResume.extractedData.skills?.length || 0);
        console.log('  - Job titles count:', latestResume.extractedData.jobTitles?.length || 0);
        console.log('  - Location:', latestResume.extractedData.location || 'NOT SET');
        
        if (latestResume.extractedData.skills) {
          console.log('  - Skills:', latestResume.extractedData.skills.slice(0, 5));
        }
        if (latestResume.extractedData.jobTitles) {
          console.log('  - Job titles:', latestResume.extractedData.jobTitles);
        }
      } else {
        console.log('⚠️ Latest resume has no extractedData');
      }
    } else {
      console.log('❌ NO RESUMES FOUND IN DATABASE');
      console.log('❓ This explains why the API returns "No resume data found"');
    }
    
  } catch (error) {
    console.error('❌ Error checking resume data:', error.message);
  }
  
  // Step 4: Test API endpoints
  console.log('\n🌐 STEP 4: Testing API endpoints');
  
  // Test search endpoint first (simpler)
  try {
    console.log('🔍 Testing /api/jobs/search...');
    const searchResponse = await axios.get('http://localhost:4000/api/jobs/search?query=developer&location=Nigeria', { timeout: 10000 });
    console.log('✅ Search endpoint working, status:', searchResponse.status);
    console.log('📊 Search returned', searchResponse.data.jobs?.length || 0, 'jobs');
  } catch (error) {
    console.error('❌ Search endpoint failed:', error.message);
  }
  
  // Test resume-based endpoint
  try {
    console.log('🎯 Testing /api/jobs/resume-based...');
    const resumeResponse = await axios.get('http://localhost:4000/api/jobs/resume-based', { 
      timeout: 15000,
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('✅ Resume-based endpoint working, status:', resumeResponse.status);
    console.log('📊 Response data:', JSON.stringify(resumeResponse.data, null, 2));
  } catch (error) {
    console.error('❌ Resume-based endpoint failed');
    console.error('   Status:', error.response?.status);
    console.error('   Status text:', error.response?.statusText);
    console.error('   Data:', error.response?.data);
    console.error('   Error message:', error.message);
  }
  
  // Step 5: Test route configuration
  console.log('\n🛤️ STEP 5: Route configuration analysis');
  try {
    // Test if route is being caught by wrong handler
    const routes = [
      '/api/jobs/search',
      '/api/jobs/recommended', 
      '/api/jobs/resume-based',
      '/api/jobs/test-id' // This should match /:jobId pattern
    ];
    
    for (const route of routes) {
      try {
        console.log(`🧪 Testing route: ${route}`);
        const response = await axios.get(`http://localhost:4000${route}`, { 
          timeout: 5000,
          validateStatus: () => true // Accept any status code
        });
        console.log(`   Status: ${response.status} - ${response.statusText}`);
      } catch (error) {
        console.log(`   Error: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Route testing failed:', error.message);
  }
  
  console.log('\n🏁 DEBUG TEST COMPLETED');
  console.log('='.repeat(60));
  
  await mongoose.disconnect();
}

comprehensiveDebugTest().catch(console.error);