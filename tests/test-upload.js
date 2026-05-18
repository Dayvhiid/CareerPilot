const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

async function testResumeUpload() {
    try {
        console.log('🚀 Testing resume upload and extraction...');

        // Create form data
        const form = new FormData();
        const resumePath = path.join(__dirname, 'test-resume.txt');
        
        if (!fs.existsSync(resumePath)) {
            console.error('❌ Test resume file not found:', resumePath);
            return;
        }

        form.append('resume', fs.createReadStream(resumePath), {
            filename: 'test-resume.txt',
            contentType: 'text/plain'
        });

        console.log('📤 Uploading resume...');

        // Upload resume
        const uploadResponse = await axios.post('http://localhost:4000/api/resume/upload', form, {
            headers: {
                ...form.getHeaders()
            },
            timeout: 30000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        });

        console.log('✅ Upload successful:', uploadResponse.data);

        // Wait for processing
        console.log('⏳ Waiting for processing to complete...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        // Get processed resume
        const getResponse = await axios.get('http://localhost:4000/api/resume');
        
        console.log('📊 Resume processing status:', getResponse.data.resume.isProcessed ? 'Complete' : 'In Progress');
        
        if (getResponse.data.resume.extractedData) {
            const data = getResponse.data.resume.extractedData;
            console.log('\n📋 Extracted Data Summary:');
            console.log('- Processing Method:', data.processingMethod);
            console.log('- Name:', data.name || 'Not found');
            console.log('- Email:', data.email || 'Not found');
            console.log('- Phone:', data.phone || 'Not found');
            console.log('- Location:', data.location || 'Not found');
            console.log('- Skills:', data.skills.length, 'found');
            console.log('- Job Titles:', data.jobTitles.length, 'found');
            console.log('- Companies:', data.companies.length, 'found');  
            console.log('- Experience entries:', data.experience.length);
            console.log('- Education entries:', data.education.length);
            console.log('- Years of Experience:', data.yearsOfExperience);
            
            console.log('\n🔍 Detailed Results:');
            console.log('Skills:', data.skills.slice(0, 10)); // Show first 10 skills
            console.log('Job Titles:', data.jobTitles);
            console.log('Companies:', data.companies);
            console.log('Industry Experience:', data.industryExperience);
            
            if (data.skills.length > 0 && data.jobTitles.length > 0) {
                console.log('\n✅ SUCCESS: Data extraction is working!');
            } else {
                console.log('\n⚠️ WARNING: Some data fields are still empty');
            }
        } else {
            console.log('❌ No extracted data found');
        }

    } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
    }
}

testResumeUpload();