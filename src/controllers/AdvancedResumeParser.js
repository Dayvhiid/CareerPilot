const { NlpManager } = require('node-nlp');

// Advanced Resume Parser with multiple extraction strategies
class AdvancedResumeParser {
  constructor() {
    this.nlpManager = new NlpManager({ languages: ['en'] });
    this.initializePatterns();
  }

  initializePatterns() {
    // Comprehensive skill database with variations
    this.techSkills = new Set([
      // Programming Languages (with variations)
      'JavaScript', 'JS', 'TypeScript', 'TS', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust',
      'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Perl', 'Dart', 'Objective-C', 'VB.NET', 'C', 'Assembly',
      
      // Frontend Technologies
      'React', 'ReactJS', 'React.js', 'Angular', 'AngularJS', 'Vue', 'Vue.js', 'VueJS', 'Svelte', 'Next.js', 'NextJS',
      'Nuxt.js', 'Gatsby', 'Ember.js', 'HTML', 'HTML5', 'CSS', 'CSS3', 'SASS', 'SCSS', 'LESS', 'Bootstrap',
      'Tailwind', 'TailwindCSS', 'Material-UI', 'MUI', 'Chakra UI', 'jQuery', 'D3.js', 'Three.js', 'Redux', 'MobX',
      
      // Backend Technologies
      'Node.js', 'NodeJS', 'Node', 'Express', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring', 'Spring Boot',
      'ASP.NET', 'Laravel', 'Symfony', 'Rails', 'Ruby on Rails', 'Gin', 'Echo', 'NestJS', 'Koa', 'Hapi',
      
      // Databases
      'MongoDB', 'Mongo', 'MySQL', 'PostgreSQL', 'Postgres', 'Oracle', 'Redis', 'SQLite', 'Cassandra', 'DynamoDB',
      'CouchDB', 'Neo4j', 'InfluxDB', 'Elasticsearch', 'Firebase', 'Supabase', 'MariaDB', 'SQL Server', 'IBM DB2',
      
      // Cloud & DevOps
      'AWS', 'Amazon Web Services', 'Azure', 'Microsoft Azure', 'Google Cloud', 'GCP', 'Docker', 'Kubernetes', 'K8s',
      'Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI', 'Travis CI', 'Terraform', 'Ansible', 'Chef', 'Puppet',
      'Nginx', 'Apache', 'Heroku', 'Vercel', 'Netlify', 'DigitalOcean',
      
      // Tools & Methodologies
      'Git', 'GitHub', 'GitLab', 'Bitbucket', 'Jira', 'Confluence', 'Slack', 'Agile', 'Scrum', 'Kanban', 'DevOps',
      'CI/CD', 'TDD', 'BDD', 'REST', 'REST API', 'GraphQL', 'gRPC', 'Microservices', 'Machine Learning', 'ML',
      'Artificial Intelligence', 'AI', 'Data Science', 'Big Data', 'Analytics', 'Blockchain',
      
      // Testing
      'Jest', 'Mocha', 'Chai', 'Cypress', 'Playwright', 'Selenium', 'WebDriver', 'JUnit', 'TestNG', 'PyTest',
      'RSpec', 'PHPUnit', 'Karma', 'Jasmine', 'Puppeteer',
      
      // Mobile & Desktop
      'React Native', 'Flutter', 'Ionic', 'Xamarin', 'Cordova', 'PhoneGap', 'Electron', 'iOS', 'Android',
      'Swift UI', 'Jetpack Compose'
    ]);

    this.softSkills = new Set([
      'Leadership', 'Communication', 'Problem Solving', 'Team Work', 'Teamwork', 'Critical Thinking',
      'Creativity', 'Adaptability', 'Time Management', 'Project Management', 'Collaboration',
      'Analytical Skills', 'Attention to Detail', 'Customer Service', 'Negotiation', 'Public Speaking',
      'Mentoring', 'Strategic Planning', 'Innovation', 'Decision Making', 'Conflict Resolution',
      'Emotional Intelligence', 'Multitasking', 'Organization', 'Presentation Skills', 'Research',
      'Writing', 'Client Relations', 'Sales', 'Marketing'
    ]);

    // Email patterns
    this.emailPatterns = [
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
    ];

    // Phone patterns
    this.phonePatterns = [
      /(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/g,
      /\+?(\d{1,3})?[-.\s]?\(?(\d{1,4})\)?[-.\s]?(\d{1,4})[-.\s]?(\d{1,9})/g,
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g
    ];

    // Name patterns
    this.namePatterns = [
      /^([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)$/gm,
      /^([A-Z][A-Z\s]+)$/gm
    ];
  }

  async parseResume(text) {
    console.log('🔍 Starting advanced resume parsing...');
    console.log('📄 Text length:', text.length);
    
    if (!text || text.length < 50) {
      console.log('❌ Text too short or empty');
      return this.getEmptyResult();
    }

    const result = {
      name: '',
      email: '',
      phone: '',
      location: '',
      skills: [],
      jobTitles: [],
      companies: [],
      experience: [],
      education: [],
      languages: [],
      certifications: [],
      summary: '',
      yearsOfExperience: 0,
      currentJobTitle: '',
      linkedinUrl: '',
      githubUrl: '',
      portfolioUrl: '',
      softSkills: [],
      industryExperience: [],
      generatedSummary: ''
    };

    try {
      // Clean and preprocess text
      const cleanText = this.preprocessText(text);
      console.log('🧹 Text preprocessed, length:', cleanText.length);

      // Extract different sections
      result.name = this.extractName(cleanText);
      result.email = this.extractEmail(cleanText);
      result.phone = this.extractPhone(cleanText);
      result.location = this.extractLocation(cleanText);
      result.skills = this.extractSkills(cleanText);
      result.softSkills = this.extractSoftSkills(cleanText);
      result.jobTitles = this.extractJobTitles(cleanText);
      result.companies = this.extractCompanies(cleanText);
      result.education = this.extractEducation(cleanText);
      result.languages = this.extractLanguages(cleanText);
      result.certifications = this.extractCertifications(cleanText);
      result.summary = this.extractSummary(cleanText);
      result.yearsOfExperience = this.extractYearsOfExperience(cleanText);
      result.currentJobTitle = result.jobTitles[0] || '';
      
      // Extract URLs
      const urls = this.extractUrls(cleanText);
      result.linkedinUrl = urls.linkedin;
      result.githubUrl = urls.github;
      result.portfolioUrl = urls.portfolio;

      // Generate professional summary
      result.generatedSummary = this.generateSummary(result);

      console.log('✅ Parsing complete. Results:', {
        name: result.name,
        email: result.email,
        skillsCount: result.skills.length,
        softSkillsCount: result.softSkills.length,
        jobTitlesCount: result.jobTitles.length
      });

      return result;
    } catch (error) {
      console.error('❌ Error in parseResume:', error);
      return result;
    }
  }

  preprocessText(text) {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\t/g, ' ')
      .replace(/\s{3,}/g, '\n')
      .replace(/[^\w\s@.,\-()\/\+\#\n]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  extractName(text) {
    const lines = text.split('\n').filter(line => line.trim().length > 0);
    const excludeWords = ['resume', 'cv', 'curriculum', 'vitae', 'phone', 'email', 'address', '@', 'http'];
    
    // Look in first 10 lines
    for (let i = 0; i < Math.min(10, lines.length); i++) {
      const line = lines[i].trim();
      
      if (excludeWords.some(word => line.toLowerCase().includes(word)) || 
          line.includes('@') || /\d{3}/.test(line)) {
        continue;
      }
      
      // Check if line looks like a name
      const words = line.split(/\s+/).filter(w => w.length > 1);
      if (words.length >= 2 && words.length <= 4) {
        const isName = words.every(word => 
          /^[A-Z][a-z]+$/.test(word) && word.length > 1 && word.length < 20
        );
        
        if (isName) {
          console.log('👤 Found name:', line);
          return line;
        }
      }
    }
    
    console.log('❌ No name found');
    return '';
  }

  extractEmail(text) {
    for (const pattern of this.emailPatterns) {
      const matches = text.match(pattern);
      if (matches && matches[0]) {
        const email = matches[0].toLowerCase();
        if (!email.includes('example') && !email.includes('test')) {
          console.log('📧 Found email:', email);
          return email;
        }
      }
    }
    console.log('❌ No email found');
    return '';
  }

  extractPhone(text) {
    for (const pattern of this.phonePatterns) {
      const matches = text.match(pattern);
      if (matches && matches[0]) {
        const phone = matches[0].trim();
        console.log('📞 Found phone:', phone);
        return phone;
      }
    }
    console.log('❌ No phone found');
    return '';
  }

  extractLocation(text) {
    const locationPatterns = [
      /([A-Z][a-z]+,\s*[A-Z]{2}(?:\s+\d{5})?)/g,
      /([A-Z][a-z]+,\s*[A-Z][a-z]+)/g,
      /(New York|Los Angeles|Chicago|Houston|Phoenix|Philadelphia|San Antonio|San Diego|Dallas|San Jose|Austin|Jacksonville|Fort Worth|Columbus|Charlotte|San Francisco|Indianapolis|Seattle|Denver|Washington|Boston|Nashville|Baltimore|Oklahoma City|Louisville|Portland|Las Vegas|Memphis|Detroit|Atlanta|Miami|Orlando|Tampa|London|Paris|Berlin|Madrid|Rome|Toronto|Vancouver|Montreal|Sydney|Melbourne|Tokyo|Mumbai)[,\s]*[A-Z]{0,2}/gi
    ];

    for (const pattern of locationPatterns) {
      const matches = text.match(pattern);
      if (matches && matches[0]) {
        console.log('📍 Found location:', matches[0]);
        return matches[0].trim();
      }
    }
    
    console.log('❌ No location found');
    return '';
  }

  extractSkills(text) {
    const foundSkills = new Set();
    const textLower = text.toLowerCase();
    
    // Find skills section for better context
    const skillsSectionMatch = text.match(/(?:skills|technical skills|technologies|expertise|competencies)[:\s\n]+([\s\S]*?)(?:\n\s*\n|experience|education|projects|$)/i);
    const searchText = skillsSectionMatch ? skillsSectionMatch[1] : text;
    
    // Search for each skill
    for (const skill of this.techSkills) {
      const skillLower = skill.toLowerCase();
      const patterns = [
        new RegExp(`\\b${this.escapeRegex(skillLower)}\\b`, 'gi'),
        new RegExp(`\\b${this.escapeRegex(skill)}\\b`, 'g'),
        new RegExp(`${this.escapeRegex(skillLower)}`, 'gi')
      ];
      
      for (const pattern of patterns) {
        if (pattern.test(searchText) || pattern.test(textLower)) {
          foundSkills.add(skill);
          break;
        }
      }
    }
    
    const skillsArray = Array.from(foundSkills).slice(0, 20);
    console.log('🛠️ Found skills:', skillsArray.length, skillsArray.slice(0, 5));
    return skillsArray;
  }

  extractSoftSkills(text) {
    const foundSkills = new Set();
    const textLower = text.toLowerCase();
    
    for (const skill of this.softSkills) {
      const skillLower = skill.toLowerCase();
      const pattern = new RegExp(`\\b${this.escapeRegex(skillLower)}\\b`, 'gi');
      
      if (pattern.test(textLower)) {
        foundSkills.add(skill);
      }
    }
    
    const skillsArray = Array.from(foundSkills).slice(0, 10);
    console.log('🤝 Found soft skills:', skillsArray.length, skillsArray.slice(0, 3));
    return skillsArray;
  }

  extractJobTitles(text) {
    const jobTitles = new Set();
    const patterns = [
      /\b(Senior|Lead|Principal|Staff|Junior|Associate)?\s*(Software Engineer|Developer|Programmer|Architect|Manager|Director|Analyst|Specialist|Consultant|Designer|Administrator|Coordinator|Executive|Officer)\b/gi,
      /\b(Full Stack|Frontend|Backend|DevOps|Data Scientist|Product Manager|Project Manager|Engineering Manager|Technical Lead|Scrum Master|QA Engineer|Security Engineer|Web Developer|Mobile Developer)\b/gi,
      /\b(CEO|CTO|CIO|VP|Vice President|President|Founder|Co-Founder)\b/gi
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanTitle = match.trim();
          if (cleanTitle.length > 5 && cleanTitle.length < 50) {
            jobTitles.add(cleanTitle);
          }
        });
      }
    }
    
    const titlesArray = Array.from(jobTitles).slice(0, 5);
    console.log('💼 Found job titles:', titlesArray.length, titlesArray);
    return titlesArray;
  }

