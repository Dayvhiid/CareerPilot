const express = require("express");
const multer = require("multer");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const router = express.Router();
const auth = require("../middleware/authMiddleware");
const {
  uploadResume,
  getResume,
  deleteResume,
} = require("../controllers/resumeController");

// Create uploads directory if it doesn't exist
const fs = require("fs");
const uploadsDir = path.join(__dirname, "../../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

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

// Routes
router.post("/upload", auth, upload.single("resume"), uploadResume);
router.get("/", auth, getResume);
router.delete("/", auth, deleteResume);

module.exports = router;