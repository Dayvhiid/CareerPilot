const path = require('path');
const fs = require('fs');
const ejs = require('ejs');

let puppeteerModulePromise;

async function loadPuppeteer() {
  if (!puppeteerModulePromise) {
    puppeteerModulePromise = import('puppeteer').then((module) => module.default || module);
  }

  return puppeteerModulePromise;
}

const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'templates', 'resume-template.ejs');

async function generateProfessionalPDF(data) {
  const templateSource = fs.readFileSync(TEMPLATE_PATH, 'utf-8');

  const html = ejs.render(templateSource, { data });
  const puppeteer = await loadPuppeteer();

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });

    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });

    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}

module.exports = { generateProfessionalPDF };
