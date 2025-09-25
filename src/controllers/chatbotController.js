const Resume = require('../models/Resume');
const mongoose = require('mongoose');

// Create a test user ObjectId for when auth is disabled
const TEST_USER_ID = new mongoose.Types.ObjectId("507f1f77bcf86cd799439011");

// Conversation states
const CONVERSATION_STATES = {
  WELCOME: 'welcome',
  PERSONAL_INFO: 'personal_info',
  PROFESSIONAL_SUMMARY: 'professional_summary',
  EDUCATION: 'education',
  WORK_EXPERIENCE: 'work_experience',
  SKILLS: 'skills',
  PROJECTS: 'projects',
  ADDITIONAL_INFO: 'additional_info',
  REVIEW: 'review',
  COMPLETED: 'completed'
};

// In-memory storage for conversation states (in production, use Redis or database)
const userSessions = new Map();

/**
 * Main chatbot message handler
 */
const processMessage = async (req, res) => {
  try {
    const userId = req.user?.id || TEST_USER_ID;
    const { message, sessionId } = req.body;
    
    console.log(`💬 Processing message from user ${userId}: "${message}"`);
    
    // Get or create user session
    const session = getUserSession(userId, sessionId);
    
    // Check if message is resume-related
    if (!isResumeRelated(message, session.state)) {
      return res.json({
        success: true,
        response: "I'm here to help you build your resume/CV. Let's focus on getting your professional information together! 😊",
        state: session.state,
        sessionId: session.sessionId
      });
    }
    
    // Process the message based on current state
    const response = await processStateMessage(session, message.trim());
    
    // Update session
    userSessions.set(getUserSessionKey(userId, session.sessionId), session);
    
    res.json({
      success: true,
      response: response.message,
      state: session.state,
      sessionId: session.sessionId,
      progress: response.progress,
      options: response.options || null,
      data: response.data || null
    });
    
  } catch (error) {
    console.error('❌ Error processing chatbot message:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, I encountered an error. Please try again.',
      error: error.message
    });
  }
};

/**
 * Start a new conversation
 */
const startConversation = async (req, res) => {
  try {
    const userId = req.user?.id || TEST_USER_ID;
    const sessionId = generateSessionId();
    
    const session = {
      sessionId,
      userId,
      state: CONVERSATION_STATES.WELCOME,
      data: {},
      startedAt: new Date(),
      lastActivity: new Date()
    };
    
    userSessions.set(getUserSessionKey(userId, sessionId), session);
    
    const welcomeMessage = "You dey find job you no get resume/cv, no lele nothing spoil. Career Pilot is here to help you! 🚀\n\nI go ask you some questions to build your professional resume. Ready to start?";
    
    res.json({
      success: true,
      response: welcomeMessage,
      state: session.state,
      sessionId: sessionId,
      progress: 0
    });
    
  } catch (error) {
    console.error('❌ Error starting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start conversation',
      error: error.message
    });
  }
};

/**
 * Generate resume from collected data
 */
const generateResume = async (req, res) => {
  try {
    const userId = req.user?.id || TEST_USER_ID;
    const { sessionId } = req.body;
    
    const session = userSessions.get(getUserSessionKey(userId, sessionId));
    if (!session || session.state !== CONVERSATION_STATES.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Complete the conversation first before generating resume'
      });
    }
    
    // Convert chat data to resume format
    const resumeData = convertChatDataToResume(session.data);
    
    // Save or update resume in database
    const existingResume = await Resume.findOne({ userId });
    
    let resume;
    if (existingResume) {
      resume = await Resume.findOneAndUpdate(
        { userId },
        {
          extractedData: resumeData,
          generatedFromChat: true,
          updatedAt: new Date()
        },
        { new: true }
      );
    } else {
      resume = new Resume({
        userId,
        filename: `resume_${Date.now()}.json`,
        originalname: 'Generated from Chat',
        extractedData: resumeData,
        generatedFromChat: true
      });
      await resume.save();
    }
    
    // Clean up session
    userSessions.delete(getUserSessionKey(userId, sessionId));
    
    res.json({
      success: true,
      message: 'Resume generated successfully! 🎉',
      resumeId: resume._id,
      resumeData: resumeData
    });
    
  } catch (error) {
    console.error('❌ Error generating resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate resume',
      error: error.message
    });
  }
};

/**
 * Get conversation progress
 */
const getProgress = async (req, res) => {
  try {
    const userId = req.user?.id || TEST_USER_ID;
    const { sessionId } = req.params;
    
    const session = userSessions.get(getUserSessionKey(userId, sessionId));
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    const progress = calculateProgress(session.state);
    
    res.json({
      success: true,
      state: session.state,
      progress: progress,
      data: session.data
    });
    
  } catch (error) {
    console.error('❌ Error getting progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get progress',
      error: error.message
    });
  }
};

