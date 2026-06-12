import { useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../api';
import { useI18n } from '../i18n';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function snapshotKey(result) {
  if (!result) return '';
  return `${result.dir}|${(result.files || []).map((f) => `${f.path}:${f.size}:${f.modifiedAt}`).join(';')}`;
}

export default function OutputPanel({
  pageVisible = true,
  panelOpen = true,
  refreshKey = 0,
  isGenerating = false,
}) {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const lastSnapshotRef = useRef('');

  const typeLabel = (type) => {
    const key = `output.type${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    const mapped = t(key);
    return mapped !== key ? mapped : t('output.typeFile');
  };

  const load = useCallback(async ({ silent = false, force = false, reason = 'manual' } = {}) => {
    if (!pageVisible) {
      // #region agent log
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'output-panel',
          hypothesisId: 'H1',
          location: 'OutputPanel.jsx:load',
          message: 'load skipped page hidden',
          data: { reason, force },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
      // #endregion
      return;
    }
    if (!silent) setInitialLoading(true);
    try {
      const result = await api.getOutputs();
      const snap = snapshotKey(result);
      const changed = snap !== lastSnapshotRef.current;
      if (force || changed) {
        lastSnapshotRef.current = snap;
        setData(result);
      }
      setError('');
    } catch (e) {
      setError(e.message);
    } finally {
      if (!silent) setInitialLoading(false);
    }
  }, [pageVisible]);

  useEffect(() => {
    if (pageVisible) load({ silent: false, reason: 'pageVisible' });
  }, [pageVisible, load]);

  useEffect(() => {
    if (refreshKey > 0) load({ silent: true, force: true, reason: 'refreshKey' });
  }, [refreshKey, load]);

  useEffect(() => {
    if (!pageVisible || !isGenerating) return undefined;
    load({ silent: true, reason: 'poll-start' });
    const id = setInterval(() => load({ silent: true, reason: 'poll' }), 2500);
    return () => clearInterval(id);
  }, [pageVisible, isGenerating, load]);

  const openFile = async (filePath) => {
    try { await api.openOutputFile(filePath); } catch (e) { setError(e.message); }
  };

  const locateFile = async (filePath) => {
    try { await api.openOutputPath(filePath); } catch (e) { setError(e.message); }
  };

  const openFolder = async () => {
    try { await api.openOutputFolder(); } catch (e) { setError(e.message); }
  };

  const copyDir = async () => {
    if (!data?.dir) return;
    try { await navigator.clipboard.writeText(data.dir); } catch { /* ignore */ }
  };

  const files = (data?.files || []).filter((f) => {
    if (filter === 'all') return true;
    if (filter === 'word') return f.type === 'word';
    return f.type === filter;
  });

  const latestDocxPath = data?.latestDocx?.path;

  const filters = [
    ['all', 'output.filterAll'],
    ['word', 'output.filterWord'],
    ['markdown', 'output.filterMarkdown'],
    ['image', 'output.filterImage'],
  ];

  return (
    <aside className={`output-panel ${panelOpen ? 'is-open' : ''} ${pageVisible ? '' : 'output-panel-hidden'}`}>
      <div className="output-panel-header">
        <span>{t('output.title')}</span>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => load({ silent: true, force: true, reason: 'manual-refresh' })}>
          {t('output.refresh')}
        </button>
      </div>

      {data?.dir && (
        <div className="output-dir-bar">
          <div className="output-dir-path" title={data.dir}>{data.dir}</div>
          <div className="output-dir-actions">
            <button type="button" className="btn btn-secondary btn-xs" onClick={copyDir} title={t('output.copyPathTitle')}>
              {t('output.copy')}
            </button>
            <button type="button" className="btn btn-secondary btn-xs" onClick={openFolder}>
              {t('output.openDir')}
            </button>
          </div>
        </div>
      )}

      {latestDocxPath && (
        <div className="output-latest-card">
          <div className="output-latest-label">{t('output.latestWord')}</div>
          <div className="output-latest-name" title={data.latestDocx.name}>{data.latestDocx.name}</div>
          <div className="output-latest-actions">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => openFile(latestDocxPath)}>
              {t('output.openWord')}
            </button>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => locateFile(latestDocxPath)}>
              {t('output.showInFolder')}
            </button>
          </div>
        </div>
      )}

      <div className="output-filter-bar">
        {filters.map(([key, labelKey]) => (
          <button
            key={key}
            type="button"
            className={`output-filter-btn ${filter === key ? 'active' : ''}`}
            onClick={() => setFilter(key)}
          >
            {t(labelKey)}
            {data?.counts?.[key === 'all' ? null : key] != null && key !== 'all' && (
              <span className="output-filter-count">{data.counts[key] || 0}</span>
            )}
          </button>
        ))}
      </div>

      <div className="output-file-list">
        {initialLoading && !data && <div className="output-empty">{t('output.loading')}</div>}
        {!initialLoading && error && <div className="output-empty output-error">{error}</div>}
        {!error && files.length === 0 && !initialLoading && (
          <div className="output-empty">
            {t('output.empty')}
            <br />
            {t('output.emptyHint')}
          </div>
        )}
        {files.map((file) => (
          <div key={file.path} className={`output-file-item ${file.path === latestDocxPath ? 'latest' : ''}`}>
            <div className="output-file-main">
              <span className={`output-file-badge type-${file.type}`}>{typeLabel(file.type)}</span>
              <div className="output-file-info">
                <div className="output-file-name" title={file.name}>{file.name}</div>
                <div className="output-file-meta">
                  {formatSize(file.size)} · {formatTime(file.modifiedAt)}
                  {file.path === latestDocxPath && <span className="output-tag-latest">{t('output.latest')}</span>}
                </div>
              </div>
            </div>
            <div className="output-file-actions">
              {file.type === 'word' && (
                <button type="button" className="btn btn-secondary btn-xs" onClick={() => openFile(file.path)}>
                  {t('output.open')}
                </button>
              )}
              <button type="button" className="btn btn-secondary btn-xs" onClick={() => locateFile(file.path)}>
                {t('output.locate')}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="output-panel-tip">{t('output.tip')}</p>
    </aside>
  );
}
