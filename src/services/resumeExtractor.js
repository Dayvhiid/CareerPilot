const nlp = require('compromise');

function normalizeEducationEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const cleanValue = entry.trim();
    return cleanValue ? { degree: cleanValue, institution: '', year: '', location: '' } : null;
  }
  if (typeof entry === 'object') {
    const degree = String(entry.degree || entry.title || entry.name || '').trim();
    const institution = String(entry.institution || entry.school || entry.university || '').trim();
    const year = String(entry.year || entry.date || '').trim();
    const location = String(entry.location || '').trim();
    return (degree || institution || year || location) ? { degree, institution, year, location } : null;
  }
  return null;
}

function normalizeEmbeddedArray(entries, mapper) {
  return Array.isArray(entries) ? entries.map(mapper).filter(Boolean) : [];
}

function normalizeExtractedData(extractedData) {
  if (!extractedData || typeof extractedData !== 'object') return getEmptyResumeData();

  // Map legacy snake_case fields to camelCase schema names
  if (extractedData.job_titles && !extractedData.jobTitles) extractedData.jobTitles = extractedData.job_titles;
  if (extractedData.years_experience !== undefined && !extractedData.yearsOfExperience) extractedData.yearsOfExperience = extractedData.years_experience;
  if (extractedData.soft_skills && !extractedData.softSkills) extractedData.softSkills = extractedData.soft_skills;
  if (extractedData.generated_summary && !extractedData.generatedSummary) extractedData.generatedSummary = extractedData.generated_summary;
  if (extractedData.industry && !extractedData.industryExperience) extractedData.industryExperience = [extractedData.industry];
  if (extractedData.certifications && !extractedData.certificates) extractedData.certificates = extractedData.certifications;
  if (extractedData.experience && !extractedData.workExperience) extractedData.workExperience = extractedData.experience;

  return {
    ...extractedData,
    education: normalizeEmbeddedArray(extractedData.education, normalizeEducationEntry),
    workExperience: normalizeEmbeddedArray(extractedData.workExperience, value => {
      if (!value) return null;
      if (typeof value === 'string') {
        const text = value.trim();
        return text ? { position: text, company: '', duration: '', location: '', responsibilities: '', contact: '' } : null;
      }
      if (typeof value === 'object') {
        return {
          position: String(value.position || value.title || value.role || '').trim(),
          company: String(value.company || value.employer || '').trim(),
          duration: String(value.duration || value.period || '').trim(),
          location: String(value.location || '').trim(),
          responsibilities: String(value.responsibilities || value.description || '').trim(),
          contact: String(value.contact || '').trim(),
        };
      }
      return null;
    }),
    projects: normalizeEmbeddedArray(extractedData.projects, value => {
      if (!value) return null;
      if (typeof value === 'string') {
        const text = value.trim();
        return text ? { name: text, description: '' } : null;
      }
      if (typeof value === 'object') {
        return {
          name: String(value.name || value.title || '').trim(),
          description: String(value.description || '').trim(),
          dates: String(value.dates || value.date || '').trim(),
          url: String(value.url || '').trim(),
        };
      }
      return null;
    }),
    certificates: normalizeEmbeddedArray(extractedData.certificates || extractedData.certifications, value => {
      if (!value) return null;
      if (typeof value === 'string') return value.trim() ? { name: value.trim() } : null;
      if (typeof value === 'object') {
        return {
          name: String(value.name || value.title || '').trim(),
          issuer: String(value.issuer || value.organization || '').trim(),
          date: String(value.date || value.year || '').trim(),
        };
      }
      return null;
    }),
    languages: normalizeEmbeddedArray(extractedData.languages, value => {
      if (!value) return null;
      if (typeof value === 'string') return value.trim() || null;
      if (typeof value === 'object') return value.name || value.language || null;
      return null;
    }),
    achievements: normalizeEmbeddedArray(extractedData.achievements, value => {
      if (!value) return null;
      return typeof value === 'string' ? value.trim() || null : String(value.description || value.name || '').trim() || null;
    }),
  };
}

