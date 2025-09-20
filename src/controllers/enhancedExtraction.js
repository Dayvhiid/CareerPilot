// Enhanced extraction functions for better resume processing accuracy

// Enhanced location extraction with better patterns and validation
function extractLocationEnhanced(text) {
  const locationPatterns = [
    // City, State, ZIP
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\s*(\d{5}(?:-\d{4})?)?/g,
    // City, State
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z]{2})\b/g,
    // City, Country
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g,
    // International formats
    /\b([A-Z][a-z]+),\s*([A-Z][a-z]+),\s*([A-Z][a-z]+)\b/g
  ];
  
  const validCities = [
    'New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia', 'San Antonio',
    'San Diego', 'Dallas', 'San Jose', 'Austin', 'Jacksonville', 'Fort Worth', 'Columbus',
    'Charlotte', 'San Francisco', 'Indianapolis', 'Seattle', 'Denver', 'Washington', 'Boston',
    'Nashville', 'Baltimore', 'Oklahoma City', 'Louisville', 'Portland', 'Las Vegas', 'Memphis',
    'Detroit', 'Atlanta', 'Miami', 'Orlando', 'Tampa', 'London', 'Paris', 'Berlin', 'Madrid',
    'Rome', 'Toronto', 'Vancouver', 'Montreal', 'Sydney', 'Melbourne', 'Tokyo', 'Mumbai'
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
      const city = match[1];
      const stateOrCountry = match[2];
      
      // Validate against known cities and states
      if (validCities.some(validCity => validCity.toLowerCase().includes(city.toLowerCase())) ||
          (stateOrCountry && stateOrCountry.length === 2 && validStates.includes(stateOrCountry))) {
        return fullMatch.trim();
      }
    }
  }
  
  return "";
}

// Enhanced URL extraction with validation
function extractUrlsEnhanced(text, data) {
  const urlPatterns = {
    linkedin: /(?:https?:\/\/)?(?:www\.)?linkedin\.com\/in\/[a-zA-Z0-9-]+\/?/gi,
    github: /(?:https?:\/\/)?(?:www\.)?github\.com\/[a-zA-Z0-9-]+\/?/gi,
    portfolio: /(?:https?:\/\/)?(?:www\.)?[a-zA-Z0-9-]+\.(?:com|net|org|io|dev|me|co)(?:\/[^\s]*)?/gi
  };

  // Extract LinkedIn
  const linkedinMatches = [...text.matchAll(urlPatterns.linkedin)];
  if (linkedinMatches.length > 0) {
    data.linkedinUrl = linkedinMatches[0][0].replace(/\/$/, '');
  }

  // Extract GitHub
  const githubMatches = [...text.matchAll(urlPatterns.github)];
  if (githubMatches.length > 0) {
    data.githubUrl = githubMatches[0][0].replace(/\/$/, '');
  }

  // Extract Portfolio (excluding social media)
  const portfolioMatches = [...text.matchAll(urlPatterns.portfolio)];
  for (const match of portfolioMatches) {
    const url = match[0];
    if (!url.includes('linkedin') && !url.includes('github') && 
        !url.includes('facebook') && !url.includes('twitter') &&
        !url.includes('instagram') && url.length < 100) {
      data.portfolioUrl = url;
      break;
    }
  }
}

