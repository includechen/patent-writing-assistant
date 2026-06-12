const { readUiConfig, writeUiConfig, DEFAULT_LOCALE } = require('./uiConfig.cjs');

const AUTHOR_EMAIL = '13960565525@163.com';
const AUTHOR_NAME = '陈兴华';

function readLocale(userDataRoot) {
  return readUiConfig(userDataRoot).locale;
}

function writeLocale(userDataRoot, locale) {
  return writeUiConfig(userDataRoot, { locale }).locale;
}

module.exports = {
  DEFAULT_LOCALE,
  AUTHOR_EMAIL,
  AUTHOR_NAME,
  readLocale,
  writeLocale,
};
