const { logger } = require('../config/logger');
const Resume = require('../models/Resume');
const Conversation = require('../models/Conversation');
const {
  CONVERSATION_STATES,
  STATE_PROGRESS,
  generateSessionId,
  isResumeRelated,
  isValidEmail,
} = require('../services/chatbot/stateMachine');
const { generateProfessionalPDF } = require('../services/chatbot/pdfGenerator');
const { convertChatDataToResume } = require('../services/chatbot/resumeConverter');
const { transcribeAudio, synthesizeSpeech } = require('../services/chatbot/audioService');

const startConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const sessionId = generateSessionId();

    const conversation = new Conversation({
      userId,
      sessionId,
      state: CONVERSATION_STATES.WELCOME,
      status: 'active',
      data: {},
      messages: [],
      startedAt: new Date(),
      lastActivity: new Date(),
    });

    await conversation.save();

    const welcomeMessage =
      'You dey find job you no get resume/cv, no lele nothing spoil. Career Pilot is here to help you! 🚀\n\nI go ask you some questions to build your professional resume. Ready to start?';

    res.json({
      success: true,
      response: welcomeMessage,
      state: conversation.state,
      sessionId: sessionId,
      progress: 0,
    });
  } catch (error) {
    logger.error('Error starting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to start conversation',
      error: error.message,
    });
  }
};

const processMessage = async (req, res) => {
  try {
    const userId = req.user.id;
    const { message, sessionId } = req.body;

    logger.info(`Processing message from user ${userId}: "${message}"`);

    const conversation = await Conversation.findOne({ userId, sessionId });
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Session not found. Please start a new conversation.',
      });
    }

    if (conversation.status !== 'active') {
      return res.status(400).json({
        success: false,
        message: 'This conversation has ended. Please start a new one.',
      });
    }

    if (conversation.messages.length >= 500) {
      conversation.status = 'ended';
      conversation.lastActivity = new Date();
      await conversation.save();
      return res.status(400).json({
        success: false,
        message:
          'This conversation has reached the maximum message limit. Please start a new conversation to continue building your resume.',
      });
    }

    conversation.messages.push({ role: 'user', content: message.trim(), timestamp: new Date() });

    if (!isResumeRelated(message, conversation.state)) {
      const botResponse =
        "I'm here to help you build your resume/CV. Let's focus on getting your professional information together! 😊";
      conversation.messages.push({ role: 'bot', content: botResponse, timestamp: new Date() });
      conversation.lastActivity = new Date();
      await conversation.save();

      return res.json({
        success: true,
        response: botResponse,
        state: conversation.state,
        sessionId: conversation.sessionId,
      });
    }

    const response = await processStateMessage(conversation, message.trim());

    conversation.messages.push({ role: 'bot', content: response.message, timestamp: new Date() });
    conversation.lastActivity = new Date();
    conversation.markModified('data');
    await conversation.save();

    res.json({
      success: true,
      response: response.message,
      state: conversation.state,
      sessionId: conversation.sessionId,
      progress: response.progress,
      options: response.options || null,
      data: response.data || null,
    });
  } catch (error) {
    logger.error('Error processing chatbot message:', error);
    res.status(500).json({
      success: false,
      message: 'Sorry, I encountered an error. Please try again.',
      error: error.message,
    });
  }
};

const generateResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.body;

    const conversation = await Conversation.findOne({ userId, sessionId });
    if (!conversation || conversation.state !== CONVERSATION_STATES.COMPLETED) {
      return res.status(400).json({
        success: false,
        message: 'Complete the conversation first before generating resume',
      });
    }

    logger.debug('Raw session data:', JSON.stringify(conversation.data, null, 2));

    const resumeData = convertChatDataToResume(conversation.data);

    logger.debug('Converted resume data:', JSON.stringify(resumeData, null, 2));

    const existingResume = await Resume.findOne({ userId }).lean();

    let resume;
    if (existingResume) {
      resume = await Resume.findOneAndUpdate(
        { userId },
        {
          extractedData: resumeData,
          isProcessed: true,
          updatedAt: new Date(),
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
        isProcessed: true,
      });
      await resume.save();
    }

    conversation.status = 'completed';
    conversation.lastActivity = new Date();
    await conversation.save();

    res.json({
      success: true,
      message: 'Resume generated successfully! 🎉',
      resumeId: resume._id,
      resumeData: resumeData,
    });
  } catch (error) {
    logger.error('Error generating resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate resume',
      error: error.message,
    });
  }
};

