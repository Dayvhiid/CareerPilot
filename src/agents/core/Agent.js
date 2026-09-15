const { Tool } = require('./Tool');
const { logger } = require('../../config/logger');

class Agent {
  constructor({ name, description, tools, memory }) {
    if (!name) {
      throw new Error('Agent requires a name');
    }
    this.name = name;
    this.description = description || '';
    this.tools = new Map();
    this.memory = memory || null;

    if (Array.isArray(tools)) {
      for (const tool of tools) {
        if (tool instanceof Tool) {
          this.tools.set(tool.name, tool);
        } else {
          logger.warn(`[Agent:${name}] Skipping invalid tool registration`);
        }
      }
    }
  }

  getTool(name) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool "${name}" not found on agent "${this.name}"`);
    }
    return tool;
  }

  async executeTool(toolName, input) {
    const tool = this.getTool(toolName);
    logger.debug(`[Agent:${this.name}] Executing tool: ${toolName}`);
    return tool.execute(input);
  }

  toJSON() {
    return {
      name: this.name,
      description: this.description,
      tools: Array.from(this.tools.values()).map((t) => t.toJSON()),
    };
  }
}

module.exports = { Agent };
