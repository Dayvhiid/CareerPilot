const axios = require('axios');

class GeminiProvider {
  constructor(config) {
    this.apiKey = config.apiKey;
    this.model = config.model || 'gemini-2.5-flash';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1/models';
    this.timeout = config.timeout || 30000;
  }

  async generate(prompt, options = {}) {
    const url = `${this.baseUrl}/${this.model}:generateContent?key=${this.apiKey}`;
    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: options.temperature || 0.1,
          maxOutputTokens: options.maxTokens || 4000,
        },
      },
      { timeout: this.timeout }
    );
    return response.data.candidates?.[0]?.content?.parts?.[0]?.text;
  }

  async embed(text) {
    const url = `${this.baseUrl}/${this.model}:embedContent?key=${this.apiKey}`;
    const response = await axios.post(
      url,
      {
        content: { parts: [{ text: text.substring(0, 8000) }] },
      },
      { timeout: this.timeout }
    );
    return response.data?.embedding?.values;
  }
}

module.exports = GeminiProvider;
