const fs = require('fs');
const path = require('path');
const { execFile, spawn } = require('child_process');
const { promisify } = require('util');
const { getOutputDir } = require('./export');

const execFileAsync = promisify(execFile);

function resolveInOutputs(filePath) {
  const outputsRoot = path.resolve(getOutputDir());
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(outputsRoot)) {
    throw new Error('仅允许访问输出目录内的文件');
  }
  return { outputsRoot, resolved };
}

function formatFileEntry(name, fullPath) {
  const stat = fs.statSync(fullPath);
  const ext = path.extname(name).toLowerCase();
  let type = 'other';
  if (ext === '.docx' || ext === '.doc') type = 'word';
  else if (ext === '.md') type = 'markdown';
  else if (ext === '.png' || ext === '.jpg' || ext === '.jpeg') type = 'image';
  else if (ext === '.mmd') type = 'mermaid';

  return {
    name,
    path: fullPath,
    size: stat.size,
    modifiedAt: stat.mtime.toISOString(),
    type,
    ext: ext.slice(1) || 'file',
  };
}

function findLatestPatentMarkdownFile() {
  const dir = getOutputDir();
  if (!fs.existsSync(dir)) return null;
  const mds = fs.readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f.includes('技术交底书'))
    .map((f) => ({ f, p: path.join(dir, f), m: fs.statSync(path.join(dir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return mds.length ? mds[0].p : null;
}

function listOutputFiles() {
  const dir = getOutputDir();
  if (!fs.existsSync(dir)) {
    return { dir, files: [], latestDocx: null, counts: { word: 0, markdown: 0, image: 0, other: 0 } };
  }

  const files = fs.readdirSync(dir)
    .filter((f) => !f.startsWith('.') && fs.statSync(path.join(dir, f)).isFile())
    .map((f) => formatFileEntry(f, path.join(dir, f)))
    .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt));

  const counts = { word: 0, markdown: 0, image: 0, other: 0, mermaid: 0 };
  for (const f of files) {
    counts[f.type] = (counts[f.type] || 0) + 1;
  }

  const latestDocx = files.find((f) => f.type === 'word') || null;

  return { dir, files, latestDocx, counts };
}

function openFileWithDefaultApp(resolved) {
  if (!fs.existsSync(resolved)) throw new Error('文件不存在');

  if (process.platform === 'win32') {
    spawn('cmd', ['/c', 'start', '', resolved], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    }).unref();
    return;
  }

  try {
    const { shell } = require('electron');
    shell.openPath(resolved);
  } catch {
    execFile('xdg-open', [resolved], () => {});
  }
}

function showItemInFolder(resolved) {
  if (!fs.existsSync(resolved)) throw new Error('文件不存在');

  if (process.platform === 'win32') {
    execFile('explorer.exe', ['/select,', resolved], () => {});
    return;
  }

  try {
    const { shell } = require('electron');
    shell.showItemInFolder(resolved);
  } catch {
    execFile('xdg-open', [path.dirname(resolved)], () => {});
  }
}

function openOutputFolder(outputsRoot) {
  const dir = outputsRoot || getOutputDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (process.platform === 'win32') {
    execFile('explorer.exe', [dir], () => {});
    return;
  }

  try {
    const { shell } = require('electron');
    shell.openPath(dir);
  } catch {
    execFile('xdg-open', [dir], () => {});
  }
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

module.exports = {
  listOutputFiles,
  findLatestPatentMarkdownFile,
  resolveInOutputs,
  openFileWithDefaultApp,
  showItemInFolder,
  openOutputFolder,
  formatSize,
  getOutputDir,
};
