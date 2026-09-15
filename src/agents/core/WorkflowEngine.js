const { logger } = require('../../config/logger');

class WorkflowEngine {
  constructor() {
    this.graphs = new Map();
  }

  defineGraph(name, definition) {
    if (!name || !definition || !definition.nodes) {
      throw new Error('Workflow graph requires name and nodes array');
    }
    this.graphs.set(name, {
      nodes: definition.nodes,
      edges: definition.edges || [],
      startNode: definition.startNode || (definition.nodes[0] ? definition.nodes[0].id : null),
    });
    logger.info(`[WorkflowEngine] Defined graph: "${name}" with ${definition.nodes.length} nodes`);
  }

  getGraph(name) {
    const graph = this.graphs.get(name);
    if (!graph) throw new Error(`Graph "${name}" not found`);
    return graph;
  }

  async execute(userId, graphName, context = {}) {
    const graph = this.getGraph(graphName);
    const results = [];
    let currentNodeId = graph.startNode;
    const visited = new Set();

    while (currentNodeId) {
      if (visited.has(currentNodeId)) {
        throw new Error(`Cycle detected at node: ${currentNodeId}`);
      }
      visited.add(currentNodeId);

      const node = graph.nodes.find((n) => n.id === currentNodeId);
      if (!node) {
        throw new Error(`Node "${currentNodeId}" not found in graph "${graphName}"`);
      }

      const nodeResult = await this._executeNode(node, { userId, ...context, results });
      results.push({ nodeId: currentNodeId, result: nodeResult });

      currentNodeId = this._resolveNextNode(node, nodeResult, graph, { userId, ...context });
    }

    return results;
  }

  async _executeNode(node, context) {
    switch (node.type) {
      case 'agent_task':
        return this._executeAgentTask(node, context);
      case 'human_gate':
        return this._executeHumanGate(node, context);
      case 'branch':
        return this._executeBranch(node, context);
      case 'transform':
        return this._executeTransform(node, context);
      default:
        logger.warn(`[WorkflowEngine] Unknown node type: ${node.type}`);
        return null;
    }
  }

  async _executeAgentTask(node, context) {
    const { executeTool } = node.config || {};
    if (!executeTool) return { status: 'skipped', reason: 'No executeTool config' };
    try {
      const result = await executeTool(context);
      return { status: 'completed', data: result };
    } catch (err) {
      logger.error(`[WorkflowEngine] Agent task failed: ${err.message}`);
      return { status: 'failed', error: err.message };
    }
  }

  async _executeHumanGate(node, context) {
    const { message, gateId } = node.config || {};
    return {
      status: 'awaiting_approval',
      gateId: gateId || node.id,
      message: message || 'Awaiting user approval',
      context,
    };
  }

  _executeBranch(node, context) {
    const { condition } = node.config || {};
    if (!condition) return { status: 'skipped', reason: 'No condition' };
    const result = condition(context);
    return { status: 'evaluated', branch: !!result };
  }

  async _executeTransform(node, context) {
    const { transform } = node.config || {};
    if (!transform) return { status: 'skipped', reason: 'No transform' };
    try {
      const result = await transform(context);
      return { status: 'completed', data: result };
    } catch (err) {
      return { status: 'failed', error: err.message };
    }
  }

  _resolveNextNode(node, nodeResult, graph, context) {
    const outgoing = graph.edges.filter((e) => e.from === node.id);

    if (outgoing.length === 0) return null;

    if (node.type === 'branch') {
      const branch = nodeResult.branch;
      const match = outgoing.find((e) => e.label === (branch ? 'yes' : 'no'));
      return (match || outgoing[0]).to;
    }

    if (node.type === 'human_gate') {
      const gates = context && context._gates;
      const approved = gates && gates[node.config.gateId || node.id];
      const match = outgoing.find((e) => e.label === (approved ? 'approved' : 'rejected'));
      return (match || outgoing[0]).to;
    }

    return outgoing[0].to;
  }
}

module.exports = { WorkflowEngine };