function cleanTextForNLP(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .replace(/\s{2}/g, ' ')
    .replace(/[^\w\s@.,\-()\/\+\#\n]/g, ' ')
    .trim();
}

function extractContactInfo(text, data) {
  const emailPatterns = [
    /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
  ];
  for (const pattern of emailPatterns) {
    const emailMatch = text.match(pattern);
    if (emailMatch && emailMatch[0]) {
      data.email = emailMatch[0].toLowerCase();
      break;
    }
  }
  const phonePatterns = [
    /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /(\+?\d{1,4}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{4}/g,
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g
  ];
  for (const pattern of phonePatterns) {
    const phoneMatch = text.match(pattern);
    if (phoneMatch && phoneMatch[0]) {
      data.phone = phoneMatch[0].trim();
      break;
    }
  }
}

function extractNameEnhanced(lines, text) {
  const commonWords = ['resume', 'cv', 'curriculum', 'vitae', 'profile', 'contact', 'phone', 'email', 'address', 'objective', 'summary', 'experience', 'education', 'skills'];
  const titles = ['mr', 'mrs', 'ms', 'dr', 'prof', 'professor'];
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i].trim();
    if (line.includes('@') || /\d{3}/.test(line) || line.includes('http') || line.length < 4 || line.length > 60 || commonWords.some(word => line.toLowerCase().includes(word))) continue;
    const words = line.split(/\s+/).filter(word => word.length > 0);
    if (words.length >= 2 && words.length <= 5) {
      const isValidName = words.every(word => {
        const cleanWord = word.replace(/[^a-zA-Z'-]/g, '');
        return cleanWord.length > 1 && /^[A-Z][a-z'-]*$/.test(cleanWord) && !commonWords.includes(cleanWord.toLowerCase());
      });
      if (isValidName) {
        const nameWords = words.filter(word => !titles.includes(word.toLowerCase().replace('.', '')));
        if (nameWords.length >= 2) return nameWords.join(' ');
      }
    }
  }
  try {
    const doc = nlp(text.substring(0, 1500));
    const people = doc.people().out('array');
    for (const person of people) {
      if (person.length > 4 && person.length < 50 && !commonWords.some(word => person.toLowerCase().includes(word))) return person;
    }
  } catch (e) { /* ignore */ }
  const headerMatch = text.substring(0, 500).match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m);
  if (headerMatch && headerMatch[1] && !commonWords.some(word => headerMatch[1].toLowerCase().includes(word))) return headerMatch[1].trim();
  return '';
}

function extractLocationEnhanced(text) {
  const locationPatterns = [
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/g,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g,
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g
  ];
  const validStates = ['AL','AK','AZ','AR','CA','CO','CT','DE','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH','NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT','VT','VA','WA','WV','WI','WY'];
  for (const pattern of locationPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const stateOrCountry = match[2];
      if (stateOrCountry && stateOrCountry.length === 2 && validStates.includes(stateOrCountry)) return match[0].trim();
      if (match[0].length > 5 && match[0].length < 50) return match[0].trim();
    }
  }
  return '';
}

function extractLocation(text) {
  const locationPatterns = [
    /([A-Z][a-z]+,\s*[A-Z]{2,}(?:\s+\d{5})?)/g,
    /([A-Z][a-z]+,\s*[A-Z][a-z]+)/g,
    /\b([A-Z][a-z]+)\s*,\s*([A-Z]{2})\b/g
  ];
  for (const pattern of locationPatterns) {
    const matches = text.match(pattern);
    if (matches && matches[0]) return matches[0];
  }
  return '';
}

function extractUrls(text, data) {
  const linkedinPattern = /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+/gi;
  const githubPattern = /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9-]+/gi;
  const portfolioPatterns = [
    /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|net|org|io|dev)/gi,
    /portfolio[:\s]*(?:https?:\/\/)?[a-zA-Z0-9.-]+/gi
  ];
  const linkedinMatch = text.match(linkedinPattern);
  if (linkedinMatch) data.linkedinUrl = linkedinMatch[0];
  const githubMatch = text.match(githubPattern);
  if (githubMatch) data.githubUrl = githubMatch[0];
  for (const pattern of portfolioPatterns) {
    const portfolioMatch = text.match(pattern);
    if (portfolioMatch && !portfolioMatch[0].includes('linkedin') && !portfolioMatch[0].includes('github')) {
      data.portfolioUrl = portfolioMatch[0];
      break;
    }
  }
}

