import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../i18n';

const AUTO_ID = 'auto';
const CHAT_MAX_FILES = 5;
const CHAT_MAX_FILE_MB = 10;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ChatComposer({
  input,
  onInputChange,
  attachments = [],
  previews = [],
  onAddFiles,
  onRemoveAttachment,
  disabled = false,
  conversationKey = '',
  onSend,
  onFocusRequestRef,
  catalog = [],
  autoEnabled = true,
  composerModel = AUTO_ID,
  onComposerModelChange,
}) {
  const { t } = useI18n();
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [menuStyle, setMenuStyle] = useState(null);
  const fileInputRef = useRef(null);
  const textareaRef = useRef(null);
  const modelBtnRef = useRef(null);
  const modelMenuRef = useRef(null);

  const manualCatalog = useMemo(
    () => catalog.filter((m) => m.id !== AUTO_ID && !m.isAuto),
    [catalog],
  );

  const autoInCatalog = useMemo(
    () => catalog.some((m) => m.id === AUTO_ID || m.isAuto),
    [catalog],
  );

  const filteredModels = useMemo(() => {
    const q = modelSearch.trim().toLowerCase();
    if (!q) return manualCatalog;
    return manualCatalog.filter(
      (m) => m.name.toLowerCase().includes(q) || (m.provider || '').toLowerCase().includes(q),
    );
  }, [manualCatalog, modelSearch]);

  const modelLabel = catalog.find((m) => m.id === composerModel)?.name
    || (composerModel === AUTO_ID ? 'AUTO' : composerModel);

  const closeModelMenu = useCallback(() => {
    setModelOpen(false);
    setModelSearch('');
    setMenuStyle(null);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const btn = modelBtnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openDown = spaceBelow >= 180 || spaceBelow >= spaceAbove;
    const maxH = Math.min(320, openDown ? spaceBelow : spaceAbove);
    const style = openDown
      ? {
        position: 'fixed',
        left: Math.max(12, rect.left),
        top: rect.bottom + 8,
        width: Math.max(300, Math.min(360, rect.width + 120)),
        maxHeight: maxH,
        zIndex: 10050,
      }
      : {
        position: 'fixed',
        left: Math.max(12, rect.left),
        bottom: window.innerHeight - rect.top + 8,
        width: Math.max(300, Math.min(360, rect.width + 120)),
        maxHeight: maxH,
        zIndex: 10050,
      };
    setMenuStyle(style);
    // #region agent log
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'composer-menu-fix-v2',
        hypothesisId: 'H-menu-blocks-input',
        location: 'ChatComposer.jsx:updateMenuPosition',
        message: 'menu positioned',
        data: { openDown, maxH, rect: { top: rect.top, bottom: rect.bottom }, conversationKey },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
    // #endregion
  }, [conversationKey]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  useEffect(() => {
    closeModelMenu();
  }, [conversationKey, closeModelMenu]);

  useEffect(() => {
    if (!onFocusRequestRef) return undefined;
    onFocusRequestRef.current = () => {
      closeModelMenu();
      textareaRef.current?.focus({ preventScroll: true });
    };
    return () => {
      if (onFocusRequestRef) onFocusRequestRef.current = null;
    };
  }, [onFocusRequestRef, closeModelMenu]);

  useEffect(() => {
    if (!modelOpen) return undefined;
    updateMenuPosition();
    const onReflow = () => updateMenuPosition();
    window.addEventListener('resize', onReflow);
    window.addEventListener('scroll', onReflow, true);
    return () => {
      window.removeEventListener('resize', onReflow);
      window.removeEventListener('scroll', onReflow, true);
    };
  }, [modelOpen, updateMenuPosition]);

  useEffect(() => {
    if (!modelOpen) return undefined;
    const onDocClick = (e) => {
      const inBtn = modelBtnRef.current?.contains(e.target);
      const inMenu = modelMenuRef.current?.contains(e.target);
      if (!inBtn && !inMenu) setModelOpen(false);
    };
    const onEsc = (e) => { if (e.key === 'Escape') setModelOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onEsc);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onEsc);
    };
  }, [modelOpen, closeModelMenu]);

  const addFilesWithLimit = (picked) => {
    if (!picked.length) return;
    const merged = [...attachments, ...picked].slice(0, CHAT_MAX_FILES);
    const oversized = merged.find((f) => f.size > CHAT_MAX_FILE_MB * 1024 * 1024);
    if (oversized) {
      window.alert(t('chat.errFileTooLarge', { maxMb: CHAT_MAX_FILE_MB, name: oversized.name }));
      return;
    }
    onAddFiles(merged);
  };

  const handlePickFiles = (e) => {
    addFilesWithLimit(Array.from(e.target.files || []));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedFiles = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const f = item.getAsFile();
        if (f) pastedFiles.push(f);
      }
    }
    if (pastedFiles.length) {
      e.preventDefault();
      addFilesWithLimit(pastedFiles);
    }
  };

  const pickModel = (id) => {
    onComposerModelChange?.(id);
    closeModelMenu();
    textareaRef.current?.focus({ preventScroll: true });
  };

  const toggleModelMenu = () => {
    setModelOpen((open) => {
      const next = !open;
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'model-menu-fix',
          hypothesisId: 'H-showAuto-undefined',
          location: 'ChatComposer.jsx:toggleModelMenu',
          message: 'model menu toggle',
          data: { next, autoEnabled, catalogLen: manualCatalog.length },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      if (next) setTimeout(updateMenuPosition, 0);
      return next;
    });
  };

  const canSend = !disabled && (input.trim() || attachments.length);

  const modelMenu = modelOpen && menuStyle && createPortal(
    <div
      ref={modelMenuRef}
      className="composer-model-menu composer-model-menu-portal"
      style={menuStyle}
      role="listbox"
      aria-label={t('chat.modelMenuLabel')}
    >
      <input
        className="composer-model-search"
        value={modelSearch}
        onChange={(e) => setModelSearch(e.target.value)}
        placeholder={t('chat.modelSearchPh')}
      />
      <div className="composer-model-list">
        {autoInCatalog && (
          <>
            <button
              type="button"
              className={`composer-model-option ${composerModel === AUTO_ID ? 'active' : ''}`}
              onClick={() => pickModel(AUTO_ID)}
            >
              <div className="composer-model-option-main">
                <span className="composer-model-option-name">AUTO</span>
                <span className="composer-model-option-hint">{t('chat.modelAutoHint')}</span>
              </div>
              {composerModel === AUTO_ID && <span className="composer-model-check">✓</span>}
            </button>
            {manualCatalog.length > 0 && <div className="composer-model-divider" />}
          </>
        )}
        {filteredModels.map((m) => (
          <button
            key={m.id}
            type="button"
            className={`composer-model-option ${composerModel === m.id ? 'active' : ''}`}
            onClick={() => pickModel(m.id)}
          >
            <div className="composer-model-option-main">
              <span className="composer-model-option-name">{m.name}</span>
              {m.provider && (
                <span className="composer-model-option-hint">{m.provider}</span>
              )}
            </div>
            {composerModel === m.id && <span className="composer-model-check">✓</span>}
          </button>
        ))}
        {filteredModels.length === 0 && modelSearch.trim() && (
          <div className="composer-model-empty">{t('chat.modelSearchEmpty')}</div>
        )}
        {filteredModels.length === 0 && !modelSearch.trim() && manualCatalog.length === 0 && !autoInCatalog && (
          <div className="composer-model-empty">{t('chat.modelSyncHint')}</div>
        )}
      </div>
    </div>,
    document.body,
  );

  return (
    <div className="composer">
      <div className={`composer-box ${disabled ? 'is-disabled' : ''}`}>
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((file, i) => (
              <div key={`${file.name}-${i}`} className="composer-attach-chip">
                {previews[i] ? (
                  <img src={previews[i]} alt="" className="composer-attach-thumb" />
                ) : (
                  <span className="composer-attach-file-icon" aria-hidden="true">📄</span>
                )}
                <span className="composer-attach-name" title={file.name}>{file.name}</span>
                <button
                  type="button"
                  className="composer-attach-remove"
                  onClick={() => onRemoveAttachment(i)}
                  title={t('chat.removeAttachment')}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="composer-textarea"
          value={input}
          onChange={(e) => {
            onInputChange(e.target.value);
            // #region agent log
            fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
              body: JSON.stringify({
                sessionId: '36d6f3',
                runId: 'composer-input-fix',
                hypothesisId: 'H-textarea-onChange',
                location: 'ChatComposer.jsx:textarea:onChange',
                message: 'textarea input changed',
                data: { conversationKey, len: e.target.value.length },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }}
          onPaste={handlePaste}
          onFocus={() => {
            closeModelMenu();
            // #region agent log
            fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
              body: JSON.stringify({
                sessionId: '36d6f3',
                runId: 'composer-input-fix',
                hypothesisId: 'H-textarea-focus',
                location: 'ChatComposer.jsx:textarea:onFocus',
                message: 'textarea focused',
                data: { conversationKey, disabled, modelWasOpen: modelOpen },
                timestamp: Date.now(),
              }),
            }).catch(() => {});
            // #endregion
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={t('chat.inputPh')}
          rows={1}
        />

        <div className="composer-toolbar">
          <button
            ref={modelBtnRef}
            type="button"
            className={`composer-model-btn ${modelOpen ? 'open' : ''}`}
            onClick={toggleModelMenu}
            disabled={disabled}
            aria-expanded={modelOpen}
            aria-haspopup="listbox"
          >
            <span className="composer-model-label">{modelLabel}</span>
            <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" className={modelOpen ? 'chevron-up' : ''}>
              <path fill="currentColor" d="M7 10l5 5 5-5H7z" />
            </svg>
          </button>

          <div className="composer-toolbar-right">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="chat-file-input"
              onChange={handlePickFiles}
              accept="image/*,.png,.jpg,.jpeg,.gif,.webp,.bmp,.pdf,.zip,.rar,.7z,.log,.txt,.md,.json,.xml,.doc,.docx"
            />
            <button
              type="button"
              className="composer-icon-btn"
              onClick={() => fileInputRef.current?.click()}
              disabled={disabled || attachments.length >= CHAT_MAX_FILES}
              title={t('chat.selectFile')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path
                  fill="currentColor"
                  d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 1 1-2 0V6h-1.5v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6H16.5z"
                />
              </svg>
            </button>
            <button
              type="button"
              className="composer-send-btn"
              onClick={onSend}
              disabled={!canSend}
              title={t('chat.send')}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="currentColor" d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8-8-8z" transform="rotate(-90 12 12)" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      {modelMenu}
      <p className="composer-hint">
        {t('chat.composerHint', { count: attachments.length, max: CHAT_MAX_FILES })}
        {' · '}
        {t('chat.modelSyncHint')}
      </p>
    </div>
  );
}
