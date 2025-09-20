const Resume = require("../models/Resume");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs");
const path = require("path");
const natural = require("natural");
const nlp = require("compromise");
const AdvancedResumeParser = require("./AdvancedResumeParser");

// Upload and process resume
exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ msg: "No file uploaded" });
    }

    const userId = req.user.id; // From auth middleware
    const { filename, originalname, size, mimetype, path: filePath } = req.file;

    // Check if user already has a resume and delete old one
    const existingResume = await Resume.findOne({ userId });
    if (existingResume) {
      // Delete old file
      try {
        fs.unlinkSync(existingResume.filePath);
      } catch (err) {
        console.log("Error deleting old file:", err);
      }
      await Resume.findByIdAndDelete(existingResume._id);
    }

    // Create new resume record
    const resume = new Resume({
      userId,
      filename,
      originalName: originalname,
      fileSize: size,
      fileType: mimetype,
      filePath,
    });

    await resume.save();

    // Start text extraction in background
    extractTextFromFile(resume._id, filePath, mimetype);

    res.json({
      msg: "Resume uploaded successfully",
      resume: {
        id: resume._id,
        filename: resume.originalName,
        size: resume.fileSize,
        uploadedAt: resume.createdAt,
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// Get user's resume
exports.getResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resume = await Resume.findOne({ userId });

    if (!resume) {
      return res.status(404).json({ msg: "No resume found" });
    }

    res.json({
      resume: {
        id: resume._id,
        filename: resume.originalName,
        size: resume.fileSize,
        uploadedAt: resume.createdAt,
        isProcessed: resume.isProcessed,
        extractedData: resume.extractedData,
      },
    });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// Delete resume
exports.deleteResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resume = await Resume.findOne({ userId });

    if (!resume) {
      return res.status(404).json({ msg: "No resume found" });
    }

    // Delete file
    try {
      fs.unlinkSync(resume.filePath);
    } catch (err) {
      console.log("Error deleting file:", err);
    }

    await Resume.findByIdAndDelete(resume._id);

    res.json({ msg: "Resume deleted successfully" });
  } catch (error) {
    res.status(500).json({ msg: "Server error", error: error.message });
  }
};

// Advanced NLP-based text extraction
async function extractTextFromFile(resumeId, filePath, mimeType) {
  try {
    let extractedText = "";

    // Extract text based on file type
    if (mimeType === "application/pdf") {
      const dataBuffer = fs.readFileSync(filePath);
      const data = await pdfParse(dataBuffer);
      extractedText = data.text;
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (mimeType === "application/msword") {
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } catch (err) {
        console.log("Error with DOC file, using fallback:", err);
        extractedText = "Unable to extract text from this DOC file format";
      }
    }

    console.log("Extracted text length:", extractedText.length);
    console.log("Processing text with Advanced Resume Parser...");

    // Process text with advanced parser
    const parser = new AdvancedResumeParser();
    const extractedData = await parser.parseResume(extractedText);

    // Update resume with extracted data
    await Resume.findByIdAndUpdate(resumeId, {
      extractedText,
      extractedData,
      isProcessed: true,
    });

    console.log(`Resume ${resumeId} processed successfully with NLP`);
    console.log("Extracted data preview:", {
      name: extractedData.name,
      email: extractedData.email,
      location: extractedData.location,
      skillsCount: extractedData.skills?.length || 0,
      jobTitlesCount: extractedData.jobTitles?.length || 0
    });

  } catch (error) {
    console.error("Text extraction error:", error);
    await Resume.findByIdAndUpdate(resumeId, {
      isProcessed: false,
      extractedText: "Error extracting text: " + error.message,
      processingError: error.message
    });
  }
}

// Comprehensive NLP-based data extraction system
async function extractStructuredDataWithNLP(text) {
  const data = {
    name: "",
    email: "",
    phone: "",
    location: "",
    skills: [],
    jobTitles: [],
    companies: [],
    experience: [],
    education: [],
    languages: [],
    certifications: [],
    summary: "",
    yearsOfExperience: 0,
    currentJobTitle: "",
    linkedinUrl: "",
    githubUrl: "",
    portfolioUrl: "",
    softSkills: [],
    industryExperience: [],
    generatedSummary: "" // AI-generated professional summary
  };

  try {
    // Clean and normalize text with better preprocessing
    const cleanText = cleanTextForNLP(text);
    const lines = cleanText.split(/\n+/).filter(line => line.trim().length > 0);
    
    console.log("Starting enhanced NLP extraction...");

    // 1. Extract Contact Information with improved accuracy
    extractContactInfoEnhanced(cleanText, data);
    
    // 2. Extract Name with multiple strategies
    data.name = extractNameEnhanced(lines, cleanText);
    
    // 3. Extract Location with better patterns
    data.location = extractLocationEnhanced(cleanText);
    
    // 4. Extract URLs with validation
    extractUrlsEnhanced(cleanText, data);
    
    // 5. Extract Skills with context awareness (use enhanced versions where available)
    data.skills = extractSkillsEnhanced ? extractSkillsEnhanced(cleanText) : extractSkills(cleanText);
    data.softSkills = extractSoftSkillsEnhanced ? extractSoftSkillsEnhanced(cleanText) : extractSoftSkills(cleanText);
    
    // 6. Extract Job Experience with improved parsing
    const jobInfo = extractJobExperience(cleanText);
    data.jobTitles = jobInfo.titles;
    data.companies = jobInfo.companies;
    data.experience = jobInfo.experience;
    data.currentJobTitle = jobInfo.currentTitle;
    data.yearsOfExperience = jobInfo.yearsOfExperience;
    data.industryExperience = jobInfo.industries;
    
    // 7. Extract Education with degree parsing
    data.education = extractEducation(cleanText);
    
    // 8. Extract Languages with proficiency levels
    data.languages = extractLanguages(cleanText);
    
    // 9. Extract Certifications with validation
    data.certifications = extractCertifications(cleanText);
    
    // 10. Extract or find existing summary
    data.summary = extractSummaryEnhanced(cleanText);
    
    // 11. Generate intelligent professional summary
    data.generatedSummary = generateProfessionalSummary(data, cleanText);

    console.log("Enhanced NLP extraction completed successfully");
    console.log("Generated summary length:", data.generatedSummary.length);
    return data;

  } catch (error) {
    console.error("NLP extraction error:", error);
    return data;
  }
}

// Enhanced text cleaning for better NLP processing
function cleanTextForNLP(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\t/g, ' ')
    .replace(/\s{3,}/g, '\n\n')
    .replace(/\s{2}/g, ' ')
    .replace(/[^\w\s@.,\-()\/\+\#\n]/g, ' ')
    .trim();
}

// Extract contact information (email, phone)
function extractContactInfo(text, data) {
  // Multiple email patterns for accuracy
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

  // Multiple phone patterns for different formats
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

// Enhanced name extraction with multiple validation strategies
function extractNameEnhanced(lines, text) {
  const commonWords = ['resume', 'cv', 'curriculum', 'vitae', 'profile', 'contact', 'phone', 'email', 'address', 'objective', 'summary', 'experience', 'education', 'skills'];
  const titles = ['mr', 'mrs', 'ms', 'dr', 'prof', 'professor'];
  
  // Strategy 1: Look in first few lines with enhanced validation
  for (let i = 0; i < Math.min(8, lines.length); i++) {
    const line = lines[i].trim();
    
    // Skip lines with contact info, common resume words, or formatting
    if (line.includes('@') || /\d{3}/.test(line) || line.includes('http') || 
        line.length < 4 || line.length > 60 ||
        commonWords.some(word => line.toLowerCase().includes(word))) {
      continue;
    }
    
    const words = line.split(/\s+/).filter(word => word.length > 0);
    if (words.length >= 2 && words.length <= 5) {
      // Check if words look like a person's name
      const isValidName = words.every(word => {
        const cleanWord = word.replace(/[^a-zA-Z'-]/g, '');
        return cleanWord.length > 1 && 
               /^[A-Z][a-z'-]*$/.test(cleanWord) &&
               !commonWords.includes(cleanWord.toLowerCase());
      });
      
      if (isValidName) {
        // Remove titles if present
        const nameWords = words.filter(word => 
          !titles.includes(word.toLowerCase().replace('.', ''))
        );
        if (nameWords.length >= 2) {
          return nameWords.join(' ');
        }
      }
    }
  }

  // Strategy 2: Use NLP with better validation
  try {
    const doc = nlp(text.substring(0, 1500));
    const people = doc.people().out('array');
    for (const person of people) {
      if (person.length > 4 && person.length < 50 && 
          !commonWords.some(word => person.toLowerCase().includes(word))) {
        return person;
      }
    }
  } catch (e) {
    console.log("NLP name extraction failed:", e.message);
  }

  // Strategy 3: Look for name patterns in header section
  const headerMatch = text.substring(0, 500).match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/m);
  if (headerMatch && headerMatch[1] && 
      !commonWords.some(word => headerMatch[1].toLowerCase().includes(word))) {
    return headerMatch[1].trim();
  }

  return "";
}

// Enhanced location extraction with better patterns and validation
function extractLocationEnhanced(text) {
  const locationPatterns = [
    // City, State, ZIP
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/g,
    // City, State
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g,
    // City, Country
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g
  ];
  
  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
    'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
    'VA', 'WA', 'WV', 'WI', 'WY'
  ];
  
  for (const pattern of locationPatterns) {
    const matches = [...text.matchAll(pattern)];
    for (const match of matches) {
      const fullMatch = match[0];
      const stateOrCountry = match[2];
      
      // Validate against known states
      if (stateOrCountry && stateOrCountry.length === 2 && validStates.includes(stateOrCountry)) {
        return fullMatch.trim();
      } else if (fullMatch.length > 5 && fullMatch.length < 50) {
        return fullMatch.trim();
      }
    }
  }
  
  return "";
}

// Extract location information
function extractLocation(text) {
  const locationPatterns = [
    /([A-Z][a-z]+,\s*[A-Z]{2,}(?:\s+\d{5})?)/g, // City, State ZIP
    /([A-Z][a-z]+,\s*[A-Z][a-z]+)/g, // City, Country
    /\b([A-Z][a-z]+)\s*,\s*([A-Z]{2})\b/g // City, State
  ];
  
  for (const pattern of locationPatterns) {
    const matches = text.match(pattern);
    if (matches && matches[0]) {
      return matches[0];
    }
  }
  return "";
}

// Extract URLs (LinkedIn, GitHub, Portfolio)
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

// Extract technical skills
function extractSkills(text) {
  const skills = new Set();
  
  // Comprehensive technical skills database
  const techSkills = [
    // Programming Languages
    'JavaScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 'Swift', 'Kotlin', 'TypeScript',
    'Scala', 'R', 'MATLAB', 'Perl', 'Dart', 'Objective-C', 'VB.NET', 'F#', 'Haskell', 'Clojure',
    
    // Frontend Technologies
    'React', 'Angular', 'Vue.js', 'Svelte', 'Next.js', 'Nuxt.js', 'Gatsby', 'Ember.js',
    'HTML', 'CSS', 'SASS', 'SCSS', 'LESS', 'Bootstrap', 'Tailwind CSS', 'Material-UI', 'Chakra UI',
    'jQuery', 'D3.js', 'Three.js', 'Chart.js', 'Redux', 'MobX', 'Vuex',
    
    // Backend Technologies
    'Node.js', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'ASP.NET', 'Laravel', 'Rails',
    'Gin', 'Echo', 'Fiber', 'NestJS', 'Koa.js', 'Hapi.js',
    
    // Databases
    'MongoDB', 'MySQL', 'PostgreSQL', 'Oracle', 'Redis', 'SQLite', 'Cassandra', 'DynamoDB',
    'CouchDB', 'Neo4j', 'InfluxDB', 'Elasticsearch', 'Firebase', 'Supabase',
    
    // Cloud & DevOps
    'AWS', 'Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'GitHub Actions',
    'Terraform', 'Ansible', 'Chef', 'Puppet', 'Vagrant', 'Nginx', 'Apache', 'Heroku', 'Vercel', 'Netlify',
    
    // Tools & Others
    'Git', 'GitHub', 'GitLab', 'Bitbucket', 'SVN', 'Jira', 'Confluence', 'Slack', 'Trello',
    'Agile', 'Scrum', 'Kanban', 'DevOps', 'CI/CD', 'TDD', 'BDD', 'REST API', 'GraphQL', 'gRPC',
    'Microservices', 'Machine Learning', 'AI', 'Data Science', 'Analytics', 'Tableau', 'Power BI',
    'Selenium', 'Jest', 'Mocha', 'Cypress', 'Playwright', 'JUnit', 'PyTest'
  ];

  // Look for skills section first
  const skillsSection = text.match(/(?:skills|technical skills|core competencies|technologies|expertise)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|education|$)/i);
  let searchText = skillsSection ? skillsSection[1] : text;
  
  // Find technical skills in text
  techSkills.forEach(skill => {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(searchText)) {
      skills.add(skill);
    }
  });

  // Extract from bullet points and comma-separated lists
  const skillLines = searchText.match(/[•\-\*]\s*([A-Za-z\s\.\+\#\/]+)|,\s*([A-Za-z\s\.\+\#\/]+)/g);
  if (skillLines) {
    skillLines.forEach(line => {
      const cleanSkill = line.replace(/[•\-\*,]\s*/, '').trim();
      if (cleanSkill.length > 2 && cleanSkill.length < 30 && 
          !cleanSkill.includes('@') && !cleanSkill.includes('http')) {
        // Check if it's a likely technical skill
        if (techSkills.some(tech => tech.toLowerCase().includes(cleanSkill.toLowerCase()) || 
                                   cleanSkill.toLowerCase().includes(tech.toLowerCase()))) {
          skills.add(cleanSkill);
        }
      }
    });
  }

  return Array.from(skills).slice(0, 20);
}

// Extract soft skills
function extractSoftSkills(text) {
  const softSkills = [
    'Leadership', 'Communication', 'Problem Solving', 'Team Work', 'Critical Thinking',
    'Creativity', 'Adaptability', 'Time Management', 'Project Management', 'Collaboration',
    'Analytical Skills', 'Attention to Detail', 'Customer Service', 'Negotiation',
    'Public Speaking', 'Mentoring', 'Strategic Planning', 'Innovation'
  ];
  
  const foundSoftSkills = new Set();
  
  softSkills.forEach(skill => {
    const regex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (regex.test(text)) {
      foundSoftSkills.add(skill);
    }
  });
  
  return Array.from(foundSoftSkills).slice(0, 8);
}

// Extract job experience with enhanced parsing
function extractJobExperience(text) {
  const titles = new Set();
  const companies = new Set();
  const experience = [];
  const industries = new Set();
  let yearsOfExperience = 0;
  let currentTitle = "";
  
  // Enhanced job title patterns
  const jobTitlePatterns = [
    /\b(Senior|Lead|Principal|Staff|Junior|Associate)?\s*(Software Engineer|Developer|Programmer|Architect|Manager|Director|Analyst|Specialist|Consultant|Designer|Administrator|Coordinator|Executive|Officer)\b/gi,
    /\b(Full Stack|Frontend|Backend|DevOps|Data Scientist|Product Manager|Project Manager|Engineering Manager|Technical Lead|Scrum Master|QA Engineer|Security Engineer)\b/gi,
    /\b(CEO|CTO|CIO|VP|Vice President|President|Founder|Co-Founder)\b/gi
  ];
  
  // Industry keywords
  const industryKeywords = [
    'Technology', 'Healthcare', 'Finance', 'Education', 'Retail', 'Manufacturing',
    'Consulting', 'Media', 'Entertainment', 'Automotive', 'Energy', 'Telecommunications'
  ];
  
  // Look for experience section
  const experienceSection = text.match(/(?:experience|work experience|employment|professional experience|career history)[:\s]+([\s\S]*?)(?:\n\s*\n|education|skills|$)/i);
  const searchText = experienceSection ? experienceSection[1] : text;
  
  // Extract job titles
  jobTitlePatterns.forEach(pattern => {
    const matches = searchText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanTitle = match.trim();
        if (cleanTitle.length > 5 && cleanTitle.length < 50) {
          titles.add(cleanTitle);
          if (!currentTitle) currentTitle = cleanTitle; // First title found
        }
      });
    }
  });
  
  // Extract years of experience
  const yearsMatch = searchText.match(/(\d+)\+?\s*years?/gi);
  if (yearsMatch) {
    const years = yearsMatch.map(match => parseInt(match.match(/\d+/)[0]));
    yearsOfExperience = Math.max(...years);
  }
  
  // Extract industries
  industryKeywords.forEach(industry => {
    if (new RegExp(`\\b${industry}\\b`, 'gi').test(text)) {
      industries.add(industry);
    }
  });
  
  // Extract company names (basic heuristic)
  const lines = searchText.split('\n');
  lines.forEach(line => {
    const trimmed = line.trim();
    if (trimmed.length > 3 && trimmed.length < 60) {
      const words = trimmed.split(/\s+/);
      if (words.length <= 5 && words.every(word => word.charAt(0).toUpperCase() === word.charAt(0))) {
        // Skip if it looks like a job title
        if (!jobTitlePatterns.some(pattern => pattern.test(trimmed))) {
          companies.add(trimmed);
        }
      }
    }
  });

  return {
    titles: Array.from(titles).slice(0, 6),
    companies: Array.from(companies).slice(0, 6),
    experience: Array.from(titles).slice(0, 4),
    currentTitle,
    yearsOfExperience,
    industries: Array.from(industries).slice(0, 3)
  };
}

// Extract education information
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
        if (cleanEducation.length > 5 && cleanEducation.length < 100) {
          education.push(cleanEducation);
        }
      });
    }
  });
  
  return [...new Set(education)].slice(0, 4);
}