function extractSkills(text) {
  const skills = new Set();
  const techSkills = [
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin', 'TypeScript',
    'Scala', 'R', 'MATLAB', 'Perl', 'Dart', 'Objective-C', 'VB.NET', 'F#', 'Haskell', 'Clojure',
    'React', 'Angular', 'Vue.js', 'Svelte', 'Next.js', 'Nuxt.js', 'Gatsby', 'Ember.js',
    'HTML', 'CSS', 'SASS', 'SCSS', 'LESS', 'Bootstrap', 'Tailwind CSS', 'Material-UI', 'Chakra UI',
    'jQuery', 'D3.js', 'Three.js', 'Chart.js', 'Redux', 'MobX', 'Vuex',
    'Node.js', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'ASP.NET', 'Laravel', 'Rails',
    'Gin', 'Echo', 'Fiber', 'NestJS', 'Koa.js', 'Hapi.js',
    'MongoDB', 'MySQL', 'PostgreSQL', 'Oracle', 'Redis', 'SQLite', 'Cassandra', 'DynamoDB',
    'CouchDB', 'Neo4j', 'InfluxDB', 'Elasticsearch', 'Firebase', 'Supabase',
    'AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'GitHub Actions',
    'Terraform', 'Ansible', 'Chef', 'Puppet', 'Vagrant', 'Nginx', 'Apache', 'Heroku', 'Vercel', 'Netlify',
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'SVN', 'Jira', 'Confluence', 'Slack', 'Trello',
    'Agile', 'Scrum', 'Kanban', 'DevOps', 'CI/CD', 'TDD', 'BDD', 'REST API', 'GraphQL', 'gRPC',
    'Microservices', 'Machine Learning', 'AI', 'Data Science', 'Analytics', 'Tableau', 'Power BI',
    'Selenium', 'Jest', 'Mocha', 'Cypress', 'Playwright', 'JUnit', 'PyTest'
  ];
  const skillsSection = text.match(/(?:skills|technical skills|core competencies|technologies|expertise)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|education|$)/i);
  let searchText = skillsSection ? skillsSection[1] : text;
  techSkills.forEach(skill => {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(searchText)) skills.add(skill);
  });
  const skillLines = searchText.match(/[•\-\*]\s*([A-Za-z\s\.\+\#\/]+)|,\s*([A-Za-z\s\.\+\#\/]+)/g);
  if (skillLines) {
    skillLines.forEach(line => {
      const cleanSkill = line.replace(/[•\-\*,]\s*/, '').trim();
      if (cleanSkill.length > 2 && cleanSkill.length < 30 && !cleanSkill.includes('@') && !cleanSkill.includes('http')) {
        if (techSkills.some(tech => tech.toLowerCase().includes(cleanSkill.toLowerCase()) || cleanSkill.toLowerCase().includes(tech.toLowerCase()))) {
          skills.add(cleanSkill);
        }
      }
    });
  }
  return Array.from(skills).slice(0, 20);
}

function extractSoftSkills(text) {
  const softSkillsList = ['Leadership', 'Communication', 'Problem Solving', 'Team Work', 'Critical Thinking', 'Creativity', 'Adaptability', 'Time Management', 'Project Management', 'Collaboration', 'Analytical Skills', 'Attention to Detail', 'Customer Service', 'Negotiation', 'Public Speaking', 'Mentoring', 'Strategic Planning', 'Innovation'];
  const found = new Set();
  softSkillsList.forEach(skill => {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(text)) found.add(skill);
  });
  return Array.from(found).slice(0, 8);
}

function extractJobExperience(text) {
  const titles = new Set();
  const companies = new Set();
  const industries = new Set();
  let yearsOfExperience = 0;
  let currentTitle = '';
  const jobTitlePatterns = [
    /\b(Senior|Lead|Principal|Staff|Junior|Associate)?\s*(Software Engineer|Developer|Programmer|Architect|Manager|Director|Analyst|Specialist|Consultant|Designer|Administrator|Coordinator|Executive|Officer)\b/gi,
    /\b(Full Stack|Frontend|Backend|DevOps|Data Scientist|Product Manager|Project Manager|Engineering Manager|Technical Lead|Scrum Master|QA Engineer|Security Engineer)\b/gi,
    /\b(CEO|CTO|CIO|VP|Vice President|President|Founder|Co-Founder)\b/gi
  ];
  const industryKeywords = ['Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 'Manufacturing', 'Consulting', 'Media', 'Entertainment', 'Automotive', 'Energy', 'Telecommunications'];
  const experienceSection = text.match(/(?:experience|work experience|employment|professional experience|career history)[:\s]+([\s\S]*?)(?:\n\s*\n|education|skills|$)/i);
  const searchText = experienceSection ? experienceSection[1] : text;
  jobTitlePatterns.forEach(pattern => {
    const matches = searchText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanTitle = match.trim();
        if (cleanTitle.length > 5 && cleanTitle.length < 50) {
          titles.add(cleanTitle);
          if (!currentTitle) currentTitle = cleanTitle;
        }
      });
    }
  });
  const yearsMatch = searchText.match(/(\d+)\+?\s*years?/gi);
  if (yearsMatch) yearsOfExperience = Math.max(...yearsMatch.map(m => parseInt(m.match(/\d+/)[0])));
  industryKeywords.forEach(industry => { if (new RegExp(`\\b${industry}\\b`, 'gi').test(text)) industries.add(industry); });
  const lines = searchText.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length > 3 && trimmed.length < 60) {
      const words = trimmed.split(/\s+/);
      if (words.length <= 5 && words.every(word => word.charAt(0).toUpperCase() === word.charAt(0))) {
        if (!jobTitlePatterns.some(pattern => pattern.test(trimmed))) companies.add(trimmed);
      }
    }
  });
  return { titles: Array.from(titles).slice(0, 6), companies: Array.from(companies).slice(0, 6), experience: Array.from(titles).slice(0, 4), currentTitle, yearsOfExperience, industries: Array.from(industries).slice(0, 3) };
}

