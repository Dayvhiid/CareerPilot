/**
 * File Upload Validation Tests
 * Tests for file upload security, validation, and sanitization
 */

const fs = require('fs');
const path = require('path');
const { sanitizeFilename, validateFile, ALLOWED_FILES } = require('../../src/services/fileValidator');

describe('File Validation Tests', () => {
  describe('sanitizeFilename', () => {
    it('should remove path separators', () => {
      const result = sanitizeFilename('../../../etc/passwd');
      expect(result).not.toContain('/');
      expect(result).not.toContain('\\');
    });

    it('should remove null bytes', () => {
      const result = sanitizeFilename('test\0.pdf');
      expect(result).not.toContain('\0');
    });

    it('should remove leading dots', () => {
      const result = sanitizeFilename('.hidden.pdf');
      expect(result).not.toMatch(/^\./);
    });

    it('should replace invalid characters with underscores', () => {
      const result = sanitizeFilename('file@#$%^&*.pdf');
      expect(result).toMatch(/^file_+\.pdf$/);
    });

    it('should limit filename length to 255 characters', () => {
      const longName = 'a'.repeat(300) + '.pdf';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
      expect(result).toContain('.pdf');
    });

    it('should preserve normal filenames', () => {
      const normal = 'my-resume_2024.pdf';
      const result = sanitizeFilename(normal);
      expect(result).toBe(normal);
    });

    it('should throw error for empty filename', () => {
      expect(() => sanitizeFilename('')).toThrow();
      expect(() => sanitizeFilename('.')).toThrow();
      expect(() => sanitizeFilename('..')).toThrow();
    });

    it('should handle special characters in names', () => {
      const result = sanitizeFilename('resume (final draft) [v2].docx');
      expect(result).toBeDefined();
      expect(result.length).toBeGreaterThan(0);
      expect(result).not.toContain('(');
      expect(result).not.toContain('[');
    });
  });

  describe('File Validation', () => {
    const testFile = {
      filename: 'test.pdf',
      mimetype: 'application/pdf',
      originalname: 'test.pdf',
      size: 1000,
      path: null
    };

    beforeEach(() => {
      // Create a temporary test directory
      if (!fs.existsSync('./test-uploads')) {
        fs.mkdirSync('./test-uploads', { recursive: true });
      }
    });

    afterEach(() => {
      // Clean up test files
      if (fs.existsSync('./test-uploads')) {
        const files = fs.readdirSync('./test-uploads');
        files.forEach(f => {
          fs.unlinkSync(path.join('./test-uploads', f));
        });
        fs.rmdirSync('./test-uploads');
      }
    });

    it('should reject non-existent files', async () => {
      const result = await validateFile(testFile, './non-existent.pdf');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should reject empty files', async () => {
      const filePath = './test-uploads/empty.pdf';
      fs.writeFileSync(filePath, '');

      const result = await validateFile(testFile, filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('empty');
    });

    it('should reject files exceeding size limit', async () => {
      const filePath = './test-uploads/large.pdf';
      // Create a file larger than 10MB
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024);
      fs.writeFileSync(filePath, largeBuffer);

      const result = await validateFile(testFile, filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds maximum');

      fs.unlinkSync(filePath);
    });

    it('should reject files with disallowed MIME types', async () => {
      const filePath = './test-uploads/test.exe';
      fs.writeFileSync(filePath, 'MZ\x90\x00'); // Windows executable header

      const invalidFile = { ...testFile, mimetype: 'application/x-msdownload' };
      const result = await validateFile(invalidFile, filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not allowed');
    });

    it('should accept valid PDF files with correct magic bytes', async () => {
      const filePath = './test-uploads/test.pdf';
      // PDF magic bytes: %PDF
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      fs.writeFileSync(filePath, Buffer.concat([pdfHeader, Buffer.from('...rest of PDF')]));

      const result = await validateFile(testFile, filePath);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toBeDefined();
    });

    it('should reject MIME type spoofing', async () => {
      const filePath = './test-uploads/fake.pdf';
      // Write non-PDF content
      fs.writeFileSync(filePath, 'This is not a PDF');

      const result = await validateFile(testFile, filePath);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('magic bytes');
    });

    it('should sanitize filename in validation result', async () => {
      const filePath = './test-uploads/test.pdf';
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      fs.writeFileSync(filePath, Buffer.concat([pdfHeader, Buffer.from('...rest')]));

      const fileWithBadName = {
        ...testFile,
        originalname: '../../../evil/file.pdf'
      };

      const result = await validateFile(fileWithBadName, filePath);
      expect(result.valid).toBe(true);
      expect(result.sanitized).not.toContain('/');
      expect(result.sanitized).not.toContain('\\');
      expect(result.sanitized).not.toContain('..');
    });

    it('should validate DOCX files (ZIP format)', async () => {
      const filePath = './test-uploads/test.docx';
      // ZIP/DOCX magic bytes: PK\x03\x04
      const zipHeader = Buffer.from([0x50, 0x4B, 0x03, 0x04]);
      fs.writeFileSync(filePath, Buffer.concat([zipHeader, Buffer.from('...rest')]));

      const docxFile = {
        ...testFile,
        filename: 'test.docx',
        mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      };

      const result = await validateFile(docxFile, filePath);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('.docx');
    });

    it('should validate plain text files', async () => {
      const filePath = './test-uploads/test.txt';
      fs.writeFileSync(filePath, 'Plain text content');

      const txtFile = {
        ...testFile,
        filename: 'test.txt',
        mimetype: 'text/plain'
      };

      const result = await validateFile(txtFile, filePath);
      expect(result.valid).toBe(true);
    });

    it('should enforce extension matching MIME type', async () => {
      const filePath = './test-uploads/test.doc';
      const pdfHeader = Buffer.from([0x25, 0x50, 0x44, 0x46]);
      fs.writeFileSync(filePath, Buffer.concat([pdfHeader, Buffer.from('...rest')]));

      const result = await validateFile(testFile, filePath);
      expect(result.valid).toBe(true);
      expect(result.sanitized).toContain('.pdf'); // Should correct extension
    });
  });

  describe('Allowed Files Configuration', () => {
    it('should only allow PDF, DOCX, DOC, and TXT', () => {
      const allowed = Object.keys(ALLOWED_FILES);
      expect(allowed).toHaveLength(4);
      expect(allowed).toContain('application/pdf');
      expect(allowed).toContain('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      expect(allowed).toContain('application/msword');
      expect(allowed).toContain('text/plain');
    });

    it('should have correct extensions for each MIME type', () => {
      expect(ALLOWED_FILES['application/pdf'].ext).toBe('.pdf');
      expect(ALLOWED_FILES['application/msword'].ext).toBe('.doc');
      expect(ALLOWED_FILES['application/vnd.openxmlformats-officedocument.wordprocessingml.document'].ext).toBe('.docx');
      expect(ALLOWED_FILES['text/plain'].ext).toBe('.txt');
    });

    it('should have magic bytes defined for each type', () => {
      Object.keys(ALLOWED_FILES).forEach(mimeType => {
        expect(ALLOWED_FILES[mimeType].magicBytes).toBeDefined();
      });
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should prevent directory traversal attacks', () => {
      const attacks = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'file/..',
        '....//....//....//etc/passwd',
        'C:\\Windows\\System32\\config',
      ];

      attacks.forEach(attack => {
        const result = sanitizeFilename(attack);
        expect(result).not.toContain('..');
        expect(result).not.toContain('/');
        expect(result).not.toContain('\\');
        expect(result).toBeDefined();
        expect(result.length).toBeGreaterThan(0);
      });
    });
  });
});
