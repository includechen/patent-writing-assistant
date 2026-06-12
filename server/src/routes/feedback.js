const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { authMiddleware } = require('../middleware/auth');
const { db } = require('../db');
const {
  DEFAULT_TO,
  getRecipient,
  isMailConfigured,
  sendFeedbackEmail,
} = require('../patent/feedbackMail');

const router = express.Router();

function mapSmtpErrorHint(err) {
  const msg = err.message || '';
  if (msg.includes('WRONG_VERSION_NUMBER')) {
    return '端口与加密方式不匹配：587 端口请勿勾选 SSL，465 端口请勾选 SSL';
  }
  if (msg.includes('unable to verify the first certificate')) {
    return '邮箱证书校验失败，请在设置中勾选「允许自签名证书」后重试';
  }
  if (msg.includes('Greeting never received') || err.code === 'ETIMEDOUT') {
    return '无法连接 SMTP 服务器，请检查服务器地址与端口（发信推荐 587）';
  }
  if (err.code === 'EAUTH') {
    return '邮箱账号或密码/授权码错误';
  }
  return msg.split('\n')[0];
}

const FEEDBACK_TYPES = {
  bug: '问题反馈',
  suggestion: '优化建议',
  feature: '功能需求',
  other: '其他',
};

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_FILES = 5;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: MAX_FILES },
});

function feedbackArchiveDir() {
  const base = process.env.PATENT_USER_DATA
    || path.join(process.env.APPDATA || process.env.HOME || process.cwd(), 'patent-assistant');
  return path.join(base, 'data', 'feedback');
}

function saveFeedbackArchive(payload, files) {
  const dir = path.join(feedbackArchiveDir(), `${Date.now()}_${payload.username || 'user'}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'feedback.json'), JSON.stringify(payload, null, 2), 'utf8');
  for (const f of files) {
    const safeName = f.originalname.replace(/[<>:"/\\|?*]/g, '_');
    fs.writeFileSync(path.join(dir, safeName), f.buffer);
  }
  return dir;
}

function buildEmailBody({ type, subject, content, contact, user, appVersion }) {
  const typeLabel = FEEDBACK_TYPES[type] || type || '其他';
  const fullSubject = `[专利撰写助手] ${typeLabel}${subject ? ` - ${subject}` : ''}`;
  const lines = [
    `反馈类型：${typeLabel}`,
    `提交用户：${user.displayName || user.username}`,
    `用户账号：${user.username}`,
    appVersion ? `应用版本：${appVersion}` : null,
    contact ? `联系方式：${contact}` : null,
    '',
    '--- 详细描述 ---',
    '',
    (content || '').trim(),
    '',
    '---',
    `提交时间：${new Date().toLocaleString('zh-CN')}`,
  ].filter((line) => line !== null);

  const text = lines.join('\n');
  const html = lines
    .map((line) => line.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'))
    .join('<br>\n');

  return { fullSubject, text, html, typeLabel };
}

router.get('/status', authMiddleware, (_req, res) => {
  const configured = isMailConfigured();
  const port = Number(process.env.FEEDBACK_SMTP_PORT || 587);
  const portWarning = [110, 995, 993].includes(port)
    ? `端口 ${port} 为收件（POP3/IMAP）端口，发信请改用 587 或 465`
    : null;

  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'feedback-sync',
      hypothesisId: 'H-stale',
      location: 'feedback.js:status',
      message: 'feedback status queried',
      data: { configured, port, portWarning: !!portWarning, host: process.env.FEEDBACK_SMTP_HOST || null },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  res.json({
    configured,
    recipient: getRecipient(),
    maxFiles: MAX_FILES,
    maxFileSizeMb: MAX_FILE_SIZE / (1024 * 1024),
    portWarning,
  });
});

router.post('/send', authMiddleware, upload.array('attachments', MAX_FILES), async (req, res) => {
  const { type, subject, content, contact, appVersion } = req.body || {};
  const files = req.files || [];

  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'feedback-v2',
      hypothesisId: 'H-smtp',
      location: 'feedback.js:send:entry',
      message: 'feedback send requested',
      data: {
        configured: isMailConfigured(),
        fileCount: files.length,
        contentLen: (content || '').length,
        type: type || null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  if (!content || String(content).trim().length < 10) {
    return res.status(400).json({ error: '详细描述至少 10 个字' });
  }

  const row = db.findUser({ id: req.user.id });
  const user = {
    username: req.user.username,
    displayName: row?.display_name || req.user.username,
  };

  const { fullSubject, text, html } = buildEmailBody({
    type, subject, content, contact, user, appVersion,
  });

  const archivePayload = {
    type,
    subject,
    content,
    contact,
    appVersion,
    username: user.username,
    displayName: user.displayName,
    recipient: getRecipient(),
    submittedAt: new Date().toISOString(),
    attachmentNames: files.map((f) => f.originalname),
  };

  let archiveDir = null;
  try {
    archiveDir = saveFeedbackArchive(archivePayload, files);
  } catch (err) {
    console.warn('[feedback] archive save failed:', err.message);
  }

  if (!isMailConfigured()) {
    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'feedback-v2',
        hypothesisId: 'H-smtp',
        location: 'feedback.js:send:not-configured',
        message: 'smtp not configured',
        data: { archiveDir },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
    return res.status(503).json({
      error: '邮件服务未配置。请在「设置 → 反馈邮件 SMTP」中填写邮箱信息。',
      archiveDir,
      recipient: getRecipient(),
    });
  }

  try {
    const replyTo = contact && contact.includes('@') ? contact : undefined;
    const result = await sendFeedbackEmail({
      subject: fullSubject,
      text,
      html,
      replyTo,
      attachments: files.map((f) => ({
        filename: f.originalname,
        content: f.buffer,
        contentType: f.mimetype,
      })),
    });

    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'feedback-v2',
        hypothesisId: 'H-smtp',
        location: 'feedback.js:send:success',
        message: 'email sent',
        data: {
          messageId: result.messageId,
          acceptedCount: (result.accepted || []).length,
          attachmentCount: files.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    res.json({
      ok: true,
      message: `邮件已发送至 ${result.to}`,
      messageId: result.messageId,
      archiveDir,
    });
  } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'feedback-v2',
        hypothesisId: 'H-smtp',
        location: 'feedback.js:send:error',
        message: 'email send failed',
        data: { code: err.code || null, errMsg: err.message?.slice(0, 200), archiveDir },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion

    console.error('[feedback] send failed:', err.message);
    const hint = mapSmtpErrorHint(err);
    res.status(500).json({
      error: `邮件发送失败：${hint}`,
      archiveDir,
      hint: '反馈内容已保存到本地，请在设置中检查 SMTP 配置',
    });
  }
});

module.exports = router;
