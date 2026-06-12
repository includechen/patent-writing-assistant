const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

/** PowerShell 5.1 默认按系统 ANSI 读 .ps1；无 BOM 的 UTF-8 中文会解析失败 */
function ensurePs1Utf8Bom(filePath) {
  if (!filePath.endsWith('.ps1') || !fs.existsSync(filePath)) return;
  const raw = fs.readFileSync(filePath);
  if (raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) return;
  const text = raw.toString('utf8').replace(/^\uFEFF/, '');
  fs.writeFileSync(filePath, `\uFEFF${text}`, 'utf8');
}

function ensurePs1DirUtf8Bom(scriptPath) {
  ensurePs1Utf8Bom(scriptPath);
  const dir = path.dirname(scriptPath);
  try {
    for (const name of fs.readdirSync(dir)) {
      if (name.endsWith('.ps1')) ensurePs1Utf8Bom(path.join(dir, name));
    }
  } catch { /* ignore */ }
}

function quotePsString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Windows 下 Node execFile + powershell -File 会在路径含空格时截断参数。
 * 统一改用 -Command "& 'script.ps1' -Arg 'value'"。
 */
async function runPowerShellScript(scriptPath, namedArgs = [], env = {}, timeout = 240000) {
  ensurePs1DirUtf8Bom(scriptPath);

  const argParts = [];
  for (let i = 0; i < namedArgs.length; i += 2) {
    const key = namedArgs[i];
    const val = namedArgs[i + 1];
    if (val === undefined || val === null || val === '') {
      argParts.push(key);
    } else {
      argParts.push(`${key} ${quotePsString(val)}`);
    }
  }
  const command = `& ${quotePsString(scriptPath)} ${argParts.join(' ')}`.trim();

  try {
    const { stdout, stderr } = await execFileAsync('powershell.exe', [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command', command,
    ], {
      timeout,
      windowsHide: true,
      env: { ...process.env, ...env },
      maxBuffer: 16 * 1024 * 1024,
    });
    return { stdout, stderr, command };
  } catch (err) {
    const detail = [err.stderr, err.stdout, err.message].filter(Boolean).join('\n').trim();
    const error = new Error(detail || err.message);
    error.command = command;
    throw error;
  }
}

module.exports = { runPowerShellScript, quotePsString, ensurePs1Utf8Bom, ensurePs1DirUtf8Bom };
