const { HfInference } = require('@huggingface/inference');

class HuggingFaceService {
  constructor() {
    this.hf = new HfInference(process.env.HUGGINGFACE_API_KEY);
    this.model = 'microsoft/DialoGPT-large'; // We'll use a good text generation model
    // Alternative models to consider:
    // 'gpt2-large'
    // 'microsoft/DialoGPT-large' 
    // 'facebook/blenderbot-400M-distill'
  }

  /**
   * Generate a professional cover letter based on job description and resume data
   */
  async generateCoverLetter(jobData, resumeData, userPreferences = {}) {
    try {
      console.log('🤖 Generating cover letter with Hugging Face...');
      console.log('📄 Job title:', jobData.title);
      console.log('🏢 Company:', jobData.company);
      
      // Build a comprehensive prompt for cover letter generation
      const prompt = this.buildCoverLetterPrompt(jobData, resumeData, userPreferences);
      console.log('📝 Generated prompt length:', prompt.length);
      
      // Use text generation model
      const response = await this.hf.textGeneration({
        model: 'gpt2-large', // Using GPT-2 Large for better text generation
        inputs: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.7,
          do_sample: true,
          top_p: 0.9,
          repetition_penalty: 1.1,
          return_full_text: false
        }
      });

      console.log('✅ Cover letter generated successfully');
      
      // Extract and clean the generated text
      let generatedText = response.generated_text || response[0]?.generated_text || '';
      generatedText = this.cleanAndFormatCoverLetter(generatedText, jobData, resumeData);
      
      return {
        success: true,
        coverLetter: generatedText,
        jobTitle: jobData.title,
        company: jobData.company,
        generatedAt: new Date().toISOString(),
        model: 'gpt2-large'
      };

    } catch (error) {
      console.error('❌ Error generating cover letter:', error.message);
      console.error('❌ Error details:', error);
      
      // Fallback to template-based cover letter
      return this.generateTemplateCoverLetter(jobData, resumeData);
    }
  }

  /**
   * Build a comprehensive prompt for cover letter generation
   */
  buildCoverLetterPrompt(jobData, resumeData, userPreferences) {
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    // Extract key information
    const applicantName = resumeData.name || 'John Doe';
    const jobTitle = jobData.title || 'Software Developer';
    const company = jobData.company || 'Tech Company';
    const skills = resumeData.skills?.slice(0, 5).join(', ') || 'programming, development';
    const experience = resumeData.yearsOfExperience || '3+ years';
    
    // Build requirements from job description
    let keyRequirements = '';
    if (jobData.requirements && jobData.requirements.length > 0) {
      keyRequirements = jobData.requirements.slice(0, 3).join('. ');
    } else if (jobData.description) {
      // Extract key phrases from description
      const desc = jobData.description.toLowerCase();
      const commonSkills = ['javascript', 'python', 'react', 'node.js', 'aws', 'sql', 'git'];
      const mentionedSkills = commonSkills.filter(skill => desc.includes(skill));
      keyRequirements = mentionedSkills.length > 0 ? mentionedSkills.join(', ') : 'software development';
    }

    const prompt = `Write a professional cover letter for the following job application:

Job Title: ${jobTitle}
Company: ${company}
Applicant: ${applicantName}
Key Skills: ${skills}
Experience: ${experience}
Job Requirements: ${keyRequirements}

Cover Letter:

${currentDate}

Dear Hiring Manager,

I am writing to express my strong interest in the ${jobTitle} position at ${company}. With ${experience} of experience and expertise in ${skills}, I am confident that I would be a valuable addition to your team.

`;

    return prompt;
  }

  /**
   * Clean and format the generated cover letter
   */
  cleanAndFormatCoverLetter(generatedText, jobData, resumeData) {
    // Remove any unwanted characters and format properly
    let cleaned = generatedText
      .replace(/\n\n+/g, '\n\n') // Remove excessive line breaks
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/[^\w\s.,!?'"()-]/g, '') // Remove special characters except punctuation
      .trim();

    // Ensure proper structure
    if (!cleaned.includes('Sincerely,') && !cleaned.includes('Best regards,')) {
      cleaned += '\n\nSincerely,\n' + (resumeData.name || 'Your Name');
    }

    return cleaned;
  }

  /**
   * Fallback template-based cover letter generation
   */
  generateTemplateCoverLetter(jobData, resumeData) {
    const currentDate = new Date().toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    });

    const applicantName = resumeData.name || 'Your Name';
    const jobTitle = jobData.title || 'the position';
    const company = jobData.company || 'your company';
    const skills = resumeData.skills?.slice(0, 5).join(', ') || 'relevant skills';
    const experience = resumeData.yearsOfExperience || 'several years';

    const templateCoverLetter = `${currentDate}

Dear Hiring Manager,

I am writing to express my strong interest in the ${jobTitle} position at ${company}. With ${experience} of professional experience and expertise in ${skills}, I am excited about the opportunity to contribute to your team.

Throughout my career, I have developed strong technical skills and a passion for delivering high-quality solutions. My background aligns well with the requirements outlined in your job posting, and I am particularly drawn to ${company}'s commitment to innovation and excellence.

Key highlights of my qualifications include:
• Extensive experience with ${skills}
• Strong problem-solving and analytical abilities
• Proven track record of successful project delivery
• Excellent communication and collaboration skills

I am excited about the possibility of bringing my expertise to ${company} and contributing to your continued success. I would welcome the opportunity to discuss how my skills and experience can benefit your team.

Thank you for considering my application. I look forward to hearing from you soon.

Sincerely,
${applicantName}`;

    return {
      success: true,
      coverLetter: templateCoverLetter,
      jobTitle: jobData.title,
      company: jobData.company,
      generatedAt: new Date().toISOString(),
      model: 'template-fallback',
      isTemplate: true
    };
  }

  /**
   * Test the Hugging Face connection
   */
  async testConnection() {
    try {
      console.log('🧪 Testing Hugging Face connection...');
      
      const response = await this.hf.textGeneration({
        model: 'gpt2',
        inputs: 'Hello world',
        parameters: {
          max_new_tokens: 10,
          temperature: 0.5
        }
      });
      
      console.log('✅ Hugging Face connection successful');
      return { success: true, response };
    } catch (error) {
      console.error('❌ Hugging Face connection failed:', error.message);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new HuggingFaceService();