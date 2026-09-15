const { Agent } = require('../../../../src/agents/core/Agent');
const { Tool } = require('../../../../src/agents/core/Tool');

describe('Agent', () => {
  it('should throw if created without a name', () => {
    expect(() => new Agent({})).toThrow('Agent requires a name');
  });

  it('should create an agent with tools', () => {
    const tool = new Tool({
      name: 'test_tool',
      handler: async () => 'done',
    });
    const agent = new Agent({
      name: 'TestAgent',
      description: 'A test agent',
      tools: [tool],
    });
    expect(agent.name).toBe('TestAgent');
    expect(agent.tools.size).toBe(1);
  });

  it('should throw when getting a non-existent tool', () => {
    const agent = new Agent({ name: 'TestAgent' });
    expect(() => agent.getTool('nonexistent')).toThrow('Tool "nonexistent" not found on agent "TestAgent"');
  });

  it('should execute a tool by name', async () => {
    const tool = new Tool({
      name: 'greet',
      handler: async ({ name }) => `Hello, ${name}`,
    });
    const agent = new Agent({ name: 'TestAgent', tools: [tool] });
    const result = await agent.executeTool('greet', { name: 'World' });
    expect(result).toBe('Hello, World');
  });

  it('should return JSON representation', () => {
    const tool = new Tool({
      name: 'test',
      description: 'A test tool',
      inputSchema: { type: 'object', properties: { x: { type: 'string' } } },
      handler: async () => null,
    });
    const agent = new Agent({ name: 'TestAgent', description: 'desc', tools: [tool] });
    const json = agent.toJSON();
    expect(json.name).toBe('TestAgent');
    expect(json.tools).toHaveLength(1);
    expect(json.tools[0].name).toBe('test');
  });
});
