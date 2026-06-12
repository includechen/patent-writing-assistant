const { app, BrowserWindow, session, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const {
  buildUserAgent,
  parseLatestYml,
  resolveDownloadUrl,
  isNewerVersion,
  fetchBuffer,
  downloadFile,
  verifySha512,
} = require('./customUpdateFetch.cjs');

const {
  PRIMARY_UPDATE_URL,
  GITEE_RAW_UPDATE_URL,
  GITEE_BROWSER_DOWNLOAD_PAGE,
} = require('../server/src/updateSources.cjs');

const DEFAULT_UPDATE_URL = `${PRIMARY_UPDATE_URL}/`;
const LEGACY_URL_MARKERS = ['patent-draft-android', '/desktop-releases', 'patent-draft-android-desktop-releases'];

const MSG = {
  zh: {
    checking: '正在检查更新…',
    available: '发现新版本 {version}，是否下载？',
    notAvailable: '当前已是最新版本',
    downloading: '正在下载更新…',
    downloaded: '新版本 {version} 已下载完成，是否立即重启安装？',
    error: '检查更新失败',
    noUrl: '未配置更新服务器地址',
    restart: '立即重启',
    later: '稍后',
    download: '下载更新',
    ok: '确定',
    checkUpdate: '检查更新',
    networkDenied: '无法从企业更新源获取安装包，请点击「浏览器下载」打开 Gitee 目录页，手动下载安装包后安装',
    notPublished: '企业更新源尚未发布新版本（latest.yml 或安装包不存在）。请联系管理员上传，或使用浏览器下载 Gitee 安装包',
    openInBrowser: '浏览器下载',
  },
  en: {
    checking: 'Checking for updates…',
    available: 'New version {version} available. Download now?',
    notAvailable: 'You are on the latest version',
    downloading: 'Downloading update…',
    downloaded: 'Version {version} is ready. Restart now to install?',
    error: 'Update check failed',
    noUrl: 'Update server URL is not configured',
    restart: 'Restart now',
    later: 'Later',
    download: 'Download update',
    ok: 'OK',
    checkUpdate: 'Check for updates',
    networkDenied: 'Cannot reach the corporate update server — use「Download in browser」to get the installer from Gitee',
    notPublished: 'No update on the corporate server yet (missing latest.yml or installer). Ask admin to upload, or use browser download on Gitee',
    openInBrowser: 'Download in browser',
  },
};

let state = {
  enabled: false,
  status: 'idle',
  version: null,
  percent: 0,
  phase: null,
  error: null,
  url: '',
  dialog: null,
};
let pendingUpdate = null;
let getLocale = () => 'zh';
let onStatus = () => {};
let lastCheckAt = 0;
let pendingManual = false;
let userInitiatedDownload = false;
let autoFlowPending = false;
let userDataRoot = '';
let browserFallbackUrl = GITEE_BROWSER_DOWNLOAD_PAGE;

function t(key, vars = {}) {
  const loc = getLocale() === 'en' ? 'en' : 'zh';
  let s = (MSG[loc][key] || MSG.zh[key] || key);
  Object.entries(vars).forEach(([k, v]) => {
    s = s.replaceAll(`{${k}}`, String(v));
  });
  return s;
}

function logUpdate(message, data = {}) {
  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'update-v2',
      hypothesisId: 'H-custom-update',
      location: 'electron/updater.cjs',
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  try {
    const logPath = path.join(userDataRoot || app.getPath('userData'), 'update.log');
    const line = `${new Date().toISOString()} ${message} ${JSON.stringify(data)}\n`;
    fs.appendFileSync(logPath, line, 'utf8');
  } catch { /* ignore */ }
}

function normalizeUrl(url) {
  if (!url) return '';
  let u = String(url).trim().replace(/\/+$/, '');
  if (LEGACY_URL_MARKERS.some((m) => u.includes(m))) {
    u = PRIMARY_UPDATE_URL.replace(/\/+$/, '');
  }
  return `${u}/`;
}

function readEnvValue(envPath, key) {
  if (!envPath || !fs.existsSync(envPath)) return '';
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const idx = trimmed.indexOf('=');
    const k = trimmed.slice(0, idx).trim();
    if (k === key) return trimmed.slice(idx + 1).trim();
  }
  return '';
}

