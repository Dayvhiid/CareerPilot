function convertChatDataToResume(chatData) {
  const parseYearsOfExperience = (exp) => {
    if (!exp) return 0;
    if (typeof exp === 'number') return exp;
    const match = exp.toString().match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  };

  const normalizeEmbeddedEntry = (entry, mapper) => {
    if (!entry) {
      return null;
    }

    if (typeof entry === 'string') {
      const value = entry.trim();
      return value ? mapper(value, {}) : null;
    }

    if (typeof entry === 'object') {
      return mapper('', entry);
    }

    return null;
  };

  const normalizeEducation = (education) => {
    if (!Array.isArray(education)) return [];

    return education
      .map((entry) =>
        normalizeEmbeddedEntry(entry, (value, item) => {
          const degree = String(item.degree || item.title || item.name || value).trim();
          const institution = String(item.institution || item.school || item.university || '').trim();
          const year = String(item.year || item.date || '').trim();
          const location = String(item.location || '').trim();

          if (!degree && !institution && !year && !location) {
            return null;
          }

          return { degree, institution, year, location };
        })
      )
      .filter(Boolean);
  };

  const normalizeProjects = (projects) => {
    if (!Array.isArray(projects)) return [];

    return projects
      .map((entry) =>
        normalizeEmbeddedEntry(entry, (value, item) => ({
          name: String(item.name || item.title || value).trim(),
          description: String(item.description || '').trim(),
          dates: String(item.dates || item.date || '').trim(),
        }))
      )
      .filter((project) => project && (project.name || project.description || project.dates));
  };

  const normalizeCertificates = (certificates) => {
    if (!Array.isArray(certificates)) return [];

    return certificates
      .map((entry) =>
        normalizeEmbeddedEntry(entry, (value, item) => ({
          name: String(item.name || item.title || value).trim(),
          issuer: String(item.issuer || item.organization || '').trim(),
          date: String(item.date || item.year || '').trim(),
        }))
      )
      .filter((cert) => cert && (cert.name || cert.issuer || cert.date));
  };

  const cleanWorkExperience = (workExp) => {
    if (!Array.isArray(workExp)) return [];
    return workExp
      .filter((job) => job.position && job.position.trim().length > 0)
      .map(({ _contactAsked, ...job }) => job);
  };

  return {
    name: chatData.personalInfo?.name || '',
    email: chatData.personalInfo?.email || '',
    phone: chatData.personalInfo?.phone || '',
    location: chatData.personalInfo?.location || '',
    currentJobTitle: chatData.professionalSummary?.currentRole || '',
    summary: chatData.professionalSummary?.summary || '',
    yearsOfExperience: parseYearsOfExperience(chatData.professionalSummary?.experience),

    education: normalizeEducation(chatData.education),

    workExperience: cleanWorkExperience(chatData.workExperience),

    skills: Array.isArray(chatData.skills) ? chatData.skills : [],

    projects: normalizeProjects(chatData.projects),

    certificates: normalizeCertificates(chatData.certificates),

    achievements: Array.isArray(chatData.achievements) ? chatData.achievements : [],

    linkedinUrl: chatData.links?.find((link) => link.type === 'linkedin')?.url || '',
    githubUrl: chatData.links?.find((link) => link.type === 'github')?.url || '',
    portfolioUrl: chatData.links?.find((link) => link.type === 'medium')?.url || '',

    languages: [],
  };
}

module.exports = { convertChatDataToResume };
