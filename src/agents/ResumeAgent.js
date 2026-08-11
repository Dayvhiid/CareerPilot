const { Agent } = require('./core/Agent');
const { Tool } = require('./core/Tool');
const analyzeResume = require('./tools/resumeAgent/analyzeResume');
const tailorResume = require('./tools/resumeAgent/tailorResume');
const identifyWeakPoints = require('./tools/resumeAgent/identifyWeakPoints');
const scoreResume = require('./tools/resumeAgent/scoreResume');
const suggestSkillImprovements = require('./tools/resumeAgent/suggestSkillImprovements');
const extractResumeText = require('./tools/resumeAgent/extractResumeText');
const generateResumeSummary = require('./tools/resumeAgent/generateResumeSummary');
const compareResumeToJob = require('./tools/resumeAgent/compareResumeToJob');

class ResumeAgent extends Agent {
  constructor(memory) {
    const tools = [
      new Tool({
        name: 'extract_resume_text',
        description: 'Extract raw text from a resume file (PDF, DOCX, DOC, TXT)',
        inputSchema: {
          type: 'object',
          properties: {
            filePath: { type: 'string' },
            mimeType: { type: 'string' },
          },
          required: ['filePath', 'mimeType'],
        },
        handler: extractResumeText,
      }),
      new Tool({
        name: 'analyze_resume',
        description: 'Analyze resume data and extract structured information including skills, experience, and domain',
        inputSchema: {
          type: 'object',
          properties: {
            extractedText: { type: 'string' },
            extractedData: { type: 'object' },
          },
        },
        handler: analyzeResume,
      }),
      new Tool({
        name: 'score_resume',
        description: 'Score a resume from 1-10 with detailed category breakdown and improvement recommendations',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object' },
          },
          required: ['extractedData'],
        },
        handler: scoreResume,
      }),
      new Tool({
        name: 'identify_weak_points',
        description: 'Identify weak areas in a resume with severity ratings and actionable suggestions',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object' },
          },
          required: ['extractedData'],
        },
        handler: identifyWeakPoints,
      }),
      new Tool({
        name: 'suggest_skill_improvements',
        description: 'Suggest skills to learn based on industry trends and target domain',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object' },
            targetDomain: { type: 'string' },
          },
          required: ['extractedData'],
        },
        handler: suggestSkillImprovements,
      }),
      new Tool({
        name: 'tailor_resume',
        description: 'Tailor resume content to match a specific job description, improving match score',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object' },
            jobDescription: { type: 'string' },
            targetCompany: { type: 'string' },
            targetRole: { type: 'string' },
          },
          required: ['extractedData', 'jobDescription'],
        },
        handler: tailorResume,
      }),
      new Tool({
        name: 'generate_resume_summary',
        description: 'Generate a professional summary for a resume in various styles',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object' },
            style: { type: 'string', enum: ['brief', 'professional', 'detailed'] },
            maxLength: { type: 'number' },
          },
          required: ['extractedData'],
        },
        handler: generateResumeSummary,
      }),
      new Tool({
        name: 'compare_resume_to_job',
        description: 'Compare a resume against a job description and provide a match analysis',
        inputSchema: {
          type: 'object',
          properties: {
            extractedData: { type: 'object' },
            jobDescription: { type: 'string' },
            jobTitle: { type: 'string' },
          },
          required: ['extractedData', 'jobDescription'],
        },
        handler: compareResumeToJob,
      }),
    ];

    super({
      name: 'ResumeAgent',
      description: 'Analyzes, scores, tailors, and optimizes resumes. Provides skill gap analysis and job match comparison.',
      tools,
      memory,
    });
  }
}

module.exports = ResumeAgent;