// Helper Functions

function getUserSession(userId, sessionId) {
  const key = getUserSessionKey(userId, sessionId);
  let session = userSessions.get(key);
  
  if (!session) {
    session = {
      sessionId: sessionId || generateSessionId(),
      userId,
      state: CONVERSATION_STATES.WELCOME,
      data: {},
      startedAt: new Date(),
      lastActivity: new Date()
    };
  }
  
  session.lastActivity = new Date();
  return session;
}

function getUserSessionKey(userId, sessionId) {
  return `${userId}_${sessionId}`;
}

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function isResumeRelated(message, currentState) {
  // Always allow progression if we're in an active conversation
  if (currentState !== CONVERSATION_STATES.WELCOME) {
    return true;
  }
  
  // Check for resume-related keywords or intent
  const lowerMessage = message.toLowerCase();
  const resumeKeywords = [
    'resume', 'cv', 'job', 'work', 'career', 'yes', 'start', 'ready', 'help',
    'experience', 'education', 'skill', 'build', 'create', 'need', 'want'
  ];
  
  const offTopicKeywords = [
    'car', 'house', 'money', 'food', 'movie', 'game', 'weather', 'sports',
    'politics', 'religion', 'dating', 'relationship'
  ];
  
  // Check for off-topic first
  for (const keyword of offTopicKeywords) {
    if (lowerMessage.includes(keyword)) {
      return false;
    }
  }
  
  // Check for resume-related
  for (const keyword of resumeKeywords) {
    if (lowerMessage.includes(keyword)) {
      return true;
    }
  }
  
  // Default to allowing if not clearly off-topic
  return message.length > 2; // Assume short responses are engagement
}

async function processStateMessage(session, message) {
  switch (session.state) {
    case CONVERSATION_STATES.WELCOME:
      return handleWelcomeState(session, message);
    
    case CONVERSATION_STATES.PERSONAL_INFO:
      return handlePersonalInfoState(session, message);
    
    case CONVERSATION_STATES.PROFESSIONAL_SUMMARY:
      return handleProfessionalSummaryState(session, message);
    
    case CONVERSATION_STATES.EDUCATION:
      return handleEducationState(session, message);
    
    case CONVERSATION_STATES.WORK_EXPERIENCE:
      return handleWorkExperienceState(session, message);
    
    case CONVERSATION_STATES.SKILLS:
      return handleSkillsState(session, message);
    
    case CONVERSATION_STATES.PROJECTS:
      return handleProjectsState(session, message);
    
    case CONVERSATION_STATES.ADDITIONAL_INFO:
      return handleAdditionalInfoState(session, message);
    
    case CONVERSATION_STATES.REVIEW:
      return handleReviewState(session, message);
    
    default:
      return {
        message: "I'm not sure how to help with that. Let's start over!",
        progress: 0
      };
  }
}

function handleWelcomeState(session, message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('yes') || lowerMessage.includes('ready') || lowerMessage.includes('start')) {
    session.state = CONVERSATION_STATES.PERSONAL_INFO;
    return {
      message: "Great! Let's start with your basic information. 📝\n\nWhat's your full name?",
      progress: 10
    };
  }
  
  return {
    message: "No wahala! When you ready, just say 'yes' or 'ready' and we go start building your resume together! 😊",
    progress: 0
  };
}

function handlePersonalInfoState(session, message) {
  if (!session.data.personalInfo) {
    session.data.personalInfo = {};
  }
  
  if (!session.data.personalInfo.name) {
    session.data.personalInfo.name = message;
    return {
      message: `Nice to meet you, ${message}! 👋\n\nWhat's your email address?`,
      progress: 15
    };
  }
  
  if (!session.data.personalInfo.email) {
    if (isValidEmail(message)) {
      session.data.personalInfo.email = message;
      return {
        message: "Perfect! What's your phone number?",
        progress: 20
      };
    } else {
      return {
        message: "That doesn't look like a valid email address. Please enter a valid email (e.g., john@example.com):",
        progress: 15
      };
    }
  }
  
  if (!session.data.personalInfo.phone) {
    session.data.personalInfo.phone = message;
    return {
      message: "Great! What city/location are you based in?",
      progress: 25
    };
  }
  
  if (!session.data.personalInfo.location) {
    session.data.personalInfo.location = message;
    session.state = CONVERSATION_STATES.PROFESSIONAL_SUMMARY;
    return {
      message: `Excellent! Now let's talk about your professional background. 💼\n\nWhat's your current job title or the role you're seeking? (e.g., Software Developer, Marketing Manager, etc.)`,
      progress: 30
    };
  }
}

