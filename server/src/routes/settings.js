const express = require('express');
const fs = require('fs');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const {
  AUTO_MODEL_ID,
  getCatalog,
  writeCatalogFile,
  parseSelectedModels,
  isAutoEnabled,
  getManualModels,
  DEFAULT_SELECTED,
  sanitizeSelectedModels,
  modelsCsvEqual,
  normalizeCatalogEntry,
} = require('../patent/providerModels');
const { pickPrimaryModel } = require('../patent/modelRouter');
const { getRecipient } = require('../patent/feedbackMail');

const router = express.Router();

function envPath() {
  if (process.env.DOTENV_PATH) return process.env.DOTENV_PATH;
  if (process.env.PATENT_USER_DATA) return path.join(process.env.PATENT_USER_DATA, '.env');
  return path.join(process.cwd(), 'config', '.env');
}

function computeModelEnvFields(modelsToSave) {
  const modelsCsv = modelsToSave.join(',');
  const primaryForEnv = modelsToSave.includes(AUTO_MODEL_ID)
    ? (getManualModels(modelsToSave)[0] || pickPrimaryModel({ mode: 'patent' }))
    : modelsToSave[0];
  return { modelsCsv, primaryForEnv };
}

function getApiBase() {
  return (process.env.LLM_API_BASE || '').trim();
}

function migrateModelsInEnv(modelsToSave) {
  const envFile = envPath();
  let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const { modelsCsv, primaryForEnv } = computeModelEnvFields(modelsToSave);
  content = upsertEnv(content, 'LLM_MODELS', modelsCsv);
  content = upsertEnv(content, 'LLM_MODEL', primaryForEnv);
  const configDir = path.dirname(envFile);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(envFile, content, 'utf8');
  process.env.LLM_MODELS = modelsCsv;
  process.env.LLM_MODEL = primaryForEnv;
  return { modelsCsv, primaryForEnv };
}

router.get('/llm', authMiddleware, (_req, res) => {
  try {
    const raw = process.env.LLM_MODELS || process.env.LLM_MODEL;
    const selectedModels = sanitizeSelectedModels(raw);
    if (!modelsCsvEqual(raw, selectedModels.join(','))) {
      migrateModelsInEnv(selectedModels);
    }
    res.json({
      apiBase: getApiBase(),
      apiBaseFixed: false,
      apiKeySet: !!(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'sk-your-api-key-here'),
      apiKeyPreview: maskKey(process.env.LLM_API_KEY),
      model: selectedModels[0] || DEFAULT_SELECTED[0],
      selectedModels,
      autoEnabled: isAutoEnabled(selectedModels),
      manualModels: getManualModels(selectedModels),
      catalog: getCatalog(),
    });
  } catch (err) {
    console.error('[settings] GET /llm failed:', err);
    res.status(500).json({ error: err.message || '加载 LLM 配置失败' });
  }
});

router.get('/smtp', authMiddleware, (_req, res) => {
  res.json({
    host: process.env.FEEDBACK_SMTP_HOST || '',
    port: process.env.FEEDBACK_SMTP_PORT || '587',
    secure: process.env.FEEDBACK_SMTP_SECURE === 'true',
    user: process.env.FEEDBACK_SMTP_USER || '',
    passSet: !!process.env.FEEDBACK_SMTP_PASS,
    from: process.env.FEEDBACK_FROM || '',
    to: getRecipient(),
    tlsInsecure: process.env.FEEDBACK_SMTP_TLS_INSECURE === 'true',
    configured: !!(
      process.env.FEEDBACK_SMTP_HOST
      && process.env.FEEDBACK_SMTP_USER
      && process.env.FEEDBACK_SMTP_PASS
    ),
  });
});

router.put('/smtp', authMiddleware, (req, res) => {
  const { host, port, secure, user, pass, from, to, tlsInsecure } = req.body || {};
  const envFile = envPath();
  let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';

  const normalizedPort = port !== undefined ? String(port) : undefined;
  let normalizedSecure = secure;
  if (normalizedPort === '587' || normalizedPort === '25') normalizedSecure = false;
  if (normalizedPort === '465') normalizedSecure = true;

  if (host !== undefined) content = upsertEnv(content, 'FEEDBACK_SMTP_HOST', host);
  if (normalizedPort !== undefined) content = upsertEnv(content, 'FEEDBACK_SMTP_PORT', normalizedPort);
  if (normalizedSecure !== undefined) {
    content = upsertEnv(content, 'FEEDBACK_SMTP_SECURE', normalizedSecure ? 'true' : 'false');
  }
  if (user !== undefined) content = upsertEnv(content, 'FEEDBACK_SMTP_USER', user);
  if (pass) content = upsertEnv(content, 'FEEDBACK_SMTP_PASS', pass);
  if (from !== undefined) content = upsertEnv(content, 'FEEDBACK_FROM', from);
  if (to !== undefined) content = upsertEnv(content, 'FEEDBACK_TO', to);
  if (tlsInsecure !== undefined) {
    content = upsertEnv(content, 'FEEDBACK_SMTP_TLS_INSECURE', tlsInsecure ? 'true' : 'false');
  }

  const configDir = path.dirname(envFile);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(envFile, content, 'utf8');

  if (host !== undefined) process.env.FEEDBACK_SMTP_HOST = host;
  if (normalizedPort !== undefined) process.env.FEEDBACK_SMTP_PORT = normalizedPort;
  if (normalizedSecure !== undefined) {
    process.env.FEEDBACK_SMTP_SECURE = normalizedSecure ? 'true' : 'false';
  }
  if (user !== undefined) process.env.FEEDBACK_SMTP_USER = user;
  if (pass) process.env.FEEDBACK_SMTP_PASS = pass;
  if (from !== undefined) process.env.FEEDBACK_FROM = from;
  if (to !== undefined) process.env.FEEDBACK_TO = to;
  if (tlsInsecure !== undefined) {
    process.env.FEEDBACK_SMTP_TLS_INSECURE = tlsInsecure ? 'true' : 'false';
  }

  res.json({ ok: true, message: 'SMTP 配置已更新' });
});

