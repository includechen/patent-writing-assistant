const fs = require('fs');
const path = require('path');

/** 设置页「自动选模」伪选项（非真实 API 模型名） */
const AUTO_MODEL_ID = 'auto';

/**
 * @typedef {{ id: string, name: string, provider?: string, vision: boolean, reasoning: boolean, coding: boolean, tools: boolean, files: boolean, contextK?: number, tier: number, tags: string[] }} ProviderModel
 */

const AUTO_CATALOG_ENTRY = {
  id: AUTO_MODEL_ID,
  name: 'AUTO',
  provider: 'system',
  vision: true,
  reasoning: true,
  coding: true,
  tools: true,
  files: true,
  isAuto: true,
  tags: ['Auto', 'Vision', 'Files', 'Reasoning'],
};

const DEFAULT_SELECTED = [AUTO_MODEL_ID];

function buildTags(m) {
  const tags = [];
  if (m.tools) tags.push('Tools');
  if (m.files) tags.push('Files');
  if (m.vision) tags.push('Vision');
  if (m.reasoning) tags.push('Reasoning');
  if (m.coding) tags.push('Coding');
  if (m.contextK) tags.push(`${m.contextK}K`);
  return tags.length ? tags : ['Chat'];
}

/** 根据模型 ID 推断能力标签（用户未填写详情时使用） */
function inferCapabilities(modelId) {
  const id = String(modelId).toLowerCase();
  const vision = /gpt-4|gpt-5|gpt-image|claude|qwen.*vl|vision|gemini|4o|4\.1|5-chat/.test(id);
  const reasoning = /r1|reason|o1|o3|think|plus|max|sonnet|codex/.test(id);
  const coding = /coder|code|codex|deepseek-c|qwen.*coder/.test(id);
  const files = /gpt|claude|deepseek|qwen|gemini|llama/.test(id);
  const tier = /max|plus|4\.|5\.|sonnet|r1|pro/.test(id) ? 1 : 2;
  return { vision, reasoning, coding, tools: true, files, tier };
}

/**
 * @param {string | { id: string, name?: string, provider?: string, vision?: boolean, reasoning?: boolean, coding?: boolean, tools?: boolean, files?: boolean, contextK?: number, tier?: number }} entry
 * @returns {ProviderModel}
 */
function normalizeCatalogEntry(entry) {
  if (typeof entry === 'string') {
    const id = entry.trim();
    if (!id || id === AUTO_MODEL_ID) return null;
    const caps = inferCapabilities(id);
    return {
      id,
      name: id,
      provider: '',
      ...caps,
      tags: buildTags(caps),
    };
  }
  if (!entry || typeof entry !== 'object') return null;
  const id = String(entry.id || entry.name || '').trim();
  if (!id || id === AUTO_MODEL_ID) return null;
  const inferred = inferCapabilities(id);
  const merged = {
    id,
    name: String(entry.name || id).trim(),
    provider: String(entry.provider || '').trim(),
    vision: entry.vision ?? inferred.vision,
    reasoning: entry.reasoning ?? inferred.reasoning,
    coding: entry.coding ?? inferred.coding,
    tools: entry.tools ?? true,
    files: entry.files ?? inferred.files,
    contextK: entry.contextK,
    tier: entry.tier ?? inferred.tier,
  };
  return { ...merged, tags: buildTags(merged) };
}

function catalogFilePath() {
  if (process.env.LLM_MODEL_CATALOG_PATH) return process.env.LLM_MODEL_CATALOG_PATH;
  if (process.env.DOTENV_PATH) return path.join(path.dirname(process.env.DOTENV_PATH), 'llm-models.json');
  if (process.env.PATENT_USER_DATA) return path.join(process.env.PATENT_USER_DATA, 'llm-models.json');
  return path.join(process.cwd(), 'config', 'llm-models.json');
}

function readCatalogFile() {
  const filePath = catalogFilePath();
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCatalogEntry).filter(Boolean);
  } catch {
    return [];
  }
}

function writeCatalogFile(models) {
  const filePath = catalogFilePath();
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const normalized = models.map(normalizeCatalogEntry).filter(Boolean);
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2), 'utf8');
  process.env.LLM_MODEL_CATALOG = JSON.stringify(normalized);
  return normalized;
}

