const axios = require('axios');

async function quickTest() {
  console.log('🧪 Quick API Test Starting...');
  
  try {
    // Test 1: Basic connectivity
    console.log('\n1. Testing basic connectivity...');
    const response = await axios.get('http://localhost:4000/', {
      timeout: 5000,
      validateStatus: () => true
    });
    console.log('✅ Server responded with status:', response.status);
    
    // Test 2: Test resume-based endpoint
    console.log('\n2. Testing resume-based jobs endpoint...');
    const jobsResponse = await axios.get('http://localhost:4000/api/jobs/resume-based', {
      timeout: 10000,
      validateStatus: () => true,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    console.log('📊 Resume-based endpoint response:');
    console.log('   Status:', jobsResponse.status);
    console.log('   Status Text:', jobsResponse.statusText);
    console.log('   Content-Type:', jobsResponse.headers['content-type']);
    
    if (jobsResponse.status === 200) {
      console.log('✅ Success! Response data:', JSON.stringify(jobsResponse.data, null, 2));
    } else {
      console.log('❌ Error response:', jobsResponse.data);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('🔌 Server is not running or not accessible on port 4000');
    }
  }
}

quickTest();
