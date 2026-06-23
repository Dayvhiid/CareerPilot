const Resume = require('../models/Resume');
const mongoose = require('mongoose');
const puppeteer = require('puppeteer');
const path = require('path');
const ejs = require('ejs');
const fs = require('fs-extra');

// Database cleanup removed to avoid startup issues



// Conversation states
const CONVERSATION_STATES = {
  WELCOME: 'welcome',
  PERSONAL_INFO: 'personal_info',
  PROFESSIONAL_SUMMARY: 'professional_summary',
  PROFESSIONAL_LINKS: 'professional_links',
  EDUCATION: 'education',
  WORK_EXPERIENCE: 'work_experience',
  SKILLS: 'skills',
  PROJECTS: 'projects',
  CERTIFICATES: 'certificates',
  ACHIEVEMENTS: 'achievements',
  REVIEW: 'review',
  COMPLETED: 'completed'
};

// In-memory storage for conversation states (in production, use Redis or database)
const userSessions = new Map();

const MAX_SESSION_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const MAX_SESSIONS_PER_USER = 10;

// Periodic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  let removed = 0;
  for (const [key, session] of userSessions) {
    if (now - session.lastActivity > MAX_SESSION_AGE_MS) {
      userSessions.delete(key);
      removed++;
    }
  }
  if (removed > 0) {
    console.log(`🧹 Cleaned up ${removed} expired chatbot sessions`);
  }
}, CLEANUP_INTERVAL_MS).unref();

/**
 * Main chatbot message handler
 */
