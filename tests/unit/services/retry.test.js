const { withRetry } = require('../../../src/utils/retry');

describe('withRetry', () => {
  it('should return result on success', async () => {
    const fn = jest.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ response: { status: 500 } })
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after all retries exhausted', async () => {
    const error = { response: { status: 500 } };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 2, baseDelay: 10 })).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry non-retryable errors', async () => {
    const error = { response: { status: 400 } };
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { maxRetries: 3, baseDelay: 10 })).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on ECONNRESET', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce({ code: 'ECONNRESET' })
      .mockResolvedValue('success');

    const result = await withRetry(fn, { maxRetries: 3, baseDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should respect custom shouldRetry function', async () => {
    const shouldRetry = jest.fn().mockReturnValue(false);
    const error = new Error('custom');
    const fn = jest.fn().mockRejectedValue(error);

    await expect(withRetry(fn, { shouldRetry, maxRetries: 3, baseDelay: 10 })).rejects.toEqual(error);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