const getProgress = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.query;

    const conversation = await Conversation.findOne({ userId, sessionId }).lean();
    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Session not found',
      });
    }

    const progress = STATE_PROGRESS[conversation.state] || 0;

    res.json({
      success: true,
      state: conversation.state,
      progress: progress,
      data: conversation.data,
    });
  } catch (error) {
    logger.error('Error getting progress:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get progress',
      error: error.message,
    });
  }
};

const listConversations = async (req, res) => {
  try {
    const userId = req.user.id;

    const conversations = await Conversation.find(
      { userId },
      {
        sessionId: 1,
        state: 1,
        status: 1,
        startedAt: 1,
        lastActivity: 1,
        messages: { $slice: -1 },
      }
    )
      .lean()
      .sort({ lastActivity: -1 })
      .lean();

    const result = conversations.map((c) => {
      const lastMsg = c.messages && c.messages.length > 0 ? c.messages[0].content : null;
      const preview = lastMsg ? lastMsg.substring(0, 80) : null;
      return {
        sessionId: c.sessionId,
        state: c.state,
        status: c.status,
        progress: STATE_PROGRESS[c.state] || 0,
        startedAt: c.startedAt,
        lastActivity: c.lastActivity,
        preview,
      };
    });

    res.json({
      success: true,
      conversations: result,
    });
  } catch (error) {
    logger.error('Error listing conversations:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to list conversations',
      error: error.message,
    });
  }
};

const getConversation = async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;

    const conversation = await Conversation.findOne(
      { userId, sessionId },
      {
        sessionId: 1,
        state: 1,
        status: 1,
        messages: 1,
        data: 1,
        startedAt: 1,
        lastActivity: 1,
      }
    ).lean();

    if (!conversation) {
      return res.status(404).json({
        success: false,
        message: 'Conversation not found',
      });
    }

    res.json({
      success: true,
      conversation: {
        sessionId: conversation.sessionId,
        state: conversation.state,
        status: conversation.status,
        messages: conversation.messages,
        data: conversation.data,
        startedAt: conversation.startedAt,
        lastActivity: conversation.lastActivity,
      },
    });
  } catch (error) {
    logger.error('Error getting conversation:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to get conversation',
      error: error.message,
    });
  }
};

const downloadResume = async (req, res) => {
  try {
    const userId = req.user.id;

    const resume = await Resume.findOne({ userId }).sort({ createdAt: -1 }).lean();
    if (!resume || !resume.extractedData) {
      return res.status(404).json({
        success: false,
        message: 'No resume found. Please generate a resume first.',
      });
    }

    logger.info('Generating PDF for user:', userId);
    const pdfBuffer = await generateProfessionalPDF(resume.extractedData);
    logger.info('PDF generated, size:', pdfBuffer.length, 'bytes');

    const fileName = `${resume.extractedData.name?.replace(/\s+/g, '_') || 'Professional'}_Resume.pdf`;
    logger.info('Sending PDF file:', fileName);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    res.setHeader('Cache-Control', 'no-cache');

    res.send(pdfBuffer);
  } catch (error) {
    logger.error('Error downloading resume:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to download resume',
      error: error.message,
    });
  }
};

const handleTranscribeAudio = async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({
        success: false,
        message: 'No audio file provided',
      });
    }

    logger.info('Received audio for transcription:', req.file.originalname, 'Size:', req.file.size);

    const result = await transcribeAudio(req.file.buffer);

    if (result.success) {
      return res.json({
        success: true,
        text: result.text,
        model: result.model,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('Transcription error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to transcribe audio',
      error: error.message,
    });
  }
};

const handleSynthesizeSpeech = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'No text provided or invalid text',
      });
    }

    logger.info('Synthesizing speech for text:', text.substring(0, 50) + '...');

    const result = await synthesizeSpeech(text);

    if (result.success) {
      return res.json({
        success: true,
        audio: result.audio,
        mimeType: result.mimeType,
        model: result.model,
      });
    } else {
      return res.status(500).json({
        success: false,
        message: result.error,
      });
    }
  } catch (error) {
    logger.error('TTS synthesis error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to synthesize speech',
      error: error.message,
    });
  }
};

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
        progress: 0,
      };
  }
}

