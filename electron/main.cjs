const { app, BrowserWindow, shell, dialog, ipcMain } = require('electron');
const { createTray, destroyTray, hasTray } = require('./tray.cjs');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { readLocale } = require('./locale.cjs');
const {
  readUiConfig,
  writeUiConfig,
  cycleThemeId,
  DEFAULT_THEME,
} = require('./uiConfig.cjs');
const { buildApplicationMenu, APP_NAME } = require('./menu.cjs');
const updater = require('./updater.cjs');

const TITLE_BAR_OVERLAY = {
  midnight: { color: '#1a2332', symbolColor: '#e8edf4', backgroundColor: '#0f1419' },
  slate: { color: '#1a1d24', symbolColor: '#e8eaef', backgroundColor: '#111318' },
  daylight: { color: '#ffffff', symbolColor: '#1e293b', backgroundColor: '#eef1f6' },
};

let mainWindow = null;
let trayApi = null;
app.isQuitting = false;
let currentLocale = 'zh';
let currentTheme = DEFAULT_THEME;
const isDev = !app.isPackaged;
const SERVER_PORT = process.env.SERVER_PORT || 3847;
const PROCESS_NAME = 'patent-assistant';
const PROCESS_DISPLAY_NAME = process.env.PATENT_APP_DISPLAY_NAME || PROCESS_NAME;
const PLACEHOLDER_API_KEY = 'sk-your-api-key-here';
const unifiedUserData = path.join(
  process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
  PROCESS_NAME,
);
app.setPath('userData', unifiedUserData);

if (process.platform === 'win32') {
  process.title = PROCESS_DISPLAY_NAME;
}
app.setName(APP_NAME.zh);
if (process.platform === 'win32') {
  app.setAppUserModelId('com.patent.assistant');
}

