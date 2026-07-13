const { PDFDocument, rgb } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

async function generateProfessionalPDF(data) {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);

  const page = doc.addPage([595.28, 841.89]);
  const { height } = page.getSize();

  let y = height - 50;

  page.drawText(data.name || 'Your Name', {
    x: 50, y, size: 24, color: rgb(0, 0, 0)
  });
  y -= 30;

  page.drawText(data.email || '', {
    x: 50, y, size: 10, color: rgb(0.3, 0.3, 0.3)
  });
  y -= 20;

  if (data.summary) {
    y -= 10;
    page.drawText(data.summary, {
      x: 50, y, size: 10, color: rgb(0.2, 0.2, 0.2)
    });
  }

  const pdfBytes = await doc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generateProfessionalPDF };