function handleWelcomeState(session, message) {
  const lowerMessage = message.toLowerCase();
  if (lowerMessage.includes('yes') || lowerMessage.includes('ready') || lowerMessage.includes('start')) {
    session.state = CONVERSATION_STATES.PERSONAL_INFO;
    return {
      message: "Great! Let's start with your basic information. 📝\n\nWhat's your full name?",
      progress: 10,
    };
  }

  return {
    message: "No wahala! When you ready, just say 'yes' or 'ready' and we go start building your resume together! 😊",
    progress: 0,
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
      progress: 15,
    };
  }

  if (!session.data.personalInfo.email) {
    if (isValidEmail(message)) {
      session.data.personalInfo.email = message;
      return {
        message: "Perfect! What's your phone number?",
        progress: 20,
      };
    } else {
      return {
        message: "That doesn't look like a valid email address. Please enter a valid email (e.g., john@example.com):",
        progress: 15,
      };
    }
  }

  if (!session.data.personalInfo.phone) {
    session.data.personalInfo.phone = message;
    return {
      message: 'Great! What city/location are you based in?',
      progress: 25,
    };
  }

  if (!session.data.personalInfo.location) {
    session.data.personalInfo.location = message;
    session.state = CONVERSATION_STATES.PROFESSIONAL_SUMMARY;
    return {
      message: `Excellent! Now let's talk about your professional background. 💼\n\nWhat's your current job title or the role you're seeking? (e.g., Software Developer, Marketing Manager, etc.)`,
      progress: 30,
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
      message:
        "Great choice! How many years of professional experience do you have in this field? (e.g., 2 years, 5 years, or 'Fresh graduate')",
      progress: 35,
    };
  }

  if (!session.data.professionalSummary.experience) {
    session.data.professionalSummary.experience = message;
    return {
      message:
        "Excellent! Now let's create a professional summary. Tell me about yourself professionally - what makes you stand out? (This will be the summary at the top of your resume)",
      progress: 35,
    };
  }

  if (!session.data.professionalSummary.summary) {
    session.data.professionalSummary.summary = message;
    session.state = CONVERSATION_STATES.PROFESSIONAL_LINKS;
    return {
      message:
        "Great summary! 💼 Now let's add your professional links.\n\nWhat's your LinkedIn URL? (e.g., linkedin.com/in/your-name)",
      progress: 40,
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
      location: '',
    });
    return {
      message: 'Great! Which school/institution are you attending?',
      progress: 50,
    };
  }

  const currentEducation = session.data.education[session.data.education.length - 1];

  if (!currentEducation.institution) {
    currentEducation.institution = message;
    return {
      message: "Nice! What years are you studying there? (e.g., '01/2022 - Present', '2020-2024')",
      progress: 52,
    };
  }

  if (!currentEducation.year) {
    currentEducation.year = message;
    return {
      message: "Perfect! What's the location? (e.g., 'Nigeria, Ogun State, Ilishan-remo')",
      progress: 54,
    };
  }

  if (!currentEducation.location) {
    currentEducation.location = message;
    session.state = CONVERSATION_STATES.WORK_EXPERIENCE;
    return {
      message:
        "Excellent! Now let's talk about your work experience. 💪\n\nTell me about your most recent job. What was your job title? (or type 'No experience' if you're just starting)",
      progress: 56,
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
      message:
        "No problem! Everyone starts somewhere. 🌟\n\nLet's focus on your skills. What are your main technical skills? (e.g., HTML, CSS, PHP, Laravel, JavaScript, etc.) - separate multiple skills with commas:",
      progress: 70,
    };
  }

  if (
    session.data.workExperience.length === 0 ||
    !session.data.workExperience[session.data.workExperience.length - 1].position
  ) {
    if (message.toLowerCase().includes(' at ')) {
      const parts = message.split(' at ');
      session.data.workExperience.push({
        position: parts[0].trim(),
        company: parts[1].trim(),
        duration: '',
        location: '',
        responsibilities: '',
        contact: '',
      });
      return {
        message: "Perfect! What was the duration? (e.g., '01/2024 - 06/2024', 'Jan 2022 - Present')",
        progress: 60,
      };
    } else {
      session.data.workExperience.push({
        position: message,
        company: '',
        duration: '',
        location: '',
        responsibilities: '',
        contact: '',
      });
      return {
        message: 'Great! What company did you work for?',
        progress: 58,
      };
    }
  }

  const currentJob = session.data.workExperience[session.data.workExperience.length - 1];

  if (!currentJob.company) {
    currentJob.company = message;
    return {
      message: "Perfect! What was the duration? (e.g., '01/2024 - 06/2024', 'Jan 2022 - Present')",
      progress: 60,
    };
  }

  if (!currentJob.duration) {
    currentJob.duration = message;
    return {
      message: "Great! What was the location? (e.g., 'Ogun, Nigeria', 'Lagos')",
      progress: 62,
    };
  }

  if (!currentJob.location) {
    currentJob.location = message;
    return {
      message: 'Excellent! Can you describe what you did in this role? (Key responsibilities and achievements)',
      progress: 64,
    };
  }

  if (!currentJob.responsibilities) {
    currentJob.responsibilities = message;
    return {
      message:
        "Perfect! Do you have a contact reference for this role? (e.g., 'Mr John Doe - +234xxxxxxxxx') or type 'none':",
      progress: 66,
    };
  }

  if (!currentJob.contactAsked) {
    currentJob.contactAsked = true;
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      currentJob.contact = message;
    }
    return {
      message: "Excellent! Do you have another job experience? Type 'yes' to add another job, or 'no' to continue:",
      progress: 68,
      options: ['yes', 'no'],
    };
  }

  if (lowerMessage.includes('yes')) {
    session.data.workExperience.push({
      position: '',
      company: '',
      duration: '',
      location: '',
      responsibilities: '',
      contact: '',
    });
    return {
      message: 'Great! What was your job title for the next position?',
      progress: 68,
    };
  } else if (lowerMessage.includes('no') || lowerMessage.includes('none')) {
    session.state = CONVERSATION_STATES.SKILLS;
    return {
      message:
        "Perfect! Now let's add your skills. 🛠️\n\nWhat are your main technical skills? (e.g., HTML, CSS, PHP, Laravel, JavaScript, etc.) - separate multiple skills with commas:",
      progress: 70,
    };
  } else {
    return {
      message: "Please type 'yes' to add another job experience, or 'no' to continue to skills:",
      progress: 68,
      options: ['yes', 'no'],
    };
  }
}

