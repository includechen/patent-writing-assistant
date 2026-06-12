import { useState, useEffect, useRef } from 'react';
import { useI18n } from '../i18n';

export default function UpdateBanner() {
  const { t } = useI18n();
  const [status, setStatus] = useState(null);
  const bannerRef = useRef(null);
  const actionsRef = useRef(null);

  useEffect(() => {
    if (!window.patentApp?.onUpdateStatus) return undefined;
    window.patentApp.getUpdateStatus?.().then(setStatus).catch(() => {});
    return window.patentApp.onUpdateStatus((next) => setStatus(next));
  }, []);

  useEffect(() => {
    if (!status?.enabled) return;
    if (!['available', 'downloading', 'downloaded', 'error'].includes(status.status)) return;
    const raf = requestAnimationFrame(() => {
      const actions = actionsRef.current;
      const root = document.documentElement;
      const actionsRect = actions?.getBoundingClientRect();
      const winW = window.innerWidth;
      const insetRight = parseFloat(
        getComputedStyle(root).getPropertyValue('--electron-titlebar-right') || '0',
      );
      const overlapPx = actionsRect ? Math.max(0, actionsRect.right - (winW - insetRight)) : null;
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'banner-layout-v1',
          hypothesisId: 'H1-H5',
          location: 'UpdateBanner.jsx:layoutMeasure',
          message: 'update banner layout metrics',
          data: { status: status.status, overlapPx },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
    });
    return () => cancelAnimationFrame(raf);
  }, [status]);

  if (!status?.enabled) return null;
  if (['installing', 'checking', 'downloading'].includes(status.status)) return null;
  if (!['available', 'downloading', 'downloaded', 'error'].includes(status.status)) return null;

  const handleInstall = () => window.patentApp?.installUpdate?.();
  const handleDownload = () => window.patentApp?.downloadUpdate?.();
  const handleRetry = () => window.patentApp?.checkUpdate?.();
  const handleOpenBrowser = () => window.patentApp?.openUpdateRelease?.();
  const handleDismiss = () => window.patentApp?.dismissUpdate?.();

  let message = '';
  if (status.status === 'available') {
    message = t('update.availableHint', { version: status.version || '' });
  } else if (status.status === 'downloading') {
    message = t('update.downloading', { percent: status.percent || 0 });
  } else if (status.status === 'downloaded') {
    message = t('update.ready', { version: status.version || '' });
  } else if (status.status === 'error') {
    message = t('update.error', { message: status.error || '' });
  }

  const percent = Math.max(0, Math.min(100, status.percent || 0));

  return (
    <div ref={bannerRef} className={`update-banner update-banner-${status.status}`}>
      <div className="update-banner-body">
        <span className="update-banner-text">{message}</span>
        {status.status === 'downloading' && (
          <div className="update-banner-progress-track" aria-hidden>
            <div className="update-banner-progress-fill" style={{ width: `${percent}%` }} />
          </div>
        )}
      </div>
      <div ref={actionsRef} className="update-banner-actions">
        {status.status === 'available' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleDownload}>
            {t('update.download')}
          </button>
        )}
        {status.status === 'downloaded' && (
          <button type="button" className="btn btn-primary btn-sm" onClick={handleInstall}>
            {t('update.startInstall')}
          </button>
        )}
        {status.status === 'error' && (
          <>
            <button type="button" className="btn btn-primary btn-sm" onClick={handleRetry}>
              {t('update.retry')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={handleOpenBrowser}>
              {t('update.openInBrowser')}
            </button>
          </>
        )}
        <button type="button" className="btn btn-secondary btn-sm" onClick={handleDismiss}>
          {t('update.dismiss')}
        </button>
      </div>
    </div>
  );
}
