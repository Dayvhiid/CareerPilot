const { calculateScore } = require('../../../services/resumeScoringService');

async function scoreResume({ extractedData }) {
  if (!extractedData || typeof extractedData !== 'object') {
    throw new Error('extractedData object is required');
  }

  const score = calculateScore(extractedData);

  const breakdown = {
    contactInfo: {
      score: (extractedData.name ? 0.4 : 0) + (extractedData.email ? 0.3 : 0) + (extractedData.phone ? 0.15 : 0) + (extractedData.location ? 0.15 : 0),
      max: 1.0,
    },
    summary: {
      score: ((extractedData.summary || extractedData.generatedSummary || '').length > 150 ? 1.0 : (extractedData.summary || '').length > 50 ? 0.7 : 0),
      max: 1.0,
    },
    skills: {
      score: Math.min(((extractedData.skills || []).length >= 10 ? 1.5 : (extractedData.skills || []).length >= 6 ? 1.0 : (extractedData.skills || []).length >= 3 ? 0.5 : 0) + ((extractedData.softSkills || []).length > 0 ? 0.5 : 0), 2.0),
      max: 2.0,
    },
    workExperience: {
      score: ((extractedData.workExperience || []).length >= 2 ? 1.0 : (extractedData.workExperience || []).length > 0 ? 0.5 : 0) + ((extractedData.workExperience || []).some((e) => (e.responsibilities || '').length > 50) ? 1.0 : 0),
      max: 2.0,
    },
    education: {
      score: Math.min(((extractedData.education || []).length >= 2 ? 1.0 : (extractedData.education || []).length > 0 ? 0.5 : 0) + ((extractedData.education || []).some((e) => e.degree && e.institution) ? 0.5 : 0), 1.5),
      max: 1.5,
    },
    careerProgression: {
      score: (extractedData.currentJobTitle ? 0.5 : 0) + ((extractedData.jobTitles || []).length >= 2 ? 0.5 : 0),
      max: 1.0,
    },
    extras: {
      score: ((extractedData.certificates || []).length > 0 ? 0.25 : 0) + ((extractedData.languages || []).length > 0 ? 0.25 : 0),
      max: 0.5,
    },
  };

  const recommendations = [];
  if (!extractedData.name || !extractedData.email) recommendations.push('Add complete contact information');
  if (!extractedData.summary && !extractedData.generatedSummary) recommendations.push('Add a professional summary');
  if ((extractedData.skills || []).length < 6) recommendations.push('List more relevant skills (aim for 6+)');
  if ((extractedData.workExperience || []).length === 0) recommendations.push('Add work experience entries');
  if ((extractedData.workExperience || []).some((e) => !e.responsibilities || e.responsibilities.length < 50)) recommendations.push('Add detailed descriptions to work experience');
  if ((extractedData.certificates || []).length === 0) recommendations.push('Consider adding certifications');

  return { score, breakdown, recommendations, maxScore: 10 };
}

module.exports = scoreResume;