function handleSkillsState(session, message) {
  if (!session.data.skills) {
    session.data.skills = [];
  }

  const skills = message
    .split(',')
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 0);
  session.data.skills = [...session.data.skills, ...skills];

  session.state = CONVERSATION_STATES.PROJECTS;
  return {
    message:
      "Awesome skills! 🔥\n\nDo you have any projects, portfolios, or achievements you'd like to showcase? (e.g., websites you built, campaigns you managed, awards, etc.) Type your projects or 'none' if you don't have any:",
    progress: 75,
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
      progress: 42,
    };
  }

  if (session.data.linkStep === 'github') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'github', url: message });
    }
    session.data.linkStep = 'stackoverflow';
    return {
      message: "Awesome! Do you have a StackOverflow profile? (or type 'none')",
      progress: 44,
    };
  }

  if (session.data.linkStep === 'stackoverflow') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'stackoverflow', url: message });
    }
    session.data.linkStep = 'medium';
    return {
      message: "Excellent! Any Medium/blog profile? (or type 'none')",
      progress: 46,
    };
  }

  if (session.data.linkStep === 'medium') {
    if (!lowerMessage.includes('none') && !lowerMessage.includes('no')) {
      session.data.links.push({ type: 'medium', url: message });
    }
    delete session.data.linkStep;
    session.state = CONVERSATION_STATES.EDUCATION;
    return {
      message:
        "Perfect! Now let's add your educational background. 🎓\n\nWhat degree are you pursuing/have completed? (e.g., Software Engineering, Computer Science, etc.)",
      progress: 48,
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
      message:
        "No problem! Now let's add any certificates you have.\n\nDo you have any professional certificates? (e.g., 'Critical Infrastructure Protection (OPSWAT) - May 2024') or type 'none':",
      progress: 85,
    };
  }

  if (session.data.projects.length === 0) {
    const projectInfo = message.split(' - ');
    session.data.projects.push({
      name: projectInfo[0] || message,
      description: projectInfo[1] || '',
      dates: projectInfo[2] || '',
    });
    return {
      message: 'Great project! Can you tell me more about it? (What did you build/achieve?)',
      progress: 80,
    };
  }

  const currentProject = session.data.projects[session.data.projects.length - 1];
  if (!currentProject.description) {
    currentProject.description = message;
    return {
      message: "Excellent! When did you work on this project? (e.g., '10/2024 - Present', 'September 2024')",
      progress: 82,
    };
  }

  if (!currentProject.dates) {
    currentProject.dates = message;
    return {
      message: "Perfect! Do you have another project to add? Type 'yes' to add another, or 'no' to continue:",
      progress: 84,
      options: ['yes', 'no'],
    };
  }

  if (lowerMessage.includes('yes')) {
    session.data.projects.push({
      name: '',
      description: '',
      dates: '',
    });
    return {
      message: "Great! What's your next project? (Project name - brief description)",
      progress: 84,
    };
  } else if (lowerMessage.includes('no')) {
    session.state = CONVERSATION_STATES.CERTIFICATES;
    return {
      message:
        "Excellent projects! Now let's add any certificates you have. 🏆\n\nDo you have any professional certificates? (e.g., 'Critical Infrastructure Protection (OPSWAT) - May 2024') or type 'none':",
      progress: 85,
    };
  } else {
    return {
      message: "Please type 'yes' to add another project, or 'no' to continue:",
      progress: 84,
      options: ['yes', 'no'],
    };
  }
}

