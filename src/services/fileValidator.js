/**
 * File Validation Utility
 * Validates file uploads for security and integrity
 */

const fs = require('fs');
const path = require('path');

/**
 * Magic bytes (file signatures) for allowed file types
 */
const MAGIC_BYTES = {
  pdf: Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
  docx: Buffer.from([0x50, 0x4B, 0x03, 0x04]), // ZIP signature (DOCX is ZIP)
  doc: [
    Buffer.from([0xD0, 0xCF, 0x11, 0xE0]), // MS Office OLE2
    Buffer.from([0xDB, 0xA5, 0x2D, 0x00]) // Alternative DOC header
  ],
  txt: Buffer.from([]) // Plain text - no specific signature
};

/**
 * Allowed MIME types and their extensions
 */
const ALLOWED_FILES = {
  'application/pdf': { ext: '.pdf', magicBytes: MAGIC_BYTES.pdf },
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
    ext: '.docx',
    magicBytes: MAGIC_BYTES.docx
  },
  'application/msword': { ext: '.doc', magicBytes: MAGIC_BYTES.doc },
  'text/plain': { ext: '.txt', magicBytes: MAGIC_BYTES.txt }
};

/**
 * Maximum file size: 10MB
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Sanitize filename to prevent path traversal and other attacks
 * @param {string} filename - Original filename
 * @returns {string} Sanitized filename
 */
function sanitizeFilename(filename) {
  if (!filename) {
    throw new Error('Filename is required');
  }

  // Remove path separators and null bytes
  let clean = filename
    .replace(/[\/\\]/g, '_')
    .replace(/\0/g, '')
    .replace(/^\.+/, ''); // Remove leading dots

  // Keep only alphanumeric, dash, underscore, and extension
  clean = clean.replace(/[^a-zA-Z0-9._-]/g, '_');

  // Limit length
  const maxLength = 255;
  if (clean.length > maxLength) {
    const ext = path.extname(clean);
    clean = clean.substring(0, maxLength - ext.length) + ext;
  }

  // Prevent empty filename
  if (!clean || clean === '.' || clean === '..') {
    throw new Error('Invalid filename');
  }

  return clean;
}

/**
 * Verify file magic bytes match MIME type
 * @param {string} filePath - Path to uploaded file
 * @param {string} mimeType - Declared MIME type
 * @returns {Promise<boolean>}
 */
async function verifyFileMagic(filePath, mimeType) {
  try {
    const fileConfig = ALLOWED_FILES[mimeType];
    if (!fileConfig) {
      return false;
    }

    const magicBytes = Array.isArray(fileConfig.magicBytes)
      ? fileConfig.magicBytes
      : [fileConfig.magicBytes];

    const file = await fs.promises.open(filePath, 'r');
    const buffer = Buffer.alloc(4);
    await file.read(buffer, 0, 4, 0);
    await file.close();

    // For plain text, any file is allowed (no magic bytes signature)
    if (mimeType === 'text/plain') {
      return true;
    }

    // Check if file starts with any of the magic byte signatures
    return magicBytes.some(magic => {
      return buffer.slice(0, magic.length).equals(magic);
    });
  } catch (error) {
    console.error('Error verifying file magic bytes:', error.message);
    return false;
  }
}

/**
 * Validate uploaded file
 * @param {object} file - Multer file object
 * @param {string} filePath - Path to uploaded file
 * @returns {Promise<object>} Validation result { valid: boolean, error?: string, sanitized?: string }
 */
async function validateFile(file, filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { valid: false, error: 'File not found after upload' };
    }

    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size > MAX_FILE_SIZE) {
      return { valid: false, error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` };
    }

    if (stats.size === 0) {
      return { valid: false, error: 'File is empty' };
    }

    // Verify MIME type is allowed
    if (!ALLOWED_FILES[file.mimetype]) {
      return {
        valid: false,
        error: `File type not allowed. Allowed types: ${Object.keys(ALLOWED_FILES).join(', ')}`
      };
    }

    // Verify magic bytes
    const magicValid = await verifyFileMagic(filePath, file.mimetype);
    if (!magicValid) {
      return { valid: false, error: 'File content does not match declared type (magic bytes mismatch)' };
    }

    // Sanitize and validate filename
    let sanitizedName;
    try {
      sanitizedName = sanitizeFilename(file.originalname);
    } catch (error) {
      return { valid: false, error: `Invalid filename: ${error.message}` };
    }

    // Ensure extension matches MIME type
    const ext = path.extname(sanitizedName).toLowerCase();
    const expectedExt = ALLOWED_FILES[file.mimetype].ext;

    // For DOCX, allow both .docx and potentially .doc in combined format
    if (ext !== expectedExt && !(file.mimetype === 'application/msword' && ext === '.doc')) {
      sanitizedName = path.basename(sanitizedName, ext) + expectedExt;
    }

    return { valid: true, sanitized: sanitizedName };
  } catch (error) {
    return { valid: false, error: `Validation error: ${error.message}` };
  }
}

module.exports = {
  sanitizeFilename,
  verifyFileMagic,
  validateFile,
  ALLOWED_FILES,
  MAX_FILE_SIZE
};
