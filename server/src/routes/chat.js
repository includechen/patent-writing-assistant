const express = require('express');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { db, recordChatUsage } = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { callLLM } = require('../patent/llm');
const { runSkillPipeline, formatPhaseReport } = require('../patent/phases');
const fs = require('fs');
const {
  listOutputFiles,
  resolveInOutputs,
  openFileWithDefaultApp,
  showItemInFolder,
  openOutputFolder,
  findLatestPatentMarkdownFile,
} = require('../patent/outputs');
const { exportPatentToWord, getOutputDir, extractMarkdownFromResponse } = require('../patent/export');
const {
  isWordExportRequest,
  expandPatentGenerationMessage,
  looksLikePatent,
  findLastPatentContent,
  extractInventionTitle,
  formatExportSection,
} = require('../patent/pipeline');
const { classifyUserIntent } = require('../patent/intent');
const {
  resolvePriorArtSubject,
  runStandalonePriorArtSearch,
  formatPriorArtSearchReply,
  formatPriorArtNeedContentReply,
  formatSearchSitesInfoReply,
} = require('../patent/priorArtSearch');
const { trimHistoryForLlm, buildPatentDraftHistory, isContextTooLongError } = require('../patent/messageTrim');
const { parseUploadFiles, buildUserMessageWithAttachments, getAttachmentProfile } = require('../patent/attachments');
const { AUTO_MODEL_ID } = require('../patent/providerModels');

const router = express.Router();

const CHAT_MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHAT_MAX_FILES = 5;
const chatUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: CHAT_MAX_FILE_SIZE, files: CHAT_MAX_FILES },
});

function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'zh';
}

function resolveChatModelSelection(body = {}) {
  const selection = body.modelSelection || '';
  let settingsModels = body.settingsModels;
  if (typeof settingsModels === 'string') {
    try { settingsModels = JSON.parse(settingsModels); } catch { settingsModels = []; }
  }
  if (selection && selection !== AUTO_MODEL_ID) {
    return selection;
  }
  if (selection === AUTO_MODEL_ID && Array.isArray(settingsModels) && settingsModels.length) {
    return settingsModels.join(',');
  }
  if (selection === AUTO_MODEL_ID) {
    return process.env.LLM_MODELS || process.env.LLM_MODEL || AUTO_MODEL_ID;
  }
  return process.env.LLM_MODELS || process.env.LLM_MODEL || null;
}

function maybeChatUpload(req, res, next) {
  const ct = req.headers['content-type'] || '';
  if (ct.includes('multipart/form-data')) {
    return chatUpload.array('attachments', CHAT_MAX_FILES)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || '附件上传失败' });
      return next();
    });
  }
  return next();
}

router.use(authMiddleware);

function finishReply(res, convId, reply, extra = {}) {
  res.json({ conversationId: convId, reply, error: false, ...extra });
}

function finishError(res, convId, err) {
  const errorReply = `❌ 错误：${err.message || '生成失败'}`;
  db.insertMessage({ conversation_id: convId, role: 'assistant', content: errorReply });
  db.updateConversation(convId, {});
  res.json({ conversationId: convId, reply: errorReply, error: true });
}

function resolvePatentContentForExport(messages) {
  const fromChat = findLastPatentContent(messages);
  if (fromChat) {
    const md = extractMarkdownFromResponse(fromChat);
    if (md && md.length >= 200) {
      return { content: fromChat, title: extractInventionTitle(fromChat), source: 'chat' };
    }
  }
  const mdPath = findLatestPatentMarkdownFile();
  if (mdPath && fs.existsSync(mdPath)) {
    const md = fs.readFileSync(mdPath, 'utf8');
    if (md.length >= 200) {
      return { content: md, title: extractInventionTitle(md), source: 'outputs' };
    }
  }
  return null;
}

