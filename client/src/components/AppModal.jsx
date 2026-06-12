import { useEffect } from 'react';

export default function AppModal({
  open,
  title,
  message,
  detail,
  icon = 'info',
  buttons = [],
  onAction,
  onClose,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && onClose) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const iconChar = { info: 'ℹ️', success: '✅', warning: '⚠️', error: '❌' }[icon] || 'ℹ️';

  return (
    <div className="app-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="app-modal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="app-modal-header">
          <span className="app-modal-icon" aria-hidden>{iconChar}</span>
          <h2 id="app-modal-title" className="app-modal-title">{title}</h2>
        </div>
        {message && <p className="app-modal-message">{message}</p>}
        {detail && <pre className="app-modal-detail">{detail}</pre>}
        <div className="app-modal-actions">
          {buttons.map((btn) => (
            <button
              key={btn.id}
              type="button"
              className={`btn ${btn.primary ? 'btn-primary' : 'btn-secondary'} btn-sm`}
              onClick={() => onAction?.(btn.id)}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
