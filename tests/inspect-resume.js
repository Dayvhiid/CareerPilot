const axios = require('axios');

async function inspectExistingResume() {
    try {
        console.log('🔍 Inspecting existing resume data...');
        
        const response = await axios.get('http://localhost:4000/api/resume');
        const extractedData = response.data.resume.extractedData;
        
        console.log('\n📊 Complete Extracted Data:');
        console.log(JSON.stringify(extractedData, null, 2));
        
        console.log('\n📋 Field Analysis:');
        console.log('- Processing Method:', extractedData.processingMethod);
        console.log('- Name:', extractedData.name || 'EMPTY');
        console.log('- Email:', extractedData.email || 'EMPTY');
        console.log('- Phone:', extractedData.phone || 'EMPTY');
        console.log('- Location:', extractedData.location || 'EMPTY');
        console.log('- Skills Count:', extractedData.skills ? extractedData.skills.length : 'UNDEFINED');
        console.log('- Job Titles Count:', extractedData.jobTitles ? extractedData.jobTitles.length : 'UNDEFINED');
        console.log('- Companies Count:', extractedData.companies ? extractedData.companies.length : 'UNDEFINED');
        console.log('- Experience Count:', extractedData.experience ? extractedData.experience.length : 'UNDEFINED');
        console.log('- Education Count:', extractedData.education ? extractedData.education.length : 'UNDEFINED');
        console.log('- Years of Experience:', extractedData.yearsOfExperience);
        console.log('- Soft Skills Count:', extractedData.softSkills ? extractedData.softSkills.length : 'UNDEFINED');
        console.log('- Industry Experience Count:', extractedData.industryExperience ? extractedData.industryExperience.length : 'UNDEFINED');
        
        if (extractedData.skills && extractedData.skills.length > 0) {
            console.log('\n🔧 Skills Found:');
            extractedData.skills.forEach((skill, index) => {
                console.log(`  ${index + 1}. ${skill}`);
            });
        }
        
        if (extractedData.companies && extractedData.companies.length > 0) {
            console.log('\n🏢 Companies Found:');
            extractedData.companies.forEach((company, index) => {
                console.log(`  ${index + 1}. ${company}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Failed to inspect resume:', error.message);
    }
}

inspectExistingResume();