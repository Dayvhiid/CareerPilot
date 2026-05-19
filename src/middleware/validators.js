/**
 * Input Validation Rules
 * Reusable validation middleware using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to handle validation errors
 */
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array().map(err => ({
        field: err.param,
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Authentication validators
 */
const authValidators = {
  register: [
    body('name')
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage('Name must be between 2 and 100 characters')
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage('Name contains invalid characters'),
    body('email')
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail()
      .toLowerCase(),
    body('password')
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
      .withMessage('Password must contain uppercase, lowercase, and numbers'),
    handleValidationErrors
  ],

  login: [
    body('email')
      .isEmail()
      .withMessage('Invalid email format')
      .normalizeEmail(),
    body('password')
      .notEmpty()
      .withMessage('Password is required'),
    handleValidationErrors
  ]
};

/**
 * Resume/File upload validators
 */
const fileValidators = {
  uploadResume: [
    body('filename')
      .if(body('filename').exists())
      .trim()
      .isLength({ max: 255 })
      .withMessage('Filename too long'),
  ],
  handleValidationErrors
};

/**
 * Chatbot validators
 */
const chatbotValidators = {
  message: [
    body('message')
      .trim()
      .isLength({ min: 1, max: 5000 })
      .withMessage('Message must be between 1 and 5000 characters')
      .escape(),
    body('sessionId')
      .if(body('sessionId').exists())
      .isLength({ max: 100 })
      .withMessage('Invalid session ID'),
    handleValidationErrors
  ]
};

/**
 * Job search validators
 */
const jobValidators = {
  search: [
    query('query')
      .if(query('query').exists())
      .trim()
      .isLength({ max: 100 })
      .withMessage('Search query too long'),
    query('location')
      .if(query('location').exists())
      .trim()
      .isLength({ max: 100 })
      .withMessage('Location too long'),
    query('page')
      .if(query('page').exists())
      .isInt({ min: 1 })
      .withMessage('Invalid page number'),
    handleValidationErrors
  ]
};

/**
 * Cover letter validators
 */
const coverLetterValidators = {
  generate: [
    body('jobDescription')
      .trim()
      .isLength({ min: 10, max: 10000 })
      .withMessage('Job description must be between 10 and 10000 characters'),
    body('tone')
      .if(body('tone').exists())
      .isIn(['professional', 'casual', 'formal'])
      .withMessage('Invalid tone'),
    handleValidationErrors
  ]
};

module.exports = {
  handleValidationErrors,
  authValidators,
  fileValidators,
  chatbotValidators,
  jobValidators,
  coverLetterValidators
};