// Extract languages
function extractLanguages(text) {
  const commonLanguages = [
    'English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian',
    'Chinese', 'Mandarin', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Dutch', 'Swedish',
    'Norwegian', 'Danish', 'Finnish', 'Polish', 'Turkish', 'Hebrew', 'Thai', 'Vietnamese'
  ];
  
  const languages = new Set();
  
  // Look for languages section
  const languageSection = text.match(/(?:languages|language skills|linguistic)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education|$)/i);
  const searchText = languageSection ? languageSection[1] : text;
  
  commonLanguages.forEach(lang => {
    const regex = new RegExp(`\\b${lang}\\b`, 'gi');
    if (regex.test(searchText)) {
      languages.add(lang);
    }
  });
  
  return Array.from(languages).slice(0, 6);
}

// Extract certifications
function extractCertifications(text) {
  const certPatterns = [
    /\b(AWS|Azure|Google Cloud|Oracle|Microsoft|Cisco|CompTIA|PMP|Scrum Master|CISSP|CISA|CISM|Six Sigma)\s*[\w\s]*\b/gi,
    /\b(Certified|Certification|Certificate)\s+[\w\s]+/gi,
    /\b(Professional|Associate|Expert)\s+(in|of)\s+[\w\s]+/gi
  ];
  
  const certifications = new Set();
  
  // Look for certifications section
  const certSection = text.match(/(?:certifications|certificates|credentials|professional development)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education|$)/i);
  const searchText = certSection ? certSection[1] : text;
  
  certPatterns.forEach(pattern => {
    const matches = searchText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const cleanCert = match.trim();
        if (cleanCert.length > 5 && cleanCert.length < 80) {
          certifications.add(cleanCert);
        }
      });
    }
  });
  
  return Array.from(certifications).slice(0, 6);
}

