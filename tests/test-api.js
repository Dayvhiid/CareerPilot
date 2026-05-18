const axios = require('axios');

async function testAPI() {
    try {
        console.log('🔍 Testing API endpoints...');
        
        // Test health check
        const healthResponse = await axios.get('http://localhost:4000/api/resume');
        console.log('✅ API is responding:', healthResponse.status);
        console.log('Response:', healthResponse.data);
        
    } catch (error) {
        console.error('❌ API test failed:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

testAPI();