// Enhanced skills extraction with context awareness
function extractSkillsEnhanced(text) {
  const skills = new Set();
  
  // Comprehensive technical skills database organized by category
  const techSkillsDatabase = {
    programming: [
      'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'PHP', 'Ruby', 'Go', 'Rust', 
      'Swift', 'Kotlin', 'Scala', 'R', 'MATLAB', 'Perl', 'Dart', 'Objective-C', 'VB.NET', 
      'F#', 'Haskell', 'Clojure', 'Elixir', 'Julia', 'Assembly', 'COBOL', 'Fortran'
    ],
    web: [
      'HTML', 'CSS', 'SASS', 'SCSS', 'LESS', 'Bootstrap', 'Tailwind CSS', 'Material-UI', 
      'Chakra UI', 'Ant Design', 'Semantic UI', 'Bulma', 'Foundation', 'Materialize'
    ],
    frontend: [
      'React', 'Angular', 'Vue.js', 'Svelte', 'Next.js', 'Nuxt.js', 'Gatsby', 'Ember.js',
      'Backbone.js', 'Knockout.js', 'Polymer', 'Lit', 'Alpine.js', 'Stimulus'
    ],
    backend: [
      'Node.js', 'Express.js', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Spring Framework',
      'ASP.NET', 'Laravel', 'Symfony', 'CodeIgniter', 'Rails', 'Sinatra', 'Gin', 'Echo', 
      'Fiber', 'NestJS', 'Koa.js', 'Hapi.js', 'Fastify'
    ],
    database: [
      'MongoDB', 'MySQL', 'PostgreSQL', 'Oracle', 'Redis', 'SQLite', 'Cassandra', 'DynamoDB',
      'CouchDB', 'Neo4j', 'InfluxDB', 'Elasticsearch', 'Firebase', 'Supabase', 'MariaDB',
      'Microsoft SQL Server', 'IBM DB2', 'Amazon RDS', 'Google Cloud SQL'
    ],
    cloud: [
      'AWS', 'Azure', 'Google Cloud', 'GCP', 'Heroku', 'Vercel', 'Netlify', 'DigitalOcean',
      'Linode', 'Vultr', 'Oracle Cloud', 'IBM Cloud', 'Alibaba Cloud'
    ],
    devops: [
      'Docker', 'Kubernetes', 'Jenkins', 'GitLab CI', 'GitHub Actions', 'CircleCI', 'Travis CI',
      'Terraform', 'Ansible', 'Chef', 'Puppet', 'Vagrant', 'Nginx', 'Apache', 'Prometheus',
      'Grafana', 'ELK Stack', 'Splunk'
    ],
    tools: [
      'Git', 'GitHub', 'GitLab', 'Bitbucket', 'SVN', 'Jira', 'Confluence', 'Slack', 'Teams',
      'Trello', 'Asana', 'Monday', 'Notion', 'VS Code', 'IntelliJ', 'Eclipse', 'Xcode'
    ],
    testing: [
      'Jest', 'Mocha', 'Chai', 'Cypress', 'Playwright', 'Selenium', 'WebDriver', 'JUnit',
      'TestNG', 'PyTest', 'RSpec', 'PHPUnit', 'Karma', 'Jasmine'
    ],
    mobile: [
      'React Native', 'Flutter', 'Ionic', 'Xamarin', 'Cordova', 'PhoneGap', 'Titanium',
      'iOS Development', 'Android Development', 'Swift UI', 'Jetpack Compose'
    ],
    data: [
      'Pandas', 'NumPy', 'Matplotlib', 'Seaborn', 'Scikit-learn', 'TensorFlow', 'PyTorch',
      'Keras', 'OpenCV', 'NLTK', 'SpaCy', 'Hadoop', 'Spark', 'Kafka', 'Airflow'
    ]
  };

  // Flatten all skills
  const allTechSkills = Object.values(techSkillsDatabase).flat();
  
  // Look for skills section first for better context
  const skillsSectionRegex = /(?:skills|technical skills|core competencies|technologies|expertise|proficiencies)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|education|projects|$)/i;
  const skillsSection = text.match(skillsSectionRegex);
  let searchText = skillsSection ? skillsSection[1] : text;
  
  // Extract skills using multiple patterns
  const extractionPatterns = [
    // Bullet points
    /[•\-\*]\s*([A-Za-z\s\.\+\#\/\(\)]+?)(?:\n|$)/g,
    // Comma separated
    /([A-Za-z\s\.\+\#\/\(\)]{2,30})(?:,|$)/g,
    // Line separated
    /^([A-Za-z\s\.\+\#\/\(\)]{2,30})$/gm
  ];
  
  // Direct skill matching with fuzzy matching
  allTechSkills.forEach(skill => {
    const skillRegex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (skillRegex.test(searchText)) {
      skills.add(skill);
    }
    
    // Fuzzy matching for variations
    const variations = generateSkillVariations(skill);
    variations.forEach(variation => {
      const variationRegex = new RegExp(`\\b${variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (variationRegex.test(searchText)) {
        skills.add(skill);
      }
    });
  });
  
  // Extract from structured lists
  extractionPatterns.forEach(pattern => {
    const matches = [...searchText.matchAll(pattern)];
    matches.forEach(match => {
      const potentialSkill = match[1].trim();
      if (isValidSkill(potentialSkill, allTechSkills)) {
        skills.add(potentialSkill);
      }
    });
  });

  return Array.from(skills).slice(0, 25);
}

// Generate skill variations for better matching
function generateSkillVariations(skill) {
  const variations = [];
  
  // Common abbreviations and variations
  const skillMap = {
    'JavaScript': ['JS', 'Javascript', 'ECMAScript'],
    'TypeScript': ['TS', 'Typescript'],
    'React': ['ReactJS', 'React.js'],
    'Vue.js': ['Vue', 'VueJS'],
    'Angular': ['AngularJS'],
    'Node.js': ['NodeJS', 'Node'],
    'Express.js': ['Express', 'ExpressJS'],
    'MongoDB': ['Mongo'],
    'PostgreSQL': ['Postgres', 'PSQL'],
    'Amazon Web Services': ['AWS'],
    'Google Cloud Platform': ['GCP'],
    'Cascading Style Sheets': ['CSS'],
    'HyperText Markup Language': ['HTML']
  };
  
  if (skillMap[skill]) {
    variations.push(...skillMap[skill]);
  }
  
  return variations;
}

// Validate if extracted text is a valid skill
function isValidSkill(text, skillsDatabase) {
  if (text.length < 2 || text.length > 40) return false;
  if (/\d{4}/.test(text)) return false; // Skip years
  if (text.includes('@') || text.includes('http')) return false;
  
  // Check if it matches any known skill (case insensitive)
  return skillsDatabase.some(skill => 
    skill.toLowerCase() === text.toLowerCase() ||
    skill.toLowerCase().includes(text.toLowerCase()) ||
    text.toLowerCase().includes(skill.toLowerCase())
  );
}

// Enhanced soft skills extraction
function extractSoftSkillsEnhanced(text) {
  const softSkillsDatabase = [
    'Leadership', 'Communication', 'Problem Solving', 'Team Work', 'Critical Thinking',
    'Creativity', 'Adaptability', 'Time Management', 'Project Management', 'Collaboration',
    'Analytical Skills', 'Attention to Detail', 'Customer Service', 'Negotiation',
    'Public Speaking', 'Mentoring', 'Strategic Planning', 'Innovation', 'Decision Making',
    'Conflict Resolution', 'Emotional Intelligence', 'Multitasking', 'Organization',
    'Presentation Skills', 'Research', 'Writing', 'Client Relations', 'Sales'
  ];
  
  const foundSoftSkills = new Set();
  
  // Look for soft skills section
  const softSkillsSection = text.match(/(?:soft skills|interpersonal skills|personal skills|core competencies)[:\s]+([\s\S]*?)(?:\n\s*\n|experience|education|technical|$)/i);
  const searchText = softSkillsSection ? softSkillsSection[1] : text;
  
  softSkillsDatabase.forEach(skill => {
    const skillRegex = new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    if (skillRegex.test(searchText)) {
      foundSoftSkills.add(skill);
    }
  });
  
  return Array.from(foundSoftSkills).slice(0, 10);
}

module.exports = {
  extractLocationEnhanced,
  extractUrlsEnhanced,
  extractSkillsEnhanced,
  extractSoftSkillsEnhanced,
  generateSkillVariations,
  isValidSkill
};