// Extract summary/objective
function extractSummary(text) {
  const summaryPatterns = [
    /(?:summary|objective|profile|about|professional summary|career objective|overview)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education)/i,
    /(?:professional summary|career summary)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills)/i
  ];
  
  for (const pattern of summaryPatterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      let summary = match[1].trim();
      if (summary.length > 50 && summary.length < 800) {
        return summary;
      }
    }
  }
  
  // Fallback: find first meaningful paragraph
  const paragraphs = text.split(/\n\s*\n/);
  for (const paragraph of paragraphs) {
    const cleaned = paragraph.trim();
    if (cleaned.length > 100 && cleaned.length < 600 && 
        !cleaned.includes('@') && !cleaned.includes('http') &&
        !cleaned.toLowerCase().includes('resume') &&
        !cleaned.toLowerCase().includes('curriculum vitae')) {
      return cleaned;
    }
  }
  
  return "";
}

// Enhanced summary extraction with better patterns
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
      if (summary.length > 50 && summary.length < 1000) {
        return summary;
      }
    }
  }
  
  return "";
}

// Generate intelligent professional summary based on extracted data
function generateProfessionalSummary(data, originalText) {
  try {
    const parts = [];
    
    // Professional identity and experience
    if (data.currentJobTitle && data.yearsOfExperience > 0) {
      parts.push(`${data.currentJobTitle} with ${data.yearsOfExperience}+ years of experience`);
    } else if (data.currentJobTitle) {
      parts.push(`Experienced ${data.currentJobTitle}`);
    } else if (data.jobTitles && data.jobTitles.length > 0) {
      parts.push(`Professional with expertise in ${data.jobTitles[0].toLowerCase()}`);
    }
    
    // Technical skills highlight
    if (data.skills && data.skills.length > 0) {
      const topSkills = data.skills.slice(0, 4).join(', ');
      parts.push(`specializing in ${topSkills}`);
    }
    
    // Industry experience
    if (data.industryExperience && data.industryExperience.length > 0) {
      const industries = data.industryExperience.slice(0, 2).join(' and ');
      parts.push(`with proven success in ${industries.toLowerCase()} sectors`);
    }
    
    // Education highlight
    if (data.education && data.education.length > 0) {
      const education = data.education[0];
      if (typeof education === 'string' && education.length > 5) {
        parts.push(`with educational background in ${education.toLowerCase()}`);
      }
    }
    
    // If we have existing summary, enhance it
    if (data.summary && data.summary.length > 50) {
      let enhancedSummary = data.summary;
      return enhancedSummary.length > 800 ? enhancedSummary.substring(0, 800) + '...' : enhancedSummary;
    }
    
    // Generate new summary from parts
    if (parts.length === 0) {
      return generateBasicSummary(data);
    }
    
    // Construct professional summary
    let summary = parts[0];
    if (parts.length > 1) {
      summary += ' ' + parts.slice(1).join(', ');
    }
    
    // Add period if not present
    if (!summary.endsWith('.') && !summary.endsWith('!')) {
      summary += '.';
    }
    
    // Add career objective
    const careerObjective = generateCareerObjective(data);
    if (careerObjective) {
      summary += ' ' + careerObjective;
    }
    
    return summary.length > 800 ? summary.substring(0, 800) + '...' : summary;
    
  } catch (error) {
    console.error('Error generating professional summary:', error);
    return generateBasicSummary(data);
  }
}