const {
  PRIMARY_UPDATE_URL,
  GITEE_RAW_UPDATE_URL,
  GITEE_BROWSER_DOWNLOAD_PAGE,
} = require('../updateSources.cjs');

const DEFAULT_UPDATE_URL = PRIMARY_UPDATE_URL;

function normalizeUpdateUrl(url) {
  if (!url) return '';
  let u = String(url).trim().replace(/\/+$/, '');
  if (
    u.includes('patent-draft-android')
    || u.includes('/desktop-releases')
    || u.includes('patent-draft-android-desktop-releases')
  ) {
    u = PRIMARY_UPDATE_URL.replace(/\/+$/, '');
  }
  return u;
}

function readBuiltinUpdateConfig() {
  const candidates = [
    process.env.PATENT_APP_ROOT
      ? path.join(process.env.PATENT_APP_ROOT, 'config', 'update.json')
      : null,
    path.join(__dirname, '..', '..', '..', 'config', 'update.json'),
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (cfg.url) return String(cfg.url).trim().replace(/\/+$/, '');
      } catch { /* ignore */ }
    }
  }
  return DEFAULT_UPDATE_URL;
}

router.get('/update', authMiddleware, (_req, res) => {
  const envUrl = process.env.PATENT_UPDATE_URL || '';
  const effectiveUrl = normalizeUpdateUrl(envUrl) || readBuiltinUpdateConfig();
  let currentVersion = '';
  try {
    const pkgPath = process.env.PATENT_APP_ROOT
      ? path.join(process.env.PATENT_APP_ROOT, 'package.json')
      : path.join(__dirname, '..', '..', '..', 'package.json');
    currentVersion = require(pkgPath).version || '';
  } catch { /* ignore */ }
  res.json({
    url: effectiveUrl,
    browserFallbackUrl: GITEE_BROWSER_DOWNLOAD_PAGE,
    enabled: !!effectiveUrl,
    currentVersion,
    builtin: !envUrl,
  });
});

router.put('/update', authMiddleware, (req, res) => {
  const { url } = req.body || {};
  const envFile = envPath();
  let content = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
  const normalized = (url || '').trim().replace(/\/+$/, '');
  content = upsertEnv(content, 'PATENT_UPDATE_URL', normalized);
  const configDir = path.dirname(envFile);
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(envFile, content, 'utf8');
  process.env.PATENT_UPDATE_URL = normalized;
  res.json({ ok: true, message: '更新服务器配置已保存，重启应用后生效', url: normalized });
});

router.put('/llm', authMiddleware, (req, res) => {
  try {
    const { apiBase, apiKey, model, selectedModels, catalog } = req.body || {};
    const envFile = envPath();
    let content = '';

    if (fs.existsSync(envFile)) {
      content = fs.readFileSync(envFile, 'utf8');
    } else {
      const exampleCandidates = [
        path.join(process.cwd(), 'config', '.env.example'),
        process.env.PATENT_APP_ROOT ? path.join(process.env.PATENT_APP_ROOT, 'config', '.env.example') : null,
      ].filter(Boolean);
      for (const example of exampleCandidates) {
        if (fs.existsSync(example)) {
          content = fs.readFileSync(example, 'utf8');
          break;
        }
      }
    }

    if (apiBase !== undefined) {
      const normalizedBase = String(apiBase || '').trim().replace(/\/+$/, '');
      content = upsertEnv(content, 'LLM_API_BASE', normalizedBase);
      process.env.LLM_API_BASE = normalizedBase;
    }

    if (Array.isArray(catalog)) {
      writeCatalogFile(catalog);
    }

    if (apiKey) content = upsertEnv(content, 'LLM_API_KEY', apiKey);

    let modelsToSave = null;
    if (Array.isArray(selectedModels) && selectedModels.length) {
      modelsToSave = sanitizeSelectedModels(selectedModels.join(','));
    } else if (model) {
      modelsToSave = sanitizeSelectedModels(model);
    }

    if (!modelsToSave || !modelsToSave.length) {
      return res.status(400).json({ error: '请至少选择 AUTO 或一个模型' });
    }

    const { modelsCsv, primaryForEnv } = computeModelEnvFields(modelsToSave);
    content = upsertEnv(content, 'LLM_MODELS', modelsCsv);
    content = upsertEnv(content, 'LLM_MODEL', primaryForEnv);

    const configDir = path.dirname(envFile);
    if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(envFile, content, 'utf8');

    if (apiKey) process.env.LLM_API_KEY = apiKey;
    process.env.LLM_MODELS = modelsCsv;
    process.env.LLM_MODEL = primaryForEnv;

    res.json({
      ok: true,
      message: 'LLM 配置已更新',
      selectedModels: modelsToSave,
      autoEnabled: isAutoEnabled(modelsToSave),
      apiBase: getApiBase(),
      catalog: getCatalog(),
    });
  } catch (err) {
    console.error('[settings] PUT /llm failed:', err);
    res.status(500).json({ error: err.message || '保存 LLM 配置失败' });
  }
});

function maskKey(key) {
  if (!key || key.length < 8) return '';
  return key.slice(0, 4) + '****' + key.slice(-4);
}

function upsertEnv(content, key, value) {
  const line = `${key}=${value}`;
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) return content.replace(regex, line);
  return content.trimEnd() + '\n' + line + '\n';
}

module.exports = router;
