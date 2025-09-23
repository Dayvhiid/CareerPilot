const axios = require('axios');
const natural = require('natural');

class JSearchService {
  constructor() {
    this.apiKey = process.env.JSEARCH_API_KEY || 'your-jsearch-api-key';
    this.baseURL = 'https://jsearch.p.rapidapi.com';
    this.headers = {
      'X-RapidAPI-Key': this.apiKey,
      'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      'Content-Type': 'application/json'
    };
  }

  /**
   * Search for jobs using JSearch API
   * @param {Object} params - Search parameters
   * @returns {Promise<Object>} - Job search results
   */
  async searchJobs(params = {}) {
    try {
      const {
        query = 'software developer', // Default query
        location = 'Nigeria',
        page = 1,
        numPages = 1,
        datePosted = 'all', // all, today, 3days, week, month
        jobType = 'all', // all, fulltime, parttime, contractor
        experienceLevel = 'all' // all, entry_level, mid_level, senior_level
      } = params;

      console.log(`🔍 Searching jobs: "${query}" in ${location}`);

      const response = await axios.get(`${this.baseURL}/search`, {
        headers: this.headers,
        params: {
          query: `${query} ${location}`,
          page,
          num_pages: numPages,
          date_posted: datePosted,
          job_requirements: experienceLevel !== 'all' ? experienceLevel : undefined,
          employment_types: jobType !== 'all' ? jobType.toUpperCase() : undefined
        },
        timeout: 10000 // 10 second timeout
      });

      if (response.data && response.data.status === 'OK') {
        console.log(`✅ Found ${response.data.data?.length || 0} jobs`);
        return {
          success: true,
          data: response.data.data || [],
          totalResults: response.data.data?.length || 0,
          parameters: response.data.parameters
        };
      } else {
        console.error('❌ JSearch API error:', response.data);
        return {
          success: false,
          error: 'No results found',
          data: []
        };
      }

    } catch (error) {
      console.error('❌ JSearch API request failed:', error.message);
      
      // Return mock data for development/testing
      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Returning mock data for development');
        return this.getMockJobs(params);
      }

      return {
        success: false,
        error: error.message,
        data: []
      };
    }
  }

  /**
   * Parse and normalize job data from JSearch API
   * @param {Array} rawJobs - Raw job data from API
   * @returns {Array} - Normalized job objects
   */
  normalizeJobs(rawJobs) {
    return rawJobs.map(job => {
      // Extract skills from job description using basic NLP
      const skills = this.extractSkills(job.job_description || '');
      
      // Extract salary information
      const salary = this.parseSalary(job.job_salary || job.job_min_salary, job.job_max_salary);
      
      // Determine job type
      const jobType = this.normalizeJobType(job.job_employment_type);
      
      // Extract location
      const location = this.normalizeLocation(job.job_city, job.job_state, job.job_country);

      return {
        title: job.job_title || 'Unknown Position',
        company: job.employer_name || 'Unknown Company',
        location: location,
        description: job.job_description || 'No description available',
        requirements: this.extractRequirements(job.job_description || ''),
        salary: salary,
        jobType: jobType,
        experienceLevel: this.determineExperienceLevel(job.job_title, job.job_description),
        skills: skills,
        postedDate: job.job_posted_at_datetime_utc ? new Date(job.job_posted_at_datetime_utc) : new Date(),
        externalId: job.job_id || `jsearch_${Date.now()}_${Math.random()}`,
        source: this.determineJobSource(job.job_apply_link || ''),
        jobUrl: job.job_apply_link || job.job_google_link || '#',
        companyLogo: job.employer_logo || null,
        industry: this.determineIndustry(job.job_title, job.job_description),
        benefits: this.extractBenefits(job.job_description || ''),
        workType: this.determineWorkType(job.job_description || '')
      };
    });
  }

  /**
   * Extract skills from job description using keyword matching
   * @param {string} description - Job description text
   * @returns {Array} - Array of identified skills
   */
  extractSkills(description) {
    const commonSkills = [
      // Programming Languages
      'JavaScript', 'Python', 'Java', 'C#', 'PHP', 'React', 'Node.js', 'Angular', 'Vue.js',
      'TypeScript', 'C++', 'Ruby', 'Go', 'Swift', 'Kotlin', 'Dart', 'Flutter',
      
      // Databases
      'MongoDB', 'MySQL', 'PostgreSQL', 'Redis', 'SQLite', 'Oracle', 'SQL Server',
      
      // Cloud & DevOps
      'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Jenkins', 'Git', 'GitHub',
      
      // Design & Marketing
      'Photoshop', 'Figma', 'Adobe', 'UI/UX', 'Graphic Design', 'Digital Marketing', 'SEO',
      
      // Business & Finance
      'Excel', 'PowerPoint', 'Accounting', 'Finance', 'Project Management', 'Agile', 'Scrum',
      
      // Nigerian specific
      'Fintech', 'Mobile Money', 'Banking', 'Insurance', 'Oil & Gas', 'Agriculture'
    ];

    const foundSkills = [];
    const lowerDescription = description.toLowerCase();

    commonSkills.forEach(skill => {
      if (lowerDescription.includes(skill.toLowerCase())) {
        foundSkills.push(skill);
      }
    });

    return foundSkills.slice(0, 10); // Limit to 10 skills
  }

  /**
   * Extract job requirements from description
   * @param {string} description - Job description
   * @returns {Array} - Array of requirements
   */
  extractRequirements(description) {
    const requirements = [];
    const lines = description.split('\n');
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.match(/^[\-\*\•]\s*/) || trimmed.match(/^\d+\.\s*/)) {
        requirements.push(trimmed.replace(/^[\-\*\•\d\.\s]+/, ''));
      }
    });

    return requirements.slice(0, 8); // Limit requirements
  }

  /**
   * Parse salary information
   * @param {string|number} minSalary - Minimum salary
   * @param {string|number} maxSalary - Maximum salary
   * @returns {Object} - Salary object
   */
  parseSalary(minSalary, maxSalary) {
    const salary = {
      min: null,
      max: null,
      currency: 'NGN',
      display: null
    };

    if (minSalary || maxSalary) {
      salary.min = typeof minSalary === 'number' ? minSalary : parseInt(minSalary) || null;
      salary.max = typeof maxSalary === 'number' ? maxSalary : parseInt(maxSalary) || null;
      
      if (salary.min || salary.max) {
        salary.display = `₦${salary.min ? salary.min.toLocaleString() : ''}${salary.max ? ' - ₦' + salary.max.toLocaleString() : ''} per month`;
      }
    }

    return salary;
  }

  /**
   * Normalize job type
   */
  normalizeJobType(employmentType) {
    if (!employmentType) return 'full-time';
    
    const type = employmentType.toLowerCase();
    if (type.includes('part')) return 'part-time';
    if (type.includes('contract')) return 'contract';
    if (type.includes('temp')) return 'temporary';
    if (type.includes('intern')) return 'internship';
    return 'full-time';
  }

  /**
   * Normalize location
   */
  normalizeLocation(city, state, country) {
    const parts = [city, state, country].filter(Boolean);
    return parts.join(', ') || 'Nigeria';
  }

  /**
   * Determine experience level from job title and description
   */
  determineExperienceLevel(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    
    if (text.includes('senior') || text.includes('lead') || text.includes('principal')) return 'senior';
    if (text.includes('junior') || text.includes('entry') || text.includes('graduate')) return 'entry';
    if (text.includes('intern')) return 'entry';
    return 'mid';
  }

  /**
   * Determine job source from apply link
   */
  determineJobSource(applyLink) {
    if (!applyLink) return 'other';
    
    const link = applyLink.toLowerCase();
    if (link.includes('indeed')) return 'indeed';
    if (link.includes('linkedin')) return 'linkedin';
    if (link.includes('glassdoor')) return 'glassdoor';
    if (link.includes('ziprecruiter')) return 'ziprecruiter';
    return 'other';
  }

  /**
   * Determine industry from job title and description
   */
  determineIndustry(title, description) {
    const text = `${title} ${description}`.toLowerCase();
    
    if (text.includes('software') || text.includes('developer') || text.includes('programming')) return 'Technology';
    if (text.includes('finance') || text.includes('bank') || text.includes('fintech')) return 'Finance';
    if (text.includes('health') || text.includes('medical') || text.includes('hospital')) return 'Healthcare';
    if (text.includes('education') || text.includes('teacher') || text.includes('school')) return 'Education';
    if (text.includes('marketing') || text.includes('sales') || text.includes('advertising')) return 'Marketing';
    if (text.includes('oil') || text.includes('gas') || text.includes('energy')) return 'Oil & Gas';
    return 'Other';
  }

  /**
   * Extract benefits from job description
   */
  extractBenefits(description) {
    const benefits = [];
    const text = description.toLowerCase();
    
    if (text.includes('health insurance') || text.includes('medical')) benefits.push('Health Insurance');
    if (text.includes('pension') || text.includes('retirement')) benefits.push('Pension Plan');
    if (text.includes('remote') || text.includes('work from home')) benefits.push('Remote Work');
    if (text.includes('vacation') || text.includes('leave')) benefits.push('Paid Leave');
    if (text.includes('training') || text.includes('development')) benefits.push('Professional Development');
    
    return benefits;
  }

  /**
   * Determine work type (remote, onsite, hybrid)
   */
  determineWorkType(description) {
    const text = description.toLowerCase();
    
    if (text.includes('remote') || text.includes('work from home')) return 'remote';
    if (text.includes('hybrid') || text.includes('flexible')) return 'hybrid';
    return 'onsite';
  }

  /**
   * Get mock jobs for development/testing
   */
  getMockJobs(params) {
    const mockJobs = [
      {
        job_id: 'mock_1',
        job_title: 'Software Developer',
        employer_name: 'Tech Solutions Nigeria',
        job_city: 'Lagos',
        job_state: 'Lagos State',
        job_country: 'Nigeria',
        job_description: 'We are looking for a skilled Software Developer with experience in JavaScript, React, and Node.js. The ideal candidate should have 2-3 years of experience in web development.',
        job_apply_link: 'https://indeed.com/job/mock1',
        job_posted_at_datetime_utc: new Date().toISOString(),
        job_employment_type: 'FULLTIME'
      },
      {
        job_id: 'mock_2',
        job_title: 'Digital Marketing Specialist',
        employer_name: 'Marketing Pro Lagos',
        job_city: 'Abuja',
        job_state: 'FCT',
        job_country: 'Nigeria',
        job_description: 'Looking for a Digital Marketing Specialist with experience in SEO, social media marketing, and content creation. Experience with Google Ads and Facebook Ads preferred.',
        job_apply_link: 'https://linkedin.com/job/mock2',
        job_posted_at_datetime_utc: new Date().toISOString(),
        job_employment_type: 'FULLTIME'
      },
      {
        job_id: 'mock_3',
        job_title: 'Data Analyst',
        employer_name: 'FinTech Nigeria Ltd',
        job_city: 'Port Harcourt',
        job_state: 'Rivers State',
        job_country: 'Nigeria',
        job_description: 'We need a Data Analyst proficient in Python, SQL, and Excel. Experience with data visualization tools like Tableau or Power BI is a plus. Banking or fintech experience preferred.',
        job_apply_link: 'https://glassdoor.com/job/mock3',
        job_posted_at_datetime_utc: new Date().toISOString(),
        job_employment_type: 'FULLTIME'
      }
    ];

    return {
      success: true,
      data: mockJobs,
      totalResults: mockJobs.length,
      parameters: params
    };
  }
}

module.exports = new JSearchService();