function extractEducation(text) {
  const education = [];
  const degreePatterns = [
    /\b(Bachelor|Master|PhD|Doctorate|Associate|Certificate|Diploma)[\s\w]*\s+(of|in|of Science|of Arts|of Engineering|of Business)\s+[\w\s]+/gi,
    /\b(BS|BA|MS|MA|MBA|PhD|Associates?|Bachelors?|Masters?)\s+[\w\s]+/gi,
    /\b(Computer Science|Engineering|Business Administration|Mathematics|Physics|Chemistry|Biology|Economics|Psychology|Marketing|Finance)\b/gi
  ];
  const educationSection = text.match(/(?:education|academic background|qualifications|academic|university|college)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|$)/i);
  const searchText = educationSection ? educationSection[1] : text;
  degreePatterns.forEach(pattern => {
    const matches = searchText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanEducation = match.trim();
        if (cleanEducation.length > 5 && cleanEducation.length < 100) education.push(cleanEducation);
      });
    }
  });
  return [...new Set(education)].slice(0, 4);
}

function extractLanguages(text) {
  const commonLanguages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Chinese', 'Mandarin', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Turkish', 'Hebrew', 'Thai', 'Vietnamese'];
  const languages = new Set();
  const languageSection = text.match(/(?:languages|language skills|linguistic)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education|$)/i);
  const searchText = languageSection ? languageSection[1] : text;
  commonLanguages.forEach(lang => { if (new RegExp(`\\b${lang}\\b`, 'gi').test(searchText)) languages.add(lang); });
  return Array.from(languages).slice(0, 6);
}

function extractCertifications(text) {
  const certPatterns = [
    /\b(AWS|Azure|Google Cloud|Oracle|Microsoft|Cisco|CompTIA|PMP|Scrum Master|CISSP|CISA|CISM|Six Sigma)\s*[\w\s]*\b/gi,
    /\b(Certified|Certification|Certificate)\s+[\w\s]+/gi,
    /\b(Professional|Associate|Expert)\s+(in|of)\s+[\w\s]+/gi
  ];
  const certifications = new Set();
  const certSection = text.match(/(?:certifications|certificates|credentials|professional development)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education|$)/i);
  const searchText = certSection ? certSection[1] : text;
  certPatterns.forEach(pattern => {
    const matches = searchText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanCert = match.trim();
        if (cleanCert.length > 5 && cleanCert.length < 80) certifications.add(cleanCert);
      });
    }
  });
  return Array.from(certifications).slice(0, 6);
}

