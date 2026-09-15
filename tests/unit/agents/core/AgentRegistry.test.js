const registry = require('../../../../src/agents/core/AgentRegistry');
const { Agent } = require('../../../../src/agents/core/Agent');

describe('AgentRegistry', () => {
  beforeEach(() => {
    registry._agents.clear();
  });

  it('should register and retrieve an agent', () => {
    const agent = new Agent({ name: 'TestAgent' });
    registry.register(agent);
    expect(registry.get('TestAgent')).toBe(agent);
  });

  it('should throw when getting a non-existent agent', () => {
    expect(() => registry.get('Nope')).toThrow('Agent "Nope" not found');
  });

  it('should list registered agent names', () => {
    registry.register(new Agent({ name: 'A' }));
    registry.register(new Agent({ name: 'B' }));
    expect(registry.list()).toEqual(['A', 'B']);
  });

  it('should throw if registering without a name', () => {
    expect(() => registry.register({})).toThrow('Cannot register agent without a name');
  });
});
