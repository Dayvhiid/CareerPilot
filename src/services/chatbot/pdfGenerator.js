const puppeteer = require('puppeteer');
const path = require('path');
const ejs = require('ejs');

async function generateProfessionalPDF(data) {
  console.log('Launching Puppeteer for STUNNING PDF generation...');

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();

  const htmlContent = await generateStunningHTML(data);

  await page.setContent(htmlContent);

  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '0mm',
      right: '0mm',
      bottom: '0mm',
      left: '0mm'
    },
    displayHeaderFooter: false
  });

  await browser.close();

  console.log('STUNNING PDF generated successfully!');
  return pdfBuffer;
}

async function generateStunningHTML(data) {
  return ejs.renderFile(
    path.join(__dirname, '../../templates/resume-template.ejs'),
    { data }
  );
}

module.exports = { generateProfessionalPDF };
