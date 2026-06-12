import { useI18n } from '../i18n';

const AUTO_ID = 'auto';

function modelInitials(name) {
  if (name === 'AUTO') return 'AU';
  const parts = String(name || '').split(/[-_.]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name || 'AI').slice(0, 2).toUpperCase();
}

export default function ModelPicker({ catalog = [], selected = [], onChange, disabled = false }) {
  const { t } = useI18n();

  const autoEntry = catalog.find((m) => m.id === AUTO_ID || m.isAuto);
  const manualCatalog = catalog.filter((m) => m.id !== AUTO_ID && !m.isAuto);
  const autoOn = selected.includes(AUTO_ID);
  const manualSelected = selected.filter((id) => id !== AUTO_ID);

  const toggle = (id) => {
    if (disabled) return;

    if (id === AUTO_ID) {
      if (autoOn) {
        const next = manualSelected.length
          ? manualSelected
          : (manualCatalog[0]?.id ? [manualCatalog[0].id] : []);
        // #region agent log
        if (typeof fetch === 'function') {
          fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
            body: JSON.stringify({
              sessionId: '36d6f3',
              runId: 'model-sync-v4',
              hypothesisId: 'H-auto-uncheck',
              location: 'ModelPicker.jsx:toggle-AUTO',
              message: 'AUTO toggled off',
              data: { prev: selected, next, manualCount: manualSelected.length },
              timestamp: Date.now(),
            }),
          }).catch(() => {});
        }
        // #endregion
        if (next.length) onChange(next);
      } else {
        onChange([AUTO_ID, ...manualSelected]);
      }
      return;
    }

    if (selected.includes(id)) {
      const nextManual = manualSelected.filter((x) => x !== id);
      if (!autoOn && !nextManual.length) return;
      onChange(autoOn ? [AUTO_ID, ...nextManual] : nextManual);
    } else {
      onChange(autoOn ? [AUTO_ID, ...manualSelected, id] : [...manualSelected, id]);
    }
  };

  if (!catalog.length) {
    return <p className="settings-desc">{t('settings.modelsLoading')}</p>;
  }

  const summaryKey = autoOn
    ? (manualSelected.length ? 'settings.modelsAutoWhitelist' : 'settings.modelsAutoFull')
    : 'settings.modelsSelected';

  return (
    <div className="model-picker">
      <p className="field-hint">{t('settings.modelsHint')}</p>

      {autoEntry && (
        <label
          className={`model-card model-card-auto ${autoOn ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
        >
          <input
            type="checkbox"
            checked={autoOn}
            onChange={() => toggle(AUTO_ID)}
            disabled={disabled}
          />
          <div className="model-card-head">
            <span className="model-card-avatar model-card-avatar-auto">AU</span>
            <div>
              <span className="model-card-name">AUTO</span>
              <div className="model-card-auto-desc">{t('settings.autoDesc')}</div>
            </div>
          </div>
          <div className="model-card-tags">
            {autoEntry.tags?.map((tag) => (
              <span key={tag} className="model-tag model-tag-auto">{tag}</span>
            ))}
          </div>
        </label>
      )}

      {autoOn && (
        <p className="model-auto-hint">
          {manualSelected.length
            ? t('settings.autoWhitelistHint')
            : t('settings.autoFullHint')}
        </p>
      )}

      {!autoOn && (
        <p className="model-auto-hint">{t('settings.manualOnlyHint')}</p>
      )}

      <div className="model-picker-grid">
        {manualCatalog.map((m) => {
          const checked = selected.includes(m.id);
          return (
            <label
              key={m.id}
              className={`model-card ${checked ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(m.id)}
                disabled={disabled}
              />
              <div className="model-card-head">
                <span className="model-card-avatar">{modelInitials(m.name)}</span>
                <span className="model-card-name" title={m.name}>{m.name}</span>
              </div>
              {m.provider && (
                <div className="model-card-provider">{m.provider}</div>
              )}
              <div className="model-card-tags">
                {m.tags?.map((tag) => (
                  <span key={tag} className="model-tag">{tag}</span>
                ))}
              </div>
            </label>
          );
        })}
      </div>
      <p className="model-picker-summary">
        {t(summaryKey, { count: manualSelected.length })}
      </p>
    </div>
  );
}