function replacePatentMarkdownInReply(reply, enrichedMd) {
  if (reply.includes('```markdown')) {
    return reply.replace(/```markdown\s*[\s\S]*?```/, `\`\`\`markdown\n${enrichedMd}\n\`\`\``);
  }
  if (reply.includes('```md')) {
    return reply.replace(/```md\s*[\s\S]*?```/, `\`\`\`markdown\n${enrichedMd}\n\`\`\``);
  }
  return `${reply}\n\n\`\`\`markdown\n${enrichedMd}\n\`\`\``;
}

async function tryAutoExport(content) {
  if (!looksLikePatent(content)) return null;
  try {
    const title = extractInventionTitle(content);
    const pipeline = await runSkillPipeline(content, title);
    if (pipeline.blocked) {
      return {
        mdPath: null,
        docxPath: null,
        pngPath: null,
        errors: [pipeline.blockReason],
        pipeline,
      };
    }
    return { ...pipeline.export, pipeline };
  } catch (err) {
    return { mdPath: null, docxPath: null, pngPath: null, errors: [err.message] };
  }
}

router.get('/conversations', (req, res) => {
  res.json(db.getConversationsByUser(req.user.id));
});

router.get('/conversations/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.json([]);
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 30));
  res.json(db.searchConversationMessages(req.user.id, q, limit));
});

router.get('/conversations/:id', (req, res) => {
  const conv = db.getConversation(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: '对话不存在' });
  res.json(conv);
});

router.delete('/conversations/:id', (req, res) => {
  const id = req.params.id;
  const conv = db.getConversation(id, req.user.id);
  if (!conv) return res.status(404).json({ error: '对话不存在' });
  const ok = db.deleteConversation(id, req.user.id);
  if (!ok) return res.status(404).json({ error: '对话不存在' });
  res.json({ ok: true, conversationId: id });
});

router.post('/new', (req, res) => {
  const convId = uuidv4();
  db.insertConversation({ id: convId, user_id: req.user.id, title: '新对话' });
  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'word-export-fix',
        hypothesisId: 'H1',
        location: 'chat.js:new',
        message: 'new conversation created',
        data: { convId, userId: req.user.id },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion
  res.json({ conversationId: convId });
});