const processMessage = async (req, res) => {
  try {
    const userId = req.user.id;
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
    const userId = req.user.id;
    const sessionId = generateSessionId();

    evictOldestSessionIfNeeded(userId, '');

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
    const userId = req.user.id;
    const { sessionId } = req.body;
    
    const session = userSessions.get(getUserSessionKey(userId, sessionId));
    if (!session || session.state !== CONVERSATION_STATES.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Complete the conversation first before generating resume'
      });
    }
    
    // Debug: Log the raw session data
    console.log('🔍 Raw session data:', JSON.stringify(session.data, null, 2));
    
    // Convert chat data to resume format
    const resumeData = convertChatDataToResume(session.data);
    
    // Debug: Log the converted resume data
    console.log('🔍 Converted resume data:', JSON.stringify(resumeData, null, 2));
    
    // Save or update resume in database
    const existingResume = await Resume.findOne({ userId });
    
    let resume;
    if (existingResume) {
      resume = await Resume.findOneAndUpdate(
        { userId },
        {
          extractedData: resumeData,
          isProcessed: true,
          updatedAt: new Date()
        },
        { new: true }
      );
    } else {
      resume = new Resume({
        userId,
        filename: `chat_resume_${Date.now()}.json`,
        originalName: 'Generated from AI Chat',
        fileSize: 0,
        fileType: 'application/json',
        filePath: `/generated/chat_resume_${Date.now()}.json`,
        extractedData: resumeData,
        isProcessed: true
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
    const userId = req.user.id;
    const { sessionId } = req.query;
    
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

  if (session) {
    if (Date.now() - session.lastActivity > MAX_SESSION_AGE_MS) {
      userSessions.delete(key);
      session = null;
    }
  }

  if (!session) {
    evictOldestSessionIfNeeded(userId, key);
    session = {
      sessionId: sessionId || generateSessionId(),
      userId,
      state: CONVERSATION_STATES.WELCOME,
      data: {},
      startedAt: new Date(),
      lastActivity: new Date()
    };
    userSessions.set(getUserSessionKey(userId, session.sessionId), session);
  }

  session.lastActivity = new Date();
  return session;
}

function evictOldestSessionIfNeeded(userId, currentKey) {
  const userSessionKeys = [];
  for (const [key, session] of userSessions) {
    if (session.userId === userId && key !== currentKey) {
      userSessionKeys.push({ key, lastActivity: session.lastActivity });
    }
  }

  if (userSessionKeys.length >= MAX_SESSIONS_PER_USER) {
    userSessionKeys.sort((a, b) => a.lastActivity - b.lastActivity);
    userSessions.delete(userSessionKeys[0].key);
  }
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
    
    case CONVERSATION_STATES.PROFESSIONAL_LINKS:
      return handleProfessionalLinksState(session, message);
    
    case CONVERSATION_STATES.EDUCATION:
      return handleEducationState(session, message);
    
    case CONVERSATION_STATES.WORK_EXPERIENCE:
      return handleWorkExperienceState(session, message);
    
    case CONVERSATION_STATES.SKILLS:
      return handleSkillsState(session, message);
    
    case CONVERSATION_STATES.PROJECTS:
      return handleProjectsState(session, message);
    
    case CONVERSATION_STATES.CERTIFICATES:
      return handleCertificatesState(session, message);
    
    case CONVERSATION_STATES.ACHIEVEMENTS:
      return handleAchievementsState(session, message);
    
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
    return {
      message: "Excellent! Now let's create a professional summary. Tell me about yourself professionally - what makes you stand out? (This will be the summary at the top of your resume)",
      progress: 35
    };
  }
  
  if (!session.data.professionalSummary.summary) {
    session.data.professionalSummary.summary = message;
    session.state = CONVERSATION_STATES.PROFESSIONAL_LINKS;
    return {
      message: "Great summary! 💼 Now let's add your professional links.\n\nWhat's your LinkedIn URL? (e.g., linkedin.com/in/your-name)",
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
      year: '',
      location: ''
    });
    return {
      message: "Great! Which school/institution are you attending?",
      progress: 50
    };
  }
  
  const currentEducation = session.data.education[session.data.education.length - 1];
  
  if (!currentEducation.institution) {
    currentEducation.institution = message;
    return {
      message: "Nice! What years are you studying there? (e.g., '01/2022 - Present', '2020-2024')",
      progress: 52
    };
  }
  
  if (!currentEducation.year) {
    currentEducation.year = message;
    return {
      message: "Perfect! What's the location? (e.g., 'Nigeria, Ogun State, Ilishan-remo')",
      progress: 54
    };
  }
  
  if (!currentEducation.location) {
    currentEducation.location = message;
    session.state = CONVERSATION_STATES.WORK_EXPERIENCE;
    return {
      message: "Excellent! Now let's talk about your work experience. 💪\n\nTell me about your most recent job. What was your job title? (or type 'No experience' if you're just starting)",
      progress: 56
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
      message: "No problem! Everyone starts somewhere. 🌟\n\nLet's focus on your skills. What are your main technical skills? (e.g., HTML, CSS, PHP, Laravel, JavaScript, etc.) - separate multiple skills with commas:",
      progress: 70
    };
  }
  
  if (session.data.workExperience.length === 0 || !session.data.workExperience[session.data.workExperience.length - 1].position) {
    // Check if this is a combined "position at company" format
    if (message.toLowerCase().includes(' at ')) {
      const parts = message.split(' at ');
      session.data.workExperience.push({
        position: parts[0].trim(),
        company: parts[1].trim(),
        duration: '',
        location: '',
        responsibilities: '',
        contact: ''
      });
      return {
        message: "Perfect! What was the duration? (e.g., '01/2024 - 06/2024', 'Jan 2022 - Present')",
        progress: 60
      };
    } else {
      session.data.workExperience.push({
        position: message,
        company: '',
        duration: '',
        location: '',
        responsibilities: '',
        contact: ''
      });
      return {
        message: "Great! What company did you work for?",
        progress: 58
      };
    }
  }
  
  const currentJob = session.data.workExperience[session.data.workExperience.length - 1];
  
  if (!currentJob.company) {
    currentJob.company = message;
    return {
      message: "Perfect! What was the duration? (e.g., '01/2024 - 06/2024', 'Jan 2022 - Present')",
      progress: 60
    };
  }
  
  if (!currentJob.duration) {
    currentJob.duration = message;
    return {
      message: "Great! What was the location? (e.g., 'Ogun, Nigeria', 'Lagos')",
      progress: 62
    };
  }
  
  if (!currentJob.location) {
    currentJob.location = message;
    return {
      message: "Excellent! Can you describe what you did in this role? (Key responsibilities and achievements)",
      progress: 64
    };
  }
  
  if (!currentJob.responsibilities) {
    currentJob.responsibilities = message;
    return {
      message: "Perfect! Do you have a contact reference for this role? (e.g., 'Mr John Doe - +234xxxxxxxxx') or type 'none':",
      progress: 66
    };
  }
  
  if (!currentJob.contact) {
    if (!lowerMessage.includes('none')) {
      currentJob.contact = message;
    }
    return {
      message: "Excellent! Do you have another job experience to add? Type 'yes' to add another job, or 'no' to continue:",
      progress: 68,
      options: ['yes', 'no']
    };
  }
  
  // Handle adding more jobs
  if (lowerMessage.includes('yes')) {
    // Reset for new job entry
    session.data.workExperience.push({
      position: '',
      company: '',
      duration: '',
      location: '',
      responsibilities: '',
      contact: ''
    });
    return {
      message: "Great! What was your job title for the next position?",
      progress: 68
    };
  } else if (lowerMessage.includes('no') || lowerMessage.includes('none')) {
    session.state = CONVERSATION_STATES.SKILLS;
    return {
      message: "Perfect! Now let's add your skills. 🛠️\n\nWhat are your main technical skills? (e.g., HTML, CSS, PHP, Laravel, JavaScript, etc.) - separate multiple skills with commas:",
      progress: 70
    };
  } else {
    return {
      message: "Please type 'yes' to add another job experience, or 'no' to continue to skills:",
      progress: 68,
      options: ['yes', 'no']
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

function handleProfessionalLinksState(session, message) {
  if (!session.data.links) {
    session.data.links = [];
  }
  
  if (!session.data.linkStep) {
    session.data.linkStep = 'linkedin';
  }
  
  const lowerMessage = message.toLowerCase();
  
  if (session.data.linkStep === 'linkedin') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'linkedin', url: message });
    }
    session.data.linkStep = 'github';
    return {
      message: "Great! What's your GitHub profile URL? (or type 'none' if you don't have one)",
      progress: 42
    };
  }
  
  if (session.data.linkStep === 'github') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'github', url: message });
    }
    session.data.linkStep = 'stackoverflow';
    return {
      message: "Awesome! Do you have a StackOverflow profile? (or type 'none')",
      progress: 44
    };
  }
  
  if (session.data.linkStep === 'stackoverflow') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'stackoverflow', url: message });
    }
    session.data.linkStep = 'medium';
    return {
      message: "Excellent! Any Medium/blog profile? (or type 'none')",
      progress: 46
    };
  }
  
  if (session.data.linkStep === 'medium') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'medium', url: message });
    }
    delete session.data.linkStep;
    session.state = CONVERSATION_STATES.EDUCATION;
    return {
      message: "Perfect! Now let's add your educational background. 🎓\n\nWhat degree are you pursuing/have completed? (e.g., Software Engineering, Computer Science, etc.)",
      progress: 48
    };
  }
}

