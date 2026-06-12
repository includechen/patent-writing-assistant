const fs = require('fs');
const path = require('path');

const DEFAULT_LOCALE = 'zh';
const DEFAULT_THEME = 'midnight';
const THEMES = ['midnight', 'slate', 'daylight'];

function getUiConfigPath(userDataRoot) {
  return path.join(userDataRoot, 'ui.json');
}

function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'zh';
}

function normalizeTheme(theme) {
  return THEMES.includes(theme) ? theme : DEFAULT_THEME;
}

function readUiConfig(userDataRoot) {
  try {
    const p = getUiConfigPath(userDataRoot);
    if (!fs.existsSync(p)) {
      return { locale: DEFAULT_LOCALE, theme: DEFAULT_THEME };
    }
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      locale: normalizeLocale(data.locale),
      theme: normalizeTheme(data.theme),
    };
  } catch {
    return { locale: DEFAULT_LOCALE, theme: DEFAULT_THEME };
  }
}

function writeUiConfig(userDataRoot, patch = {}) {
  const current = readUiConfig(userDataRoot);
  const next = {
    locale: patch.locale !== undefined ? normalizeLocale(patch.locale) : current.locale,
    theme: patch.theme !== undefined ? normalizeTheme(patch.theme) : current.theme,
  };
  const p = getUiConfigPath(userDataRoot);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8');
  fs.renameSync(tmp, p);
  return next;
}

function cycleThemeId(current) {
  const theme = normalizeTheme(current);
  const idx = THEMES.indexOf(theme);
  return THEMES[(idx + 1) % THEMES.length];
}

module.exports = {
  DEFAULT_LOCALE,
  DEFAULT_THEME,
  THEMES,
  readUiConfig,
  writeUiConfig,
  normalizeTheme,
  cycleThemeId,
};
