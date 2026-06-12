import { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../api';
import { smtpConfigStore } from '../smtpConfigStore';
import { useI18n } from '../i18n';
import ExampleTable from './ExampleTable';

import { AUTHOR_EMAIL, getAuthorName } from '../authorInfo';
const MAX_FILES = 5;
const MAX_FILE_MB = 10;

const FEEDBACK_TYPE_KEYS = ['bug', 'suggestion', 'feature', 'other'];

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageFile(file) {
  return file.type.startsWith('image/');
}

function displayRecipient(mailStatus) {
  return mailStatus?.recipient || AUTHOR_EMAIL;
}

export default function FeedbackPage({ visible = true }) {
  const { t, tr, locale } = useI18n();
  const [type, setType] = useState('bug');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [contact, setContact] = useState('');
  const [appVersion, setAppVersion] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [previews, setPreviews] = useState([]);
  const [mailStatus, setMailStatus] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const fileInputRef = useRef(null);

  const typeLabel = (value) => tr(`feedback.types.${value}`) || value;

  const refreshMailStatus = useCallback((reason) => {
    api.getFeedbackStatus()
      .then((status) => {
        setMailStatus(status);
        // #region agent log
        fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
          body: JSON.stringify({
            sessionId: '36d6f3',
            runId: 'i18n-verify',
            hypothesisId: 'H-stale',
            location: 'FeedbackPage.jsx:refreshMailStatus',
            message: 'mail status refreshed',
            data: { reason, configured: status.configured, locale },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
        // #endregion
      })
      .catch(() => setMailStatus({ configured: false, recipient: AUTHOR_EMAIL }));
  }, [locale]);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then((h) => setAppVersion(h.version || ''))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!visible) return;
    refreshMailStatus('pageVisible');
  }, [visible, refreshMailStatus]);

  useEffect(() => {
    return smtpConfigStore.subscribe(() => {
      if (visible) refreshMailStatus('smtpSaved');
    });
  }, [visible, refreshMailStatus]);

  useEffect(() => {
    const urls = attachments.map((f) => (isImageFile(f) ? URL.createObjectURL(f) : null));
    setPreviews(urls);
    return () => urls.forEach((u) => u && URL.revokeObjectURL(u));
  }, [attachments]);

  const validate = () => {
    if (!content.trim()) {
      setError(t('feedback.errDescriptionRequired'));
      return false;
    }
    if (content.trim().length < 10) {
      setError(t('feedback.errDescriptionTooShort'));
      return false;
    }
    setError('');
    return true;
  };

  const handlePickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    if (!picked.length) return;
    const merged = [...attachments, ...picked].slice(0, MAX_FILES);
    const oversized = merged.find((f) => f.size > MAX_FILE_MB * 1024 * 1024);
    if (oversized) {
      setError(t('feedback.errFileTooLarge', { maxMb: MAX_FILE_MB, name: oversized.name }));
      return;
    }
    setAttachments(merged);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if (!validate()) return;
    setSending(true);
    setMessage('');
    setError('');

    const form = new FormData();
    form.append('type', type);
    form.append('subject', subject);
    form.append('content', content);
    form.append('contact', contact);
    form.append('appVersion', appVersion);
    attachments.forEach((f) => form.append('attachments', f, f.name));

    try {
      const result = await api.sendFeedback(form);
      setMessage(result.message || t('feedback.successEmailSent'));
      setSubject('');
      setContent('');
      setContact('');
      setAttachments([]);
    } catch (e) {
      setError(e.message || t('feedback.errSendFailed'));
    } finally {
      setSending(false);
    }
  };

  const handleCopy = async () => {
    if (!validate()) return;
    const label = typeLabel(type);
    const subjectSuffix = subject ? ` - ${subject}` : '';
    const text = [
      t('feedback.copyRecipient', { email: mailStatus?.recipient || AUTHOR_EMAIL }),
      t('feedback.copySubject', { type: label, subject: subjectSuffix }),
      t('feedback.copyUser', { name: t('appName') }),
      contact ? t('feedback.copyContact', { contact }) : null,
      '',
      content.trim(),
      attachments.length
        ? t('feedback.copyAttachments', { names: attachments.map((f) => f.name).join('、') })
        : null,
    ].filter(Boolean).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setMessage(t('feedback.successCopied'));
      setError('');
    } catch {
      setError(t('feedback.errCopyFailed'));
    }
  };

  const tips = tr('feedback.tips') || [];
  const asideExampleRows = tr('feedback.asideExampleRows') || [];
  const asideTypeRows = tr('feedback.asideTypeRows') || [];

  return (
    <div className="page feedback-page">
      <div className="feedback-layout">
        <div className="feedback-main">
      <h2 style={{ marginBottom: 8 }}>{t('feedback.title')}</h2>
      <p className="feedback-intro">
        {t('feedback.intro', { maxFiles: MAX_FILES, maxFileMb: MAX_FILE_MB })}
      </p>

      {mailStatus && !mailStatus.configured && (
        <div className="feedback-warn">{t('feedback.smtpNotConfigured')}</div>
      )}

      {mailStatus?.portWarning && (
        <div className="feedback-warn">
          {mailStatus.portWarning}{t('feedback.portWarningSuffix')}
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}
      {message && <div className="feedback-success">{message}</div>}

      <section className="settings-section feedback-card">
        <div className="feedback-author">
          <div className="feedback-author-row">
            <span className="feedback-author-label">{t('feedback.authorLabel')}</span>
            <span>{getAuthorName(locale)}</span>
          </div>
          <div className="feedback-author-row">
            <span className="feedback-author-label">{t('feedback.authorEmailLabel')}</span>
            <a className="feedback-email-link" href={`mailto:${displayRecipient(mailStatus)}`}>
              {displayRecipient(mailStatus)}
            </a>
          </div>
        </div>

        <div className="form-group">
          <label>{t('feedback.typeLabel')}</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className="form-select">
            {FEEDBACK_TYPE_KEYS.map((key) => (
              <option key={key} value={key}>{typeLabel(key)}</option>
            ))}
          </select>
        </div>

        <div className="form-group">
          <label>{t('feedback.subject')}</label>
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('feedback.subjectPh')}
            maxLength={120}
          />
        </div>

        <div className="form-group">
          <label>{t('feedback.description')}</label>
          <textarea
            className="feedback-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={t('feedback.descriptionPh')}
            rows={8}
          />
        </div>

        <div className="form-group">
          <label>{t('feedback.attachments')}</label>
          <div className="feedback-upload-zone">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="feedback-file-input"
              onChange={handlePickFiles}
              accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.pdf,.zip,.rar,.7z,.log,.txt,.doc,.docx,.xlsx,.pptx,.mp4,.mov"
            />
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachments.length >= MAX_FILES}
            >
              {t('feedback.selectFile')}
            </button>
            <span className="feedback-upload-hint">
              {t('feedback.uploadHint', { count: attachments.length, max: MAX_FILES })}
            </span>
          </div>

          {attachments.length > 0 && (
            <ul className="feedback-attachment-list">
              {attachments.map((file, i) => (
                <li key={`${file.name}-${i}`} className="feedback-attachment-item">
                  {previews[i] ? (
                    <img src={previews[i]} alt={file.name} className="feedback-thumb" />
                  ) : (
                    <span className="feedback-file-icon">📎</span>
                  )}
                  <div className="feedback-file-meta">
                    <span className="feedback-file-name" title={file.name}>{file.name}</span>
                    <span className="feedback-file-size">{formatSize(file.size)}</span>
                  </div>
                  <button
                    type="button"
                    className="feedback-remove-btn"
                    onClick={() => removeAttachment(i)}
                    title={t('feedback.removeAttachment')}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-group">
          <label>{t('feedback.contact')}</label>
          <input
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder={t('feedback.contactPh')}
          />
        </div>

        <div className="feedback-actions">
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSend}
            disabled={sending}
          >
            {sending ? t('feedback.sending') : t('feedback.submit')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleCopy}>
            {t('feedback.copy')}
          </button>
        </div>
      </section>
        </div>

        <aside className="settings-aside feedback-aside">
          <div className="settings-aside-card">
            <h3>{t('feedback.asideTitle')}</h3>
            <p className="settings-aside-intro">{t('feedback.asideIntro')}</p>
          </div>

          <div className="settings-aside-card">
            <h4>{t('feedback.asideExampleTitle')}</h4>
            <ExampleTable rows={asideExampleRows} />
          </div>

          <div className="settings-aside-card">
            <h4>{t('feedback.asideTypeTitle')}</h4>
            <ExampleTable rows={asideTypeRows} />
          </div>

          <div className="settings-aside-card">
            <h4>{t('feedback.tipsTitle')}</h4>
            <ul className="aside-tips-list">
              {tips.map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
