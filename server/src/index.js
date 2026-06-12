const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const envFromEnvVar = process.env.DOTENV_PATH;
const envCandidates = [
  envFromEnvVar,
  path.join(process.cwd(), 'config', '.env'),
  path.join(__dirname, '..', '..', 'config', '.env'),
  process.env.PATENT_USER_DATA ? path.join(process.env.PATENT_USER_DATA, '.env') : null,
].filter(Boolean);

for (const p of envCandidates) {
  if (fs.existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}
dotenv.config();

const { resolveLocalUser } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const chatRoutes = require('./routes/chat');
const statsRoutes = require('./routes/stats');
const settingsRoutes = require('./routes/settings');
const depsRoutes = require('./routes/deps');
const feedbackRoutes = require('./routes/feedback');

const app = express();
const PORT = process.env.SERVER_PORT || 3847;

function getAppVersion() {
  try {
    const pkgPath = process.env.PATENT_APP_ROOT
      ? path.join(process.env.PATENT_APP_ROOT, 'package.json')
      : path.join(__dirname, '..', '..', 'package.json');
    return require(pkgPath).version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}

app.use(cors());
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    version: getAppVersion(),
    features: ['multi-source-search', 'standalone-prior-art-search', 'output-poll-refresh', 'docx-diagram-openxml', 'table-page-adaptive', 'feedback-smtp-send', 'user-guide', 'flat-user-roles'],
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/stats', statsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/deps', depsRoutes);
app.use('/api/feedback', feedbackRoutes);

function resolveClientDist() {
  const resourcesPath = process.env.PATENT_RESOURCES_PATH || process.resourcesPath;
  const candidates = [
    process.env.PATENT_CLIENT_DIST,
    resourcesPath ? path.join(resourcesPath, 'app.asar.unpacked', 'client', 'dist') : null,
    process.env.PATENT_APP_ROOT
      ? path.join(process.env.PATENT_APP_ROOT.replace(/app\.asar$/i, 'app.asar.unpacked'), 'client', 'dist')
      : null,
    process.env.PATENT_APP_ROOT ? path.join(process.env.PATENT_APP_ROOT, 'client', 'dist') : null,
    path.join(__dirname, '..', '..', 'client', 'dist'),
    path.join(process.cwd(), 'client', 'dist'),
  ].filter(Boolean);

  const resolved = candidates.find((p) => {
    try { return fs.existsSync(p); } catch { return false; }
  }) || candidates[0];

  // #region agent log
  try {
    const logPath = process.env.PATENT_USER_DATA
      ? path.join(process.env.PATENT_USER_DATA, 'startup-debug.log')
      : null;
    const payload = {
      resolved,
      exists: fs.existsSync(resolved),
      candidates,
      patentClientDist: process.env.PATENT_CLIENT_DIST || null,
      resourcesPath: resourcesPath || null,
      patentAppRoot: process.env.PATENT_APP_ROOT || null,
      time: new Date().toISOString(),
    };
    if (logPath) fs.appendFileSync(logPath, JSON.stringify(payload) + '\n', 'utf8');
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'fix-v2',
        hypothesisId: 'H2',
        location: 'server/src/index.js:resolveClientDist',
        message: 'clientDist resolved',
        data: payload,
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  return resolved;
}

const clientDist = resolveClientDist();
const clientDistExists = fs.existsSync(clientDist);

// #region agent log
try {
  fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
    body: JSON.stringify({
      sessionId: '36d6f3',
      runId: 'post-fix',
      hypothesisId: 'H1',
      location: 'server/src/index.js:startup',
      message: 'clientDist resolution',
      data: {
        clientDist,
        clientDistExists,
        patentAppRoot: process.env.PATENT_APP_ROOT || null,
        cwd: process.cwd(),
        electronRunAsNode: process.env.ELECTRON_RUN_AS_NODE || null,
      },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
} catch { /* ignore */ }
// #endregion

if (clientDistExists) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
} else {
  app.get('/', (_req, res) => {
    res.status(503).send('前端资源未找到，请使用桌面客户端 loadFile 模式加载。');
  });
}

function ensureLocalUser() {
  const user = resolveLocalUser();
  console.log(`[init] 本地模式，用户: ${user.username} (id=${user.id})`);
}

ensureLocalUser();

if (process.platform === 'win32') {
  setImmediate(() => {
    try {
      const { ensureSkillMirror } = require('./patent/skillMirror');
      const mirrored = ensureSkillMirror();
      console.log('[patent-skill] root:', mirrored);
    } catch (err) {
      console.warn('[patent-skill] mirror failed:', err.message);
    }
    const { ensureAll } = require('./patent/deps');
    ensureAll({ background: true }).catch((err) => {
      console.warn('[patent-deps] 后台安装依赖失败:', err.message);
    });
  });
}

const server = app.listen(PORT, '127.0.0.1', () => {
  console.log(`[patent-server] http://127.0.0.1:${PORT}`);
});

module.exports = { app, server, PORT };
