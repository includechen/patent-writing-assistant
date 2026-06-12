const path = require('path');
const fs = require('fs');
const { embedExeBranding } = require('./embed-exe-branding.cjs');

module.exports = async function afterPack(context) {
  const projectDir = context.packager.projectDir;
  const pkg = require(path.join(projectDir, 'package.json'));
  const iconPath = path.join(projectDir, 'build', 'icon.ico');
  const exePath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);

  if (!fs.existsSync(exePath)) {
    console.warn(`[afterPack] exe missing: ${exePath}`);
    return;
  }

  const productName = context.packager.appInfo.productName || pkg.build?.productName;
  const iconSize = fs.existsSync(iconPath) ? fs.statSync(iconPath).size : 0;
  const result = embedExeBranding(exePath, {
    iconPath,
    productName,
    version: pkg.version,
    description: '专利撰写助手',
  });

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'branding',
        hypothesisId: 'H-taskmgr-name',
        location: 'after-pack.cjs',
        message: 'exe branding embedded',
        data: { exePath, iconPath, iconSize, ...result },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  console.log(`[afterPack] branded exe (${result.iconCount} icons, v${result.version}): ${exePath}`);
};
