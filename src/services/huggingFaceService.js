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

    // Extract key information with better defaults
    const applicantName = resumeData.name || '[Your Name]';
    const jobTitle = jobData.title || 'the position';
    const company = jobData.company || '[Company Name]';
    
    // Extract skills more intelligently
    const topSkills = resumeData.skills?.slice(0, 4) || [];
    const skillsText = topSkills.length > 0 ? topSkills.join(', ') : 'relevant technical skills';
    
    // Extract work experience details
    const workExperience = resumeData.workExperience || [];
    const recentPosition = workExperience[0];
    const experienceText = recentPosition ? 
      `${recentPosition.position} at ${recentPosition.company}` : 
      'professional experience in the field';
    
    // Extract education if available
    const education = resumeData.education || [];
    const degree = education[0] ? 
      `${education[0].degree} in ${education[0].field}` : 
      'relevant educational background';
    
    // Analyze job description for key requirements
    let jobRequirements = [];
    let companyInfo = '';
    
    if (jobData.description) {
      const desc = jobData.description.toLowerCase();
      
      // Extract technical skills mentioned
      const techSkills = ['javascript', 'python', 'react', 'node.js', 'aws', 'sql', 'mongodb', 'express', 'html', 'css', 'git', 'docker', 'kubernetes', 'java', 'c++', 'angular', 'vue'];
      const mentionedTech = techSkills.filter(skill => desc.includes(skill));
      
      // Extract soft skills and requirements
      const softSkills = ['leadership', 'teamwork', 'communication', 'problem-solving', 'analytical', 'creative', 'detail-oriented'];
      const mentionedSoft = softSkills.filter(skill => desc.includes(skill));
      
      jobRequirements = [...mentionedTech.slice(0, 3), ...mentionedSoft.slice(0, 2)];
    }
    
    const requirementsText = jobRequirements.length > 0 ? 
      jobRequirements.join(', ') : 
      'the technical and soft skills required for this role';

    // Build a more sophisticated prompt
    const prompt = `You are a professional career advisor writing a personalized cover letter. Create a compelling, professional cover letter that demonstrates genuine interest and qualifications.

CONTEXT:
- Applicant: ${applicantName}
- Position: ${jobTitle}
- Company: ${company}
- Date: ${currentDate}
- Applicant's Skills: ${skillsText}
- Recent Experience: ${experienceText}
- Education: ${degree}
- Job Requirements: ${requirementsText}

INSTRUCTIONS:
Write a professional cover letter that:
1. Opens with genuine enthusiasm for the specific role and company
2. Highlights 2-3 most relevant qualifications that match the job requirements
3. Provides a specific example of relevant achievement or experience
4. Shows knowledge of the company or industry
5. Concludes with a strong call to action
6. Uses professional but engaging tone
7. Is concise (3-4 paragraphs maximum)

COVER LETTER:

${currentDate}

Dear Hiring Manager,

I am excited to apply for the ${jobTitle} position at ${company}. Your commitment to innovation and excellence in the industry aligns perfectly with my professional values and career aspirations.

With my background in ${experienceText} and expertise in ${skillsText}, I am well-positioned to contribute meaningfully to your team. My experience has equipped me with strong capabilities in ${requirementsText}, which I understand are crucial for success in this role.

In my previous role, I successfully [specific achievement that demonstrates relevant skills and impact]. This experience has strengthened my ability to [relevant skill/competency] and deliver results that drive business objectives forward.

I am particularly drawn to ${company} because of [mention something specific about the company - innovation, market position, values, or recent achievements]. I would welcome the opportunity to discuss how my skills and enthusiasm can contribute to your team's continued success.

Thank you for considering my application. I look forward to hearing from you soon.

Sincerely,
${applicantName}`;

    return prompt;
  }

  /**
   * Clean and format the generated cover letter
   */
  cleanAndFormatCoverLetter(generatedText, jobData, resumeData) {
    // Find the actual cover letter content (after the date)
    const dateRegex = /\w+\s+\d{1,2},\s+\d{4}/;
    const dateMatch = generatedText.match(dateRegex);
    
    let cleaned = generatedText;
    
    // If we find a date, start from there
    if (dateMatch) {
      const dateIndex = generatedText.indexOf(dateMatch[0]);
      cleaned = generatedText.substring(dateIndex);
    }
    
    // Clean up the text
    cleaned = cleaned
      .replace(/\n\n\n+/g, '\n\n') // Remove excessive line breaks
      .replace(/^\s+|\s+$/g, '') // Trim whitespace
      .replace(/\[Your Name\]/g, resumeData.name || '[Your Name]') // Replace placeholder
      .replace(/\[Company Name\]/g, jobData.company || '[Company Name]')
      .replace(/\[specific achievement.*?\]/g, 'delivered successful projects and exceeded performance targets') // Replace placeholder achievements
      .replace(/\[mention something specific.*?\]/g, 'your reputation for innovation and commitment to excellence')
      .replace(/\[relevant skill\/competency\]/g, 'problem-solve effectively')
      .trim();

    // Ensure proper paragraph structure
    const paragraphs = cleaned.split('\n\n');
    const formattedParagraphs = paragraphs.map(p => p.trim()).filter(p => p.length > 0);
    
    // Ensure proper closing
    let lastParagraph = formattedParagraphs[formattedParagraphs.length - 1];
    if (!lastParagraph.includes('Sincerely,') && !lastParagraph.includes('Best regards,') && !lastParagraph.includes('Thank you')) {
      formattedParagraphs.push(`Thank you for considering my application. I look forward to hearing from you soon.\n\nSincerely,\n${resumeData.name || '[Your Name]'}`);
    }
    
    // Join paragraphs with proper spacing
    cleaned = formattedParagraphs.join('\n\n');
    
    // Final cleanup - ensure no incomplete sentences or odd formatting
    cleaned = cleaned
      .replace(/\s+/g, ' ') // Remove extra spaces
      .replace(/\n\s+/g, '\n') // Remove indented lines
      .replace(/\n\n\s*\n/g, '\n\n') // Clean up paragraph breaks
      .trim();

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