const { calculateScore } = require('../../../src/services/resumeScoringService');

describe('Resume Scoring Service', () => {
  describe('calculateScore', () => {
    it('should return 1 for null/undefined input', () => {
      expect(calculateScore(null)).toBe(1);
      expect(calculateScore(undefined)).toBe(1);
    });

    it('should return 1 for empty object', () => {
      expect(calculateScore({})).toBe(1);
    });

    it('should increase score with contact info', () => {
      const result = calculateScore({ name: 'John', email: 'john@test.com' });
      expect(result).toBeGreaterThan(1);
    });

    it('should increase score with skills', () => {
      const data = {
        name: 'John',
        email: 'john@test.com',
        skills: ['js', 'node', 'react', 'python', 'sql', 'aws', 'docker', 'redis', 'mongo', 'graphql'],
      };
      const result = calculateScore(data);
      expect(result).toBeGreaterThan(3);
    });

    it('should increase score with work experience', () => {
      const data = {
        name: 'John',
        email: 'john@test.com',
        workExperience: [
          { title: 'Dev', company: 'Co', responsibilities: 'a'.repeat(60) },
        ],
      };
      const result = calculateScore(data);
      expect(result).toBeGreaterThan(2);
    });

    it('should increase score with education', () => {
      const data = {
        name: 'John',
        email: 'john@test.com',
        education: [
          { degree: 'BS', institution: 'MIT' },
          { degree: 'MS', institution: 'Stanford' },
        ],
      };
      const result = calculateScore(data);
      expect(result).toBeGreaterThan(2);
    });

    it('should cap score at 10', () => {
      const fullData = {
        name: 'John',
        email: 'j@t.com',
        phone: '123',
        location: 'NY',
        summary: 'x'.repeat(200),
        skills: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
        softSkills: ['teamwork'],
        workExperience: [
          { title: 'Dev', company: 'Co', responsibilities: 'x'.repeat(60) },
          { title: 'Sr Dev', company: 'Co2', responsibilities: 'y'.repeat(60) },
        ],
        education: [
          { degree: 'BS', institution: 'MIT' },
          { degree: 'MS', institution: 'S' },
        ],
        currentJobTitle: 'Engineer',
        jobTitles: ['Junior', 'Senior'],
        certificates: ['AWS'],
        languages: ['English'],
      };
      expect(calculateScore(fullData)).toBeLessThanOrEqual(10);
    });
  });
});
