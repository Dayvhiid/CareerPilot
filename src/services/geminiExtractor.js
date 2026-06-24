const axios = require('axios');

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models';
const MODEL = 'gemini-2.5-flash';

async function extractResumeData(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error('❌ GEMINI_API_KEY is not set in environment variables');
    throw new Error('GEMINI_API_KEY is not set');
  }

  console.log('🔑 GEMINI_API_KEY present, prefix:', apiKey.substring(0, 8) + '...');
  console.log(`📡 Sending request to Gemini API with model ${MODEL}`);
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

  const url = `${GEMINI_API_URL}/${MODEL}:generateContent?key=${apiKey}`;

  let response;
  try {
    response = await axios.post(
      url,
      {
        contents: [{
          parts: [{ text: prompt }]
        }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000
        }
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );
    console.log(`✅ Gemini API responded with status ${response.status}`);
  } catch (err) {
    if (err.response) {
      console.error(`❌ Gemini API error ${err.response.status}:`, JSON.stringify(err.response.data, null, 2));
    } else if (err.code === 'ECONNABORTED') {
      console.error('❌ Gemini API request timed out after 30s');
    } else {
      console.error('❌ Gemini API request failed:', err.message);
    }
    throw err;
  }

  const content = response.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!content) {
    console.error('❌ Gemini returned empty response');
    throw new Error('Gemini returned empty response');
  }

  console.log(`📝 Gemini raw response length: ${content.length} chars`);
  console.log('📝 Gemini response preview:', content.substring(0, 200));

  const jsonMatch = content.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(jsonMatch);

  console.log('✅ Successfully parsed Gemini JSON response');
  return parsed;
}

module.exports = { extractResumeData };