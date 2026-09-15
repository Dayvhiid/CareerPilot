const { Tool } = require('../../../../src/agents/core/Tool');

describe('Tool', () => {
  it('should throw if created without a name', () => {
    expect(() => new Tool({ handler: async () => null })).toThrow('Tool requires name and handler');
  });

  it('should throw if created without a handler', () => {
    expect(() => new Tool({ name: 'test' })).toThrow('Tool requires name and handler');
  });

  it('should execute the handler with input', async () => {
    const handler = jest.fn(async (input) => input.value);
    const tool = new Tool({ name: 'echo', handler });
    const result = await tool.execute({ value: 42 });
    expect(result).toBe(42);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('should throw if execute is called without input', async () => {
    const tool = new Tool({ name: 'test', handler: async () => null });
    await expect(tool.execute()).rejects.toThrow('requires an object input');
  });

  it('should return JSON representation', () => {
    const tool = new Tool({
      name: 'my_tool',
      description: 'Does something',
      inputSchema: { type: 'object' },
      handler: async () => null,
    });
    const json = tool.toJSON();
    expect(json.name).toBe('my_tool');
    expect(json.description).toBe('Does something');
    expect(json.inputSchema).toEqual({ type: 'object' });
  });
});