router.get('/outputs', (_req, res) => {
  try {
    const data = listOutputFiles();
    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'output-panel',
          hypothesisId: 'H5',
          location: 'chat.js:outputs:list',
          message: 'list outputs',
          data: {
            dir: data.dir,
            fileCount: data.files.length,
            latestDocx: data.latestDocx?.name || null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/open-path', (req, res) => {
  const { filePath } = req.body || {};
  if (!filePath) return res.status(400).json({ error: '缺少路径' });
  try {
    const { resolved } = resolveInOutputs(filePath);
    showItemInFolder(resolved);
    res.json({ ok: true, mode: 'select' });
  } catch (err) {
    res.status(err.message.includes('不存在') ? 404 : 403).json({ error: err.message });
  }
});

router.post('/open-file', (req, res) => {
  const { filePath } = req.body || {};
  if (!filePath) return res.status(400).json({ error: '缺少路径' });
  try {
    const { resolved } = resolveInOutputs(filePath);
    openFileWithDefaultApp(resolved);
    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'output-panel',
          hypothesisId: 'H5',
          location: 'chat.js:outputs:openFile',
          message: 'open file',
          data: { filePath: resolved },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion
    res.json({ ok: true, mode: 'open' });
  } catch (err) {
    res.status(err.message.includes('不存在') ? 404 : 403).json({ error: err.message });
  }
});

router.post('/open-folder', (_req, res) => {
  try {
    const { dir } = listOutputFiles();
    openOutputFolder(dir);
    res.json({ ok: true, dir, mode: 'folder' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/send', maybeChatUpload, async (req, res) => {
  const body = req.body || {};
  const rawMessage = body.message || '';
  const conversationId = body.conversationId || null;
  const forceNew = body.forceNew === true || body.forceNew === 'true';
  const uploadedFiles = req.files || [];
  const parsed = parseUploadFiles(uploadedFiles);
  const fullMessage = buildUserMessageWithAttachments(rawMessage, parsed);

  if (!fullMessage) {
    return res.status(400).json({ error: '消息不能为空，请输入文字或添加附件' });
  }

  let convId = forceNew ? null : conversationId;
  const titleSource = rawMessage.trim() || uploadedFiles[0]?.originalname || '附件对话';
  if (!convId) {
    convId = uuidv4();
    const title = titleSource.slice(0, 40) + (titleSource.length > 40 ? '…' : '');
    db.insertConversation({ id: convId, user_id: req.user.id, title });
  } else {
    const conv = db.conversations.find((c) => c.id === convId && c.user_id === req.user.id);
    if (!conv) return res.status(404).json({ error: '对话不存在' });
  }

  const priorHistory = db.getMessages(convId);
  const intent = classifyUserIntent(rawMessage.trim() || fullMessage, priorHistory);
  const locale = normalizeLocale(body.locale);

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'locale-prompt',
        hypothesisId: 'H-locale-pass',
        location: 'chat.js:send:entry',
        message: 'send with locale',
        data: {
          convId,
          intent,
          locale,
          forceNew: !!forceNew,
          fileCount: uploadedFiles.length,
          imageCount: parsed.images.length,
          textCount: parsed.textBlocks.length,
          priorMsgCount: priorHistory.length,
          userPreview: rawMessage.trim().slice(0, 80),
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  // 仅导出 Word：不调用 LLM，直接对已有专利执行 Phase 6
  if (isWordExportRequest(rawMessage) && !forceNew && !uploadedFiles.length) {
    db.insertMessage({ conversation_id: convId, role: 'user', content: rawMessage.trim() });
    const resolved = resolvePatentContentForExport(priorHistory);
    if (!resolved) {
      return finishError(res, convId, new Error('未找到可导出的专利正文，请先生成完整专利 Markdown'));
    }
    try {
      const pipelineResult = await runSkillPipeline(resolved.content, resolved.title, { skipPhase36: true });
      const exportResult = pipelineResult.export || { errors: [pipelineResult.blockReason] };
      const reply = `正在执行 **Phase 2b + Phase 6（厂商模板填表）**…${formatPhaseReport(pipelineResult)}${formatExportSection(exportResult)}`;
      db.insertMessage({ conversation_id: convId, role: 'assistant', content: reply });
      db.updateConversation(convId, {});
      recordChatUsage(req.user.id, convId);
      return finishReply(res, convId, reply, { export: exportResult, phase: 6 });
    } catch (err) {
      return finishError(res, convId, err);
    }
  }

  db.insertMessage({ conversation_id: convId, role: 'user', content: fullMessage });
  const history = db.getMessages(convId);
  const hasPatentContext = !!findLastPatentContent(history);

  if (intent === 'search_sites_info') {
    const reply = formatSearchSitesInfoReply(locale);
    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'prior-art-meta-fix',
          hypothesisId: 'H-meta-not-search',
          location: 'chat.js:search_sites_info',
          message: 'answered search platform list (not prior art search)',
          data: { convId, userPreview: rawMessage.trim().slice(0, 80) },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion
    db.insertMessage({ conversation_id: convId, role: 'assistant', content: reply });
    db.updateConversation(convId, {});
    recordChatUsage(req.user.id, convId);
    return finishReply(res, convId, reply, { intent });
  }

  if (intent === 'prior_art_search') {
    const attachmentText = parsed.textBlocks.map((b) => b.content).join('\n\n');
    const subject = resolvePriorArtSubject(rawMessage.trim(), priorHistory, attachmentText);
    if (!subject) {
      const reply = formatPriorArtNeedContentReply(locale);
      db.insertMessage({ conversation_id: convId, role: 'assistant', content: reply });
      db.updateConversation(convId, {});
      recordChatUsage(req.user.id, convId);
      return finishReply(res, convId, reply, { intent, priorArtSearch: null });
    }
    try {
      const searchResult = await runStandalonePriorArtSearch(subject);
      const reply = formatPriorArtSearchReply(searchResult, locale);
      // #region agent log
      try {
        fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
          body: JSON.stringify({
            sessionId: '36d6f3',
            runId: 'prior-art-standalone',
            hypothesisId: 'H-prior-art',
            location: 'chat.js:prior_art_search',
            message: 'standalone prior art search done',
            data: {
              convId,
              title: subject.title,
              source: subject.source,
              hitCount: searchResult.phase3?.hits?.length || 0,
              overlapPct: searchResult.phase36?.overlapPct,
              phase36Pass: searchResult.phase36?.pass,
            },
            timestamp: Date.now(),
          }),
        }).catch(() => {});
      } catch { /* ignore */ }
      // #endregion
      db.insertMessage({ conversation_id: convId, role: 'assistant', content: reply });
      db.updateConversation(convId, {});
      recordChatUsage(req.user.id, convId);
      return finishReply(res, convId, reply, {
        intent,
        priorArtSearch: {
          title: subject.title,
          source: subject.source,
          phase36: searchResult.phase36,
          hitCount: searchResult.phase3?.hits?.length || 0,
        },
      });
    } catch (err) {
      return finishError(res, convId, err);
    }
  }

  let historyForLlm = history;
  let llmMode = 'chat';
  let runPipeline = false;
  let llmUserContent = fullMessage;

  if (intent === 'patent_draft') {
    llmMode = 'patent';
    runPipeline = true;
    const expanded = expandPatentGenerationMessage(rawMessage.trim() || fullMessage);
    llmUserContent = expanded !== rawMessage.trim() ? expanded : fullMessage;
    historyForLlm = buildPatentDraftHistory(history, llmUserContent);
  } else {
    llmMode = 'chat';
    runPipeline = false;
    historyForLlm = trimHistoryForLlm(historyForLlm);
  }

  try {
    const attachmentProfile = getAttachmentProfile(parsed);
    const selectedRaw = resolveChatModelSelection(body);
    const hasApiKey = !!(process.env.LLM_API_KEY && process.env.LLM_API_KEY !== 'sk-your-api-key-here');
    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'model-sync-v3',
          hypothesisId: 'H-apikey-path',
          location: 'chat.js:send:model',
          message: 'model selection resolved',
          data: {
            modelSelection: body.modelSelection,
            selectedRaw,
            hasApiKey,
            llmModels: process.env.LLM_MODELS || null,
            dotenvPath: process.env.DOTENV_PATH || null,
            userData: process.env.PATENT_USER_DATA || null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion
    let llmHistory = historyForLlm;
    let llmResult;
    try {
      llmResult = await callLLM(llmHistory, {
        mode: llmMode,
        locale,
        hasPatentContext,
        images: parsed.images,
        hasTextAttachments: parsed.textBlocks.length > 0,
        attachmentProfile,
        selectedRaw: selectedRaw || undefined,
      });
    } catch (llmErr) {
      if (isContextTooLongError(llmErr)) {
        llmHistory = llmMode === 'patent'
          ? buildPatentDraftHistory(history, llmUserContent, { minimal: true })
          : trimHistoryForLlm(history, { aggressive: true });
        llmResult = await callLLM(llmHistory, {
          mode: llmMode,
          locale,
          hasPatentContext,
          images: parsed.images,
          hasTextAttachments: parsed.textBlocks.length > 0,
          attachmentProfile,
          selectedRaw: selectedRaw || undefined,
        });
      } else {
        throw llmErr;
      }
    }
    const { content, model, usage, modelRoute } = llmResult;
    let finalReply = content;
    let exportResult = null;
    let pipelineResult = null;

    if (runPipeline && looksLikePatent(content)) {
      const title = extractInventionTitle(content);
      pipelineResult = await runSkillPipeline(content, title);
      if (pipelineResult.enrichedMd) {
        finalReply = replacePatentMarkdownInReply(finalReply, pipelineResult.enrichedMd);
      }
      finalReply += formatPhaseReport(pipelineResult);
      if (!pipelineResult.blocked) {
        exportResult = pipelineResult.export;
        finalReply += formatExportSection(exportResult);
      } else {
        exportResult = { errors: [pipelineResult.blockReason] };
      }
    }

    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'intent-routing',
          hypothesisId: 'H-pipeline-skip',
          location: 'chat.js:send:afterLlm',
          message: 'reply routed',
          data: {
            convId,
            intent,
            llmMode,
            runPipeline,
            pipelineRan: !!pipelineResult,
            looksLikePatent: looksLikePatent(content),
            docxPath: exportResult?.docxPath || null,
          },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion

    db.insertMessage({ conversation_id: convId, role: 'assistant', content: finalReply });
    db.updateConversation(convId, {});
    recordChatUsage(req.user.id, convId);

    res.json({
      conversationId: convId,
      reply: finalReply,
      model,
      modelRoute: modelRoute || null,
      usage,
      intent,
      error: false,
      export: exportResult,
      pipeline: pipelineResult,
    });
  } catch (err) {
    finishError(res, convId, err);
  }
});

router.post('/conversations/:id/reexport', async (req, res) => {
  const conv = db.getConversation(req.params.id, req.user.id);
  if (!conv) return res.status(404).json({ error: '对话不存在' });

  const resolved = resolvePatentContentForExport(conv.messages || []);
  if (!resolved) {
    return res.status(400).json({ error: '未找到可导出的专利正文，请先生成完整专利 Markdown' });
  }

  db.insertMessage({ conversation_id: conv.id, role: 'user', content: '重新导出 Word' });

  try {
    const pipelineResult = await runSkillPipeline(resolved.content, resolved.title, { skipPhase36: true });
    const exportResult = pipelineResult.export || { errors: [pipelineResult.blockReason] };
    const reply = `正在执行 **Phase 2b + Phase 6（厂商模板填表）**…${formatPhaseReport(pipelineResult)}${formatExportSection(exportResult)}`;
    db.insertMessage({ conversation_id: conv.id, role: 'assistant', content: reply });
    db.updateConversation(conv.id, {});
    recordChatUsage(req.user.id, conv.id);
    res.json({ conversationId: conv.id, reply, export: exportResult, pipeline: pipelineResult, error: !!pipelineResult.blocked });
  } catch (err) {
    finishError(res, conv.id, err);
  }
});

router.post('/prior-art-search', async (req, res) => {
  const body = req.body || {};
  const locale = normalizeLocale(body.locale);
  const title = String(body.title || '').trim();
  const content = String(body.content || body.message || '').trim();
  if (!content || content.length < 20) {
    return res.status(400).json({ error: locale === 'en' ? 'Technical content required (≥20 chars)' : '请提供至少 20 字的技术方案描述' });
  }
  const subject = {
    title: title || extractInventionTitle(content) || '技术方案查重',
    content,
    source: 'api',
  };
  try {
    const searchResult = await runStandalonePriorArtSearch(subject);
    const report = formatPriorArtSearchReply(searchResult, locale);
    res.json({
      ok: true,
      title: subject.title,
      report,
      phase36: searchResult.phase36,
      hits: (searchResult.phase3?.hits || []).slice(0, 10),
      query: searchResult.phase3?.query,
    });
  } catch (err) {
    res.status(500).json({ error: err.message || '查重失败' });
  }
});

router.post('/export', async (req, res) => {
  const { content, title } = req.body || {};
  if (!content) return res.status(400).json({ error: '缺少专利内容' });

  try {
    const result = await exportPatentToWord(content, title || extractInventionTitle(content));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message || '导出失败' });
  }
});

module.exports = router;
