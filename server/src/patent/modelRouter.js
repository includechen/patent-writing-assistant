const {
  getProviderModels,
  parseSelectedModels,
  getModelById,
  DEFAULT_SELECTED,
  isAutoEnabled,
  getManualModels,
} = require('./providerModels');

/**
 * @typedef {{ images?: number, text?: number, office?: number, archive?: number, binary?: number }} AttachmentProfile
 */

/**
 * @param {AttachmentProfile} profile
 */
function inferTaskNeeds(profile = {}, opts = {}) {
  const { mode = 'chat', hasImages = false, hasTextAttachments = false } = opts;
  const p = {
    images: profile.images || (hasImages ? 1 : 0),
    text: profile.text || (hasTextAttachments ? 1 : 0),
    office: profile.office || 0,
    archive: profile.archive || 0,
    binary: profile.binary || 0,
  };

  return {
    needVision: p.images > 0,
    needFiles: p.text > 0 || p.office > 0,
    needLongContext: p.text > 0 || mode === 'patent',
    needReasoning: mode === 'patent' || mode === 'consult' || p.office > 0,
    needCoding: mode === 'patent',
    needFast: mode === 'chat' && !p.images && !p.office && !p.text,
    profile: p,
  };
}

function buildPool(selectedRaw) {
  const selected = parseSelectedModels(selectedRaw || process.env.LLM_MODELS || process.env.LLM_MODEL);
  const auto = isAutoEnabled(selected);
  const manual = getManualModels(selected);

  if (auto) {
    if (manual.length) {
      return manual.map((id) => getModelById(id)).filter(Boolean);
    }
    return [...getProviderModels()];
  }

  let pool = manual.map((id) => getModelById(id)).filter(Boolean);
  if (!pool.length) {
    pool = DEFAULT_SELECTED
      .filter((id) => id !== 'auto')
      .map((id) => getModelById(id))
      .filter(Boolean);
  }
  return pool;
}

/**
 * 按场景为已选模型排序，返回调用顺序（首选 → 备选）
 * @param {{ mode?: string, hasImages?: boolean, hasTextAttachments?: boolean, attachmentProfile?: AttachmentProfile, selectedRaw?: string }} opts
 * @returns {{ models: string[], auto: boolean, reason: string }}
 */
function rankModelsForTask(opts = {}) {
  const needs = inferTaskNeeds(opts.attachmentProfile, opts);
  let pool = buildPool(opts.selectedRaw);

  if (needs.needVision) {
    const visionPool = pool.filter((m) => m.vision);
    if (visionPool.length) {
      pool = visionPool;
    } else {
      pool = getProviderModels().filter((m) => m.vision);
    }
  }

  const score = (m) => {
    let s = 0;
    const tierBonus = (4 - (m.tier || 3)) * 10;
    const { mode = 'chat' } = opts;
    const p = needs.profile;

    if (needs.needVision && m.vision) s += 50;
    if (needs.needFiles && m.files) s += 22;
    if (needs.needLongContext && m.contextK && m.contextK >= 128) s += 12;

    if (p.office > 0) {
      if (m.vision) s += 18;
      if (m.reasoning) s += 20;
      if (m.files) s += 15;
    }

    if (p.text > 0 && m.files) s += 16;
    if (p.archive > 0 && m.reasoning) s += 10;

    if (mode === 'patent') {
      if (m.reasoning) s += 30;
      if (m.coding) s += 25;
    } else if (mode === 'consult') {
      if (m.reasoning) s += 28;
      if (m.tools) s += 8;
    } else if (needs.needFast) {
      if (m.tier >= 3) s += 18;
    } else {
      if (m.tools) s += 6;
    }

    if (needs.needReasoning && m.reasoning) s += 15;
    if (needs.needCoding && m.coding) s += 12;

    return s + tierBonus;
  };

  const ranked = [...pool].sort((a, b) => score(b) - score(a)).map((m) => m.id);

  const auto = isAutoEnabled(parseSelectedModels(opts.selectedRaw || process.env.LLM_MODELS || process.env.LLM_MODEL));
  let reason = 'manual';
  if (auto) {
    if (needs.needVision && needs.profile.office) reason = 'auto:vision+office';
    else if (needs.needVision) reason = 'auto:vision';
    else if (needs.profile.office) reason = 'auto:office';
    else if (needs.profile.text) reason = 'auto:text';
    else if (opts.mode === 'patent') reason = 'auto:patent';
    else if (opts.mode === 'consult') reason = 'auto:consult';
    else reason = 'auto:chat';
  }

  return { models: ranked, auto, reason };
}

function pickPrimaryModel(opts = {}) {
  const { models } = rankModelsForTask(opts);
  return models[0] || 'deepseek-coder';
}

module.exports = { rankModelsForTask, pickPrimaryModel, inferTaskNeeds, buildPool };
