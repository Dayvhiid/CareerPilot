const axios = require('axios');

async function testFrontendData() {
    try {
        console.log('🔍 Testing what frontend receives...');
        
        const response = await axios.get('http://localhost:4000/api/resume');
        
        if (response.data && response.data.resume && response.data.resume.extractedData) {
            const data = response.data.resume.extractedData;
            
            console.log('📊 Frontend receives this data structure:');
            console.log('- skills array length:', data.skills?.length || 0);
            console.log('- jobTitles array length:', data.jobTitles?.length || 0);
            console.log('- companies array length:', data.companies?.length || 0);
            console.log('- industries array length:', data.industryExperience?.length || 0);
            
            console.log('\n🔍 Sample data:');
            console.log('- First 3 skills:', data.skills?.slice(0, 3) || []);
            console.log('- Job titles:', data.jobTitles || []);
            console.log('- Companies:', data.companies || []);
            console.log('- Industries:', data.industryExperience || []);
            
            // Check if arrays are actually empty or have data
            const hasData = data.skills?.length > 0 || data.jobTitles?.length > 0 || data.companies?.length > 0;
            
            if (hasData) {
                console.log('✅ Data is present - frontend should display it correctly');
            } else {
                console.log('❌ All arrays are empty - this is the problem');
            }
            
        } else {
            console.log('❌ No extracted data found');
        }
        
    } catch (error) {
        console.error('❌ Error testing frontend data:', error.message);
    }
}

testFrontendData();