function handleProjectsState(session, message) {
  if (!session.data.projects) {
    session.data.projects = [];
  }
  
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('none') || lowerMessage.includes('no projects')) {
    session.data.projects = [];
    session.state = CONVERSATION_STATES.CERTIFICATES;
    return {
      message: "No problem! Now let's add any certificates you have. �\n\nDo you have any professional certificates? (e.g., 'Critical Infrastructure Protection (OPSWAT) - May 2024') or type 'none':",
      progress: 85
    };
  }
  
  // Handle multiple projects
  if (session.data.projects.length === 0) {
    const projectInfo = message.split(' - ');
    session.data.projects.push({
      name: projectInfo[0] || message,
      description: projectInfo[1] || '',
      dates: projectInfo[2] || ''
    });
    return {
      message: "Great project! Can you tell me more about it? (What did you build/achieve?)",
      progress: 80
    };
  }
  
  const currentProject = session.data.projects[session.data.projects.length - 1];
  if (!currentProject.description) {
    currentProject.description = message;
    return {
      message: "Excellent! When did you work on this project? (e.g., '10/2024 - Present', 'September 2024')",
      progress: 82
    };
  }
  
  if (!currentProject.dates) {
    currentProject.dates = message;
    return {
      message: "Perfect! Do you have another project to add? Type 'yes' to add another, or 'no' to continue:",
      progress: 84,
      options: ['yes', 'no']
    };
  }
  
  if (lowerMessage.includes('yes')) {
    // Reset for new project
    session.data.projects.push({
      name: '',
      description: '',
      dates: ''
    });
    return {
      message: "Great! What's your next project? (Project name - brief description)",
      progress: 84
    };
  } else if (lowerMessage.includes('no')) {
    session.state = CONVERSATION_STATES.CERTIFICATES;
    return {
      message: "Excellent projects! Now let's add any certificates you have. 🏆\n\nDo you have any professional certificates? (e.g., 'Critical Infrastructure Protection (OPSWAT) - May 2024') or type 'none':",
      progress: 85
    };
  } else {
    return {
      message: "Please type 'yes' to add another project, or 'no' to continue:",
      progress: 84,
      options: ['yes', 'no']
    };
  }
}

