function calculateScore(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return 1;

  const d = extractedData;
  let score = 1;

  // Contact info completeness (max +1.0)
  if (d.name) score += 0.4;
  if (d.email) score += 0.3;
  if (d.phone) score += 0.15;
  if (d.location) score += 0.15;

  // Summary / profile (max +1.0)
  const summary = d.summary || d.generatedSummary || '';
  if (summary.length > 50) score += 0.7;
  if (summary.length > 150) score += 0.3;

  // Skills (max +2.0)
  const skillsCount = d.skills?.length || 0;
  if (skillsCount >= 3) score += 0.5;
  if (skillsCount >= 6) score += 0.5;
  if (skillsCount >= 10) score += 0.5;
  if (d.softSkills?.length > 0) score += 0.5;

  // Work experience (max +2.0)
  const expCount = d.workExperience?.length || 0;
  if (expCount > 0) score += 0.5;
  if (expCount >= 2) score += 0.5;
  const hasDetails = d.workExperience?.some((e) => e.responsibilities?.length > 50);
  if (hasDetails) score += 1.0;

  // Education (max +1.5)
  const eduCount = d.education?.length || 0;
  if (eduCount > 0) score += 0.5;
  if (eduCount >= 2) score += 0.5;
  const hasDetailedEdu = d.education?.some((e) => e.degree && e.institution);
  if (hasDetailedEdu) score += 0.5;

  // Career progression (max +1.0)
  if (d.currentJobTitle) score += 0.5;
  const titleCount = d.jobTitles?.length || 0;
  if (titleCount >= 2) score += 0.5;

  // Extras — certifications & languages (max +0.5)
  if (d.certificates?.length > 0) score += 0.25;
  if (d.languages?.length > 0) score += 0.25;

  return Math.min(Math.round(score * 10) / 10, 10);
}

module.exports = { calculateScore };
