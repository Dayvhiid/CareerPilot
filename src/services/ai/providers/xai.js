const axios = require('axios');

class XaiProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'grok-4.3';
    this.baseUrl = 'https://api.x.ai/v1/chat/completions';
    this.timeout = config.timeout || 30000;
  }

  async generate(prompt, options = {}) {
    const response = await axios.post(this.baseUrl, {
      model: this.model,
      messages: [
        { role: 'system', content: 'You extract structured JSON data from resumes. Return only valid JSON.' },
        { role: 'user', content: prompt }
      ],
      temperature: options.temperature || 0.1,
      max_tokens: options.maxTokens || 4000
    }, {
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      timeout: this.timeout
    });
    return response.data.choices?.[0]?.message?.content;
  }

  async embed(text) {
    return null;
  }
}

module.exports = XaiProvider;
