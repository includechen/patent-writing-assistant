import { useState, useEffect, useCallback } from 'react';
import { api } from '../api';
import { smtpConfigStore } from '../smtpConfigStore';
import { useI18n, changeLocale } from '../i18n';
import ExampleTable from './ExampleTable';
import ModelPicker from './ModelPicker';
import { llmConfigStore } from '../llmConfig';

export default function SettingsPage() {
  const { t, tr, locale: uiLocale } = useI18n();
  const [settings, setSettings] = useState(null);
  const [apiBase, setApiBase] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [selectedModels, setSelectedModels] = useState([]);
  const [modelCatalog, setModelCatalog] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [deps, setDeps] = useState(null);
  const [depsLoading, setDepsLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [installLog, setInstallLog] = useState([]);

  const [smtp, setSmtp] = useState(null);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState('587');
  const [smtpSecure, setSmtpSecure] = useState(false);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpPass, setSmtpPass] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpTo, setSmtpTo] = useState('');
  const [smtpSaving, setSmtpSaving] = useState(false);
  const [smtpTlsInsecure, setSmtpTlsInsecure] = useState(false);

  const [customModels, setCustomModels] = useState([]);
  const [newModelId, setNewModelId] = useState('');
  const [newModelProvider, setNewModelProvider] = useState('');
  const [updateVersion, setUpdateVersion] = useState('');

  const syncCatalogFromSettings = (s) => {
    const manual = (s.catalog || []).filter((m) => !m.isAuto && m.id !== 'auto');
    setCustomModels(manual);
    setModelCatalog(s.catalog || []);
  };

  const loadDeps = useCallback(async () => {
    setDepsLoading(true);
    try {
      const status = await api.getDepsStatus();
      setDeps(status);
    } catch (e) {
      setDeps(null);
    } finally {
      setDepsLoading(false);
    }
  }, []);

  useEffect(() => {
    api.getLlmSettings()
      .then((s) => {
        setSettings(s);
        setApiBase(s.apiBase || '');
        syncCatalogFromSettings(s);
        setSelectedModels(s.selectedModels?.length ? s.selectedModels : (s.model ? [s.model] : []));
      })
      .catch((e) => setError(e.message));
    loadDeps();
    api.getSmtpSettings()
      .then((s) => {
        setSmtp(s);
        setSmtpHost(s.host || '');
        setSmtpPort(s.port || '587');
        setSmtpSecure(!!s.secure);
        setSmtpUser(s.user || '');
        setSmtpFrom(s.from || '');
        setSmtpTo(s.to || '');
        setSmtpTlsInsecure(!!s.tlsInsecure);
      })
      .catch(() => {});
    api.getUpdateSettings()
      .then((s) => {
        setUpdateVersion(s.currentVersion || window.patentApp?.version || '');
      })
      .catch(() => {
        setUpdateVersion(window.patentApp?.version || '');
      });
  }, [loadDeps]);

  const handleAddModel = () => {
    const id = newModelId.trim();
    if (!id) return;
    if (customModels.some((m) => m.id === id)) {
      setError(t('settings.modelDuplicate'));
      return;
    }
    const entry = {
      id,
      name: id,
      provider: newModelProvider.trim(),
    };
    const next = [...customModels, entry];
    setCustomModels(next);
    setModelCatalog([
      { id: 'auto', name: 'AUTO', isAuto: true, tags: ['Auto'] },
      ...next,
    ]);
    setNewModelId('');
    setNewModelProvider('');
    setError('');
  };

  const handleRemoveModel = (id) => {
    const next = customModels.filter((m) => m.id !== id);
    setCustomModels(next);
    setModelCatalog([
      { id: 'auto', name: 'AUTO', isAuto: true, tags: ['Auto'] },
      ...next,
    ]);
    setSelectedModels((prev) => prev.filter((mid) => mid === 'auto' || next.some((m) => m.id === mid)));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      if (!apiBase.trim()) {
        setError(t('settings.apiBaseRequired'));
        return;
      }
      if (!customModels.length) {
        setError(t('settings.catalogRequired'));
        return;
      }
      if (!selectedModels.length) {
        setError(t('settings.modelsRequired'));
        return;
      }
      await api.updateLlmSettings({
        apiBase: apiBase.trim(),
        apiKey: apiKey || undefined,
        selectedModels,
        catalog: customModels,
      });
      setMessage(t('settings.configSaved'));
      setApiKey('');
      const s = await api.getLlmSettings();
      setSettings(s);
      setApiBase(s.apiBase || '');
      syncCatalogFromSettings(s);
      setSelectedModels(s.selectedModels?.length ? s.selectedModels : []);
      llmConfigStore.notifyUpdated({ saved: true });
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSmtp = async () => {
    setSmtpSaving(true);
    setError('');
    setMessage('');
    try {
      await api.updateSmtpSettings({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        user: smtpUser,
        pass: smtpPass || undefined,
        from: smtpFrom,
        to: smtpTo,
        tlsInsecure: smtpTlsInsecure,
      });
      setMessage(t('settings.smtpSaved'));
      setSmtpPass('');
      const s = await api.getSmtpSettings();
      setSmtp(s);
      smtpConfigStore.notifyUpdated();
    } catch (e) {
      setError(e.message);
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleEnsureDeps = async () => {
    setInstalling(true);
    setInstallLog([t('settings.installStart')]);
    try {
      const result = await api.ensureDeps();
      setDeps(result);
      setInstallLog(result.log || []);
      if (result.ready) {
        setMessage(t('settings.depsReadyMsg'));
      } else {
        const missing = (result.items || []).filter((i) => i.required && !i.ok).map((i) => i.name);
        setError(t('settings.depsMissing', { items: missing.join('、') }));
      }
    } catch (e) {
      setError(e.message);
      setInstallLog((prev) => [...prev, `❌ ${e.message}`]);
    } finally {
      setInstalling(false);
    }
  };

  const handleLocaleChange = async (nextLocale) => {
    await changeLocale(nextLocale);
    setMessage(t('settings.languageDesc'));
  };

  const handleCheckUpdate = () => {
    window.patentApp?.checkUpdate?.({ autoFlow: true });
  };

  const apiNotes = tr('settings.apiNotes') || [];
  const asideSmtpRows = tr('settings.asideSmtpRows') || [];
  const asideLlmRows = tr('settings.asideLlmRows') || [];

  return (
    <div className="page settings-page">
      <div className="settings-layout">
        <div className="settings-main">
      <h2 style={{ marginBottom: 8 }}>{t('settings.title')}</h2>

      {error && <div className="error-msg">{error}</div>}
      {message && <div style={{ color: 'var(--accent)', marginBottom: 12 }}>{message}</div>}

      <section className="settings-section">
        <h3>{t('settings.language')}</h3>
        <p className="settings-desc">{t('settings.languageDesc')}</p>
        <div className="feedback-actions" style={{ marginTop: 8 }}>
          <button
            type="button"
            className={`btn ${uiLocale === 'zh' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleLocaleChange('zh')}
          >
            {t('settings.langZh')}
          </button>
          <button
            type="button"
            className={`btn ${uiLocale === 'en' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => handleLocaleChange('en')}
          >
            {t('settings.langEn')}
          </button>
        </div>
      </section>

      <section className="settings-section" style={{ marginTop: 32 }}>
        <h3>{t('settings.updateTitle')}</h3>
        <p className="settings-desc">{t('settings.updateDesc')}</p>
        <p className="settings-desc settings-version">
          {t('settings.updateCurrent', { version: updateVersion || '—' })}
        </p>
        <div className="feedback-actions" style={{ marginTop: 8 }}>
          <button type="button" className="btn btn-primary" onClick={handleCheckUpdate}>
            {t('settings.checkUpdateBtn')}
          </button>
        </div>
      </section>

      <section className="settings-section" style={{ marginTop: 32 }}>
        <h3>{t('settings.depsTitle')}</h3>
        <p className="settings-desc">{t('settings.depsDesc')}</p>

        {depsLoading && <p className="settings-desc">{t('settings.depsChecking')}</p>}

        {!depsLoading && deps && (
          <>
            <div className={`deps-banner ${deps.ready ? 'ready' : 'warn'}`}>
              {deps.ready ? t('settings.depsReady') : t('settings.depsNotReady')}
            </div>
            <ul className="deps-list">
              {deps.items.map((item) => (
                <li key={item.id} className={item.ok ? 'ok' : 'fail'}>
                  <span className="deps-icon">{item.ok ? '✓' : '✗'}</span>
                  <div>
                    <strong>{item.name}</strong>
                    {item.required && <span className="deps-tag">{t('settings.required')}</span>}
                    <div className="deps-detail">{item.detail}</div>
                    {item.hint && !item.ok && <div className="deps-hint">{item.hint}</div>}
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleEnsureDeps}
              disabled={installing}
              style={{ width: 'auto', marginTop: 8 }}
            >
              {installing ? t('settings.installing') : t('settings.installBtn')}
            </button>
            {installLog.length > 0 && (
              <pre className="deps-log">{installLog.join('\n')}</pre>
            )}
          </>
        )}
      </section>

      <section className="settings-section" style={{ marginTop: 32 }}>
        <h3>{t('settings.smtpTitle')}</h3>
        <p className="settings-desc">
          {t('settings.smtpDesc')}
          {smtp?.configured ? (
            <span style={{ color: 'var(--accent)' }}>{t('settings.smtpConfigured')}</span>
          ) : (
            <span style={{ color: 'var(--danger)' }}>{t('settings.smtpNotConfigured')}</span>
          )}
        </p>

        <div className="form-group">
          <label>{t('settings.smtpHost')}</label>
          <input
            value={smtpHost}
            onChange={(e) => setSmtpHost(e.target.value)}
            placeholder={t('settings.smtpHostPh')}
          />
        </div>

        {['995', '993', '110'].includes(String(smtpPort)) && (
          <div className="feedback-warn" style={{ marginBottom: 12 }}>
            {t('settings.smtpPortWarn', { port: smtpPort })}
          </div>
        )}

        <div className="form-group" style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 1 }}>
            <label>{t('settings.smtpPort')}</label>
            <input
              value={smtpPort}
              onChange={(e) => {
                const p = e.target.value;
                setSmtpPort(p);
                if (p === '587' || p === '25') setSmtpSecure(false);
                if (p === '465') setSmtpSecure(true);
              }}
              placeholder={t('settings.smtpPortPh')}
            />
          </div>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', paddingBottom: 4 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={smtpSecure}
                onChange={(e) => setSmtpSecure(e.target.checked)}
              />
              {t('settings.smtpSslTls')}
            </label>
          </div>
        </div>

        <div className="form-group">
          <label>{t('settings.smtpUser')}</label>
          <input
            value={smtpUser}
            onChange={(e) => setSmtpUser(e.target.value)}
            placeholder={t('settings.smtpUserPh')}
          />
        </div>

        <div className="form-group">
          <label>
            {t('settings.smtpPass')}
            {smtp?.passSet && ` ${t('settings.smtpPassSet')}`}
          </label>
          <p className="field-hint">{t('settings.smtpPassHint')}</p>
          <input
            type="password"
            value={smtpPass}
            onChange={(e) => setSmtpPass(e.target.value)}
            placeholder={t('settings.smtpPassPh')}
          />
        </div>

        <div className="form-group">
          <label>{t('settings.smtpFrom')}</label>
          <input
            value={smtpFrom}
            onChange={(e) => setSmtpFrom(e.target.value)}
            placeholder={t('settings.smtpFromPh')}
          />
        </div>

        <div className="form-group">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={smtpTlsInsecure}
              onChange={(e) => setSmtpTlsInsecure(e.target.checked)}
            />
            {t('settings.smtpTlsInsecure')}
          </label>
        </div>

        <div className="form-group">
          <label>{t('settings.smtpTo')}</label>
          <input
            value={smtpTo}
            onChange={(e) => setSmtpTo(e.target.value)}
            placeholder={t('settings.smtpToPh')}
          />
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={handleSaveSmtp}
          disabled={smtpSaving}
          style={{ width: 'auto' }}
        >
          {smtpSaving ? t('settings.savingSmtp') : t('settings.saveSmtp')}
        </button>
      </section>

      <section className="settings-section" style={{ marginTop: 32 }}>
        <h3>{t('settings.llmTitle')}</h3>
        <p className="settings-desc">{t('settings.llmDesc')}</p>

        <div className="form-group">
          <label>{t('settings.apiBaseUrl')}</label>
          <p className="field-hint">{t('settings.apiBaseHint')}</p>
          <input
            value={apiBase}
            onChange={(e) => setApiBase(e.target.value)}
            placeholder={t('settings.apiBaseUrlPh')}
          />
        </div>

        <div className="form-group">
          <label>
            {settings?.apiKeySet
              ? t('settings.apiKeyCurrent', { preview: settings.apiKeyPreview })
              : 'API Key'}
          </label>
          <p className="field-hint">{t('settings.apiKeyHint')}</p>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={settings?.apiKeySet ? t('settings.apiKeyPhNew') : t('settings.apiKeyPh')}
          />
        </div>

        <div className="form-group">
          <label>{t('settings.customModelsTitle')}</label>
          <p className="field-hint">{t('settings.customModelsHint')}</p>
          <div className="custom-model-add" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
            <input
              value={newModelId}
              onChange={(e) => setNewModelId(e.target.value)}
              placeholder={t('settings.modelPh')}
              style={{ flex: '1 1 180px' }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
            />
            <input
              value={newModelProvider}
              onChange={(e) => setNewModelProvider(e.target.value)}
              placeholder={t('settings.modelProviderPh')}
              style={{ flex: '1 1 140px' }}
              onKeyDown={(e) => e.key === 'Enter' && handleAddModel()}
            />
            <button type="button" className="btn btn-secondary" onClick={handleAddModel} disabled={!newModelId.trim()}>
              {t('settings.addModel')}
            </button>
          </div>
          {customModels.length > 0 && (
            <ul className="custom-model-list" style={{ marginBottom: 16, paddingLeft: 0, listStyle: 'none' }}>
              {customModels.map((m) => (
                <li key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <code>{m.id}</code>
                  {m.provider && <span className="settings-desc" style={{ margin: 0 }}>{m.provider}</span>}
                  <button type="button" className="btn btn-secondary" style={{ marginLeft: 'auto', padding: '2px 10px' }} onClick={() => handleRemoveModel(m.id)}>
                    {t('settings.removeModel')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="form-group">
          <label>{t('settings.modelsTitle')}</label>
          <ModelPicker
            catalog={modelCatalog}
            selected={selectedModels}
            onChange={setSelectedModels}
            disabled={saving}
          />
        </div>

        <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving} style={{ width: 'auto' }}>
          {saving ? t('settings.savingApi') : t('settings.saveApi')}
        </button>
      </section>

      <div className="settings-note">
        <h4>{t('settings.apiNoteTitle')}</h4>
        <ul>
          {apiNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </div>
        </div>

        <aside className="settings-aside">
          <div className="settings-aside-card">
            <h3>{t('settings.asideTitle')}</h3>
            <p className="settings-aside-intro">{t('settings.asideIntro')}</p>
          </div>

          <div className="settings-aside-card">
            <h4>{t('settings.asideLlmTitle')}</h4>
            <ExampleTable rows={asideLlmRows} />
          </div>

          <div className="settings-aside-card">
            <h4>{t('settings.asideSmtpTitle')}</h4>
            <ExampleTable rows={asideSmtpRows} />
          </div>

          <div className="settings-aside-card settings-aside-tip">
            <p>{t('settings.asideUpdateTip')}</p>
            <p className="settings-aside-more">{t('settings.asideMoreGuide')}</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
