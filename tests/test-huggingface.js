const { HfInference } = require('@huggingface/inference');

async function testHuggingFaceModel() {
    const hf = new HfInference();
    
    const testText = `John Smith
Senior Software Engineer
john.smith@email.com | (555) 123-4567
Google Inc. | 2020-Present
Skills: Python, JavaScript, React, Node.js, AWS`;

    try {
        console.log('🔍 Testing HuggingFace resume-ner-bert-v2 model...');
        console.log('📄 Test text:', testText);
        
        const result = await hf.tokenClassification({
            model: 'yashpwr/resume-ner-bert-v2',
            inputs: testText,
            parameters: {
                aggregation_strategy: "simple"
            }
        });
        
        console.log('✅ Model response:', JSON.stringify(result, null, 2));
        
        if (result && Array.isArray(result)) {
            console.log(`📊 Found ${result.length} entities:`);
            result.forEach((entity, index) => {
                console.log(`  ${index + 1}. ${entity.entity_group}: "${entity.word}" (confidence: ${entity.score.toFixed(3)})`);
            });
        }
        
    } catch (error) {
        console.error('❌ Error testing HuggingFace model:', error.message);
        if (error.response) {
            console.error('Response:', error.response.data);
        }
    }
}

testHuggingFaceModel();