function extractSummary(text) {
  const summaryPatterns = [
    /(?:summary|objective|profile|about|professional summary|career objective|overview)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education)/i,
    /(?:professional summary|career summary)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills)/i
  ];
  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let summary = match[1].trim();
      if (summary.length > 50 && summary.length < 800) return summary;
    }
  }
  const paragraphs = text.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const cleaned = paragraph.trim();
    if (cleaned.length > 100 && cleaned.length < 600 && !cleaned.includes('@') && !cleaned.includes('http') && !cleaned.toLowerCase().includes('resume') && !cleaned.toLowerCase().includes('curriculum vitae')) return cleaned;
  }
  return '';
}

function extractSummaryEnhanced(text) {
  const summaryPatterns = [
    /(?:professional summary|executive summary|career summary|summary of qualifications)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education)/i,
    /(?:summary|objective|profile|about|overview)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education)/i,
    /(?:career objective|professional objective)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills)/i
  ];
  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let summary = match[1].trim().replace(/\s+/g, ' ');
      if (summary.length > 50 && summary.length < 1000) return summary;
    }
  }
  return '';
}

function generateProfessionalSummary(data, originalText) {
  try {
    if (data.summary && data.summary.length > 50) return data.summary.length > 800 ? data.summary.substring(0, 800) + '...' : data.summary;
    const parts = [];
    if (data.currentJobTitle && data.yearsOfExperience > 0) parts.push(`${data.currentJobTitle} with ${data.yearsOfExperience}+ years of experience`);
    else if (data.currentJobTitle) parts.push(`Experienced ${data.currentJobTitle}`);
    else if (data.jobTitles && data.jobTitles.length > 0) parts.push(`Professional with expertise in ${data.jobTitles[0].toLowerCase()}`);
    if (data.skills && data.skills.length > 0) parts.push(`specializing in ${data.skills.slice(0, 4).join(', ')}`);
    let summary = parts.length > 0 ? parts.join(' ') : generateBasicSummary(data);
    if (parts.length > 1) summary = parts[0] + ' ' + parts.slice(1).join(', ');
    if (!summary.endsWith('.') && !summary.endsWith('!')) summary += '.';
    const careerObjective = generateCareerObjective(data);
    if (careerObjective) summary += ' ' + careerObjective;
    return summary.length > 800 ? summary.substring(0, 800) + '...' : summary;
  } catch (error) {
    return generateBasicSummary(data);
  }
}

function generateBasicSummary(data) {
  const parts = [];
  parts.push(data.name ? `${data.name} is a` : 'Dedicated');
  parts.push(data.jobTitles && data.jobTitles.length > 0 ? data.jobTitles[0].toLowerCase() : 'professional');
  parts.push(data.skills && data.skills.length > 0 ? `with expertise in ${data.skills.slice(0, 3).join(', ')}` : 'with diverse technical skills');
  let summary = parts.join(' ');
  if (!summary.endsWith('.')) summary += '.';
  summary += ' Committed to delivering innovative solutions and contributing to team success.';
  return summary;
}

function generateCareerObjective(data) {
  if (data.yearsOfExperience > 8) return 'Seeking executive leadership opportunities to drive strategic technical initiatives and build high-performing teams.';
  if (data.yearsOfExperience > 5) return 'Looking for senior roles to lead complex projects and mentor emerging talent while driving innovation.';
  if (data.yearsOfExperience > 2) return 'Seeking challenging opportunities to expand technical expertise and contribute to impactful projects.';
  return 'Eager to contribute technical skills and grow within a collaborative, innovation-focused environment.';
}

function getEmptyResumeData() {
  return {
    name: '', email: '', phone: '', location: '', summary: '',
    currentJobTitle: '', yearsOfExperience: 0,
    skills: [], softSkills: [], industryExperience: [],
    jobTitles: [], companies: [],
    education: [], workExperience: [], projects: [],
    certificates: [], interests: [], achievements: [],
    languages: [], linkedinUrl: '', githubUrl: '', portfolioUrl: '',
    generatedSummary: '',
  };
}

module.exports = {
  normalizeEducationEntry,
  normalizeEmbeddedArray,
  normalizeExtractedData,
  cleanTextForNLP,
  extractContactInfo,
  extractNameEnhanced,
  extractLocationEnhanced,
  extractLocation,
  extractUrls,
  extractSkills,
  extractSoftSkills,
  extractJobExperience,
  extractEducation,
  extractLanguages,
  extractCertifications,
  extractSummary,
  extractSummaryEnhanced,
  generateProfessionalSummary,
  generateBasicSummary,
  generateCareerObjective,
  getEmptyResumeData
};
