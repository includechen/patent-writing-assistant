const {
  Menu, app, shell, BrowserWindow,
} = require('electron');
const path = require('path');
const { AUTHOR_EMAIL, AUTHOR_NAME } = require('./locale.cjs');
const { THEMES } = require('./uiConfig.cjs');
const updater = require('./updater.cjs');

const APP_NAME = { zh: '专利撰写助手', en: 'Patent Assistant' };

const T = {
  zh: {
    file: '文件',
    openOutput: '打开输出目录',
    quit: '退出',
    edit: '编辑',
    undo: '撤销',
    redo: '重做',
    cut: '剪切',
    copy: '复制',
    paste: '粘贴',
    selectAll: '全选',
    view: '视图',
    reload: '重新加载',
    zoomIn: '放大',
    zoomOut: '缩小',
    zoomReset: '重置缩放',
    fullscreen: '全屏',
    language: '语言',
    langZh: '中文',
    langEn: 'English',
    theme: '主题',
    themeMidnight: '午夜深蓝',
    themeSlate: '石墨深灰',
    themeDaylight: '日光浅色',
    help: '帮助',
    about: '关于',
    checkUpdate: '检查更新',
    userGuide: '使用说明',
    aboutTitle: '关于专利撰写助手',
    version: '版本',
    author: '作者',
    authorName: '陈兴华',
    contact: '联系邮箱',
  },
  en: {
    file: 'File',
    openOutput: 'Open Output Folder',
    quit: 'Quit',
    edit: 'Edit',
    undo: 'Undo',
    redo: 'Redo',
    cut: 'Cut',
    copy: 'Copy',
    paste: 'Paste',
    selectAll: 'Select All',
    view: 'View',
    reload: 'Reload',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    zoomReset: 'Reset Zoom',
    fullscreen: 'Toggle Fullscreen',
    language: 'Language',
    langZh: '中文',
    langEn: 'English',
    theme: 'Theme',
    themeMidnight: 'Midnight',
    themeSlate: 'Slate',
    themeDaylight: 'Daylight',
    help: 'Help',
    about: 'About',
    checkUpdate: 'Check for updates',
    userGuide: 'User Guide',
    aboutTitle: 'About Patent Assistant',
    version: 'Version',
    author: 'Author',
    authorName: 'Xinghua Chen',
    contact: 'Email',
  },
};

function getAppVersion() {
  try {
    return require(path.join(__dirname, '..', 'package.json')).version || '1.0.0';
  } catch {
    return '1.0.0';
  }
}

function sendToRenderer(channel, payload) {
  const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

const THEME_LABEL_KEYS = {
  midnight: 'themeMidnight',
  slate: 'themeSlate',
  daylight: 'themeDaylight',
};

function buildApplicationMenu({
  locale = 'zh',
  theme = 'midnight',
  userDataRoot,
  isDev = false,
  onLocaleChange,
  onThemeChange,
}) {
  const t = T[locale] || T.zh;
  const appVersion = getAppVersion();
  const outputsDir = path.join(userDataRoot, 'data', 'outputs');

  const template = [
    {
      label: t.file,
      submenu: [
        {
          label: t.openOutput,
          click: () => {
            if (!require('fs').existsSync(outputsDir)) {
              require('fs').mkdirSync(outputsDir, { recursive: true });
            }
            shell.openPath(outputsDir);
          },
        },
        { type: 'separator' },
        {
          label: t.quit,
          accelerator: 'Alt+F4',
          click: () => app.quit(),
        },
      ],
    },
    {
      label: t.edit,
      submenu: [
        { label: t.undo, role: 'undo' },
        { label: t.redo, role: 'redo' },
        { type: 'separator' },
        { label: t.cut, role: 'cut' },
        { label: t.copy, role: 'copy' },
        { label: t.paste, role: 'paste' },
        { type: 'separator' },
        { label: t.selectAll, role: 'selectAll' },
      ],
    },
    {
      label: t.view,
      submenu: [
        { label: t.reload, role: 'reload' },
        { type: 'separator' },
        { label: t.zoomIn, role: 'zoomIn' },
        { label: t.zoomOut, role: 'zoomOut' },
        { label: t.zoomReset, role: 'resetZoom' },
        { type: 'separator' },
        { label: t.fullscreen, role: 'togglefullscreen' },
        { type: 'separator' },
        {
          label: t.language,
          submenu: [
            {
              label: t.langZh,
              type: 'radio',
              checked: locale === 'zh',
              click: () => onLocaleChange('zh'),
            },
            {
              label: t.langEn,
              type: 'radio',
              checked: locale === 'en',
              click: () => onLocaleChange('en'),
            },
          ],
        },
        {
          label: t.theme,
          submenu: THEMES.map((id) => ({
            label: t[THEME_LABEL_KEYS[id]],
            type: 'radio',
            checked: theme === id,
            click: () => onThemeChange?.(id),
          })),
        },
      ],
    },
    {
      label: t.help,
      submenu: [
        {
          label: t.userGuide,
          click: () => sendToRenderer('nav:goto', 'guide'),
        },
        { type: 'separator' },
        {
          label: t.checkUpdate,
          click: () => { updater.checkForUpdates(true); },
        },
        {
          label: t.about,
          click: () => {
            sendToRenderer('app:showAbout', {
              version: appVersion,
              author: AUTHOR_NAME,
              email: AUTHOR_EMAIL,
            });
          },
        },
      ],
    },
  ];

  if (isDev) {
    const viewMenu = template.find((m) => m.label === t.view);
    if (viewMenu) {
      viewMenu.submenu.splice(1, 0, { label: 'DevTools', role: 'toggleDevTools' });
    }
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);

  // #region agent log
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'menu-i18n',
      hypothesisId: 'H-menu',
      location: 'electron/menu.cjs:buildApplicationMenu',
      message: 'application menu built',
      data: { locale, theme, version: appVersion },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return { appVersion, appName: APP_NAME[locale] };
}

module.exports = {
  APP_NAME,
  T,
  getAppVersion,
  buildApplicationMenu,
  sendToRenderer,
};
