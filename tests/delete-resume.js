const axios = require('axios');

async function deleteResume() {
    try {
        console.log('🗑️ Deleting existing resume...');
        const response = await axios.delete('http://localhost:4000/api/resume');
        console.log('✅ Resume deleted:', response.data);
    } catch (error) {
        console.error('❌ Failed to delete resume:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
    }
}

deleteResume();