  extractCompanies(text) {
    // This is a simplified approach - in a real system you'd want a company database
    const companies = new Set();
    const lines = text.split('\n');
    
    // Look for patterns that might be company names
    const companyPatterns = [
      /\b(Inc\.|LLC|Ltd\.|Corporation|Corp\.|Company|Co\.)$/gi,
      /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s+(Inc\.|LLC|Ltd\.|Corporation|Corp\.)/gi
    ];
    
    for (const pattern of companyPatterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanCompany = match.trim();
          if (cleanCompany.length > 3 && cleanCompany.length < 50) {
            companies.add(cleanCompany);
          }
        });
      }
    }
    
    const companiesArray = Array.from(companies).slice(0, 5);
    console.log('🏢 Found companies:', companiesArray.length, companiesArray);
    return companiesArray;
  }

  extractEducation(text) {
    const education = new Set();
    const patterns = [
      /\b(Bachelor|Master|PhD|Doctorate|Associate|Certificate|Diploma)\s+(?:of\s+)?(?:Science|Arts|Engineering|Business|Administration)?\s+(?:in\s+)?([A-Za-z\s]+)/gi,
      /\b(BS|BA|MS|MA|MBA|PhD|Associates?|Bachelors?|Masters?)\s+(?:in\s+)?([A-Za-z\s]+)/gi,
      /\b(Computer Science|Engineering|Business Administration|Mathematics|Physics|Chemistry|Biology|Economics|Psychology|Marketing|Finance|Information Technology|Software Engineering)\b/gi
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanEducation = match.trim();
          if (cleanEducation.length > 5 && cleanEducation.length < 100) {
            education.add(cleanEducation);
          }
        });
      }
    }
    
    const educationArray = Array.from(education).slice(0, 4);
    console.log('🎓 Found education:', educationArray.length, educationArray);
    return educationArray;
  }

  extractLanguages(text) {
    const languages = new Set(['English', 'Spanish', 'French', 'German', 'Italian', 'Portuguese', 'Russian', 'Chinese', 'Mandarin', 'Japanese', 'Korean', 'Arabic', 'Hindi', 'Dutch', 'Swedish', 'Norwegian', 'Danish', 'Finnish', 'Polish', 'Turkish', 'Hebrew', 'Thai', 'Vietnamese']);
    const foundLanguages = new Set();
    
    for (const lang of languages) {
      const pattern = new RegExp(`\\b${lang}\\b`, 'gi');
      if (pattern.test(text)) {
        foundLanguages.add(lang);
      }
    }
    
    const languagesArray = Array.from(foundLanguages).slice(0, 6);
    console.log('🌐 Found languages:', languagesArray.length, languagesArray);
    return languagesArray;
  }

  extractCertifications(text) {
    const certifications = new Set();
    const patterns = [
      /\b(AWS|Azure|Google Cloud|Oracle|Microsoft|Cisco|CompTIA|PMP|Scrum Master|CISSP|CISA|CISM|Six Sigma)\s*[\w\s]*(?:Certified|Certification|Certificate)?\b/gi,
      /\b(Certified|Certification|Certificate)\s+[\w\s]+/gi
    ];
    
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanCert = match.trim();
          if (cleanCert.length > 5 && cleanCert.length < 80) {
            certifications.add(cleanCert);
          }
        });
      }
    }
    
    const certificationsArray = Array.from(certifications).slice(0, 6);
    console.log('🏆 Found certifications:', certificationsArray.length, certificationsArray);
    return certificationsArray;
  }

  extractSummary(text) {
    const patterns = [
      /(?:professional summary|executive summary|career summary|summary of qualifications)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education)/i,
      /(?:summary|objective|profile|about|overview)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|skills|education)/i
    ];
    
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const summary = match[1].trim().replace(/\s+/g, ' ');
        if (summary.length > 50 && summary.length < 1000) {
          console.log('📝 Found summary:', summary.substring(0, 100) + '...');
          return summary;
        }
      }
    }
    
    console.log('❌ No summary found');
    return '';
  }

  extractYearsOfExperience(text) {
    const patterns = [
      /(\d+)\+?\s*years?\s+(?:of\s+)?experience/gi,
      /experience[:\s]+(\d+)\+?\s*years?/gi,
      /(\d+)\+?\s*years?\s+in/gi
    ];
    
    let maxYears = 0;
    for (const pattern of patterns) {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const years = parseInt(match.match(/\d+/)[0]);
          if (years > maxYears && years < 50) {
            maxYears = years;
          }
        });
      }
    }
    
    console.log('⏳ Found years of experience:', maxYears);
    return maxYears;
  }

  extractUrls(text) {
    const urls = { linkedin: '', github: '', portfolio: '' };
    
    const linkedinMatch = text.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?/gi);
    if (linkedinMatch) urls.linkedin = linkedinMatch[0];
    
    const githubMatch = text.match(/(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9-]+\/?/gi);
    if (githubMatch) urls.github = githubMatch[0];
    
    const portfolioMatch = text.match(/(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|net|org|io|dev)(?:\/[^\s]*)?/gi);
    if (portfolioMatch) {
      for (const url of portfolioMatch) {
        if (!url.includes('linkedin') && !url.includes('github') && !url.includes('facebook') && !url.includes('twitter')) {
          urls.portfolio = url;
          break;
        }
      }
    }
    
    console.log('🔗 Found URLs:', urls);
    return urls;
  }

  generateSummary(data) {
    const parts = [];
    
    if (data.name) {
      parts.push(`${data.name} is a`);
    }
    
    if (data.jobTitles.length > 0) {
      if (data.yearsOfExperience > 0) {
        parts.push(`${data.jobTitles[0].toLowerCase()} with ${data.yearsOfExperience}+ years of experience`);
      } else {
        parts.push(`${data.jobTitles[0].toLowerCase()}`);
      }
    } else {
      parts.push('professional');
    }
    
    if (data.skills.length > 0) {
      const topSkills = data.skills.slice(0, 4).join(', ');
      parts.push(`specializing in ${topSkills}`);
    }
    
    if (data.education.length > 0) {
      parts.push(`with educational background in ${data.education[0].toLowerCase()}`);
    }
    
    let summary = parts.join(' ');
    if (!summary.endsWith('.')) {
      summary += '.';
    }
    
    // Add career objective
    if (data.yearsOfExperience > 5) {
      summary += ' Seeking senior roles to lead innovative projects and mentor team members.';
    } else if (data.yearsOfExperience > 2) {
      summary += ' Looking for challenging opportunities to expand technical expertise and contribute to impactful projects.';
    } else {
      summary += ' Eager to contribute technical skills and grow within a collaborative environment.';
    }
    
    console.log('✨ Generated summary:', summary);
    return summary;
  }

  escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  getEmptyResult() {
    return {
      name: '', email: '', phone: '', location: '', skills: [], jobTitles: [], companies: [],
      experience: [], education: [], languages: [], certifications: [], summary: '',
      yearsOfExperience: 0, currentJobTitle: '', linkedinUrl: '', githubUrl: '',
      portfolioUrl: '', softSkills: [], industryExperience: [], generatedSummary: ''
    };
  }
}

module.exports = AdvancedResumeParser;