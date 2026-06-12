const { execFile, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { promisify } = require('util');
const { resolveSkillRoot } = require('./prompt');

const execFileAsync = promisify(execFile);

const NODE_VERSION = '22.14.0';
const NODE_MIRROR = `https://npmmirror.com/mirrors/node/v${NODE_VERSION}/node-v${NODE_VERSION}-win-x64.zip`;

function getToolsRoot() {
  const base = process.env.PATENT_USER_DATA || path.join(process.cwd(), 'server', 'data');
  const dir = path.join(base, 'tools');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getNodeDir() {
  return path.join(getToolsRoot(), 'node');
}

function getNpmPrefix() {
  return path.join(getToolsRoot(), 'npm-global');
}

function getMermaidCliBin() {
  return path.join(getNpmPrefix(), 'node_modules', '.bin', 'mmdc.cmd');
}

function getVendorTemplatePath() {
  const { resolveVendorTemplatePath } = require('./vendorTemplate');
  const skillRoot = resolveSkillRoot();
  return resolveVendorTemplatePath(skillRoot);
}

function getProgramFilesNode() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'nodejs', 'node.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'node.exe'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function getProgramFilesNpm() {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'nodejs', 'npm.cmd'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'nodejs', 'npm.cmd'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function debugLog(hypothesisId, location, message, data) {
  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'deps-ensure',
        hypothesisId,
        location,
        message,
        data,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion
}

function resolveNpmForNode(nodeExe) {
  if (!nodeExe || nodeExe === 'node') {
    const pf = getProgramFilesNpm();
    if (pf) return pf;
    return null;
  }
  const dir = path.dirname(nodeExe);
  const npmCmd = path.join(dir, 'npm.cmd');
  if (fs.existsSync(npmCmd)) return npmCmd;
  const npmSh = path.join(dir, 'npm');
  if (fs.existsSync(npmSh)) return npmSh;
  const npmCli = path.join(dir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (fs.existsSync(npmCli)) return { cli: npmCli, node: nodeExe };
  return getProgramFilesNpm();
}

async function discoverNodeCandidates() {
  const list = [];
  const bundled = path.join(getNodeDir(), 'node.exe');
  if (fs.existsSync(bundled)) list.push(bundled);
  const pf = getProgramFilesNode();
  if (pf) list.push(pf);
  if (process.platform === 'win32') {
    try {
      const { stdout } = await execFileAsync('where.exe', ['node'], { timeout: 10000, windowsHide: true });
      stdout.trim().split(/\r?\n/).forEach((line) => {
        const p = line.trim();
        if (p) list.push(p);
      });
    } catch { /* ignore */ }
  }
  return [...new Set(list.filter((p) => fs.existsSync(p)))];
}

async function commandExists(cmd, args = ['--version']) {
  try {
    await execFileAsync(cmd, args, { timeout: 15000, windowsHide: true });
    return true;
  } catch {
    return false;
  }
}

async function resolveSystemNode() {
  const candidates = await discoverNodeCandidates();
  for (const exe of candidates) {
    const npm = resolveNpmForNode(exe);
    if (!npm) continue;
    try {
      const { stdout } = await execFileAsync(exe, ['--version'], { timeout: 10000, windowsHide: true });
      return {
        exe,
        version: stdout.trim(),
        source: exe.includes(getToolsRoot()) ? 'bundled' : 'discovered',
        npm,
      };
    } catch { /* try next */ }
  }

  if (await commandExists('node')) {
    try {
      const { stdout } = await execFileAsync('node', ['--version'], { timeout: 10000, windowsHide: true });
      return { exe: 'node', version: stdout.trim(), source: 'system', npm: resolveNpmForNode('node') };
    } catch { /* fall through */ }
  }
  const bundled = path.join(getNodeDir(), 'node.exe');
  if (fs.existsSync(bundled)) {
    try {
      const { stdout } = await execFileAsync(bundled, ['--version'], { timeout: 10000, windowsHide: true });
      return { exe: bundled, version: stdout.trim(), source: 'bundled' };
    } catch { /* fall through */ }
  }
  const electronExe = process.env.PATENT_ELECTRON_EXE || process.execPath;
  if (electronExe && fs.existsSync(electronExe)) {
    try {
      const { stdout } = await execFileAsync(electronExe, ['--version'], {
        timeout: 10000,
        windowsHide: true,
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      });
      return { exe: electronExe, version: stdout.trim(), source: 'builtin', useElectronAsNode: true };
    } catch { /* fall through */ }
  }
  return null;
}

async function checkWord() {
  if (process.platform !== 'win32') return { ok: false, detail: '仅 Windows 支持 Word COM' };
  const ps = `
try {
  $w = New-Object -ComObject Word.Application
  $v = $w.Version
  $w.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($w) | Out-Null
  Write-Output "OK:$v"
  exit 0
} catch {
  Write-Output "FAIL:$($_.Exception.Message)"
  exit 1
}`;
  try {
    const { stdout } = await execFileAsync('powershell', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps,
    ], { timeout: 30000, windowsHide: true });
    const line = stdout.trim().split('\n').pop();
    if (line.startsWith('OK:')) {
      return { ok: true, version: line.slice(3), detail: `Microsoft Word ${line.slice(3)}` };
    }
    return { ok: false, detail: line.replace(/^FAIL:/, '') || '未检测到 Word' };
  } catch (err) {
    return { ok: false, detail: err.message || 'Word COM 检测失败' };
  }
}

async function checkMermaidCli(nodeInfo) {
  const mmdc = getMermaidCliBin();
  if (fs.existsSync(mmdc)) {
    return { ok: true, detail: mmdc, source: 'bundled' };
  }
  if (await commandExists('npx', ['--version'])) {
    return { ok: true, detail: 'npx @mermaid-js/mermaid-cli', source: 'npx' };
  }
  if (nodeInfo) return { ok: false, detail: 'mermaid-cli 未安装' };
  return { ok: false, detail: '需要 Node.js 才能安装 mermaid-cli' };
}

function formatNodeSource(source) {
  const labels = {
    builtin: '应用内置',
    bundled: '便携版',
    discovered: '本机',
    system: '系统',
  };
  return labels[source] || source;
}

async function checkAll() {
  const node = await resolveSystemNode();
  const pandocOk = await commandExists('pandoc');
  const word = await checkWord();
  const templatePath = getVendorTemplatePath();
  const templateOk = fs.existsSync(templatePath);
  const mermaid = await checkMermaidCli(node);

  const items = [
    {
      id: 'node',
      name: 'Node.js',
      required: true,
      ok: !!node,
      detail: node ? `${node.version}（${formatNodeSource(node.source)}）` : '未安装',
      installable: true,
    },
    {
      id: 'mermaid',
      name: 'Mermaid CLI（流程图 PNG）',
      required: true,
      ok: mermaid.ok,
      detail: mermaid.detail,
      installable: true,
    },
    {
      id: 'word',
      name: 'Microsoft Word',
      required: true,
      ok: word.ok,
      detail: word.detail,
      installable: false,
      hint: '请安装 Microsoft Office Word（2016 或更高版本）',
    },
    {
      id: 'template',
      name: '厂商 Word 模板',
      required: true,
      ok: templateOk,
      detail: templateOk ? templatePath : 'templates 下缺少 .docx 模板',
      installable: true,
      needsPandoc: !pandocOk,
    },
    {
      id: 'pandoc',
      name: 'Pandoc（模板/bootstrap 兜底）',
      required: !templateOk,
      ok: pandocOk,
      detail: pandocOk ? '已安装' : '未安装（生成厂商模板时需要）',
      installable: true,
    },
  ];

  const ready = items.filter((i) => i.required).every((i) => i.ok);

  return { ready, items, node, word, mermaid, templatePath };
}

function runWinget(args, timeout = 600000) {
  return new Promise((resolve, reject) => {
    const child = spawn('winget', args, { windowsHide: true, shell: false });
    let stderr = '';
    child.stderr?.on('data', (d) => { stderr += d.toString(); });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error('winget 超时'));
    }, timeout);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) resolve({ ok: true });
      else reject(new Error(stderr.trim() || `winget exit ${code}`));
    });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const get = url.startsWith('https') ? https.get : http.get;
    get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`下载失败 HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(dest)));
    }).on('error', reject);
  });
}

async function installPortableNode(log) {
  const nodeDir = getNodeDir();
  const nodeExe = path.join(nodeDir, 'node.exe');
  if (fs.existsSync(nodeExe)) {
    log.push('Node.js 便携版已存在');
    return nodeExe;
  }

  try {
    log.push('尝试 winget 安装 Node.js LTS…');
    await runWinget([
      'install', '--id', 'OpenJS.NodeJS.LTS',
      '--accept-package-agreements', '--accept-source-agreements',
      '--silent',
    ]);
    if (await commandExists('node')) {
      log.push('winget 安装 Node.js 成功');
      return getProgramFilesNode() || 'node';
    }
    const pf = getProgramFilesNode();
    if (pf) {
      log.push('winget 安装 Node.js 成功（Program Files）');
      return pf;
    }
  } catch (e) {
    log.push(`winget Node 失败: ${e.message}`);
  }

  log.push('下载 Node.js 便携版…');
  const zipPath = path.join(getToolsRoot(), 'node.zip');
  await downloadFile(NODE_MIRROR, zipPath);

  const extractDir = path.join(getToolsRoot(), 'node-extract');
  if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
  fs.mkdirSync(extractDir, { recursive: true });

  await execFileAsync('powershell', [
    '-NoProfile', '-Command',
    `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${extractDir.replace(/'/g, "''")}' -Force`,
  ], { timeout: 120000, windowsHide: true });

  const extracted = fs.readdirSync(extractDir).find((d) => d.startsWith('node-v'));
  if (!extracted) throw new Error('Node 解压目录未找到');
  const src = path.join(extractDir, extracted);
  if (fs.existsSync(nodeDir)) fs.rmSync(nodeDir, { recursive: true, force: true });
  fs.cpSync(src, nodeDir, { recursive: true });
  fs.unlinkSync(zipPath);
  fs.rmSync(extractDir, { recursive: true, force: true });

  if (!fs.existsSync(nodeExe)) throw new Error('Node 便携版安装失败');
  log.push(`Node.js 便携版已安装: ${nodeExe}`);
  return nodeExe;
}

async function installPandoc(log) {
  if (await commandExists('pandoc')) {
    log.push('Pandoc 已存在');
    return true;
  }
  try {
    log.push('尝试 winget 安装 Pandoc…');
    await runWinget([
      'install', '--id', 'JohnMacFarlane.Pandoc',
      '--accept-package-agreements', '--accept-source-agreements',
      '--silent',
    ]);
    if (await commandExists('pandoc')) {
      log.push('Pandoc 安装成功');
      return true;
    }
  } catch (e) {
    log.push(`winget Pandoc 失败: ${e.message}`);
  }
  return false;
}

async function verifyMermaidCliWorks() {
  const mmdc = getMermaidCliBin();
  if (!fs.existsSync(mmdc)) return false;
  const os = require('os');
  const tempMmd = path.join(os.tmpdir(), `patent_mmdc_probe_${Date.now()}.mmd`);
  const tempPng = path.join(os.tmpdir(), `patent_mmdc_probe_${Date.now()}.png`);
  fs.writeFileSync(tempMmd, 'flowchart TD\n  A-->B\n', 'utf8');
  try {
    const exportEnv = await getExportEnv();
    await execFileAsync(mmdc, ['-i', tempMmd, '-o', tempPng, '-b', 'white', '-w', '400', '-H', '300'], {
      timeout: 120000,
      windowsHide: true,
      env: exportEnv,
    });
    return fs.existsSync(tempPng) && fs.statSync(tempPng).size > 100;
  } catch {
    return false;
  } finally {
    try { fs.unlinkSync(tempMmd); } catch { /* ignore */ }
    try { fs.unlinkSync(tempPng); } catch { /* ignore */ }
  }
}

async function installMermaidCli(nodeInfo, log, force = false) {
  const mmdc = getMermaidCliBin();
  if (!force && fs.existsSync(mmdc)) {
    if (await verifyMermaidCliWorks()) {
      log.push('mermaid-cli 已安装且可用');
      return true;
    }
    log.push('mermaid-cli 依赖损坏，正在重新安装…');
    const brokenNm = path.join(getNpmPrefix(), 'node_modules');
    if (fs.existsSync(brokenNm)) fs.rmSync(brokenNm, { recursive: true, force: true });
  }

  const prefix = getNpmPrefix();
  fs.mkdirSync(prefix, { recursive: true });
  const runEnv = {
    ...process.env,
    npm_config_prefix: prefix,
    npm_config_cache: path.join(getToolsRoot(), 'npm-cache'),
  };

  log.push('安装 @mermaid-js/mermaid-cli + puppeteer（首次约 2～5 分钟）…');

  const npmArgs = [
    'install',
    '@mermaid-js/mermaid-cli@11.4.0',
    'puppeteer@23.11.1',
    '--prefix', prefix,
    '--legacy-peer-deps',
    '--no-fund',
    '--no-audit',
  ];
  const npm = nodeInfo?.npm || resolveNpmForNode(nodeInfo?.exe);

  if (npm && typeof npm === 'object' && npm.cli) {
    await execFileAsync(npm.node, [npm.cli, ...npmArgs.slice(1)], { timeout: 600000, windowsHide: true, env: runEnv });
  } else if (typeof npm === 'string' && fs.existsSync(npm)) {
    await execFileAsync(npm, npmArgs, { timeout: 600000, windowsHide: true, env: runEnv, shell: true });
  } else {
    throw new Error('找不到 npm，无法安装 mermaid-cli');
  }

  if (!fs.existsSync(mmdc)) {
    log.push('mermaid-cli 安装后仍未找到 mmdc.cmd');
    return false;
  }
  if (await verifyMermaidCliWorks()) {
    log.push('mermaid-cli 安装完成且渲染探针通过');
    return true;
  }
  log.push('mermaid-cli 安装完成但渲染探针失败，请检查网络/代理后重试');
  return false;
}

async function bootstrapVendorTemplate(log) {
  const tpl = getVendorTemplatePath();
  if (tpl && fs.existsSync(tpl)) {
    log.push(`厂商 Word 模板已存在 (${Math.round(fs.statSync(tpl).size / 1024)}KB)`);
    return true;
  }
  const skillRoot = resolveSkillRoot();
  const script = path.join(skillRoot, 'scripts', 'bootstrap-patent-vendor-template.ps1');
  if (!fs.existsSync(script)) {
    log.push('未找到 bootstrap-patent-vendor-template.ps1');
    return false;
  }
  if (!(await commandExists('pandoc'))) {
    log.push('缺少 Pandoc，无法自动生成厂商模板');
    return false;
  }
  log.push('运行 bootstrap 生成厂商 Word 模板…');
  const { runPowerShellScript } = require('./powershell');
  await runPowerShellScript(script, [], {}, 120000);
  if (fs.existsSync(tpl)) {
    log.push('厂商 Word 模板已生成');
    return true;
  }
  log.push('bootstrap 完成但未找到模板文件');
  return false;
}

async function ensureAll(options = {}) {
  const log = [];
  const errors = [];

  debugLog('H4', 'deps.js:ensureAll:start', 'ensure begin', {});

  let nodeExe = 'node';
  try {
    nodeExe = await installPortableNode(log);
  } catch (e) {
    errors.push(`Node.js: ${e.message}`);
    log.push(`Node 安装失败: ${e.message}`);
  }

  const nodeInfo = await resolveSystemNode();
  if (!nodeInfo) errors.push('Node.js 不可用');

  try {
    await installPandoc(log);
  } catch (e) {
    log.push(`Pandoc: ${e.message}`);
  }

  try {
    await installMermaidCli(nodeInfo, log);
  } catch (e) {
    errors.push(`mermaid-cli: ${e.message}`);
    log.push(`mermaid-cli 安装失败: ${e.message}`);
  }

  try {
    await bootstrapVendorTemplate(log);
  } catch (e) {
    log.push(`模板 bootstrap: ${e.message}`);
  }

  const status = await checkAll();
  debugLog('H4', 'deps.js:ensureAll:done', 'ensure complete', {
    ready: status.ready,
    logLines: log.length,
    errors,
  });

  return { ...status, log, errors, installed: log.length > 0 };
}

function buildToolPath(nodeInfo) {
  const parts = [];
  const nodeDir = getNodeDir();
  if (fs.existsSync(path.join(nodeDir, 'node.exe'))) {
    parts.push(nodeDir);
  }
  const pfNodeDir = getProgramFilesNode();
  if (pfNodeDir) parts.push(path.dirname(pfNodeDir));
  const npmBin = path.join(getNpmPrefix(), 'node_modules', '.bin');
  if (fs.existsSync(npmBin)) parts.push(npmBin);
  if (nodeInfo?.exe && nodeInfo.exe !== 'node' && fs.existsSync(path.dirname(nodeInfo.exe))) {
    parts.push(path.dirname(nodeInfo.exe));
  }
  return parts.join(path.delimiter);
}

async function getExportEnv() {
  const nodeInfo = await resolveSystemNode();
  const toolPath = buildToolPath(nodeInfo);
  const env = {
    ...process.env,
    PATH: toolPath ? `${toolPath}${path.delimiter}${process.env.PATH || ''}` : process.env.PATH,
    PATENT_NPM_PREFIX: getNpmPrefix(),
    PATENT_NODE_EXE: nodeInfo?.exe || 'node',
  };
  if (nodeInfo?.useElectronAsNode) env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

async function ensureBeforeExport() {
  let status = await checkAll();
  const mermaidItem = status.items?.find((i) => i.id === 'mermaid');
  if (mermaidItem?.ok && !(await verifyMermaidCliWorks())) {
    const log = [];
    await installMermaidCli(await resolveSystemNode(), log, true);
    status = await checkAll();
  }
  if (status.ready) return status;

  const result = await ensureAll({ force: true });
  if (!result.ready) {
    const missing = result.items.filter((i) => i.required && !i.ok).map((i) => i.name);
    throw new Error(
      `导出环境未就绪，缺少: ${missing.join('、')}。`
      + (result.items.find((i) => i.id === 'word' && !i.ok)?.hint || '')
      + ' 请在「设置 → 导出环境」中点击「一键安装依赖」。'
    );
  }
  return result;
}

module.exports = {
  checkAll,
  ensureAll,
  ensureBeforeExport,
  getExportEnv,
  getVendorTemplatePath,
  resolveSystemNode,
};