// Generate basic summary when limited data is available
function generateBasicSummary(data) {
  const parts = [];
  
  if (data.name) {
    parts.push(`${data.name} is a`);
  } else {
    parts.push('Dedicated');
  }
  
  if (data.jobTitles && data.jobTitles.length > 0) {
    parts.push(`${data.jobTitles[0].toLowerCase()}`);
  } else {
    parts.push('professional');
  }
  
  if (data.skills && data.skills.length > 0) {
    parts.push(`with expertise in ${data.skills.slice(0, 3).join(', ')}`);
  } else {
    parts.push('with diverse technical skills');
  }
  
  let summary = parts.join(' ');
  if (!summary.endsWith('.')) {
    summary += '.';
  }
  
  summary += ' Committed to delivering innovative solutions and contributing to team success.';
  
  return summary;
}

// Generate career objective based on extracted data
function generateCareerObjective(data) {
  if (data.yearsOfExperience > 8) {
    return 'Seeking executive leadership opportunities to drive strategic technical initiatives and build high-performing teams.';
  } else if (data.yearsOfExperience > 5) {
    return 'Looking for senior roles to lead complex projects and mentor emerging talent while driving innovation.';
  } else if (data.yearsOfExperience > 2) {
    return 'Seeking challenging opportunities to expand technical expertise and contribute to impactful projects.';
  } else {
    return 'Eager to contribute technical skills and grow within a collaborative, innovation-focused environment.';
  }
}