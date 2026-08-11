jest.mock('../../../src/utils/retry', () => ({
  withRetry: jest.fn((fn) => fn()),
}));

jest.mock('../../../src/services/ai/AIService', () => ({
  generate: jest.fn(),
  extractResumeData: jest.fn(),
  computeEmbedding: jest.fn(),
}));

const ResumeAgent = require('../../../src/agents/ResumeAgent');
const aiService = require('../../../src/services/ai/AIService');

describe('ResumeAgent', () => {
  let agent;
  beforeEach(() => {
    agent = new ResumeAgent(null);
  });

  it('should register with the correct name', () => {
    expect(agent.name).toBe('ResumeAgent');
  });

  it('should have 8 tools', () => {
    expect(agent.tools.size).toBe(8);
  });

  it('should have all expected tool names', () => {
    const names = Array.from(agent.tools.keys());
    expect(names).toContain('extract_resume_text');
    expect(names).toContain('analyze_resume');
    expect(names).toContain('score_resume');
    expect(names).toContain('identify_weak_points');
    expect(names).toContain('suggest_skill_improvements');
    expect(names).toContain('tailor_resume');
    expect(names).toContain('generate_resume_summary');
    expect(names).toContain('compare_resume_to_job');
  });

  describe('score_resume', () => {
    it('should return a score object with breakdown', async () => {
      const result = await agent.executeTool('score_resume', {
        extractedData: {
          name: 'John',
          email: 'john@test.com',
          skills: ['js', 'node', 'react', 'python', 'sql', 'aws'],
          workExperience: [{ title: 'Dev', company: 'Co', responsibilities: 'x'.repeat(60) }],
          education: [{ degree: 'BS', institution: 'MIT' }],
        },
      });
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('recommendations');
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.score).toBeLessThanOrEqual(10);
    });

    it('should throw without extractedData', async () => {
      await expect(agent.executeTool('score_resume', {})).rejects.toThrow();
    });
  });

  describe('suggest_skill_improvements', () => {
    it('should return suggestions for a known domain', async () => {
      const result = await agent.executeTool('suggest_skill_improvements', {
        extractedData: {
          skills: ['JavaScript'],
        },
        targetDomain: 'Software Engineering',
      });
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.grouped).toHaveProperty('high');
      expect(result.targetDomain).toBe('Software Engineering');
    });
  });

  describe('analyze_resume', () => {
    it('should call AI service and return analysis', async () => {
      aiService.generate.mockResolvedValue(JSON.stringify({
        name: 'John',
        currentJobTitle: 'Engineer',
        yearsOfExperience: 5,
        domain: 'Software Engineering',
        skillCount: 8,
        topSkills: ['js', 'node'],
        skillGaps: ['docker'],
        experienceLevel: 'mid',
        strengths: ['Strong technical skills'],
        weaknesses: ['Missing cloud experience'],
        summary: 'Experienced engineer',
      }));

      const result = await agent.executeTool('analyze_resume', {
        extractedData: { name: 'John' },
      });
      expect(result.name).toBe('John');
      expect(result.domain).toBe('Software Engineering');
      expect(aiService.generate).toHaveBeenCalled();
    });
  });
});
