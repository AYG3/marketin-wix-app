/**
 * Alert Service
 * Handles failure notifications via email and logging
 */
const nodemailer = require('nodemailer');

// Email configuration - uses environment variables
const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null; // Email not configured
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });
};

const ALERT_EMAIL = process.env.ALERT_EMAIL || 'gilbertayoku3@gmail.com';
const FROM_EMAIL = process.env.ALERT_FROM_EMAIL || 'alerts@marketin.io';

/**
 * Send conversion failure alert
 */
const sendConversionFailureAlert = async ({ jobId, payload, error, attempts }) => {
  const timestamp = new Date().toISOString();
  
  // Always log
  console.error(`[ALERT] Conversion failed permanently`, {
    timestamp,
    jobId,
    error,
    attempts
  });

  // Try to send email
  try {
    const transporter = getTransporter();
    if (!transporter) {
      console.warn('[ALERT] Email not configured, skipping email notification');
      return { sent: false, reason: 'not_configured' };
    }

    let parsedPayload;
    try {
      parsedPayload = typeof payload === 'string' ? JSON.parse(payload) : payload;
    } catch {
      parsedPayload = payload;
    }

    const subject = `[Market!N Alert] Conversion Send Failed: ${jobId}`;
    const html = `
      <h2>Conversion Send Failed</h2>
      <p><strong>Job ID:</strong> ${jobId}</p>
      <p><strong>Error:</strong> ${error}</p>
      <p><strong>Attempts:</strong> ${attempts}</p>
      <p><strong>Timestamp:</strong> ${timestamp}</p>
      
      <h3>Payload:</h3>
      <pre style="background: #f4f4f4; padding: 10px; overflow: auto;">${JSON.stringify(parsedPayload, null, 2)}</pre>
      
      <hr>
      <p style="color: #666; font-size: 12px;">
        This conversion has exceeded retry limits and requires manual intervention.
        Check the conversion_failures table for more details.
      </p>
    `;

    const text = `
Conversion Send Failed

Job ID: ${jobId}
Error: ${error}
Attempts: ${attempts}
Timestamp: ${timestamp}

Payload:
${JSON.stringify(parsedPayload, null, 2)}

This conversion has exceeded retry limits and requires manual intervention.
`;

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject,
      text,
      html
    });

    console.log(`[ALERT] Email sent to ${ALERT_EMAIL}`);
    return { sent: true, to: ALERT_EMAIL };
  } catch (err) {
    console.error('[ALERT] Failed to send email', err?.message || err);
    return { sent: false, reason: 'send_failed', error: err?.message };
  }
};

/**
 * Send daily summary of queue health
 */
const sendDailySummary = async (stats) => {
  const timestamp = new Date().toISOString();
  
  console.log(`[ALERT] Daily queue summary`, { timestamp, ...stats });

  try {
    const transporter = getTransporter();
    if (!transporter) return { sent: false, reason: 'not_configured' };

    const subject = `[Market!N] Daily Conversion Queue Summary`;
    const html = `
      <h2>Daily Conversion Queue Summary</h2>
      <p><strong>Date:</strong> ${timestamp}</p>
      
      <h3>Queue Status:</h3>
      <ul>
        <li><strong>Pending:</strong> ${stats.queue?.pending || 0}</li>
        <li><strong>Processing:</strong> ${stats.queue?.processing || 0}</li>
        <li><strong>Completed:</strong> ${stats.queue?.completed || 0}</li>
        <li><strong>Failed (retrying):</strong> ${stats.queue?.failed || 0}</li>
        <li><strong>Dead (needs attention):</strong> ${stats.queue?.dead || 0}</li>
      </ul>
      
      <p><strong>Failures in last 24h:</strong> ${stats.failures24h || 0}</p>
      
      ${stats.queue?.dead > 0 ? '<p style="color: red;"><strong>⚠️ There are dead jobs requiring manual intervention!</strong></p>' : ''}
    `;

    await transporter.sendMail({
      from: FROM_EMAIL,
      to: ALERT_EMAIL,
      subject,
      text: `Daily Queue Summary\n\nPending: ${stats.queue?.pending || 0}\nCompleted: ${stats.queue?.completed || 0}\nDead: ${stats.queue?.dead || 0}\nFailures 24h: ${stats.failures24h || 0}`,
      html
    });

    return { sent: true, to: ALERT_EMAIL };
  } catch (err) {
    console.error('[ALERT] Failed to send daily summary', err?.message || err);
    return { sent: false, reason: 'send_failed', error: err?.message };
  }
};

/**
 * Test email configuration
 */
const testEmailConfig = async () => {
  const transporter = getTransporter();
  if (!transporter) {
    return { configured: false, message: 'SMTP not configured' };
  }

  try {
    await transporter.verify();
    return { configured: true, message: 'SMTP configuration valid' };
  } catch (err) {
    return { configured: false, message: err?.message || 'SMTP verification failed' };
  }
};

module.exports = {
  sendConversionFailureAlert,
  sendDailySummary,
  testEmailConfig,
  ALERT_EMAIL
};
