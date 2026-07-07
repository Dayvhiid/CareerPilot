const { ALLOWED_FILES, MAX_FILE_SIZE } = require('../../../src/services/fileValidator');

describe('File Validator', () => {
  describe('ALLOWED_FILES', () => {
    it('should allow PDF files', () => {
      expect(ALLOWED_FILES['application/pdf']).toBeDefined();
      expect(ALLOWED_FILES['application/pdf'].ext).toBe('.pdf');
    });

    it('should allow DOCX files', () => {
      expect(ALLOWED_FILES['application/vnd.openxmlformats-officedocument.wordprocessingml.document']).toBeDefined();
      expect(ALLOWED_FILES['application/vnd.openxmlformats-officedocument.wordprocessingml.document'].ext).toBe('.docx');
    });

    it('should allow TXT files', () => {
      expect(ALLOWED_FILES['text/plain']).toBeDefined();
      expect(ALLOWED_FILES['text/plain'].ext).toBe('.txt');
    });

    it('should not allow image files', () => {
      expect(ALLOWED_FILES['image/png']).toBeUndefined();
    });
  });

  describe('MAX_FILE_SIZE', () => {
    it('should be 10MB', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
    });
  });
});
