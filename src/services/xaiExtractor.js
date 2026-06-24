const axios = require('axios');

const XAI_API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = 'grok-4.3';

async function extractResumeData(text) {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    console.error('❌ XAI_API_KEY is not set in environment variables');
    throw new Error('XAI_API_KEY is not set');
  }

  console.log('🔑 XAI_API_KEY present, prefix:', apiKey.substring(0, 8) + '...');
  console.log(`📡 Sending request to x.ai API (${XAI_API_URL}) with model ${MODEL}`);
  console.log(`📄 Resume text length: ${text.length} characters`);

  const prompt = `You are a resume parsing engine. Extract structured data from the resume text below and return ONLY valid JSON with no additional text, explanation, or markdown formatting.

The JSON must follow this exact schema:
{
  "name": "string (full name of the candidate)",
  "email": "string",
  "phone": "string",
  "location": "string (city, state, country)",
  "summary": "string (brief professional summary from resume)",
  "currentJobTitle": "string (most recent or current job title)",
  "yearsOfExperience": "number (total years of professional experience)",
  "skills": ["array of technical/professional skills"],
  "softSkills": ["array of soft skills like leadership, communication, etc."],
  "industryExperience": ["array of industries the candidate has worked in"],
  "jobTitles": ["array of all job titles mentioned"],
  "companies": ["array of companies worked at"],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "year": "string",
      "location": "string"
    }
  ],
  "workExperience": [
    {
      "position": "string",
      "company": "string",
      "duration": "string",
      "location": "string",
      "responsibilities": "string (brief description of responsibilities)",
      "contact": "string"
    }
  ],
  "projects": [
    {
      "name": "string",
      "description": "string",
      "dates": "string"
    }
  ],
  "certificates": [
    {
      "name": "string",
      "issuer": "string",
      "date": "string"
    }
  ],
  "interests": ["array of interests"],
  "achievements": ["array of achievements"],
  "languages": ["array of languages"],
  "linkedinUrl": "string",
  "githubUrl": "string",
  "portfolioUrl": "string",
  "generatedSummary": "string (write a 2-3 sentence professional summary based on the resume)"

Return ONLY the JSON object. No markdown, no code fences, no extra text.

Resume text:
${text}`;

  let response;
  try {
    response = await axios.post(
      XAI_API_URL,
      {
        model: MODEL,
        messages: [
          { role: 'system', content: 'You extract structured JSON data from resumes. Return only valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 4000
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );
    console.log(`✅ x.ai API responded with status ${response.status}`);
  } catch (err) {
    if (err.response) {
      console.error(`❌ x.ai API error ${err.response.status}:`, JSON.stringify(err.response.data, null, 2));
    } else if (err.code === 'ECONNABORTED') {
      console.error('❌ x.ai API request timed out after 30s');
    } else {
      console.error('❌ x.ai API request failed:', err.message);
    }
    throw err;
  }

  const content = response.data.choices[0].message.content.trim();
  console.log(`📝 x.ai raw response length: ${content.length} chars`);
  console.log('📝 x.ai response preview:', content.substring(0, 200));

  const jsonMatch = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(jsonMatch);

  console.log('✅ Successfully parsed x.ai JSON response');
  return parsed;
}

module.exports = { extractResumeData };
