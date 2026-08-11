const { logger } = require('../../config/logger');

class AgentRegistry {
  constructor() {
    this._agents = new Map();
  }

  register(agent) {
    if (!agent || !agent.name) {
      throw new Error('Cannot register agent without a name');
    }
    if (this._agents.has(agent.name)) {
      logger.warn(`[AgentRegistry] Overwriting existing agent: ${agent.name}`);
    }
    this._agents.set(agent.name, agent);
    logger.info(`[AgentRegistry] Registered agent: ${agent.name}`);
  }

  get(name) {
    const agent = this._agents.get(name);
    if (!agent) {
      throw new Error(`Agent "${name}" not found`);
    }
    return agent;
  }

  list() {
    return Array.from(this._agents.keys());
  }

  listAgents() {
    return Array.from(this._agents.values());
  }
}

module.exports = new AgentRegistry();
