const { VectorStore } = require('../../../../src/agents/memory/VectorStore');

describe('VectorStore', () => {
  let store;
  beforeEach(() => {
    store = new VectorStore({ type: 'memory' });
  });

  it('should store and search vectors', async () => {
    await store.store('test', '1', 'hello', [1, 0, 0], { label: 'a' });
    await store.store('test', '2', 'world', [0, 1, 0], { label: 'b' });

    const results = await store.search('test', [1, 0, 0], 5);
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe('1');
    expect(results[0].similarity).toBeCloseTo(1, 2);
  });

  it('should return empty for non-existent collection', async () => {
    const results = await store.search('nothing', [1, 0, 0]);
    expect(results).toEqual([]);
  });

  it('should update existing entries', async () => {
    await store.store('test', '1', 'old', [1, 0, 0]);
    await store.store('test', '1', 'new', [0, 1, 0]);
    const results = await store.search('test', [0, 1, 0], 5);
    expect(results[0].text).toBe('new');
  });

  it('should delete collections', async () => {
    await store.store('test', '1', 'data', [1, 0, 0]);
    await store.deleteCollection('test');
    const results = await store.search('test', [1, 0, 0]);
    expect(results).toEqual([]);
  });
});