function handleCertificatesState(session, message) {
  if (!session.data.certificates) {
    session.data.certificates = [];
  }

  const lowerMessage = message.toLowerCase();

  if (!session.data.certificateStep) {
    if (lowerMessage.includes('none') || lowerMessage.includes('no certificates')) {
      session.data.certificates = [];
      session.state = CONVERSATION_STATES.ACHIEVEMENTS;
      return {
        message:
          "No problem! Finally, do you have any key achievements or accomplishments you'd like to highlight? 🌟\n\n(e.g., awards, recognition, special tasks completed, etc.) or type 'none':",
        progress: 90,
      };
    }

    const certParts = message.split(' - ');
    const nameAndIssuer = certParts[0];
    const date = certParts[1] || '';

    const issuerMatch = nameAndIssuer.match(/\(([^)]+)\)/);
    const certName = nameAndIssuer.replace(/\s*\([^)]+\)\s*/, '').trim();
    const issuer = issuerMatch ? issuerMatch[1] : '';

    session.data.certificates.push({
      name: certName,
      issuer: issuer,
      date: date,
    });

    session.data.certificateStep = 'asking_more';
    return {
      message:
        "Great certificate! Do you have another certificate to add? Type 'yes' to add another, or 'no' to continue:",
      progress: 87,
      options: ['yes', 'no'],
    };
  }

  if (session.data.certificateStep === 'asking_more') {
    if (lowerMessage.includes('yes')) {
      session.data.certificateStep = 'adding_more';
      return {
        message: "Great! What's your next certificate? (e.g., 'Certificate Name (Issuer) - Date')",
        progress: 87,
      };
    } else if (lowerMessage.includes('no') || lowerMessage.includes('none')) {
      delete session.data.certificateStep;
      session.state = CONVERSATION_STATES.ACHIEVEMENTS;
      return {
        message:
          "Perfect! Finally, do you have any key achievements or accomplishments you'd like to highlight? 🌟\n\n(e.g., awards, recognition, special tasks completed, etc.) or type 'none':",
        progress: 90,
      };
    } else {
      return {
        message: "Please type 'yes' to add another certificate, or 'no' to continue:",
        progress: 87,
        options: ['yes', 'no'],
      };
    }
  }

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
      date: date,
    });

    session.data.certificateStep = 'asking_more';
    return {
      message: "Excellent! Do you have another certificate to add? Type 'yes' for more, or 'no' to continue:",
      progress: 88,
      options: ['yes', 'no'],
    };
  }
}

