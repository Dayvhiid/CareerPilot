class Tool {
  constructor({ name, description, inputSchema, handler }) {
    if (!name || !handler) {
      throw new Error('Tool requires name and handler');
    }
    this.name = name;
    this.description = description || '';
    this.inputSchema = inputSchema || { type: 'object', properties: {} };
    this.handler = handler;
  }

  async execute(input) {
    if (!input || typeof input !== 'object') {
      throw new Error(`Tool "${this.name}" requires an object input`);
    }
    return this.handler(input);
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      inputSchema: this.inputSchema,
    };
  }
}

module.exports = { Tool };