function handleProfessionalSummaryState(session, message) {
  if (!session.data.professionalSummary) {
    session.data.professionalSummary = {};
  }
  
  if (!session.data.professionalSummary.currentRole) {
    session.data.professionalSummary.currentRole = message;
    return {
      message: "Great choice! How many years of professional experience do you have in this field? (e.g., 2 years, 5 years, or 'Fresh graduate')",
      progress: 35
    };
  }
  
  if (!session.data.professionalSummary.experience) {
    session.data.professionalSummary.experience = message;
    session.state = CONVERSATION_STATES.EDUCATION;
    return {
      message: "Perfect! Now let's add your educational background. 🎓\n\nWhat's your highest level of education? (e.g., Bachelor's in Computer Science, HND in Marketing, SSCE, etc.)",
      progress: 40
    };
  }
}

function handleEducationState(session, message) {
  if (!session.data.education) {
    session.data.education = [];
  }
  
  if (session.data.education.length === 0) {
    session.data.education.push({
      degree: message,
      institution: '',
      year: ''
    });
    return {
      message: "Great! Which school/institution did you attend?",
      progress: 45
    };
  }
  
  const currentEducation = session.data.education[session.data.education.length - 1];
  
  if (!currentEducation.institution) {
    currentEducation.institution = message;
    return {
      message: "Nice! What year did you graduate (or expect to graduate)?",
      progress: 50
    };
  }
  
  if (!currentEducation.year) {
    currentEducation.year = message;
    session.state = CONVERSATION_STATES.WORK_EXPERIENCE;
    return {
      message: "Excellent! Now let's talk about your work experience. 💪\n\nTell me about your most recent job (or first job you want to include). What was your job title and company name? (e.g., 'Software Developer at TechCorp' or type 'No experience' if you're just starting)",
      progress: 55
    };
  }
}

function handleWorkExperienceState(session, message) {
  if (!session.data.workExperience) {
    session.data.workExperience = [];
  }
  
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('no experience') || lowerMessage.includes('fresh graduate')) {
    session.state = CONVERSATION_STATES.SKILLS;
    return {
      message: "No problem! Everyone starts somewhere. 🌟\n\nLet's focus on your skills. What are your main skills? (e.g., Microsoft Office, Communication, Python, Digital Marketing, etc.) - separate multiple skills with commas:",
      progress: 65
    };
  }
  
  if (session.data.workExperience.length === 0) {
    session.data.workExperience.push({
      position: message,
      company: '',
      duration: '',
      responsibilities: ''
    });
    return {
      message: "Good! How long did you work there? (e.g., '2020-2023', 'Jan 2022 - Present', '6 months')",
      progress: 60
    };
  }
  
  const currentJob = session.data.workExperience[session.data.workExperience.length - 1];
  
  if (!currentJob.duration) {
    currentJob.duration = message;
    return {
      message: "Great! Can you tell me 2-3 key things you did in this role? (This will help make your resume stand out)",
      progress: 62
    };
  }
  
  if (!currentJob.responsibilities) {
    currentJob.responsibilities = message;
    return {
      message: "Excellent! Do you have another job experience to add? Type 'yes' to add another job, or 'no' to continue:",
      progress: 64,
      options: ['yes', 'no']
    };
  }
  
  // Handle adding more jobs
  if (lowerMessage.includes('yes')) {
    return {
      message: "Great! Tell me about your next job - what was your job title and company name?",
      progress: 64
    };
  } else {
    session.state = CONVERSATION_STATES.SKILLS;
    return {
      message: "Perfect! Now let's add your skills. 🛠️\n\nWhat are your main skills? (e.g., Microsoft Office, Communication, Python, Digital Marketing, etc.) - separate multiple skills with commas:",
      progress: 65
    };
  }
}

function handleSkillsState(session, message) {
  if (!session.data.skills) {
    session.data.skills = [];
  }
  
  // Parse skills from comma-separated list
  const skills = message.split(',').map(skill => skill.trim()).filter(skill => skill.length > 0);
  session.data.skills = [...session.data.skills, ...skills];
  
  session.state = CONVERSATION_STATES.PROJECTS;
  return {
    message: "Awesome skills! 🔥\n\nDo you have any projects, portfolios, or achievements you'd like to showcase? (e.g., websites you built, campaigns you managed, awards, etc.) Type your projects or 'none' if you don't have any:",
    progress: 75
  };
}

function handleProjectsState(session, message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('none') || lowerMessage.includes('no projects')) {
    session.data.projects = [];
  } else {
    session.data.projects = [message];
  }
  
  session.state = CONVERSATION_STATES.ADDITIONAL_INFO;
  return {
    message: "Almost done! 🎯\n\nDo you have any professional links you'd like to include? (e.g., LinkedIn profile, GitHub, portfolio website, etc.) Type them or 'none':",
    progress: 85
  };
}

