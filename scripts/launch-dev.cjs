const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { embedExeBranding, PRODUCT_NAME_EXE } = require('../build/embed-exe-branding.cjs');

const root = path.join(__dirname, '..');
const srcExe = require('electron');
const devExe = path.join(__dirname, 'patent-assistant-dev.exe');

function needsRefresh() {
  if (!fs.existsSync(devExe)) return true;
  return fs.statSync(devExe).mtimeMs < fs.statSync(srcExe).mtimeMs;
}

if (needsRefresh()) {
  fs.copyFileSync(srcExe, devExe);
  try {
    embedExeBranding(devExe, { productName: PRODUCT_NAME_EXE });
    console.log(`[dev] branded launcher: ${devExe}`);
  } catch (err) {
    console.warn(`[dev] branding skipped: ${err.message}`);
  }
}

const child = spawn(devExe, ['.'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    PATENT_ELECTRON_EXE: devExe,
    PATENT_APP_DISPLAY_NAME: PRODUCT_NAME_EXE,
  },
});

child.on('exit', (code) => process.exit(code ?? 0));