function handleCertificatesState(session, message) {
  if (!session.data.certificates) {
    session.data.certificates = [];
  }
  
  const lowerMessage = message.toLowerCase();
  
  // First time asking about certificates
  if (!session.data.certificateStep) {
    if (lowerMessage.includes('none') || lowerMessage.includes('no certificates')) {
      session.data.certificates = [];
      session.state = CONVERSATION_STATES.ACHIEVEMENTS;
      return {
        message: "No problem! Finally, do you have any key achievements or accomplishments you'd like to highlight? 🌟\n\n(e.g., awards, recognition, special tasks completed, etc.) or type 'none':",
        progress: 90
      };
    }
    
    // Parse certificate info (Name (Issuer) - Date format)
    const certParts = message.split(' - ');
    const nameAndIssuer = certParts[0];
    const date = certParts[1] || '';
    
    // Extract issuer from parentheses
    const issuerMatch = nameAndIssuer.match(/\(([^)]+)\)/);
    const certName = nameAndIssuer.replace(/\s*\([^)]+\)\s*/, '').trim();
    const issuer = issuerMatch ? issuerMatch[1] : '';
    
    session.data.certificates.push({
      name: certName,
      issuer: issuer,
      date: date
    });
    
    session.data.certificateStep = 'asking_more';
    return {
      message: "Great certificate! Do you have another certificate to add? Type 'yes' to add another, or 'no' to continue:",
      progress: 87,
      options: ['yes', 'no']
    };
  }
  
  // Asking if they want to add more certificates
  if (session.data.certificateStep === 'asking_more') {
    if (lowerMessage.includes('yes')) {
      session.data.certificateStep = 'adding_more';
      return {
        message: "Great! What's your next certificate? (e.g., 'Certificate Name (Issuer) - Date')",
        progress: 87
      };
    } else if (lowerMessage.includes('no') || lowerMessage.includes('none')) {
      delete session.data.certificateStep;
      session.state = CONVERSATION_STATES.ACHIEVEMENTS;
      return {
        message: "Perfect! Finally, do you have any key achievements or accomplishments you'd like to highlight? 🌟\n\n(e.g., awards, recognition, special tasks completed, etc.) or type 'none':",
        progress: 90
      };
    } else {
      return {
        message: "Please type 'yes' to add another certificate, or 'no' to continue:",
        progress: 87,
        options: ['yes', 'no']
      };
    }
  }
  
  // Adding another certificate
  if (session.data.certificateStep === 'adding_more') {
    const certParts = message.split(' - ');
    const nameAndIssuer = certParts[0];
    const date = certParts[1] || '';
    
    const issuerMatch = nameAndIssuer.match(/\(([^)]+)\)/);
    const certName = nameAndIssuer.replace(/\s*\([^)]+\)\s*/, '').trim();
    const issuer = issuerMatch ? issuerMatch[1] : '';
    
    session.data.certificates.push({
      name: certName,
      issuer: issuer,
      date: date
    });
    
    session.data.certificateStep = 'asking_more';
    return {
      message: "Excellent! Do you have another certificate to add? Type 'yes' for more, or 'no' to continue:",
      progress: 88,
      options: ['yes', 'no']
    };
  }
}

