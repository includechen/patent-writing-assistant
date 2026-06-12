import { useI18n } from '../i18n';

const FLOW_STATUSES = ['checking', 'downloading', 'installing'];

export default function UpdateInstallOverlay({ status }) {
  const { t } = useI18n();
  if (!FLOW_STATUSES.includes(status?.status)) return null;

  const version = status.version || '';
  const phase = status.phase || status.status;
  const percent = status.percent;
  const indeterminate = percent == null || (status.status === 'installing' && phase === 'handoff');

  let titleKey = 'update.installingTitle';
  if (status.status === 'checking') titleKey = 'update.checkingTitle';
  else if (status.status === 'downloading') titleKey = 'update.downloadingTitle';

  const displayPercent = indeterminate
    ? null
    : Math.max(0, Math.min(100, percent || 0));

  return (
    <div className="update-install-overlay" role="status" aria-live="polite">
      <div className="update-install-card">
        <img src="/logo.png" alt="" className="update-install-logo" width="56" height="56" />
        <h2 className="update-install-title">
          {t(titleKey, { version })}
        </h2>
        <p className="update-install-phase">
          {t(`update.phase.${phase}`, { version, percent: displayPercent ?? status.percent ?? 0 })}
        </p>
        <div
          className={`update-install-progress-track${indeterminate ? ' update-install-progress-indeterminate' : ''}`}
          aria-hidden
        >
          <div
            className="update-install-progress-fill"
            style={indeterminate ? undefined : { width: `${displayPercent}%` }}
          />
        </div>
        {!indeterminate && (
          <p className="update-install-percent">{displayPercent}%</p>
        )}
        <p className="update-install-hint">{t(`update.hint.${status.status}`)}</p>
      </div>
    </div>
  );
}
