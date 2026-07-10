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

const STATE_PROGRESS = {
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

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function isResumeRelated(message, currentState) {
  if (currentState !== CONVERSATION_STATES.WELCOME) {
    return true;
  }

  const lowerMessage = message.toLowerCase();
  const resumeKeywords = [
    'resume', 'cv', 'job', 'work', 'career', 'yes', 'start', 'ready', 'help',
    'experience', 'education', 'skill', 'build', 'create', 'need', 'want'
  ];

  const offTopicKeywords = [
    'car', 'house', 'money', 'food', 'movie', 'game', 'weather', 'sports',
    'politics', 'religion', 'dating', 'relationship'
  ];

  for (const keyword of offTopicKeywords) {
    if (lowerMessage.includes(keyword)) {
      return false;
    }
  }

  for (const keyword of resumeKeywords) {
    if (lowerMessage.includes(keyword)) {
      return true;
    }
  }

  return message.length > 2;
}

function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

module.exports = {
  CONVERSATION_STATES,
  STATE_PROGRESS,
  generateSessionId,
  isResumeRelated,
  isValidEmail
};