function handleAchievementsState(session, message) {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes('none') || lowerMessage.includes('no achievements')) {
    session.data.achievements = [];
  } else {
    // Parse multiple achievements separated by newlines or bullet points
    const achievements = message.split(/[•\n]/).map(item => item.trim()).filter(item => item.length > 0);
    session.data.achievements = achievements;
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
      message: "Perfect! Your resume data is ready! 🎉\n\nClick the 'Generate Resume' button below to create your professional resume. You'll be able to download it and use it for job applications!",
      progress: 100,
      state: 'completed'
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
  let review = "Perfect! Here's a comprehensive summary of your information: 📋\n\n";
  
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
    review += `Experience: ${data.professionalSummary.experience}\n`;
    if (data.professionalSummary.summary) {
      review += `Summary: ${data.professionalSummary.summary}\n`;
    }
    review += `\n`;
  }
  
  // Professional Links
  if (data.links && data.links.length > 0) {
    review += `🔗 **Professional Links:**\n`;
    data.links.forEach(link => {
      review += `${link.type}: ${link.url}\n`;
    });
    review += `\n`;
  }
  
  // Education
  if (data.education && data.education.length > 0) {
    review += `🎓 **Education:**\n`;
    data.education.forEach(edu => {
      review += `${edu.degree} - ${edu.institution}\n`;
      review += `${edu.year}, ${edu.location}\n`;
    });
    review += `\n`;
  }
  
  // Work Experience
  if (data.workExperience && data.workExperience.length > 0) {
    review += `💪 **Work Experience:**\n`;
    data.workExperience.forEach(job => {
      review += `${job.position} - ${job.company}\n`;
      review += `${job.duration}, ${job.location}\n`;
      if (job.responsibilities) {
        review += `${job.responsibilities}\n`;
      }
      if (job.contact) {
        review += `Contact: ${job.contact}\n`;
      }
      review += `\n`;
    });
  }
  
  // Skills
  if (data.skills && data.skills.length > 0) {
    review += `🛠️ **Skills:**\n${data.skills.join(', ')}\n\n`;
  }
  
  // Projects
  if (data.projects && data.projects.length > 0) {
    review += `🎯 **Projects:**\n`;
    data.projects.forEach(project => {
      if (typeof project === 'object') {
        review += `${project.name} (${project.dates})\n`;
        review += `${project.description}\n\n`;
      } else {
        review += `${project}\n`;
      }
    });
  }
  
  // Certificates
  if (data.certificates && data.certificates.length > 0) {
    review += `🏆 **Certificates:**\n`;
    data.certificates.forEach(cert => {
      review += `${cert.name} (${cert.issuer}) - ${cert.date}\n`;
    });
    review += `\n`;
  }
  
  // Achievements
  if (data.achievements && data.achievements.length > 0) {
    review += `🌟 **Achievements:**\n`;
    data.achievements.forEach(achievement => {
      review += `• ${achievement}\n`;
    });
    review += `\n`;
  }
  
  review += `Does this look correct? Type 'yes' to confirm and I'll show you the generate button, or type 'edit' to make changes:`;
  
  return review;
}

