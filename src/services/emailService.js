const { logger } = require('../config/logger');
const nodemailer = require('nodemailer');

const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const EMAIL_FROM = process.env.EMAIL_FROM || 'CareerPilot <no-reply@careerpilot.app>';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    logger.warn('[email] SMTP_HOST / SMTP_USER / SMTP_PASS not set — emails will be logged only.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user, pass },
  });

  return transporter;
}

async function sendEmail({ to, subject, text, html }) {
  const transport = getTransporter();

  if (!transport) {
    logger.info(`[email:dev] To: ${to} | Subject: ${subject}`);
    logger.info(`[email:dev] Body: ${(text || html || '').slice(0, 2000)}`);
    return { id: 'dev-mode' };
  }

  const info = await transport.sendMail({
    from: EMAIL_FROM,
    to,
    subject,
    text,
    html: html || `<p>${text}</p>`,
  });

  logger.info(`[email] Sent to ${to} | Subject: ${subject} | ID: ${info.messageId}`);
  return { id: info.messageId };
}

module.exports = { sendEmail, APP_BASE_URL, EMAIL_FROM };
