const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const fs = require('fs');

let tray = null;

function getTrayIconPath(isDev) {
  const candidates = [
    !isDev ? path.join(process.resourcesPath, 'tray-icon.png') : null,
    path.join(__dirname, '..', 'build', 'brand', 'icon-32.png'),
    path.join(__dirname, 'icon.png'),
    path.join(__dirname, 'icon.ico'),
    !isDev ? path.join(process.resourcesPath, 'app-icon.ico') : null,
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function trayLabels(locale) {
  if (locale === 'en') {
    return { open: 'Open Patent Assistant', quit: 'Quit' };
  }
  return { open: '打开专利撰写助手', quit: '退出' };
}

function createTray({ isDev, getLocale, focusMainWindow, appName }) {
  if (process.platform !== 'win32') return null;

  const iconPath = getTrayIconPath(isDev);
  if (!iconPath) return null;

  let image = nativeImage.createFromPath(iconPath);
  if (image.isEmpty()) return null;

  image = image.resize({ width: 16, height: 16 });
  tray = new Tray(image);

  const rebuildMenu = () => {
    const loc = getLocale() === 'en' ? 'en' : 'zh';
    const labels = trayLabels(loc);
    tray.setToolTip(appName[loc] || appName.zh);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label: labels.open, click: () => focusMainWindow() },
      { type: 'separator' },
      { label: labels.quit, click: () => { app.isQuitting = true; app.quit(); } },
    ]));
  };

  rebuildMenu();
  tray.on('click', () => focusMainWindow());
  tray.on('double-click', () => focusMainWindow());

  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'tray-v1',
      hypothesisId: 'H-tray-icon',
      location: 'electron/tray.cjs:createTray',
      message: 'system tray created',
      data: { iconPath, isDev },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return { tray, rebuildMenu };
}

function destroyTray() {
  if (tray && !tray.isDestroyed()) tray.destroy();
  tray = null;
}

function hasTray() {
  return !!(tray && !tray.isDestroyed());
}

module.exports = { createTray, destroyTray, hasTray };
