/** Shared update feed URLs (Electron main + server settings). */
const GITEE_OWNER = 'quanzhouuniversity';
const GITEE_REPO = 'patent-writing-assistant';
const GITEE_REPO_BASE = `https://gitee.com/${GITEE_OWNER}/${GITEE_REPO}`;

/** electron-updater custom fetch: latest.yml base (trailing slash added by consumer) */
const PRIMARY_UPDATE_URL = `${GITEE_REPO_BASE}/raw/master`;
const GITEE_RAW_UPDATE_URL = PRIMARY_UPDATE_URL;
/** 「浏览器下载」打开的 Gitee 页（Release 安装包） */
const GITEE_BROWSER_DOWNLOAD_PAGE = `${GITEE_REPO_BASE}/releases`;
/** 仓库首页（文档/README 链接用） */
const GITEE_REPO_HOME = GITEE_REPO_BASE;

module.exports = {
  GITEE_OWNER,
  GITEE_REPO,
  GITEE_REPO_BASE,
  GITEE_REPO_HOME,
  PRIMARY_UPDATE_URL,
  GITEE_RAW_UPDATE_URL,
  GITEE_BROWSER_DOWNLOAD_PAGE,
};
