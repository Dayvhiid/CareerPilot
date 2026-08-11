const registry = require('./core/AgentRegistry');
const { MemoryStore } = require('./core/MemoryStore');
const { VectorStore } = require('./memory/VectorStore');
const ResumeAgent = require('./ResumeAgent');
const UserPreference = require('../models/UserPreference');
const { logger } = require('../config/logger');

let memoryStore = null;

async function initializeAgents() {
  const vectorStore = new VectorStore({ type: 'memory' });

  memoryStore = new MemoryStore({
    userPreferenceModel: UserPreference,
    vectorStore,
  });

  const resumeAgent = new ResumeAgent(memoryStore);
  registry.register(resumeAgent);

  logger.info(`[Agents] Initialized ${registry.list().length} agent(s):`);
  for (const name of registry.list()) {
    const agent = registry.get(name);
    logger.info(`  - ${name}: ${agent.tools.size} tools`);
  }
}

function getMemoryStore() {
  return memoryStore;
}

module.exports = { initializeAgents, getMemoryStore };
