const { HfInference } = require('@huggingface/inference');

// Initialize Hugging Face Inference
const hf = new HfInference(); // Will use free tier initially

class HuggingFaceResumeParser {
  constructor() {
    console.log('🤗 Initializing Hybrid Resume Parser with HuggingFace NER + Enhanced Keywords...');
    this.models = {
      // Use available HuggingFace models
      generalNER: 'dbmdz/bert-large-cased-finetuned-conll03-english', // For names, locations, organizations
      alternativeNER: 'microsoft/DialoGPT-medium' // Alternative if needed
    };
    
    // Entity mapping for general NER model
    this.entityTypes = {
      'PER': 'name',
      'PERSON': 'name', 
      'LOC': 'location',
      'ORG': 'companies',
      'MISC': 'misc'
    };
    
    console.log('✅ Hybrid parser initialized - combining HuggingFace NER with specialized resume extraction');
  }

  async parseResume(text) {
    try {
      console.log('🔍 Starting specialized resume parsing with resume-ner-bert-v2...');
      
      if (!text || text.trim().length < 50) {
        return this._getEmptyResult();
      }

      // Clean the text
      const cleanedText = this._preprocessText(text);
      
      // Use the specialized resume NER model to extract all entities at once
      const extractedData = await this._extractWithResumeNER(cleanedText);
      
      // Enhance with additional extraction methods
      const [
        additionalSkills,
        softSkills, 
        urls,
        industry
      ] = await Promise.allSettled([
        this._enhanceSkillsExtraction(cleanedText, extractedData.skills),
        this._extractSoftSkills(cleanedText),
        this._extractUrls(cleanedText),
        this._classifyIndustry(cleanedText)
      ]);

      // Combine and structure the results
      const result = {
        name: extractedData.name || this._extractNameFallback(cleanedText),
        email: extractedData.email || this._extractEmailRegex(cleanedText),
        phone: extractedData.phone || this._extractPhoneRegex(cleanedText),
        location: extractedData.location || this._extractLocationFallback(cleanedText),
        skills: this._mergeSkills(extractedData.skills, additionalSkills.status === 'fulfilled' ? additionalSkills.value : []),
        jobTitles: extractedData.jobTitles || [],
        companies: extractedData.companies || [],
        experience: extractedData.experience || [],
        education: extractedData.education || [],
        languages: this._extractLanguages(cleanedText),
        certifications: this._extractCertifications(cleanedText),
        summary: this._extractSummary(cleanedText),
        yearsOfExperience: extractedData.yearsOfExperience || this._calculateYearsOfExperience(cleanedText),
        currentJobTitle: '',
        linkedinUrl: urls.status === 'fulfilled' ? urls.value.linkedin : '',
        githubUrl: urls.status === 'fulfilled' ? urls.value.github : '',
        portfolioUrl: urls.status === 'fulfilled' ? urls.value.portfolio : '',
        softSkills: softSkills.status === 'fulfilled' ? softSkills.value : [],
        industryExperience: industry.status === 'fulfilled' ? [industry.value] : [],
        generatedSummary: ''
      };

      // Set current job title
      if (result.jobTitles.length > 0) {
        result.currentJobTitle = result.jobTitles[0];
      }

      // Generate professional summary
      result.generatedSummary = this._generateSummary(result);

      console.log(`✅ Resume NER parsing complete. Found ${result.skills.length} skills, ${result.jobTitles.length} job titles, ${result.companies.length} companies`);
      
      return result;

    } catch (error) {
      console.error('❌ Resume NER parsing error:', error);
      // Fallback to basic extraction
      return await this._fallbackExtraction(text);
    }
  }

  async _extractWithResumeNER(text) {
    try {
      console.log('🎯 Using hybrid approach: HuggingFace NER + Enhanced keyword extraction...');
      
      // First, try to extract basic entities using general NER
      let hfEntities = [];
      try {
        const chunks = this._splitTextIntoChunks(text, 512);
        
        for (const chunk of chunks) {
          const entities = await hf.tokenClassification({
            model: this.models.generalNER,
            inputs: chunk,
            parameters: {
              aggregation_strategy: "simple"
            }
          });
          
          if (entities && Array.isArray(entities)) {
            hfEntities.push(...entities);
          }
        }
        
        console.log(`📊 HuggingFace NER found ${hfEntities.length} entities`);
      } catch (hfError) {
        console.log('⚠️ HuggingFace NER failed, using pure keyword extraction:', hfError.message);
      }

      // Combine HF entities with enhanced keyword extraction
      const extractedData = await this._hybridExtraction(text, hfEntities);
      
      return extractedData;

    } catch (error) {
      console.log('⚠️ Hybrid extraction failed, using basic fallback:', error.message);
      return await this._fallbackBasicExtraction(text);
    }
  }

