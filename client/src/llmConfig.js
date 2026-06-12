export const AUTO_ID = 'auto';

const state = { revision: 0, saved: false, listeners: new Set() };

export const llmConfigStore = {
  /** @param {{ saved?: boolean }} [opts] */
  notifyUpdated(opts = {}) {
    state.saved = !!opts.saved;
    state.revision += 1;
    state.listeners.forEach((fn) => fn(state.revision));
  },

  consumeSavedFlag() {
    const v = state.saved;
    state.saved = false;
    return v;
  },

  subscribe(fn) {
    state.listeners.add(fn);
    fn(state.revision);
    return () => state.listeners.delete(fn);
  },
};

/** 聊天区仅展示设置页已勾选项（严格同步，未勾选不出现） */
export function buildComposerCatalog(catalog = [], selectedModels = []) {
  const selected = selectedModels || [];
  const autoEnabled = selected.includes(AUTO_ID);
  const manualIds = new Set(selected.filter((id) => id !== AUTO_ID));
  const allManual = catalog.filter((m) => !m.isAuto && m.id !== AUTO_ID);
  const manualEntries = allManual.filter((m) => manualIds.has(m.id));

  const autoEntry = catalog.find((m) => m.isAuto || m.id === AUTO_ID) || {
    id: AUTO_ID,
    name: 'AUTO',
    isAuto: true,
    tags: ['Auto'],
  };

  const result = [];
  if (autoEnabled) result.push(autoEntry);
  result.push(...manualEntries);

  // #region agent log
  if (typeof fetch === 'function') {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'model-sync-v4',
        hypothesisId: 'H-strict-sync',
        location: 'llmConfig.js:buildComposerCatalog',
        message: 'composer catalog',
        data: { autoEnabled, settingsIds: selected, resultIds: result.map((m) => m.id) },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  }
  // #endregion

  return result;
}

export function pickComposerModel({
  storedModel,
  composerCatalog = [],
  autoEnabled = false,
  forceDefault = false,
}) {
  const ids = new Set(composerCatalog.map((m) => m.id));

  if (forceDefault) {
    if (autoEnabled && ids.has(AUTO_ID)) return AUTO_ID;
    const first = composerCatalog.find((m) => m.id !== AUTO_ID);
    return first?.id || '';
  }

  if (storedModel && ids.has(storedModel)) return storedModel;
  if (autoEnabled && ids.has(AUTO_ID)) return AUTO_ID;
  const first = composerCatalog.find((m) => m.id !== AUTO_ID);
  return first?.id || '';
}