function handleAdditionalInfoState(session, message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('none')) {
    session.data.additionalInfo = {};
  } else {
    session.data.additionalInfo = {
      links: message
    };
  }
  
  session.state = CONVERSATION_STATES.REVIEW;
  return {
    message: generateReviewMessage(session.data),
    progress: 95,
    data: session.data
  };
}

function handleReviewState(session, message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('yes') || lowerMessage.includes('looks good') || lowerMessage.includes('correct')) {
    session.state = CONVERSATION_STATES.COMPLETED;
    return {
      message: "Perfect! Your resume data is ready! 🎉\n\nClick the 'Generate Resume' button to create your professional resume. You'll be able to download it and use it for job applications!",
      progress: 100
    };
  } else if (lowerMessage.includes('edit') || lowerMessage.includes('change') || lowerMessage.includes('modify')) {
    return {
      message: "No problem! What would you like to change? You can say things like:\n- 'Change my name'\n- 'Add more skills'\n- 'Edit work experience'\n- 'Update education'",
      progress: 95
    };
  } else {
    return {
      message: "Please review the information above. Type 'yes' if everything looks correct, or 'edit' if you want to make changes:",
      progress: 95,
      options: ['yes', 'edit']
    };
  }
}

function generateReviewMessage(data) {
  let review = "Perfect! Here's a summary of your information: 📋\n\n";
  
  // Personal Info
  if (data.personalInfo) {
    review += `👤 **Personal Information:**\n`;
    review += `Name: ${data.personalInfo.name}\n`;
    review += `Email: ${data.personalInfo.email}\n`;
    review += `Phone: ${data.personalInfo.phone}\n`;
    review += `Location: ${data.personalInfo.location}\n\n`;
  }
  
  // Professional Summary
  if (data.professionalSummary) {
    review += `💼 **Professional Summary:**\n`;
    review += `Role: ${data.professionalSummary.currentRole}\n`;
    review += `Experience: ${data.professionalSummary.experience}\n\n`;
  }
  
  // Education
  if (data.education && data.education.length > 0) {
    review += `🎓 **Education:**\n`;
    data.education.forEach(edu => {
      review += `${edu.degree} - ${edu.institution} (${edu.year})\n`;
    });
    review += `\n`;
  }
  
  // Work Experience
  if (data.workExperience && data.workExperience.length > 0) {
    review += `💪 **Work Experience:**\n`;
    data.workExperience.forEach(job => {
      review += `${job.position} (${job.duration})\n`;
      if (job.responsibilities) {
        review += `${job.responsibilities}\n`;
      }
    });
    review += `\n`;
  }
  
  // Skills
  if (data.skills && data.skills.length > 0) {
    review += `🛠️ **Skills:**\n${data.skills.join(', ')}\n\n`;
  }
  
  // Projects
  if (data.projects && data.projects.length > 0) {
    review += `🎯 **Projects:**\n${data.projects.join('\n')}\n\n`;
  }
  
  // Additional Info
  if (data.additionalInfo && data.additionalInfo.links) {
    review += `🔗 **Professional Links:**\n${data.additionalInfo.links}\n\n`;
  }
  
  review += `Does this look correct? Type 'yes' to generate your resume or 'edit' to make changes:`;
  
  return review;
}

function calculateProgress(state) {
  const stateProgress = {
    [CONVERSATION_STATES.WELCOME]: 0,
    [CONVERSATION_STATES.PERSONAL_INFO]: 20,
    [CONVERSATION_STATES.PROFESSIONAL_SUMMARY]: 35,
    [CONVERSATION_STATES.EDUCATION]: 50,
    [CONVERSATION_STATES.WORK_EXPERIENCE]: 65,
    [CONVERSATION_STATES.SKILLS]: 75,
    [CONVERSATION_STATES.PROJECTS]: 85,
    [CONVERSATION_STATES.ADDITIONAL_INFO]: 90,
    [CONVERSATION_STATES.REVIEW]: 95,
    [CONVERSATION_STATES.COMPLETED]: 100
  };
  
  return stateProgress[state] || 0;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function convertChatDataToResume(chatData) {
  return {
    name: chatData.personalInfo?.name || '',
    email: chatData.personalInfo?.email || '',
    phone: chatData.personalInfo?.phone || '',
    location: chatData.personalInfo?.location || '',
    currentJobTitle: chatData.professionalSummary?.currentRole || '',
    yearsOfExperience: chatData.professionalSummary?.experience || '',
    education: chatData.education || [],
    workExperience: chatData.workExperience || [],
    skills: chatData.skills || [],
    projects: chatData.projects || [],
    professionalLinks: chatData.additionalInfo?.links || '',
    generatedFromChat: true,
    generatedAt: new Date().toISOString()
  };
}

module.exports = {
  processMessage,
  startConversation,
  generateResume,
  getProgress
};