function parseCatalogJson(raw) {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCatalogEntry).filter(Boolean);
  } catch {
    return [];
  }
}

function seedCatalogFromSelected(rawSelected) {
  const ids = String(rawSelected || '')
    .split(/[,;|\s]+/)
    .map((s) => s.trim())
    .filter((id) => id && id !== AUTO_MODEL_ID);
  const unique = [...new Set(ids)];
  return unique.map((id) => normalizeCatalogEntry(id)).filter(Boolean);
}

/** @returns {ProviderModel[]} */
function getProviderModels() {
  const fromFile = readCatalogFile();
  if (fromFile.length) return fromFile;
  const fromEnv = parseCatalogJson(process.env.LLM_MODEL_CATALOG);
  if (fromEnv.length) return fromEnv;
  return seedCatalogFromSelected(process.env.LLM_MODELS || process.env.LLM_MODEL);
}

function getModelIdSet() {
  return new Set(getProviderModels().map((m) => m.id));
}

function getCatalog() {
  return [AUTO_CATALOG_ENTRY, ...getProviderModels().map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider,
    vision: m.vision,
    reasoning: m.reasoning,
    coding: m.coding,
    tools: m.tools,
    files: m.files,
    contextK: m.contextK,
    tags: m.tags,
  }))];
}

function serializeCatalog(models) {
  if (!Array.isArray(models)) return '[]';
  const normalized = models.map(normalizeCatalogEntry).filter(Boolean);
  return JSON.stringify(normalized.map((m) => ({
    id: m.id,
    name: m.name,
    provider: m.provider || undefined,
    vision: m.vision,
    reasoning: m.reasoning,
    coding: m.coding,
    tools: m.tools,
    files: m.files,
    contextK: m.contextK,
    tier: m.tier,
  })));
}

function parseSelectedModels(raw) {
  const modelIdSet = getModelIdSet();
  if (!raw) return [...DEFAULT_SELECTED];
  const ids = String(raw)
    .split(/[,;|\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const hasAuto = ids.includes(AUTO_MODEL_ID);
  const manual = ids.filter((id) => id !== AUTO_MODEL_ID && modelIdSet.has(id));
  if (hasAuto) return manual.length ? [AUTO_MODEL_ID, ...manual] : [AUTO_MODEL_ID];
  if (manual.length) return manual;
  const single = String(raw).trim();
  if (modelIdSet.has(single)) return [single];
  return [...DEFAULT_SELECTED];
}

function isAutoEnabled(selected) {
  const list = Array.isArray(selected) ? selected : parseSelectedModels(selected);
  return list.includes(AUTO_MODEL_ID);
}

function getManualModels(selected) {
  const list = Array.isArray(selected) ? selected : parseSelectedModels(selected);
  const modelIdSet = getModelIdSet();
  return list.filter((id) => id !== AUTO_MODEL_ID && modelIdSet.has(id));
}

function getModelById(id) {
  return getProviderModels().find((m) => m.id === id) || null;
}

function sanitizeSelectedModels(raw) {
  const parsed = parseSelectedModels(raw);
  const manual = getManualModels(parsed);
  const hasAuto = parsed.includes(AUTO_MODEL_ID);
  if (hasAuto) return manual.length ? [AUTO_MODEL_ID, ...manual] : [AUTO_MODEL_ID];
  if (manual.length) return manual;
  return [...DEFAULT_SELECTED];
}

function modelsCsvEqual(a, b) {
  return sanitizeSelectedModels(a).join(',') === sanitizeSelectedModels(b).join(',');
}

/** @deprecated use process.env.LLM_API_BASE — kept for backward-compatible imports */
const FIXED_API_BASE = '';

/** @deprecated use getProviderModels() */
const PROVIDER_MODELS = [];

module.exports = {
  AUTO_MODEL_ID,
  AUTO_CATALOG_ENTRY,
  DEFAULT_SELECTED,
  FIXED_API_BASE,
  PROVIDER_MODELS,
  getProviderModels,
  getCatalog,
  serializeCatalog,
  writeCatalogFile,
  readCatalogFile,
  parseCatalogJson,
  normalizeCatalogEntry,
  parseSelectedModels,
  isAutoEnabled,
  getManualModels,
  getModelById,
  sanitizeSelectedModels,
  modelsCsvEqual,
};
