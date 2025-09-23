const axios = require('axios');

async function testResumeBasedJobs() {
  try {
    console.log('🧪 Testing resume-based jobs endpoint...');
    console.log('📍 Making request to: http://localhost:4000/api/jobs/resume-based');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    const startTime = Date.now();
    const response = await axios.get('http://localhost:4000/api/jobs/resume-based', {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CareerPilot-Test/1.0'
      }
    });
    const endTime = Date.now();
    
    console.log('✅ Response Status:', response.status);
    console.log('📋 Response Headers:', JSON.stringify(response.headers, null, 2));
    console.log('⏱️ Response Time:', (endTime - startTime) + 'ms');
    console.log('📊 Response Data:', JSON.stringify(response.data, null, 2));
    
    if (response.data.success) {
      console.log(`🎯 Found ${response.data.jobs.length} jobs based on resume data`);
      
      if (response.data.resumeData) {
        console.log('📄 Resume data used:');
        console.log('- Current Job Title:', response.data.resumeData.currentJobTitle);
        console.log('- Top Skills:', response.data.resumeData.topSkills.join(', '));
        console.log('- Job Titles:', response.data.resumeData.jobTitles.join(', '));
        console.log('- Location:', response.data.resumeData.location);
      }
      
      if (response.data.jobs.length > 0) {
        console.log('\n🔍 Sample Jobs Found:');
        response.data.jobs.slice(0, 3).forEach((job, index) => {
          console.log(`${index + 1}. ${job.title} at ${job.company}`);
          console.log(`   Location: ${job.location}`);
          console.log(`   Apply: ${job.applyUrl}`);
          console.log('');
        });
      }
    } else {
      console.log('❌ Request failed:', response.data.message);
    }
    
  } catch (error) {
    console.error('❌ Error testing endpoint:', error.message);
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error code:', error.code);
    
    if (error.response) {
      console.error('📋 Error response status:', error.response.status);
      console.error('📋 Error response headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('📋 Error response data:', error.response.data);
    } else if (error.request) {
      console.error('📋 Request was made but no response received:', error.request);
    } else {
      console.error('📋 Error setting up request:', error.message);
    }
    
    console.error('❌ Full error stack:', error.stack);
  }
}

testResumeBasedJobs();