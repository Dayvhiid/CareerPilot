const axios = require('axios');

async function testRedisCaching() {
  console.log('🧪 Testing Redis Caching for Resume-Based Jobs');
  console.log('='.repeat(60));
  
  try {
    // Test 1: First request (should fetch from API and cache)
    console.log('\n1️⃣ First request (should be cache MISS):');
    const start1 = Date.now();
    const response1 = await axios.get('http://localhost:4000/api/jobs/resume-based');
    const time1 = Date.now() - start1;
    
    console.log(`✅ Status: ${response1.status}`);
    console.log(`⏱️ Response time: ${time1}ms`);
    console.log(`📊 Jobs found: ${response1.data.jobs?.length || 0}`);
    console.log(`💾 From cache: ${response1.data.fromCache || false}`);
    console.log(`🔑 Cache key: ${response1.data.cacheKey || 'N/A'}`);
    
    // Test 2: Second request immediately (should be cache HIT)
    console.log('\n2️⃣ Second request (should be cache HIT):');
    const start2 = Date.now();
    const response2 = await axios.get('http://localhost:4000/api/jobs/resume-based');
    const time2 = Date.now() - start2;
    
    console.log(`✅ Status: ${response2.status}`);
    console.log(`⏱️ Response time: ${time2}ms`);
    console.log(`📊 Jobs found: ${response2.data.jobs?.length || 0}`);
    console.log(`💾 From cache: ${response2.data.fromCache || false}`);
    console.log(`🔑 Cache key: ${response2.data.cacheKey || 'N/A'}`);
    
    // Performance comparison
    const speedup = ((time1 - time2) / time1 * 100).toFixed(1);
    console.log(`\n🚀 Cache performance: ${speedup}% faster (${time1}ms → ${time2}ms)`);
    
    // Test 3: Check cache stats
    console.log('\n3️⃣ Cache statistics:');
    const statsResponse = await axios.get('http://localhost:4000/api/jobs/cache/stats');
    console.log('📈 Cache stats:', JSON.stringify(statsResponse.data, null, 2));
    
    // Test 4: Clear cache
    console.log('\n4️⃣ Clearing cache:');
    const clearResponse = await axios.delete('http://localhost:4000/api/jobs/cache/clear');
    console.log('🗑️ Clear result:', clearResponse.data);
    
    // Test 5: Request after cache clear (should be cache MISS again)
    console.log('\n5️⃣ Request after cache clear (should be cache MISS):');
    const start3 = Date.now();
    const response3 = await axios.get('http://localhost:4000/api/jobs/resume-based');
    const time3 = Date.now() - start3;
    
    console.log(`✅ Status: ${response3.status}`);
    console.log(`⏱️ Response time: ${time3}ms`);
    console.log(`💾 From cache: ${response3.data.fromCache || false}`);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
  
  console.log('\n🏁 Redis caching test completed');
  console.log('='.repeat(60));
}

testRedisCaching();