// #region agent log
try {
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'branding-v1',
      hypothesisId: 'H-taskmgr-name',
      location: 'electron/main.cjs:startup',
      message: 'app branding at startup',
      data: {
        processTitle: process.title,
        appName: app.getName(),
        execPath: process.execPath,
        processDisplayName: PROCESS_DISPLAY_NAME,
        appUiName: APP_NAME.zh,
        isPackaged: app.isPackaged,
        electronExeEnv: process.env.PATENT_ELECTRON_EXE || null,
        userDataPath: unifiedUserData,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
} catch { /* ignore */ }
// #endregion

function getAppRoot() {
  if (isDev) return path.join(__dirname, '..');
  return path.join(process.resourcesPath, 'app.asar');
}

function getClientDistPath() {
  if (isDev) return path.join(__dirname, '..', 'client', 'dist');
  const unpacked = path.join(process.resourcesPath, 'app.asar.unpacked', 'client', 'dist');
  if (fs.existsSync(unpacked)) return unpacked;
  return path.join(process.resourcesPath, 'app.asar', 'client', 'dist');
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, 'icon.ico'),
    path.join(__dirname, 'icon.png'),
    path.join(process.resourcesPath, 'app-icon.ico'),
    path.join(__dirname, '..', 'build', 'icon.ico'),
    path.join(__dirname, '..', 'build', 'brand', 'icon-256.png'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function getUserDataRoot() {
  const dir = app.getPath('userData');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  migrateLegacyUserData(dir);
  return dir;
}

function readApiKeyFromEnv(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return '';
  const line = fs.readFileSync(envPath, 'utf8').split('\n').find((l) => l.startsWith('LLM_API_KEY='));
  return line ? line.slice('LLM_API_KEY='.length).trim() : '';
}

function isPlaceholderApiKey(key) {
  return !key || key === PLACEHOLDER_API_KEY;
}

function migrateLegacyUserData(userData) {
  const appData = path.dirname(userData);
  const legacyRoots = [
    path.join(appData, '专利撰写助手'),
    path.join(userData, 'patent-assistant'),
  ];

  for (const legacyRoot of legacyRoots) {
    if (!fs.existsSync(legacyRoot)) continue;
    if (path.resolve(legacyRoot) === path.resolve(userData)) continue;

    const legacyEnv = path.join(legacyRoot, '.env');
    const targetEnv = path.join(userData, '.env');
    if (fs.existsSync(legacyEnv)) {
      const legacyKey = readApiKeyFromEnv(legacyEnv);
      const targetKey = readApiKeyFromEnv(targetEnv);
      const shouldCopyEnv = !fs.existsSync(targetEnv)
        || (isPlaceholderApiKey(targetKey) && !isPlaceholderApiKey(legacyKey));
      if (shouldCopyEnv) {
        fs.cpSync(legacyEnv, targetEnv, { force: true });
      }
    }

    for (const item of ['data', 'ui.json']) {
      const from = path.join(legacyRoot, item);
      const to = path.join(userData, item);
      if (fs.existsSync(from) && !fs.existsSync(to)) {
        fs.cpSync(from, to, { recursive: true });
      }
    }
  }
}

function ensureUserConfig() {
  const userData = getUserDataRoot();
  const userEnv = path.join(userData, '.env');
  if (!fs.existsSync(userEnv)) {
    const example = isDev
      ? path.join(__dirname, '..', 'config', '.env.example')
      : path.join(getAppRoot(), 'config', '.env.example');
    if (fs.existsSync(example)) {
      fs.copyFileSync(example, userEnv);
    } else {
      fs.writeFileSync(userEnv, [
        'LLM_API_BASE=https://api.openai.com/v1',
        'LLM_API_KEY=sk-your-api-key-here',
        'LLM_MODEL=gpt-4o-mini',
        `SERVER_PORT=${SERVER_PORT}`,
        'JWT_SECRET=patent-assistant-production',
        'ADMIN_USERNAME=admin',
        'ADMIN_PASSWORD=admin123',
      ].join('\n'), 'utf8');
    }
  }
  return userEnv;
}

function startServerInProcess() {
  const appRoot = getAppRoot();
  const userData = getUserDataRoot();
  const userEnv = ensureUserConfig();
  const clientDist = getClientDistPath();

  process.env.PATENT_APP_ROOT = appRoot;
  process.env.PATENT_CLIENT_DIST = clientDist;
  process.env.PATENT_RESOURCES_PATH = process.resourcesPath;
  process.env.PATENT_ELECTRON_EXE = process.execPath;
  process.env.PATENT_USER_DATA = userData;
  const skillSource = isDev
    ? path.join(__dirname, '..', '..', 'patent-draft-android')
    : path.join(process.resourcesPath, 'patent-skill');
  process.env.PATENT_SKILL_ROOT_SOURCE = skillSource;
  process.env.PATENT_SKILL_ROOT = skillSource;
  process.env.DOTENV_PATH = userEnv;
  process.env.SERVER_PORT = String(SERVER_PORT);

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'fix-v3',
        hypothesisId: 'H3',
        location: 'electron/main.cjs:startServerInProcess',
        message: 'starting server in main process',
        data: { appRoot, clientDist, clientDistExists: fs.existsSync(clientDist), userEnv },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  require(path.join(appRoot, 'server', 'src', 'index.js'));
}

async function waitForServer() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${SERVER_PORT}/api/health`);
      if (res.ok) return;
    } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('本地服务启动超时');
}

function applyTitleBarOverlay() {
  if (!mainWindow || mainWindow.isDestroyed() || process.platform !== 'win32') return;
  const cfg = TITLE_BAR_OVERLAY[currentTheme] || TITLE_BAR_OVERLAY.midnight;
  if (typeof mainWindow.setTitleBarOverlay === 'function') {
    mainWindow.setTitleBarOverlay({
      color: cfg.color,
      symbolColor: cfg.symbolColor,
      height: 36,
    });
  }
  if (cfg.backgroundColor) mainWindow.setBackgroundColor(cfg.backgroundColor);
}

function notifyRenderer() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('locale:changed', currentLocale);
  mainWindow.webContents.send('theme:changed', currentTheme);
}

function applyUiSettings({ locale, theme } = {}) {
  const userDataRoot = getUserDataRoot();
  const patch = {};
  if (locale !== undefined) {
    currentLocale = locale === 'en' ? 'en' : 'zh';
    patch.locale = currentLocale;
  }
  if (theme !== undefined) {
    currentTheme = theme;
    patch.theme = currentTheme;
  }
  if (Object.keys(patch).length) {
    const saved = writeUiConfig(userDataRoot, patch);
    currentLocale = saved.locale;
    currentTheme = saved.theme;
  }
  buildApplicationMenu({
    locale: currentLocale,
    theme: currentTheme,
    userDataRoot,
    isDev,
    onLocaleChange: (loc) => {
      applyUiSettings({ locale: loc });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.setTitle(APP_NAME[currentLocale]);
      }
      notifyRenderer();
    },
    onThemeChange: (id) => {
      applyUiSettings({ theme: id });
      notifyRenderer();
    },
  });
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setTitle(APP_NAME[currentLocale]);
    applyTitleBarOverlay();
  }
}

function applyLocale(locale) {
  applyUiSettings({ locale });
  trayApi?.rebuildMenu?.();
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return true;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.focus();
  return true;
}

function setupIpc() {
  ipcMain.handle('locale:get', () => readLocale(getUserDataRoot()));
  ipcMain.handle('locale:set', (_event, locale) => {
    applyUiSettings({ locale });
    notifyRenderer();
    return currentLocale;
  });
  ipcMain.handle('theme:get', () => readUiConfig(getUserDataRoot()).theme);
  ipcMain.handle('theme:set', (_event, theme) => {
    applyUiSettings({ theme });
    notifyRenderer();
    return currentTheme;
  });
  ipcMain.handle('theme:cycle', () => {
    const next = cycleThemeId(currentTheme);
    applyUiSettings({ theme: next });
    notifyRenderer();
    return currentTheme;
  });
  ipcMain.handle('update:check', (_evt, options) => updater.checkForUpdates(true, options || {}));
  ipcMain.handle('update:download', () => updater.downloadUpdate());
  ipcMain.handle('update:install', () => updater.quitAndInstall());
  ipcMain.handle('update:dismiss', () => updater.dismissBanner());
  ipcMain.handle('update:clearDialog', () => updater.clearDialog());
  ipcMain.handle('update:status', () => updater.getStatus());
  ipcMain.handle('update:openRelease', () => updater.openReleaseInBrowser());
  ipcMain.handle('window:focus', () => focusMainWindow());
}

function createWindow() {
  const ui = readUiConfig(getUserDataRoot());
  currentLocale = ui.locale;
  currentTheme = ui.theme;
  const iconPath = getAppIconPath();
  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'icon-fix',
        hypothesisId: 'H-icon-path',
        location: 'main.cjs:createWindow',
        message: 'app icon resolved',
        data: { iconPath, isDev, isPackaged: app.isPackaged, resourcesPath: process.resourcesPath },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion
  const titleBarCfg = TITLE_BAR_OVERLAY[currentTheme] || TITLE_BAR_OVERLAY.midnight;
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 960,
    minHeight: 640,
    title: APP_NAME[currentLocale],
    backgroundColor: titleBarCfg.backgroundColor,
    autoHideMenuBar: true,
    ...(iconPath ? { icon: iconPath } : {}),
    ...(process.platform === 'win32'
      ? {
        titleBarStyle: 'hidden',
        titleBarOverlay: {
          color: titleBarCfg.color,
          symbolColor: titleBarCfg.symbolColor,
          height: 36,
        },
      }
      : {}),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
    show: false,
  });

  const url = isDev
    ? 'http://127.0.0.1:5173'
    : `http://127.0.0.1:${SERVER_PORT}`;

  mainWindow.loadURL(url);
  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (e) => {
    if (!app.isQuitting && hasTray()) {
      e.preventDefault();
      mainWindow.hide();
    }
  });

  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  }
}

app.whenReady().then(async () => {
  try {
    setupIpc();
    if (!isDev) {
      startServerInProcess();
      await waitForServer();
    }
    applyUiSettings(readUiConfig(getUserDataRoot()));
    if (!isDev) {
      await updater.init({
        userDataRoot: getUserDataRoot(),
        getLocaleFn: () => currentLocale,
      });
    }
    createWindow();
    trayApi = createTray({
      isDev,
      getLocale: () => currentLocale,
      focusMainWindow,
      appName: APP_NAME,
    });
  } catch (err) {
    const logPath = path.join(getUserDataRoot(), 'startup-error.log');
    fs.writeFileSync(logPath, `${new Date().toISOString()}\n${err.stack || err.message}\n`, 'utf8');
    dialog.showErrorBox('专利撰写助手启动失败', `${err.message}\n\n详情已写入：\n${logPath}`);
    app.quit();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
  destroyTray();
});

app.on('window-all-closed', () => {
  if (process.platform === 'darwin') return;
  if (hasTray()) return;
  app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