function migrateEnvUpdateUrl(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return;
  let content = fs.readFileSync(envPath, 'utf8');
  const current = readEnvValue(envPath, 'PATENT_UPDATE_URL');
  if (!current) return;
  let normalized = normalizeUrl(current).replace(/\/$/, '');
  if (LEGACY_URL_MARKERS.some((m) => current.includes(m))) {
    normalized = PRIMARY_UPDATE_URL.replace(/\/+$/, '');
  }
  if (normalized === current.replace(/\/+$/, '')) return;
  const line = `PATENT_UPDATE_URL=${normalized}`;
  const regex = /^PATENT_UPDATE_URL=.*$/m;
  content = regex.test(content)
    ? content.replace(regex, line)
    : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(envPath, content, 'utf8');
  process.env.PATENT_UPDATE_URL = normalized;
  logUpdate('migrated PATENT_UPDATE_URL', { from: current, to: normalized });
}

function readUpdateConfig(root) {
  const candidates = [
    path.join(process.resourcesPath, 'update-config', 'update.json'),
    path.join(__dirname, '..', 'config', 'update.json'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        return JSON.parse(fs.readFileSync(p, 'utf8'));
      } catch { /* ignore */ }
    }
  }
  return {
    url: DEFAULT_UPDATE_URL.replace(/\/$/, ''),
    browserFallbackUrl: GITEE_BROWSER_DOWNLOAD_PAGE,
    checkOnStartup: true,
    checkIntervalHours: 24,
  };
}

function resolveUpdateUrl(root) {
  const envFile = path.join(root, '.env');
  migrateEnvUpdateUrl(envFile);

  const fromEnv = process.env.PATENT_UPDATE_URL || readEnvValue(envFile, 'PATENT_UPDATE_URL');
  if (fromEnv) return normalizeUrl(fromEnv);

  const cfg = readUpdateConfig(root);
  if (cfg.url) return normalizeUrl(cfg.url);

  try {
    const pkg = require(path.join(__dirname, '..', 'package.json'));
    const pub = pkg.build?.publish;
    const entry = Array.isArray(pub) ? pub[0] : pub;
    if (entry?.url) return normalizeUrl(entry.url);
  } catch { /* ignore */ }

  return normalizeUrl(DEFAULT_UPDATE_URL);
}

function broadcast() {
  onStatus({ ...state });
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send('update:status', { ...state });
  }
}

function setStatus(patch) {
  state = { ...state, ...patch };
  broadcast();
}

function friendlyError(msg) {
  const s = String(msg || '');
  if (s.includes('404') || s.includes('HTTP 404')) return t('notPublished');
  if (
    s.includes('ERR_NETWORK_ACCESS_DENIED')
    || s.includes('ERR_CONNECTION_ABORTED')
    || s.includes('ECONNREFUSED')
    || s.includes('ENOTFOUND')
    || s.includes('EACCES')
    || s.includes('ETIMEDOUT')
    || s.includes('electron-net')
    || s.includes('node-http')
    || s.includes('curl exit')
    || s.includes('curl spawn')
    || s.includes('net::ERR_')
  ) {
    return t('networkDenied');
  }
  const cleaned = s
    .replace(/electron-net:\s*/gi, '')
    .replace(/node-http:\s*/gi, '')
    .replace(/curl:\s*/gi, '')
    .replace(/curl spawn:\s*/gi, '')
    .replace(/builtin-net:\s*/gi, '')
    .trim();
  if (!cleaned || /^(HTTP|connect|exit)\s/i.test(cleaned)) return t('networkDenied');
  return cleaned.length > 120 ? `${cleaned.slice(0, 120)}…` : cleaned;
}

function openReleaseInBrowser() {
  const url = browserFallbackUrl || GITEE_BROWSER_DOWNLOAD_PAGE;
  logUpdate('openReleaseInBrowser', { url, primary: state.url });
  return shell.openExternal(url);
}