function calculateProgress(state) {
  const stateProgress = {
    [CONVERSATION_STATES.WELCOME]: 0,
    [CONVERSATION_STATES.PERSONAL_INFO]: 15,
    [CONVERSATION_STATES.PROFESSIONAL_SUMMARY]: 25,
    [CONVERSATION_STATES.PROFESSIONAL_LINKS]: 35,
    [CONVERSATION_STATES.EDUCATION]: 50,
    [CONVERSATION_STATES.WORK_EXPERIENCE]: 65,
    [CONVERSATION_STATES.SKILLS]: 75,
    [CONVERSATION_STATES.PROJECTS]: 80,
    [CONVERSATION_STATES.CERTIFICATES]: 85,
    [CONVERSATION_STATES.ACHIEVEMENTS]: 90,
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
  // Helper function to safely convert years of experience to number
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
      .map(entry => normalizeEmbeddedEntry(entry, (value, item) => {
        const degree = String(item.degree || item.title || item.name || value).trim();
        const institution = String(item.institution || item.school || item.university || '').trim();
        const year = String(item.year || item.date || '').trim();
        const location = String(item.location || '').trim();

        if (!degree && !institution && !year && !location) {
          return null;
        }

        return { degree, institution, year, location };
      }))
      .filter(Boolean);
  };

  const normalizeProjects = (projects) => {
    if (!Array.isArray(projects)) return [];

    return projects
      .map(entry => normalizeEmbeddedEntry(entry, (value, item) => ({
        name: String(item.name || item.title || value).trim(),
        description: String(item.description || '').trim(),
        dates: String(item.dates || item.date || '').trim(),
      })))
      .filter(project => project && (project.name || project.description || project.dates));
  };

  const normalizeCertificates = (certificates) => {
    if (!Array.isArray(certificates)) return [];

    return certificates
      .map(entry => normalizeEmbeddedEntry(entry, (value, item) => ({
        name: String(item.name || item.title || value).trim(),
        issuer: String(item.issuer || item.organization || '').trim(),
        date: String(item.date || item.year || '').trim(),
      })))
      .filter(cert => cert && (cert.name || cert.issuer || cert.date));
  };

  // Helper function to validate and clean links
  const cleanLinks = (links) => {
    if (!Array.isArray(links)) return [];
    return links.map(link => {
      if (typeof link === 'string') {
        return { type: 'other', url: link };
      }
      return {
        type: link.type || 'other',
        url: link.url || ''
      };
    }).filter(link => link.url.trim().length > 0);
  };

  // Helper function to clean work experience
  const cleanWorkExperience = (workExp) => {
    if (!Array.isArray(workExp)) return [];
    return workExp.filter(job => job.position && job.position.trim().length > 0);
  };

  return {
    name: chatData.personalInfo?.name || '',
    email: chatData.personalInfo?.email || '',
    phone: chatData.personalInfo?.phone || '',
    location: chatData.personalInfo?.location || '',
    currentJobTitle: chatData.professionalSummary?.currentRole || '',
    summary: chatData.professionalSummary?.summary || '',
    yearsOfExperience: parseYearsOfExperience(chatData.professionalSummary?.experience),
    
    // Education with detailed info
    education: normalizeEducation(chatData.education),
    
    // Work Experience with detailed info - cleaned
    workExperience: cleanWorkExperience(chatData.workExperience),
    
    // Skills
    skills: Array.isArray(chatData.skills) ? chatData.skills : [],
    
    // Projects with detailed info
    projects: normalizeProjects(chatData.projects),
    
    // Certificates with detailed info
    certificates: normalizeCertificates(chatData.certificates),
    
    // Achievements
    achievements: Array.isArray(chatData.achievements) ? chatData.achievements : [],
    
    // Extract specific link types for backward compatibility (simplified to avoid schema conflicts)
    linkedinUrl: chatData.links?.find(link => link.type === 'linkedin')?.url || '',
    githubUrl: chatData.links?.find(link => link.type === 'github')?.url || '',
    portfolioUrl: chatData.links?.find(link => link.type === 'medium')?.url || '',
    
    languages: [],
    summary: chatData.professionalSummary?.summary || ''
  };
}

