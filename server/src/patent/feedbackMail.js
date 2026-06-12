const nodemailer = require('nodemailer');

const DEFAULT_TO = '13960565525@163.com';

const LEGACY_RECIPIENTS = new Set([
  'xinghua2.chen@tinno.com',
  'author@example.com',
]);

function getRecipient() {
  const to = (process.env.FEEDBACK_TO || DEFAULT_TO).trim();
  if (LEGACY_RECIPIENTS.has(to)) return DEFAULT_TO;
  return to || DEFAULT_TO;
}

function getSmtpConfig() {
  const host = process.env.FEEDBACK_SMTP_HOST;
  const user = process.env.FEEDBACK_SMTP_USER;
  const pass = process.env.FEEDBACK_SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.FEEDBACK_SMTP_PORT || 587);
  // 587/25 使用 STARTTLS（先明文再升级）；465 使用隐式 SSL。二者不可混用。
  let secure = false;
  if (port === 465) {
    secure = true;
  } else if (port === 587 || port === 25) {
    secure = false;
  } else {
    secure = process.env.FEEDBACK_SMTP_SECURE === 'true';
  }

  const transport = {
    host,
    port,
    secure,
    auth: { user, pass },
  };

  if (!secure && (port === 587 || port === 25)) {
    transport.requireTLS = true;
  }

  if (process.env.FEEDBACK_SMTP_TLS_INSECURE === 'true') {
    transport.tls = { rejectUnauthorized: false };
  }

  return transport;
}

function isMailConfigured() {
  return Boolean(getSmtpConfig());
}

function getFromAddress() {
  return process.env.FEEDBACK_FROM || process.env.FEEDBACK_SMTP_USER || getRecipient();
}

async function sendFeedbackEmail({ subject, text, html, attachments = [], replyTo }) {
  const smtp = getSmtpConfig();
  if (!smtp) {
    const err = new Error('邮件服务未配置，请在设置页配置 SMTP');
    err.code = 'SMTP_NOT_CONFIGURED';
    throw err;
  }

  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'smtp-fix',
      hypothesisId: 'H-ssl-mismatch',
      location: 'feedbackMail.js:send',
      message: 'smtp transport config',
      data: {
        host: smtp.host,
        port: smtp.port,
        secure: smtp.secure,
        requireTLS: !!smtp.requireTLS,
        tlsInsecure: !!(smtp.tls && smtp.tls.rejectUnauthorized === false),
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  const transporter = nodemailer.createTransport(smtp);
  const to = getRecipient();

  const mail = {
    from: getFromAddress(),
    to,
    subject,
    text,
    html,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      content: a.content,
      contentType: a.contentType,
    })),
  };
  if (replyTo) mail.replyTo = replyTo;

  const info = await transporter.sendMail(mail);
  return { messageId: info.messageId, accepted: info.accepted, to };
}

module.exports = {
  DEFAULT_TO,
  getRecipient,
  getSmtpConfig,
  isMailConfigured,
  getFromAddress,
  sendFeedbackEmail,
};
