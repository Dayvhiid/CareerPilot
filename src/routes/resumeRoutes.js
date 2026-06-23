const express = require("express");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const auth = require("../middleware/auth");
const { uploadLimiter } = require("../middleware/rateLimiters");
const { validateFile } = require("../services/fileValidator");
const {
  uploadResume,
  getResume,
  deleteResume,
} = require("../controllers/resumeController");

// Create uploads directory if it doesn't exist
const fsp = require("fs").promises;
const uploadsDir = path.join(__dirname, "../../uploads");
fsp.mkdir(uploadsDir, { recursive: true }).catch(() => {});

// Multer configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${Date.now()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  // Only allow PDF, DOCX, DOC (not plain text - removed for security)
  const allowedTypes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only PDF, DOC, and DOCX are allowed."), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
});

// File validation middleware
const validateFileMiddleware = async (req, res, next) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: "No file uploaded" });
  }

  const validation = await validateFile(req.file, req.file.path);
  
  if (!validation.valid) {
    try {
      await fsp.unlink(req.file.path);
    } catch {
      // File may not exist, ignore
    }
    return res.status(400).json({ success: false, message: validation.error });
  }

  // Store sanitized filename
  req.file.sanitized = validation.sanitized;
  next();
};

// Routes with authentication and rate limiting
router.post("/upload", auth, uploadLimiter, upload.single("resume"), validateFileMiddleware, uploadResume);
router.get("/", auth, getResume);
router.delete("/", auth, deleteResume);

module.exports = router;