/**
 * Download generated resume as professional PDF
 */
const downloadResume = async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Find the user's resume
    const resume = await Resume.findOne({ userId }).sort({ createdAt: -1 });
    if (!resume || !resume.extractedData) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please generate a resume first.'
      });
    }
    
    // Generate professional PDF
    console.log('🔄 Generating PDF for user:', userId);
    const pdfBuffer = await generateProfessionalPDF(resume.extractedData);
    console.log('✅ PDF generated, size:', pdfBuffer.length, 'bytes');
    
    // Set headers for PDF download
    const fileName = `${resume.extractedData.name?.replace(/\s+/g, '_') || 'Professional'}_Resume.pdf`;
    console.log('📁 Sending PDF file:', fileName);
    
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Send the PDF
    res.send(pdfBuffer);
    
  } catch (error) {
    console.error('❌ Error downloading resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download resume',
      error: error.message
    });
  }
};

/**
 * Generate ABSOLUTELY STUNNING PDF resume using Puppeteer 🔥💎✨
 */
async function generateProfessionalPDF(data) {
  try {
    console.log('🚀 Launching Puppeteer for STUNNING PDF generation...');
    
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    
    // Generate the stunning HTML template
    const htmlContent = await generateStunningHTML(data);
    
    await page.setContent(htmlContent);
    
    // Generate PDF with high quality settings
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0mm',
        right: '0mm',
        bottom: '0mm',
        left: '0mm'
      },
      displayHeaderFooter: false
    });
    
    await browser.close();
    
    console.log('✅ STUNNING PDF generated successfully!');
    return pdfBuffer;
    
  } catch (error) {
    console.error('❌ Error generating PDF:', error);
    throw error;
  }
}

/**
 * Generate HTML template using EJS
 */
async function generateStunningHTML(data) {
  return ejs.renderFile(
    path.join(__dirname, '../templates/resume-template.ejs'),
    { data }
  );
}

/**
 * Handle speech-to-text (audio to text transcription)
 */
const transcribeAudio = async (req, res) => {
  try {
    const huggingFaceService = require('../services/huggingFaceService');
    
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided'
      });
    }

    console.log('🎙️ Received audio for transcription:', req.file.originalname, 'Size:', req.file.size);

    const result = await huggingFaceService.transcribeAudio(req.file.buffer);
    
    if (result.success) {
      return res.json({
        success: true,
        text: result.text,
        model: result.model
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('❌ Transcription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transcribe audio',
      error: error.message
    });
  }
};

/**
 * Handle text-to-speech (text to audio synthesis)
 */
const synthesizeSpeech = async (req, res) => {
  try {
    const huggingFaceService = require('../services/huggingFaceService');
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'No text provided or invalid text'
      });
    }

    console.log('🔊 Synthesizing speech for text:', text.substring(0, 50) + '...');

    const result = await huggingFaceService.synthesizeSpeech(text);

    if (result.success) {
      return res.json({
        success: true,
        audio: result.audio,
        mimeType: result.mimeType,
        model: result.model
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error
      });
    }
  } catch (error) {
    console.error('❌ TTS synthesis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to synthesize speech',
      error: error.message
    });
  }
};

module.exports = {
  processMessage,
  startConversation,
  generateResume,
  getProgress,
  downloadResume,
  transcribeAudio,
  synthesizeSpeech
};