function getUpdateCacheDir() {
  const dir = path.join(app.getPath('temp'), 'patent-assistant-updates');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getUserAgent() {
  return buildUserAgent(app.getVersion());
}

async function fetchLatestMeta() {
  const ymlUrl = new URL('latest.yml', state.url).toString();
  const buf = await fetchBuffer(ymlUrl, {
    userAgent: getUserAgent(),
    tempDir: app.getPath('temp'),
    log: logUpdate,
  });
  const meta = parseLatestYml(buf.toString('utf8'));
  const downloadUrl = resolveDownloadUrl(meta, state.url);
  if (!meta.version || !downloadUrl) {
    throw new Error('Invalid latest.yml — missing version or download URL');
  }
  return { ...meta, downloadUrl, ymlUrl };
}

function notifyError(msg, { offerBrowser = false } = {}) {
  const hint = friendlyError(msg);
  const shouldOfferBrowser = offerBrowser
    || msg.includes('403')
    || msg.includes('404')
    || msg.includes('NETWORK');
  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'update-ui-v1',
      hypothesisId: 'H-update-dialog',
      location: 'electron/updater.cjs:notifyError',
      message: 'update error shown in app modal',
      data: { raw: String(msg).slice(0, 300), hint, shouldOfferBrowser },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
  setStatus({
    status: 'error',
    error: hint,
    percent: 0,
    phase: null,
    dialog: { kind: 'error', message: `${t('error')}: ${hint}`, offerBrowser: shouldOfferBrowser },
  });
}

function promptDownload(version) {
  setStatus({
    status: 'available',
    version,
    dialog: { kind: 'available', version },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveUpdateSplashScript() {
  const candidates = [
    path.join(process.resourcesPath, 'update-splash.ps1'),
    path.join(__dirname, '..', 'build', 'update-splash.ps1'),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function launchUpdateSplash(installerPid, version) {
  const script = resolveUpdateSplashScript();
  if (!script || process.platform !== 'win32') {
    logUpdate('splash-skip', { reason: 'no-script-or-platform' });
    return;
  }
  try {
    const splash = spawn('powershell.exe', [
      '-NoProfile',
      '-Sta',
      '-ExecutionPolicy', 'Bypass',
      '-File', script,
      '-InstallerPid', String(installerPid),
      '-Version', version || '',
    ], { detached: true, stdio: 'ignore', windowsHide: false });
    splash.unref();
    logUpdate('splash-launched', { installerPid, script });
  } catch (err) {
    logUpdate('splash-fail', { msg: err?.message || String(err) });
  }
}

function runInstaller(exePath, version) {
  logUpdate('runInstaller', { exePath, version });
  const args = ['--updated'];
  if (process.platform === 'win32') args.push('/S');
  const child = spawn(exePath, args, { detached: true, stdio: 'ignore', windowsHide: true });
  launchUpdateSplash(child.pid, version);
  child.unref();
  return child;
}

function shouldCheck(intervalHours) {
  if (!lastCheckAt) return true;
  const ms = (intervalHours || 24) * 3600 * 1000;
  return Date.now() - lastCheckAt >= ms;
}

async function checkForUpdates(manual = false, options = {}) {
  if (!state.enabled) {
    if (manual) {
      setStatus({ dialog: { kind: 'no-url', message: t('noUrl') } });
    }
    return state;
  }

  if (!manual && !shouldCheck(readUpdateConfig(userDataRoot).checkIntervalHours)) {
    return state;
  }

  const wasManual = !!manual;
  const autoFlow = !!(wasManual && options.autoFlow);
  pendingManual = wasManual;
  autoFlowPending = autoFlow;
  lastCheckAt = Date.now();

  try {
    if (wasManual) {
      setStatus({
        status: 'checking',
        error: null,
        percent: null,
        phase: 'checking',
        dialog: null,
      });
    }
    logUpdate('checkForUpdates', { manual: wasManual, autoFlow, url: state.url });

    const meta = await fetchLatestMeta();
    const current = app.getVersion();
    logUpdate('custom-check-result', {
      remote: meta.version,
      local: current,
      downloadUrl: meta.downloadUrl,
      autoFlow,
    });

    if (!isNewerVersion(meta.version, current)) {
      pendingUpdate = null;
      pendingManual = false;
      autoFlowPending = false;
      setStatus({ status: 'idle', version: null, error: null, percent: 0, phase: null });
      if (wasManual) {
        setStatus({ dialog: { kind: 'info', message: t('notAvailable') } });
      }
      return state;
    }

    pendingUpdate = {
      version: meta.version,
      downloadUrl: meta.downloadUrl,
      sha512: meta.sha512,
      size: meta.size,
      localPath: null,
    };
    pendingManual = false;
    setStatus({ status: 'available', version: meta.version, error: null, percent: 0, phase: null });

    if (autoFlow) {
      logUpdate('auto-flow-download', { version: meta.version });
      return downloadUpdate();
    }
    if (wasManual) promptDownload(meta.version);
    return state;
  } catch (err) {
    pendingManual = false;
    autoFlowPending = false;
    const msg = err?.message || String(err);
    logUpdate('checkForUpdates-fail', { msg, manual: wasManual, url: state.url, browserFallbackUrl });
    if (wasManual) notifyError(msg, { offerBrowser: true });
    else setStatus({ status: 'idle', error: null, percent: 0, phase: null });
    return state;
  }
}

async function downloadUpdate() {
  if (!state.enabled) return state;

  if (!pendingUpdate?.downloadUrl) {
    const msg = 'Please check update first';
    logUpdate('download-skip', { msg });
    if (userInitiatedDownload || pendingManual) notifyError(msg);
    return state;
  }

  userInitiatedDownload = true;
  setStatus({
    status: 'downloading',
    percent: 0,
    error: null,
    dialog: null,
    phase: 'downloading',
    version: pendingUpdate.version,
  });

  const fileName = path.basename(pendingUpdate.downloadUrl.split('?')[0]);
  const dest = path.join(getUpdateCacheDir(), fileName);

  try {
    logUpdate('download-start', { url: pendingUpdate.downloadUrl, dest });
    await downloadFile(pendingUpdate.downloadUrl, dest, {
      userAgent: getUserAgent(),
      onProgress: (percent) => setStatus({
        status: 'downloading',
        percent,
        error: null,
        phase: 'downloading',
        version: pendingUpdate.version,
      }),
      log: logUpdate,
    });
    verifySha512(dest, pendingUpdate.sha512);
    pendingUpdate.localPath = dest;
    userInitiatedDownload = false;
    logUpdate('download-complete', { dest, version: pendingUpdate.version, autoFlow: autoFlowPending });
    if (autoFlowPending) {
      autoFlowPending = false;
      setStatus({
        status: 'downloading',
        version: pendingUpdate.version,
        percent: 100,
        phase: 'downloading',
        error: null,
        dialog: null,
      });
      await sleep(350);
      return quitAndInstall();
    }
    setStatus({
      status: 'downloaded',
      version: pendingUpdate.version,
      percent: 100,
      error: null,
      phase: null,
      dialog: { kind: 'downloaded', version: pendingUpdate.version },
    });
    return state;
  } catch (err) {
    userInitiatedDownload = false;
    const msg = err?.message || String(err);
    logUpdate('download-fail', { msg });
    notifyError(msg, { offerBrowser: true });
    return state;
  }
}

async function quitAndInstall() {
  if (!pendingUpdate?.localPath || !fs.existsSync(pendingUpdate.localPath)) {
    logUpdate('quitAndInstall-missing', { pending: !!pendingUpdate });
    notifyError('安装包不存在，请重新下载更新');
    return state;
  }

  const version = pendingUpdate.version;
  const exePath = pendingUpdate.localPath;

  setStatus({
    status: 'installing',
    version,
    percent: 8,
    phase: 'preparing',
    dialog: null,
    error: null,
  });
  logUpdate('install-start', { version, exePath });
  await sleep(500);

  setStatus({ status: 'installing', version, percent: 22, phase: 'launching' });
  await sleep(400);

  const child = runInstaller(exePath, version);
  logUpdate('install-child-spawned', { pid: child?.pid, version });

  setStatus({ status: 'installing', version, percent: 55, phase: 'handoff' });
  await sleep(1400);

  setStatus({ status: 'installing', version, percent: 78, phase: 'handoff' });
  await sleep(1200);

  setStatus({ status: 'installing', version, percent: null, phase: 'handoff' });
  await sleep(800);

  logUpdate('install-handoff-quit', { version, installerPid: child?.pid });
  app.quit();
  return state;
}

function dismissBanner() {
  setStatus({
    status: 'idle',
    version: null,
    error: null,
    percent: 0,
    phase: null,
    dialog: null,
  });
}

function clearDialog() {
  setStatus({ dialog: null });
}

function getStatus() {
  return { ...state };
}

async function init({ userDataRoot: root, getLocaleFn, onStatusFn }) {
  userDataRoot = root || '';
  if (!app.isPackaged) {
    state = { ...state, enabled: false, status: 'disabled' };
    return state;
  }

  getLocale = getLocaleFn || getLocale;
  onStatus = onStatusFn || onStatus;

  const url = resolveUpdateUrl(root);
  if (!url) {
    state = { ...state, enabled: false, status: 'no-url', url: '' };
    return state;
  }

  try {
    await session.defaultSession.setProxy({ mode: 'system' });
    logUpdate('proxy-configured', { mode: 'system' });
  } catch (err) {
    logUpdate('proxy-config-fail', { msg: err?.message || String(err) });
  }

  const cfg = readUpdateConfig(root);
  browserFallbackUrl = cfg.browserFallbackUrl || GITEE_BROWSER_DOWNLOAD_PAGE;

  state = { ...state, enabled: true, url, status: 'idle', error: null };
  logUpdate('init', {
    url,
    browserFallbackUrl,
    giteeRaw: GITEE_RAW_UPDATE_URL,
    appVersion: app.getVersion(),
    mode: 'custom-fetch',
  });

  if (cfg.checkOnStartup) {
    setTimeout(() => checkForUpdates(false), 12000);
  }

  return state;
}

module.exports = {
  init,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  dismissBanner,
  clearDialog,
  getStatus,
  openReleaseInBrowser,
  resolveUpdateUrl,
  DEFAULT_UPDATE_URL,
  GITEE_RAW_UPDATE_URL,
  GITEE_BROWSER_DOWNLOAD_PAGE,
};
