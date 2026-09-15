const registry = require('../agents/core/AgentRegistry');

exports.listAgents = async (req, res) => {
  try {
    const agents = registry.listAgents().map((a) => a.toJSON());
    res.json({ success: true, data: agents });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAgent = async (req, res) => {
  try {
    const agent = registry.get(req.params.agentName);
    res.json({ success: true, data: agent.toJSON() });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
};

exports.executeTool = async (req, res) => {
  try {
    const { agentName, toolName } = req.params;
    const agent = registry.get(agentName);
    const result = await agent.executeTool(toolName, { ...req.body, userId: req.user.id });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