function handleAchievementsState(session, message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('none') || lowerMessage.includes('no achievements')) {
    session.data.achievements = [];
  } else {
    const achievements = message
      .split(/[•\n]/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    session.data.achievements = achievements;
  }

  session.state = CONVERSATION_STATES.REVIEW;
  return {
    message: generateReviewMessage(session.data),
    progress: 95,
    data: session.data,
  };
}

function handleReviewState(session, message) {
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes('yes') || lowerMessage.includes('looks good') || lowerMessage.includes('correct')) {
    session.state = CONVERSATION_STATES.COMPLETED;
    return {
      message:
        "Perfect! Your resume data is ready! 🎉\n\nClick the 'Generate Resume' button below to create your professional resume. You'll be able to download it and use it for job applications!",
      progress: 100,
      state: 'completed',
    };
  } else if (lowerMessage.includes('edit') || lowerMessage.includes('change') || lowerMessage.includes('modify')) {
    return {
      message:
        "No problem! What would you like to change? You can say things like:\n- 'Change my name'\n- 'Add more skills'\n- 'Edit work experience'\n- 'Update education'",
      progress: 95,
    };
  } else {
    return {
      message:
        "Please review the information above. Type 'yes' if everything looks correct, or 'edit' if you want to make changes:",
      progress: 95,
      options: ['yes', 'edit'],
    };
  }
}

function generateReviewMessage(data) {
  let review = "Perfect! Here's a comprehensive summary of your information: 📋\n\n";

  if (data.personalInfo) {
    review += `👤 **Personal Information:**\n`;
    review += `Name: ${data.personalInfo.name}\n`;
    review += `Email: ${data.personalInfo.email}\n`;
    review += `Phone: ${data.personalInfo.phone}\n`;
    review += `Location: ${data.personalInfo.location}\n\n`;
  }

  if (data.professionalSummary) {
    review += `💼 **Professional Summary:**\n`;
    review += `Role: ${data.professionalSummary.currentRole}\n`;
    review += `Experience: ${data.professionalSummary.experience}\n`;
    if (data.professionalSummary.summary) {
      review += `Summary: ${data.professionalSummary.summary}\n`;
    }
    review += `\n`;
  }

  if (data.links && data.links.length > 0) {
    review += `🔗 **Professional Links:**\n`;
    data.links.forEach((link) => {
      review += `${link.type}: ${link.url}\n`;
    });
    review += `\n`;
  }

  if (data.education && data.education.length > 0) {
    review += `🎓 **Education:**\n`;
    data.education.forEach((edu) => {
      review += `${edu.degree} - ${edu.institution}\n`;
      review += `${edu.year}, ${edu.location}\n`;
    });
    review += `\n`;
  }

  if (data.workExperience && data.workExperience.length > 0) {
    review += `💪 **Work Experience:**\n`;
    data.workExperience.forEach((job) => {
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

  if (data.skills && data.skills.length > 0) {
    review += `🛠️ **Skills:**\n${data.skills.join(', ')}\n\n`;
  }

  if (data.projects && data.projects.length > 0) {
    review += `🎯 **Projects:**\n`;
    data.projects.forEach((project) => {
      if (typeof project === 'object') {
        review += `${project.name} (${project.dates})\n`;
        review += `${project.description}\n\n`;
      } else {
        review += `${project}\n`;
      }
    });
  }

  if (data.certificates && data.certificates.length > 0) {
    review += `🏆 **Certificates:**\n`;
    data.certificates.forEach((cert) => {
      review += `${cert.name} (${cert.issuer}) - ${cert.date}\n`;
    });
    review += `\n`;
  }

  if (data.achievements && data.achievements.length > 0) {
    review += `🌟 **Achievements:**\n`;
    data.achievements.forEach((achievement) => {
      review += `• ${achievement}\n`;
    });
    review += `\n`;
  }

  review += `Does this look correct? Type 'yes' if everything looks correct, or 'edit' if you want to make changes:`;

  return review;
}

module.exports = {
  processMessage,
  startConversation,
  generateResume,
  getProgress,
  listConversations,
  getConversation,
  downloadResume,
  transcribeAudio: handleTranscribeAudio,
  synthesizeSpeech: handleSynthesizeSpeech,
};
