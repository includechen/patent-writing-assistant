const { net } = require('electron');
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

function buildUserAgent(appVersion) {
  return `PatentAssistant/${appVersion || '0.0.0'}`;
}

function parseLatestYml(text) {
  const result = { version: '', path: '', sha512: '', size: 0, files: [] };
  for (const line of String(text).split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('version:')) {
      result.version = trimmed.slice('version:'.length).trim();
    } else if (trimmed.startsWith('path:')) {
      result.path = trimmed.slice('path:'.length).trim();
    } else if (trimmed.startsWith('sha512:') && !result.sha512) {
      result.sha512 = trimmed.slice('sha512:'.length).trim();
    } else if (trimmed.startsWith('size:')) {
      result.size = parseInt(trimmed.slice('size:'.length).trim(), 10) || 0;
    } else if (/^\s*-\s*url:/.test(line)) {
      result.files.push({ url: line.replace(/^\s*-\s*url:\s*/, '').trim() });
    }
  }
  return result;
}

function resolveDownloadUrl(meta, feedUrl) {
  const raw = meta.path || meta.files[0]?.url || '';
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return new URL(raw, feedUrl).toString();
}

function isNewerVersion(remote, local) {
  const r = String(remote).split('.').map((n) => parseInt(n, 10) || 0);
  const l = String(local).split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(r.length, l.length);
  for (let i = 0; i < len; i += 1) {
    const a = r[i] || 0;
    const b = l[i] || 0;
    if (a > b) return true;
    if (a < b) return false;
  }
  return false;
}

function fetchBufferElectronNet(url, userAgent, redirects = 8) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url });
    req.setHeader('User-Agent', userAgent);
    const chunks = [];
    req.on('response', (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        fetchBufferElectronNet(next, userAgent, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`内置网络 HTTP ${res.statusCode}`));
        return;
      }
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
    req.end();
  });
}

function fetchBufferNode(url, userAgent, redirects = 8) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': userAgent } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        fetchBufferNode(next, userAgent, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`备用网络 HTTP ${res.statusCode}`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

function fetchBufferCurl(url, userAgent, tempDir) {
  const tmp = path.join(tempDir, `fetch-${Date.now()}.tmp`);
  return new Promise((resolve, reject) => {
    const proc = spawn('curl.exe', ['-fsSL', '-A', userAgent, '-o', tmp, url], { windowsHide: true });
    proc.on('error', (err) => reject(new Error(`下载工具不可用: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`下载工具退出码 ${code}`));
        return;
      }
      try {
        resolve(fs.readFileSync(tmp));
      } catch (err) {
        reject(err);
      } finally {
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
      }
    });
  });
}

const VIA_LABEL = {
  'builtin-net': '内置网络',
  'node-http': '备用网络',
  curl: '下载工具',
};

async function fetchBuffer(url, { userAgent, tempDir, log }) {
  const errors = [];
  const attempts = [
    ['builtin-net', () => fetchBufferElectronNet(url, userAgent)],
    ['node-http', () => fetchBufferNode(url, userAgent)],
    ['curl', () => fetchBufferCurl(url, userAgent, tempDir)],
  ];
  for (const [name, fn] of attempts) {
    try {
      const buf = await fn();
      log?.('fetch-ok', { url, via: name, bytes: buf.length });
      return buf;
    } catch (err) {
      const msg = err?.message || String(err);
      errors.push(`${VIA_LABEL[name] || name}: ${msg}`);
      log?.('fetch-fail', { url, via: name, err: msg });
    }
  }
  throw new Error(errors.join(' | '));
}

function downloadFileElectronNet(url, dest, userAgent, onProgress, redirects = 8) {
  return new Promise((resolve, reject) => {
    const req = net.request({ method: 'GET', url });
    req.setHeader('User-Agent', userAgent);
    req.on('response', (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        downloadFileElectronNet(next, dest, userAgent, onProgress, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`内置网络 HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)));
      });
      res.on('error', reject);
      file.on('error', reject);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          onProgress(100);
          resolve(dest);
        });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function downloadFileNode(url, dest, userAgent, onProgress, redirects = 8) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(url, { headers: { 'User-Agent': userAgent } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        const next = new URL(res.headers.location, url).toString();
        res.resume();
        downloadFileNode(next, dest, userAgent, onProgress, redirects - 1).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        reject(new Error(`备用网络 HTTP ${res.statusCode}`));
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10);
      let received = 0;
      const file = fs.createWriteStream(dest);
      res.on('data', (chunk) => {
        received += chunk.length;
        if (total > 0) onProgress(Math.min(99, Math.round((received / total) * 100)));
      });
      res.on('error', reject);
      file.on('error', reject);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => {
          onProgress(100);
          resolve(dest);
        });
      });
    });
    req.on('error', reject);
  });
}

function downloadFileCurl(url, dest, userAgent) {
  return new Promise((resolve, reject) => {
    const proc = spawn('curl.exe', ['-fSL', '-A', userAgent, '-o', dest, url], { windowsHide: true });
    proc.on('error', (err) => reject(new Error(`下载工具不可用: ${err.message}`)));
    proc.on('close', (code) => {
      if (code !== 0) reject(new Error(`下载工具退出码 ${code}`));
      else resolve(dest);
    });
  });
}

async function downloadFile(url, dest, { userAgent, onProgress, log }) {
  const errors = [];
  const attempts = [
    ['builtin-net', () => downloadFileElectronNet(url, dest, userAgent, onProgress || (() => {}))],
    ['node-http', () => downloadFileNode(url, dest, userAgent, onProgress || (() => {}))],
    ['curl', async () => {
      onProgress?.(0);
      await downloadFileCurl(url, dest, userAgent);
      onProgress?.(100);
      return dest;
    }],
  ];
  for (const [name, fn] of attempts) {
    try {
      const result = await fn();
      log?.('download-ok', { url, via: name, dest });
      return result;
    } catch (err) {
      const msg = err?.message || String(err);
      errors.push(`${VIA_LABEL[name] || name}: ${msg}`);
      log?.('download-fail', { url, via: name, err: msg });
      try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch { /* ignore */ }
    }
  }
  throw new Error(errors.join(' | '));
}

function verifySha512(filePath, expected) {
  if (!expected) return true;
  const hash = crypto.createHash('sha512').update(fs.readFileSync(filePath)).digest('base64');
  if (hash !== expected) {
    throw new Error(`SHA512 mismatch (expected ${expected.slice(0, 12)}…, got ${hash.slice(0, 12)}…)`);
  }
  return true;
}

module.exports = {
  buildUserAgent,
  parseLatestYml,
  resolveDownloadUrl,
  isNewerVersion,
  fetchBuffer,
  downloadFile,
  verifySha512,
};