  async _hybridExtraction(text, hfEntities = []) {
    console.log('🔄 Performing hybrid extraction...');
    
    // Extract basic info from HF entities and fallbacks
    const result = {
      name: this._extractNameFromEntities(hfEntities) || this._extractNameFallback(text),
      email: this._extractEmailRegex(text),
      phone: this._extractPhoneRegex(text),
      location: this._extractLocationFromEntities(hfEntities) || this._extractLocationFallback(text),
      skills: await this._advancedSkillExtraction(text),
      jobTitles: this._advancedJobTitleExtraction(text),
      companies: [...(this._extractCompaniesFromEntities(hfEntities) || []), ...this._basicCompanyExtraction(text)],
      experience: this._extractExperienceEntries(text),
      education: this._advancedEducationExtraction(text),
      yearsOfExperience: this._calculateYearsOfExperience(text)
    };

    console.log(`✅ Hybrid extraction complete - Name: ${result.name}, Skills: ${result.skills.length}, Jobs: ${result.jobTitles.length}, Companies: ${result.companies.length}`);
    
    return result;
  }

  _extractNameFromEntities(entities) {
    const personEntities = entities.filter(e => 
      (e.entity_group === 'PER' || e.entity_group === 'PERSON') && 
      e.score > 0.85
    );
    
    if (personEntities.length > 0) {
      // Get the highest scoring person entity
      const bestPerson = personEntities.sort((a, b) => b.score - a.score)[0];
      return bestPerson.word.replace(/##/g, '').trim();
    }
    
    return '';
  }

  _extractLocationFromEntities(entities) {
    const locationEntities = entities.filter(e => 
      e.entity_group === 'LOC' && e.score > 0.7
    );
    
    if (locationEntities.length > 0) {
      const bestLocation = locationEntities.sort((a, b) => b.score - a.score)[0];
      return bestLocation.word.replace(/##/g, '').trim();
    }
    
    return '';
  }

  _extractCompaniesFromEntities(entities) {
    const orgEntities = entities.filter(e => 
      e.entity_group === 'ORG' && e.score > 0.7
    );
    
    const companies = orgEntities.map(e => e.word.replace(/##/g, '').trim())
      .filter(company => company.length > 2);
    
    return [...new Set(companies)];
  }

  _splitTextIntoChunks(text, maxTokens = 512) {
    // Rough estimation: 1 token ≈ 4 characters
    const maxChars = maxTokens * 3; // Conservative estimate
    const chunks = [];
    
    if (text.length <= maxChars) {
      return [text];
    }
    
    // Split by sentences first, then by chunks
    const sentences = text.split(/[.!?]+/);
    let currentChunk = '';
    
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars && currentChunk) {
        chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence + '.';
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks.length > 0 ? chunks : [text.substring(0, maxChars)];
  }

  _organizeResumeEntities(entities, originalText) {
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
      yearsOfExperience: 0
    };

    // Group entities by type and aggregate
    const entityGroups = {};
    
    entities.forEach(entity => {
      if (!entity.entity_group || entity.score < 0.5) return;
      
      const entityType = entity.entity_group.toUpperCase();
      const word = entity.word.replace(/##/g, '').trim();
      
      if (!word || word.length < 2) return;
      
      if (!entityGroups[entityType]) {
        entityGroups[entityType] = [];
      }
      
      entityGroups[entityType].push({
        word: word,
        score: entity.score,
        start: entity.start,
        end: entity.end
      });
    });

    // Extract specific information based on entity types
    Object.entries(entityGroups).forEach(([entityType, items]) => {
      switch (entityType) {
        case 'NAME':
        case 'PERSON':
          if (!result.name && items.length > 0) {
            // Take the highest scoring name
            const bestName = items.sort((a, b) => b.score - a.score)[0];
            result.name = bestName.word;
          }
          break;
          
        case 'SKILLS':
        case 'SKILL':
          items.forEach(item => {
            if (item.word.length > 2 && !result.skills.includes(item.word)) {
              result.skills.push(item.word);
            }
          });
          break;
          
        case 'DESIGNATION':
        case 'JOB_TITLE':
        case 'POSITION':
          items.forEach(item => {
            if (item.word.length > 3 && !result.jobTitles.includes(item.word)) {
              result.jobTitles.push(item.word);
            }
          });
          break;
          
        case 'COMPANY':
        case 'ORGANIZATION':
          items.forEach(item => {
            if (item.word.length > 2 && !result.companies.includes(item.word)) {
              result.companies.push(item.word);
            }
          });
          break;
          
        case 'COLLEGE NAME':
        case 'UNIVERSITY':
        case 'DEGREE':
        case 'EDUCATION':
          items.forEach(item => {
            if (item.word.length > 3 && !result.education.includes(item.word)) {
              result.education.push(item.word);
            }
          });
          break;
          
        case 'EMAIL':
          if (!result.email && items.length > 0) {
            result.email = items[0].word;
          }
          break;
          
        case 'PHONE':
        case 'PHONE_NUMBER':
          if (!result.phone && items.length > 0) {
            result.phone = items[0].word;
          }
          break;
          
        case 'LOCATION':
        case 'ADDRESS':
          if (!result.location && items.length > 0) {
            result.location = items[0].word;
          }
          break;
          
        case 'YEARS_OF_EXPERIENCE':
        case 'EXPERIENCE_YEARS':
          if (items.length > 0) {
            const yearText = items[0].word;
            const yearMatch = yearText.match(/\d+/);
            if (yearMatch) {
              result.yearsOfExperience = parseInt(yearMatch[0]);
            }
          }
          break;
      }
    });

    // If basic info wasn't found, try fallback extraction
    if (!result.email) result.email = this._extractEmailRegex(originalText);
    if (!result.phone) result.phone = this._extractPhoneRegex(originalText);
    if (!result.location) result.location = this._extractLocationFallback(originalText);
    if (!result.name) result.name = this._extractNameFallback(originalText);

    return result;
  }

  async _fallbackBasicExtraction(text) {
    return {
      name: this._extractNameFallback(text),
      email: this._extractEmailRegex(text),
      phone: this._extractPhoneRegex(text),
      location: this._extractLocationFallback(text),
      skills: this._basicSkillExtraction(text),
      jobTitles: this._basicJobTitleExtraction(text),
      companies: this._basicCompanyExtraction(text),
      experience: [],
      education: this._basicEducationExtraction(text),
      yearsOfExperience: this._calculateYearsOfExperience(text)
    };
  }

  async _enhanceSkillsExtraction(text, extractedSkills = []) {
    try {
      // Enhanced skill extraction combining NER results with keyword matching
      const skillKeywords = [
        // Programming Languages
        'python', 'javascript', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 'swift',
        'kotlin', 'typescript', 'scala', 'r', 'matlab', 'sql', 'html', 'css',
        
        // Frameworks & Libraries
        'react', 'angular', 'vue', 'node.js', 'express', 'django', 'flask', 'spring',
        'laravel', 'rails', 'asp.net', 'bootstrap', 'jquery', 'redux', 'next.js',
        
        // Databases
        'mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle', 'cassandra',
        'elasticsearch', 'dynamodb',
        
        // Cloud & DevOps
        'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'jenkins', 'gitlab', 'github',
        'terraform', 'ansible', 'ci/cd', 'devops',
        
        // Tools & Technologies
        'git', 'linux', 'apache', 'nginx', 'microservices', 'api', 'rest', 'graphql',
        'agile', 'scrum', 'jira', 'confluence'
      ];

      const foundSkills = [...extractedSkills]; // Start with NER extracted skills
      const textLower = text.toLowerCase();
      
      // Extract additional skills using keyword matching
      skillKeywords.forEach(skill => {
        const regex = new RegExp(`\\b${skill}\\b`, 'gi');
        if (regex.test(textLower)) {
          const capitalizedSkill = this._capitalizeSkill(skill);
          if (!foundSkills.includes(capitalizedSkill)) {
            foundSkills.push(capitalizedSkill);
          }
        }
      });

      // Add context-based skill extraction
      const contextSkills = this._extractSkillsFromContext(text);
      contextSkills.forEach(skill => {
        if (!foundSkills.includes(skill)) {
          foundSkills.push(skill);
        }
      });

      // Remove duplicates and return
      return [...new Set(foundSkills)];

    } catch (error) {
      console.log('⚠️ Enhanced skill extraction failed:', error.message);
      return extractedSkills;
    }
  }

  _mergeSkills(nerSkills = [], enhancedSkills = []) {
    const allSkills = [...nerSkills, ...enhancedSkills];
    return [...new Set(allSkills)].filter(skill => skill && skill.length > 1);
  }

  async _advancedSkillExtraction(text) {
    console.log('🔧 Performing advanced skill extraction...');
    
    // Comprehensive skill database
    const skillCategories = {
      programming: [
        'python', 'javascript', 'typescript', 'java', 'c++', 'c#', 'php', 'ruby', 'go', 'rust', 
        'swift', 'kotlin', 'scala', 'r', 'matlab', 'sql', 'html', 'css', 'sass', 'less'
      ],
      frameworks: [
        'react', 'angular', 'vue', 'vue.js', 'svelte', 'node.js', 'express', 'next.js', 'nuxt.js',
        'django', 'flask', 'spring', 'spring boot', 'laravel', 'rails', 'asp.net', 'dotnet',
        'bootstrap', 'tailwind', 'material-ui', 'jquery', 'redux', 'mobx', 'graphql'
      ],
      databases: [
        'mysql', 'postgresql', 'mongodb', 'redis', 'sqlite', 'oracle', 'sql server',
        'cassandra', 'elasticsearch', 'dynamodb', 'firebase', 'supabase'
      ],
      cloud: [
        'aws', 'azure', 'google cloud', 'gcp', 'heroku', 'netlify', 'vercel', 'digital ocean',
        'docker', 'kubernetes', 'jenkins', 'gitlab ci', 'github actions', 'terraform', 'ansible'
      ],
      tools: [
        'git', 'github', 'gitlab', 'bitbucket', 'jira', 'confluence', 'slack', 'trello',
        'figma', 'sketch', 'adobe', 'photoshop', 'linux', 'ubuntu', 'windows', 'macos'
      ]
    };

    const foundSkills = [];
    const textLower = text.toLowerCase();
    
    // Extract skills from all categories
    Object.values(skillCategories).flat().forEach(skill => {
      try {
        // Properly escape special regex characters including + in c++
        const escapedSkill = skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${escapedSkill}\\b`, 'gi');
        if (regex.test(textLower)) {
          foundSkills.push(this._capitalizeSkill(skill));
        }
      } catch (regexError) {
        // Fallback for problematic skills like c++
        console.log(`⚠️ Regex issue with skill "${skill}", using simple includes match`);
        if (textLower.includes(skill.toLowerCase())) {
          foundSkills.push(this._capitalizeSkill(skill));
        }
      }
    });

    // Context-based extraction around skill indicators
    const skillSections = this._extractSkillSections(text);
    foundSkills.push(...skillSections);

    // Clean and deduplicate with better filtering
    const cleanSkills = [...new Set(foundSkills)]
      .filter(skill => {
        if (!skill || skill.length < 2 || skill.length > 25) return false;
        
        // Filter out fragmented or invalid skills
        const invalidPatterns = [
          /^[^\w]/,                    // Starts with non-word character
          /\w+@\w+/,                   // Contains email-like pattern
          /^(and|or|the|of|in|at|to|for|with|by|from|on|about|over|into)\s/i, // Common words
          /^\d+$/,                     // Just numbers
          /^[A-Z]{1}\s[a-z]/,         // Single capital letter followed by lowercase (fragments)
          /\.(com|org|net|edu)/,       // Domain-like
          /^(present|inc\.|corp|ltd)$/i, // Company suffixes alone
          /^[a-z]{1,2}$|^[A-Z]{1,2}$/  // 1-2 letter abbreviations
        ];
        
        return !invalidPatterns.some(pattern => pattern.test(skill));
      })
      .slice(0, 30); // Limit to 30 clean skills
    
    console.log(`🎯 Found ${cleanSkills.length} skills`);
    return cleanSkills;
  }

  _extractSkillSections(text) {
    const skillIndicators = [
      'skills:', 'technical skills:', 'technologies:', 'tools:', 'programming languages:',
      'proficient in:', 'experienced with:', 'expertise:', 'familiar with:', 'knowledge of:'
    ];
    
    const skills = [];
    const lines = text.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].toLowerCase();
      
      if (skillIndicators.some(indicator => line.includes(indicator))) {
        // Extract skills from this line and next few lines
        const skillLines = lines.slice(i, i + 5).join(' ');
        const skillMatches = skillLines.match(/[A-Za-z][A-Za-z0-9+#.\-\s]{2,25}/g);
        
        if (skillMatches) {
          skillMatches.forEach(match => {
            const cleaned = match.trim();
            if (cleaned.length > 2 && cleaned.length < 25) {
              skills.push(cleaned);
            }
          });
        }
      }
    }
    
    return skills;
  }

  _advancedJobTitleExtraction(text) {
    console.log('💼 Performing advanced job title extraction...');
    
    const titlePatterns = [
      // Senior/Lead roles
      /(?:senior|sr\.?|lead|principal|chief|head\s+of|director\s+of|vp\s+of|vice\s+president\s+of)\s+(?:software|web|mobile|full[- ]?stack|front[- ]?end|back[- ]?end|data|machine\s+learning|ai|devops|cloud|security|product|project|program|engineering|technical|marketing|sales|business|operations)?\s*(?:engineer|developer|architect|analyst|scientist|consultant|manager|specialist|designer)/gi,
      
      // Regular roles
      /(?:software|web|mobile|full[- ]?stack|front[- ]?end|back[- ]?end|data|machine\s+learning|ai|devops|cloud|security)\s+(?:engineer|developer|architect|analyst|scientist|consultant|manager|specialist|designer)/gi,
      
      // Management roles
      /(?:product|project|program|engineering|technical|marketing|sales|business|operations|team)\s+(?:manager|director|lead|coordinator|analyst|supervisor)/gi,
      
      // C-level and executive
      /(?:ceo|cto|cio|cfo|cmo|coo|chief\s+executive|chief\s+technology|chief\s+information|chief\s+financial|chief\s+marketing|chief\s+operating)\s*(?:officer)?/gi,
      
      // Specific roles
      /(?:ux|ui)\s+(?:designer|developer)/gi,
      /(?:quality\s+assurance|qa)\s+(?:engineer|analyst|tester)/gi,
      /(?:system|network|database)\s+(?:administrator|admin)/gi
    ];

    const jobTitles = [];
    
    titlePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanTitle = match.trim()
            .replace(/[^\w\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
          
          if (cleanTitle.length > 3 && cleanTitle.length < 50) {
            // Capitalize properly
            const properTitle = cleanTitle.split(' ')
              .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
              .join(' ');
            jobTitles.push(properTitle);
          }
        });
      }
    });

    const uniqueTitles = [...new Set(jobTitles)];
    console.log(`💼 Found ${uniqueTitles.length} job titles`);
    return uniqueTitles;
  }

  _advancedEducationExtraction(text) {
    console.log('🎓 Performing advanced education extraction...');
    
    const educationPatterns = [
      // Degree types with fields
      /(?:bachelor|master|phd|doctorate|associates?|diploma|certificate)(?:\s+of|\s+in)?\s+(?:science|arts|engineering|business|computer|information|technology|management|marketing|finance|accounting|law|medicine|psychology|education|mathematics|physics|chemistry|biology|economics|history|english|communications?)/gi,
      
      // Abbreviated degrees
      /(?:b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|m\.?b\.?a\.?|phd|ph\.?d\.?|m\.?d\.?|j\.?d\.?)\s+(?:in|of)?\s*[a-zA-Z\s]+/gi,
      
      // Universities and colleges
      /(?:university|college|institute|school)\s+of\s+[a-zA-Z\s]+/gi,
      /[A-Z][a-zA-Z\s&.,-]+(?:university|college|institute|school)/gi
    ];

    const education = [];
    
    educationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          const cleanEd = match.trim();
          if (cleanEd.length > 5 && cleanEd.length < 100) {
            education.push(cleanEd);
          }
        });
      }
    });

    const uniqueEducation = [...new Set(education)];
    console.log(`🎓 Found ${uniqueEducation.length} education entries`);
    return uniqueEducation;
  }

  _basicCompanyExtraction(text) {
    console.log('🏢 Performing advanced company extraction...');
    
    const companyPatterns = [
      // Companies with common suffixes
      /(?:at|@|\|)\s+([A-Z][a-zA-Z\s&.,'-]+(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co|Technologies|Tech|Systems|Solutions|Group|Enterprises))/gi,
      
      // Companies without suffixes but in work context
      /(?:at|@|\|)\s+([A-Z][a-zA-Z\s&.,'-]{2,30})(?:\s+\||,|\s+-|\s+\()/g,
      
      // Companies in experience sections
      /(?:Software Engineer|Developer|Manager|Analyst|Consultant|Intern|Specialist)(?:\s+(?:at|@|\|))?\s+([A-Z][a-zA-Z\s&.,'-]{2,30})(?:\s+\||,|\s+-|\s+\(|\s+\d{4})/gi,
      
      // Well-known tech companies (case insensitive)
      /\b(Google|Microsoft|Apple|Amazon|Facebook|Meta|Netflix|Tesla|Uber|Airbnb|Spotify|Adobe|Oracle|IBM|Intel|NVIDIA|Salesforce|Twitter|LinkedIn|PayPal|eBay|Dropbox|Slack|Zoom|GitHub|GitLab|Atlassian|Shopify|Square|Stripe|Twilio|MongoDB|Redis|Docker|Kubernetes)\b/gi
    ];

    const companies = [];
    
    companyPatterns.forEach((pattern, index) => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach(match => {
        let company = match[1] ? match[1].trim() : match[0].trim();
        
        // Clean up the company name
        company = company
          .replace(/[|,-].*$/, '') // Remove everything after |, comma, or dash
          .replace(/\s+\d{4}.*$/, '') // Remove years
          .replace(/\s*\(.*$/, '') // Remove parentheses content
          .trim();
        
        // Validate company name
        if (company.length > 2 && 
            company.length < 50 && 
            !company.match(/^\d+$/) && // Not just numbers
            !company.includes('@') && // Not email
            !company.includes('http') && // Not URL
            !company.match(/^(the|and|or|of|in|at|to|for|with|by)$/i)) { // Not common words
          companies.push(company);
        }
      });
    });

    const uniqueCompanies = [...new Set(companies)];
    console.log(`🏢 Found ${uniqueCompanies.length} companies:`, uniqueCompanies);
    return uniqueCompanies;
  }

  _basicEducationExtraction(text) {
    const degreePatterns = [
      /(?:bachelor|master|phd|doctorate|associates?|diploma|certificate)(?:\s+of|\s+in)?\s+(?:science|arts|engineering|business|computer|information|technology)/gi,
      /(?:bs|ba|ms|ma|mba|phd|md|jd)\s+(?:in|of)?\s*[a-zA-Z\s]+/gi
    ];

    const education = [];
    degreePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        matches.forEach(match => {
          education.push(match.trim());
        });
      }
    });

    return [...new Set(education)];
  }

  _extractUrls(text) {
    return {
      linkedin: this._extractUrl(text, 'linkedin'),
      github: this._extractUrl(text, 'github'),
      portfolio: this._extractUrl(text, 'portfolio')
    };
  }

  async _fallbackExtraction(text) {
    try {
      console.log('🔄 Using fallback extraction methods...');
      
      const result = {
        name: this._extractNameFallback(text),
        email: this._extractEmailRegex(text),
        phone: this._extractPhoneRegex(text),
        location: this._extractLocationFallback(text),
        skills: this._basicSkillExtraction(text),
        jobTitles: this._basicJobTitleExtraction(text),
        companies: this._basicCompanyExtraction(text),
        experience: this._extractExperienceEntries(text),
        education: this._basicEducationExtraction(text),
        languages: this._extractLanguages(text),
        certifications: this._extractCertifications(text),
        summary: this._extractSummary(text),
        yearsOfExperience: this._calculateYearsOfExperience(text),
        currentJobTitle: '',
        linkedinUrl: this._extractUrl(text, 'linkedin'),
        githubUrl: this._extractUrl(text, 'github'),
        portfolioUrl: this._extractUrl(text, 'portfolio'),
        softSkills: this._extractSoftSkills(text),
        industryExperience: [this._classifyIndustry(text)],
        generatedSummary: ''
      };

      if (result.jobTitles.length > 0) {
        result.currentJobTitle = result.jobTitles[0];
      }

      result.generatedSummary = this._generateSummary(result);

      return result;
    } catch (error) {
      console.error('❌ Fallback extraction failed:', error);
      return this._getEmptyResult();
    }
  }

  async _extractExperience(text) {
    try {
      const jobTitles = [];
      const companies = [];
      const experience = [];

      // Common job title patterns
      const titlePatterns = [
        /(?:senior|lead|principal|chief|head of|director of)?\s*(?:software|web|mobile|full[- ]?stack|front[- ]?end|back[- ]?end|data|machine learning|ai|devops|cloud|security)?\s*(?:engineer|developer|architect|analyst|scientist|consultant|manager|specialist)/gi,
        /(?:product|project|program|engineering|technical|marketing|sales|business|operations)\s+(?:manager|director|lead|coordinator|analyst)/gi,
        /(?:ceo|cto|cio|cfo|vp|vice president)/gi
      ];

      titlePatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            const cleanTitle = match.trim().replace(/[^\w\s]/g, '');
            if (cleanTitle.length > 3) {
              jobTitles.push(cleanTitle);
            }
          });
        }
      });

      // Extract companies using common patterns
      const companyPatterns = [
        /(?:at|@)\s+([A-Z][a-zA-Z\s&.,]+(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co))/g,
        /([A-Z][a-zA-Z\s&.,]+(?:Inc|LLC|Corp|Corporation|Ltd|Limited|Company|Co))/g
      ];

      companyPatterns.forEach(pattern => {
        const matches = [...text.matchAll(pattern)];
        matches.forEach(match => {
          const company = match[1] ? match[1].trim() : match[0].trim();
          if (company.length > 2 && company.length < 50) {
            companies.push(company);
          }
        });
      });

      // Extract experience entries (simplified)
      const experienceEntries = this._extractExperienceEntries(text);
      experience.push(...experienceEntries);

      return {
        jobTitles: [...new Set(jobTitles)],
        companies: [...new Set(companies)],
        experience
      };

    } catch (error) {
      console.log('⚠️ Experience extraction failed:', error.message);
      return { jobTitles: [], companies: [], experience: [] };
    }
  }

  async _extractEducation(text) {
    try {
      const education = [];
      const degreePatterns = [
        /(?:bachelor|master|phd|doctorate|associates?|diploma|certificate)(?:\s+of|\s+in)?\s+(?:science|arts|engineering|business|computer|information|technology|management|marketing|finance|accounting|law|medicine|psychology|education|mathematics|physics|chemistry|biology)/gi,
        /(?:bs|ba|ms|ma|mba|phd|md|jd)\s+(?:in|of)?\s*[a-zA-Z\s]+/gi
      ];

      degreePatterns.forEach(pattern => {
        const matches = text.match(pattern);
        if (matches) {
          matches.forEach(match => {
            education.push(match.trim());
          });
        }
      });

      return [...new Set(education)];
    } catch (error) {
      console.log('⚠️ Education extraction failed:', error.message);
      return [];
    }
  }

  async _classifyIndustry(text) {
    try {
      // Simple industry classification based on keywords
      const industries = {
        'technology': ['software', 'tech', 'programming', 'developer', 'engineer', 'coding', 'startup', 'saas'],
        'healthcare': ['medical', 'health', 'hospital', 'clinical', 'patient', 'doctor', 'nurse', 'pharmaceutical'],
        'finance': ['bank', 'financial', 'investment', 'trading', 'accounting', 'finance', 'insurance'],
        'education': ['teaching', 'education', 'university', 'school', 'academic', 'research', 'professor'],
        'marketing': ['marketing', 'advertising', 'brand', 'digital marketing', 'social media', 'seo'],
        'legal': ['law', 'legal', 'attorney', 'lawyer', 'paralegal', 'compliance', 'litigation'],
        'consulting': ['consulting', 'consultant', 'advisory', 'strategy', 'management'],
        'retail': ['retail', 'sales', 'customer service', 'merchandising', 'store'],
        'manufacturing': ['manufacturing', 'production', 'operations', 'quality', 'supply chain']
      };

      const textLower = text.toLowerCase();
      let maxScore = 0;
      let detectedIndustry = 'general';

      Object.entries(industries).forEach(([industry, keywords]) => {
        let score = 0;
        keywords.forEach(keyword => {
          const regex = new RegExp(`\\b${keyword}\\b`, 'g');
          const matches = textLower.match(regex);
          if (matches) {
            score += matches.length;
          }
        });

        if (score > maxScore) {
          maxScore = score;
          detectedIndustry = industry;
        }
      });

      return detectedIndustry;
    } catch (error) {
      console.log('⚠️ Industry classification failed:', error.message);
      return 'general';
    }
  }

  // Helper methods
  _preprocessText(text) {
    return text
      .replace(/\s+/g, ' ')
      .replace(/\n+/g, '\n')
      .trim();
  }

  _extractEmailRegex(text) {
    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
    const match = text.match(emailPattern);
    return match ? match[0].toLowerCase() : '';
  }

  _extractPhoneRegex(text) {
    const phonePatterns = [
      /\+?1?[-.\s]?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/,
      /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/
    ];
    
    for (const pattern of phonePatterns) {
      const match = text.match(pattern);
      if (match) return match[0].trim();
    }
    
    return '';
  }

  _extractNameFallback(text) {
    const lines = text.split('\n').slice(0, 5);
    
    for (const line of lines) {
      const cleanLine = line.trim();
      const words = cleanLine.split(/\s+/);
      
      if (words.length >= 2 && words.length <= 3) {
        const isName = words.every(word => 
          /^[A-Z][a-z]+$/.test(word) && 
          !['Resume', 'CV', 'Email', 'Phone', 'Address'].includes(word)
        );
        
        if (isName && !cleanLine.includes('@') && !cleanLine.includes('http')) {
          return cleanLine;
        }
      }
    }
    
    return '';
  }

  _extractLocationFallback(text) {
    const locationPattern = /([A-Z][a-z]+,\s*[A-Z]{2}(?:\s+\d{5})?)|([A-Z][a-z]+,\s*[A-Z][a-z]+)/;
    const match = text.match(locationPattern);
    return match ? match[0] : '';
  }

  _extractSkillsFromContext(text) {
    const skillIndicators = [
      'skills:', 'technologies:', 'proficient in:', 'experienced with:',
      'expertise:', 'familiar with:', 'knowledge of:'
    ];
    
    const skills = [];
    const textLower = text.toLowerCase();
    
    skillIndicators.forEach(indicator => {
      const index = textLower.indexOf(indicator);
      if (index !== -1) {
        const section = text.substring(index, index + 500);
        const skillMatches = section.match(/[A-Za-z][A-Za-z0-9+#.\-\s]{2,20}/g);
        if (skillMatches) {
          skills.push(...skillMatches.slice(0, 10));
        }
      }
    });
    
    return skills.filter(skill => skill.trim().length > 2);
  }

  _capitalizeSkill(skill) {
    const specialCases = {
      'javascript': 'JavaScript',
      'typescript': 'TypeScript',
      'node.js': 'Node.js',
      'next.js': 'Next.js',
      'vue.js': 'Vue.js',
      'react.js': 'React.js',
      'asp.net': 'ASP.NET',
      'c#': 'C#',
      'c++': 'C++',
      'mysql': 'MySQL',
      'postgresql': 'PostgreSQL',
      'mongodb': 'MongoDB',
      'aws': 'AWS',
      'gcp': 'Google Cloud Platform',
      'ci/cd': 'CI/CD'
    };
    
    return specialCases[skill.toLowerCase()] || 
           skill.charAt(0).toUpperCase() + skill.slice(1).toLowerCase();
  }

  _extractExperienceEntries(text) {
    // Simplified experience extraction
    const entries = [];
    const lines = text.split('\n');
    
    let currentEntry = '';
    for (const line of lines) {
      if (line.trim().length > 20 && 
          (line.includes('20') || line.includes('present') || line.includes('current'))) {
        if (currentEntry) {
          entries.push(currentEntry.trim());
        }
        currentEntry = line;
      } else if (currentEntry && line.trim().length > 10) {
        currentEntry += ' ' + line;
      }
    }
    
    if (currentEntry) {
      entries.push(currentEntry.trim());
    }
    
    return entries;
  }

  _extractLanguages(text) {
    const languages = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Korean', 'Arabic', 'Portuguese', 'Italian', 'Russian'];
    const found = [];
    
    languages.forEach(lang => {
      if (new RegExp(`\\b${lang}\\b`, 'i').test(text)) {
        found.push(lang);
      }
    });
    
    return found;
  }

  _extractCertifications(text) {
    const certPatterns = [
      /(?:certified|certification|certificate)\s+[a-zA-Z\s\-()]{5,50}/gi,
      /[A-Z]{2,}\s+certified/gi
    ];
    
    const certs = [];
    certPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        certs.push(...matches);
      }
    });
    
    return [...new Set(certs)];
  }

  _extractSummary(text) {
    const summaryIndicators = ['summary', 'objective', 'about', 'profile'];
    
    for (const indicator of summaryIndicators) {
      const regex = new RegExp(`${indicator}[:\s]*([^\\n]{50,300})`, 'i');
      const match = text.match(regex);
      if (match) {
        return match[1].trim();
      }
    }
    
    return '';
  }

  _calculateYearsOfExperience(text) {
    const currentYear = new Date().getFullYear();
    const yearMatches = text.match(/20\d{2}/g);
    
    if (yearMatches && yearMatches.length >= 2) {
      const years = yearMatches.map(y => parseInt(y)).sort();
      const earliestYear = years[0];
      return Math.max(0, currentYear - earliestYear);
    }
    
    return 0;
  }

  _extractUrl(text, type) {
    const patterns = {
      linkedin: /linkedin\.com\/in\/[a-zA-Z0-9\-]+/i,
      github: /github\.com\/[a-zA-Z0-9\-]+/i,
      portfolio: /(?:portfolio|website):\s*(https?:\/\/[^\s]+)/i
    };
    
    const match = text.match(patterns[type]);
    return match ? match[0] : '';
  }

  _extractSoftSkills(text) {
    const softSkills = [
      'leadership', 'communication', 'teamwork', 'problem solving', 'analytical',
      'creative', 'organized', 'detail oriented', 'time management', 'adaptable',
      'collaborative', 'innovative', 'strategic thinking', 'presentation skills'
    ];
    
    const found = [];
    const textLower = text.toLowerCase();
    
    softSkills.forEach(skill => {
      if (textLower.includes(skill)) {
        found.push(skill);
      }
    });
    
    return found;
  }

  _generateSummary(data) {
    const { name, skills, jobTitles, industryExperience, yearsOfExperience } = data;
    
    let summary = name ? `${name} is a` : 'A';
    
    if (jobTitles.length > 0) {
      summary += ` ${jobTitles[0].toLowerCase()}`;
    } else {
      summary += ' professional';
    }
    
    if (industryExperience.length > 0) {
      summary += ` in the ${industryExperience[0]} industry`;
    }
    
    if (yearsOfExperience > 0) {
      summary += ` with ${yearsOfExperience} years of experience`;
    }
    
    if (skills.length > 0) {
      const topSkills = skills.slice(0, 3).join(', ');
      summary += ` specializing in ${topSkills}`;
    }
    
    summary += '.';
    
    return summary;
  }

  _getEmptyResult() {
    return {
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
  }
}

module.exports = HuggingFaceResumeParser;