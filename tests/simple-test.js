const http = require('http');

console.log('🧪 Testing resume-based jobs endpoint with simple HTTP request...');

const options = {
  hostname: 'localhost',
  port: 4000,
  path: '/api/jobs/resume-based',
  method: 'GET',
  headers: {
    'Content-Type': 'application/json'
  }
};

const req = http.request(options, (res) => {
  console.log(`✅ Status: ${res.statusCode}`);
  console.log(`📋 Headers:`, res.headers);
  
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('📊 Raw Response:', data);
    
    if (res.headers['content-type'] && res.headers['content-type'].includes('application/json')) {
      try {
        const jsonData = JSON.parse(data);
        console.log('🎯 Parsed JSON:', JSON.stringify(jsonData, null, 2));
      } catch (e) {
        console.error('❌ JSON Parse Error:', e.message);
      }
    } else {
      console.log('⚠️ Response is not JSON, content-type:', res.headers['content-type']);
    }
  });
});

req.on('error', (err) => {
  console.error('❌ Request Error:', err.message);
});

req.setTimeout(10000, () => {
  console.error('❌ Request Timeout');
  req.destroy();
});

req.end();