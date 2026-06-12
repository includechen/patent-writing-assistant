const { contextBridge, ipcRenderer, shell } = require('electron');

let appVersion = '1.0.0';
try {
  appVersion = require('../package.json').version || appVersion;
} catch { /* ignore */ }

const TITLE_BAR_INSET = process.platform === 'win32'
  ? { top: 36, right: 138 }
  : { top: 0, right: 0 };

contextBridge.exposeInMainWorld('patentApp', {
  platform: process.platform,
  titleBarInset: TITLE_BAR_INSET,
  version: appVersion,
  themes: ['midnight', 'slate', 'daylight'],
  apiBase: '/api',
  isDesktop: true,
  openExternal: (url) => shell.openExternal(url),
  focusWindow: () => ipcRenderer.invoke('window:focus'),
  getLocale: () => ipcRenderer.invoke('locale:get'),
  setLocale: (locale) => ipcRenderer.invoke('locale:set', locale),
  onLocaleChange: (callback) => {
    const handler = (_event, locale) => callback(locale);
    ipcRenderer.on('locale:changed', handler);
    return () => ipcRenderer.removeListener('locale:changed', handler);
  },
  getTheme: () => ipcRenderer.invoke('theme:get'),
  setTheme: (theme) => ipcRenderer.invoke('theme:set', theme),
  cycleTheme: () => ipcRenderer.invoke('theme:cycle'),
  onThemeChange: (callback) => {
    const handler = (_event, theme) => callback(theme);
    ipcRenderer.on('theme:changed', handler);
    return () => ipcRenderer.removeListener('theme:changed', handler);
  },
  onNavigate: (callback) => {
    const handler = (_event, page) => callback(page);
    ipcRenderer.on('nav:goto', handler);
    return () => ipcRenderer.removeListener('nav:goto', handler);
  },
  checkUpdate: (options) => ipcRenderer.invoke('update:check', options || {}),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: () => ipcRenderer.invoke('update:install'),
  dismissUpdate: () => ipcRenderer.invoke('update:dismiss'),
  clearUpdateDialog: () => ipcRenderer.invoke('update:clearDialog'),
  getUpdateStatus: () => ipcRenderer.invoke('update:status'),
  openUpdateRelease: () => ipcRenderer.invoke('update:openRelease'),
  onUpdateStatus: (callback) => {
    const handler = (_event, status) => callback(status);
    ipcRenderer.on('update:status', handler);
    return () => ipcRenderer.removeListener('update:status', handler);
  },
  onShowAbout: (callback) => {
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on('app:showAbout', handler);
    return () => ipcRenderer.removeListener('app:showAbout', handler);
  },
});
