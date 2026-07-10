jest.mock('../../../src/utils/retry', () => ({
  withRetry: jest.fn((fn) => fn())
}));

describe('AIService', () => {
  let AIService, mockProvider;

  beforeEach(() => {
    jest.resetModules();
    mockProvider = {
      generate: jest.fn(),
      embed: jest.fn()
    };

    jest.mock('../../../src/services/ai/providers/gemini', () => {
      return jest.fn(() => mockProvider);
    });

    AIService = require('../../../src/services/ai/AIService');
  });

  afterEach(() => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.GROQ_API_KEY;
    delete process.env.XAI_API_KEY;
  });

  it('should initialize with Gemini provider when GEMINI_API_KEY is set', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const service = new AIService.constructor();
    expect(service.primaryExtractor).toBeDefined();
    expect(service.embeddingService).toBeDefined();
  });

  it('should throw when all providers fail', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    mockProvider.generate.mockRejectedValue(new Error('API error'));

    const service = new AIService.constructor();

    await expect(service.extractResumeData('test text')).rejects.toThrow('API error');
  });

  it('should parse JSON response correctly', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const service = new AIService.constructor();

    const result = service.parseJSONResponse('```json\n{"name": "John"}\n```');
    expect(result).toEqual({ name: 'John' });
  });

  it('should parse JSON without code fences', () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const service = new AIService.constructor();

    const result = service.parseJSONResponse('{"name": "Jane"}');
    expect(result).toEqual({ name: 'Jane' });
  });
});
