const axios = require('axios');

class GroqProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'llama-3.3-70b-versatile';
    this.baseUrl = 'https://api.groq.com/openai/v1/chat/completions';
    this.timeout = config.timeout || 30000;
  }

  async generate(prompt, options = {}) {
    const response = await axios.post(
      this.baseUrl,
      {
        model: this.model,
        messages: [
          { role: 'system', content: 'You extract structured JSON data from resumes. Return only valid JSON.' },
          { role: 'user', content: prompt },
        ],
        temperature: options.temperature || 0.1,
        max_tokens: options.maxTokens || 4000,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: this.timeout,
      }
    );
    return response.data.choices?.[0]?.message?.content;
  }

  async embed(_text) {
    return null;
  }
}

module.exports = GroqProvider;
