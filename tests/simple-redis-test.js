const axios = require('axios');

async function simpleTest() {
  try {
    console.log('🧪 Simple API test...');
    console.log('📍 Making request to: http://localhost:4000/api/jobs/resume-based');
    console.log('⏰ Timestamp:', new Date().toISOString());
    
    const response = await axios.get('http://localhost:4000/api/jobs/resume-based', { 
      timeout: 15000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Redis-Test/1.0'
      }
    });
    
    console.log('✅ Success!');
    console.log('📊 Response status:', response.status);
    console.log('📊 Jobs found:', response.data.jobs?.length || 0);
    console.log('💾 From cache:', response.data.fromCache);
    console.log('🔑 Cache key:', response.data.cacheKey);
    console.log('🕐 Response timestamp:', response.data.timestamp);
    
    if (response.data.fetchError) {
      console.log('⚠️ API fetch error:', response.data.fetchError);
    }
    
    // Test cache stats
    console.log('\n📈 Testing cache stats...');
    const stats = await axios.get('http://localhost:4000/api/jobs/cache/stats');
    console.log('📈 Cache stats:', JSON.stringify(stats.data, null, 2));
    
  } catch (error) {
    console.error('❌ Error type:', error.constructor.name);
    console.error('❌ Error message:', error.message);
    console.error('❌ Error code:', error.code);
    
    if (error.response) {
      console.error('📋 Response status:', error.response.status);
      console.error('📋 Response status text:', error.response.statusText);
      console.error('📋 Response headers:', JSON.stringify(error.response.headers, null, 2));
      console.error('📋 Response data:', JSON.stringify(error.response.data, null, 2));
    } else if (error.request) {
      console.error('📋 Request made but no response:', error.request);
    } else {
      console.error('📋 Error setting up request:', error.message);
    }
    
    console.error('❌ Full error stack:', error.stack);
  }
}

simpleTest();