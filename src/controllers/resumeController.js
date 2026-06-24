const Resume = require("../models/Resume");
const JobMatch = require("../models/JobMatch");
const pdfParse = require("pdf-parse");
const mammoth = require("mammoth");
const fs = require("fs").promises;
const path = require("path");
const mongoose = require("mongoose");
const extractor = require("../services/resumeExtractor");
const geminiExtractor = require("../services/geminiExtractor");

async function updateProcessingState(resumeId, { stage, progress, message }) {
  const update = {
    processingUpdatedAt: new Date(),
  };

  if (stage) update.processingStage = stage;
  if (typeof progress === 'number') update.processingProgress = Math.max(0, Math.min(100, progress));
  if (message) update.processingMessage = message;

  console.log(`📌 Resume ${resumeId} -> ${stage || 'status'} (${typeof progress === 'number' ? progress + '%' : 'n/a'}): ${message || ''}`);
  await Resume.findByIdAndUpdate(resumeId, update);
}

function withTimeout(promise, timeoutMs, label) {
  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs / 1000} seconds`));
    }, timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    timeoutPromise,
  ]);
}

// Upload and process resume
exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }

    const userId = req.user.id;
    const { filename, originalname, size, mimetype, path: filePath } = req.file;

    // Check if user already has a resume and delete old one
    const existingResume = await Resume.findOne({ userId });
    if (existingResume) {
      // Delete old file
      try {
        await fs.unlink(existingResume.filePath);
      } catch (err) {
        console.log("Error deleting old file:", err);
      }
      await Resume.findByIdAndDelete(existingResume._id);
    }

    // Invalidate old job matches so recommendations get recalculated with new resume
    try {
      const deleted = await JobMatch.deleteMany({ userId });
      if (deleted.deletedCount > 0) {
        console.log(`🗑️ Deleted ${deleted.deletedCount} old job matches for user ${userId}`);
      }
    } catch (err) {
      console.log("Error deleting old job matches:", err);
    }

    // Clear Redis job cache so next request fetches fresh data based on new resume
    try {
      const redisService = require('../services/redisService');
      await redisService.clearJobsCache();
      console.log('🗑️ Cleared Redis job cache after resume upload');
    } catch (err) {
      console.log("Error clearing Redis cache:", err);
    }

    // Create new resume record
    const resume = new Resume({
      userId,
      filename,
      originalName: originalname,
      fileSize: size,
      fileType: mimetype,
      filePath,
      processingStage: 'queued',
      processingProgress: 0,
      processingMessage: 'Resume uploaded and waiting to be processed',
      processingStartedAt: new Date(),
      processingUpdatedAt: new Date(),
    });

    await resume.save();

    // Start text extraction in background
    console.log(`🚀 Starting background resume extraction for ${resume._id}`);
    extractTextFromFile(resume._id, filePath, mimetype).catch(error => {
      console.error(`❌ Background resume extraction failed for ${resume._id}:`, error);
    });

    res.json({
      success: true,
      message: "Resume uploaded successfully",
      resume: {
        id: resume._id,
        filename: resume.originalName,
        size: resume.fileSize,
        uploadedAt: resume.createdAt,
        isProcessed: resume.isProcessed,
        processingStage: resume.processingStage,
        processingProgress: resume.processingProgress,
        processingMessage: 'Processing has started',
      },
    });
  } catch (error) {
    console.error("Upload error:", error);
    res.status(500).json({ success: false, message: "Server error", errors: [{ message: error.message }] });
  }
};

// Get user's resume
exports.getResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resume = await Resume.findOne({ userId });

    if (!resume) {
      return res.status(404).json({ success: false, message: "Resume not found" });
    }

    res.json({
      success: true,
      resume: {
        id: resume._id,
        filename: resume.originalName,
        size: resume.fileSize,
        uploadedAt: resume.createdAt,
        isProcessed: resume.isProcessed,
        processingStage: resume.processingStage,
        processingProgress: resume.processingProgress,
        processingMessage: resume.processingMessage,
        processingError: resume.processingError,
        extractedData: resume.extractedData,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", errors: [{ message: error.message }] });
  }
};

// Delete resume
exports.deleteResume = async (req, res) => {
  try {
    const userId = req.user.id;
    const resume = await Resume.findOne({ userId });

    if (!resume) {
      return res.status(404).json({ success: false, message: "Resume not found" });
    }

    // Delete file
      try {
        await fs.unlink(resume.filePath);
    } catch (err) {
      console.log("Error deleting file:", err);
    }

    await Resume.findByIdAndDelete(resume._id);

    res.json({ success: true, message: "Resume deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error", errors: [{ message: error.message }] });
  }
};

// Advanced NLP-based text extraction
async function extractTextFromFile(resumeId, filePath, mimeType) {
  try {
    console.log(`🧪 extractTextFromFile invoked for ${resumeId} (${mimeType})`);
    await updateProcessingState(resumeId, {
      stage: 'reading-file',
      progress: 10,
      message: 'Reading uploaded file',
    });

    let extractedText = "";

    // Extract text based on file type
    if (mimeType === "application/pdf") {
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);
      extractedText = data.text;
    } else if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (mimeType === "application/msword") {
      try {
        const result = await mammoth.extractRawText({ path: filePath });
        extractedText = result.value;
      } catch (err) {
        console.log("Error with DOC file, using fallback:", err);
        extractedText = "Unable to extract text from this DOC file format";
      }
    } else if (mimeType === "text/plain") {
      extractedText = await fs.readFile(filePath, 'utf8');
    }

    await updateProcessingState(resumeId, {
      stage: 'text-extracted',
      progress: 25,
      message: 'Text extracted successfully, analyzing content',
    });

    console.log("Extracted text length:", extractedText.length);
    console.log("🤖 Processing with Gemini LLM extraction...");

    let extractedData = null;
    let processingMethod = "unknown";

    // Extract structured data using Gemini
    try {
      await updateProcessingState(resumeId, {
        stage: 'gemini-extraction',
        progress: 45,
        message: 'Running AI extraction via Gemini',
      });
      extractedData = await withTimeout(
        geminiExtractor.extractResumeData(extractedText),
        30000,
        'Gemini resume parsing'
      );
      if (extractedData && typeof extractedData === 'object') {
        processingMethod = "Gemini (gemini-2.0-flash)";
        console.log("✅ Successfully processed with Gemini");
        console.log("🔧 Skills found:", extractedData.skills?.length || 0);
        console.log("💼 Job titles found:", extractedData.jobTitles?.length || 0);
        console.log("🏢 Companies found:", extractedData.companies?.length || 0);
        console.log("👤 Name extracted:", extractedData.name || 'Not found');
        console.log("📧 Email extracted:", extractedData.email || 'Not found');
      }
    } catch (geminiError) {
      console.log("⚠️ Gemini extraction failed:", geminiError.message);
      extractedData = null;
    }

    // Ultimate fallback: empty structure
    if (!extractedData) {
      console.log("❌ No extraction method available, using empty structure");
      extractedData = extractor.getEmptyResumeData();
      processingMethod = "Empty fallback";
    }

    await updateProcessingState(resumeId, {
      stage: 'finalizing',
      progress: 85,
      message: 'Finalizing extracted profile data',
    });

    // Ensure extractedData has the required structure
    if (!extractedData || typeof extractedData !== 'object') {
      console.log("❌ Invalid extracted data, using empty structure");
      extractedData = extractor.getEmptyResumeData();
      processingMethod = "Empty fallback";
    }

    // Add processing metadata
    extractedData.processingMethod = processingMethod;
    extractedData.processedAt = new Date().toISOString();

    // Normalize parser output so it matches the Resume schema before saving.
    extractedData = extractor.normalizeExtractedData(extractedData);

    // Update resume with extracted data
    try {
      await Resume.findByIdAndUpdate(resumeId, {
        extractedText,
        extractedData,
        isProcessed: true,
        processingStage: 'completed',
        processingProgress: 100,
        processingMessage: 'Resume processing complete',
        processingUpdatedAt: new Date(),
      });
    } catch (saveError) {
      console.error('❌ Failed to save normalized extracted data:', saveError);

      const safeFallbackData = extractor.normalizeExtractedData(extractor.getEmptyResumeData());
      await Resume.findByIdAndUpdate(resumeId, {
        extractedText,
        extractedData: safeFallbackData,
        isProcessed: true,
        processingStage: 'completed',
        processingProgress: 100,
        processingMessage: 'Resume processing complete with fallback data',
        processingUpdatedAt: new Date(),
      });
    }

    console.log(`✅ Resume ${resumeId} processed successfully with ${processingMethod}`);
    console.log("📊 Extracted data preview:", {
      name: extractedData.name,
      email: extractedData.email,
      location: extractedData.location,
      skillsCount: extractedData.skills?.length || 0,
      jobTitlesCount: extractedData.jobTitles?.length || 0
    });

  } catch (error) {
    console.error("Text extraction error:", error);
    await Resume.findByIdAndUpdate(resumeId, {
      isProcessed: false,
      extractedText: "Error extracting text: " + error.message,
      processingError: error.message,
      processingStage: 'error',
      processingProgress: 100,
      processingMessage: `Processing failed: ${error.message}`,
      processingUpdatedAt: new Date(),
    });
  }
}



