const { logger } = require('../config/logger');

const APP_BASE_URL = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 4000}`).replace(/\/$/, '');
const EMAIL_FROM = process.env.EMAIL_FROM || 'no-reply@careerpilot.app';

/**
 * Send an email. There is no SMTP provider wired up yet, so emails are
 * logged (and rendered to a temp file in development) so flows can be
 * tested end-to-end. Plug in a real provider (SES, SendGrid, etc.) by
 * replacing the body of this function.
 */
async function sendEmail({ to, subject, text, html }) {
  const envelope = {
    to,
    from: EMAIL_FROM,
    subject,
    text,
    html,
  };

  logger.info(`[email:dev] To: ${to} | Subject: ${subject}`);
  logger.info(`[email:dev] Body: ${(text || html || '').slice(0, 2000)}`);

  if (process.env.NODE_ENV === 'production') {
    logger.warn('[email:dev] No email provider configured — verification/reset emails are only logged.');
  }

  return envelope;
}

module.exports = { sendEmail, APP_BASE_URL, EMAIL_FROM };
