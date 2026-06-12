const {
  looksLikePatent,
  extractInventionTitle,
  findLastPatentContent,
} = require('./pipeline');
const { extractMarkdownFromResponse } = require('./export');

const LARGE_MSG_THRESHOLD = 3500;
const DEFAULT_MAX_CHARS = 24000;
const PATENT_DRAFT_MAX_CHARS = 16000;
const PATENT_EXCERPT_MAX = 10000;

function summarizeLargeContent(content) {
  if (!content || content.length <= LARGE_MSG_THRESHOLD) return content;

  if (looksLikePatent(content) || content.includes('## 项 目') || content.includes('```markdown')) {
    const title = extractInventionTitle(content);
    return `（此前已生成完整专利交底书《${title}》，正文较长已从上下文省略。可继续咨询细节或要求修改。）`;
  }

  if (content.includes('Phase 6 — Word 交付') || content.includes('Word 文档已生成')) {
    const docx = content.match(/Word:\s*`([^`]+)`/);
    const md = content.match(/Markdown:\s*`([^`]+)`/);
    const parts = ['（此前已完成 Word 导出'];
    if (docx) parts.push(`Word: ${docx[1]}`);
    if (md) parts.push(`MD: ${md[1]}`);
    return `${parts.join('，')}）`;
  }

  if (content.includes('Phase ') && content.length > LARGE_MSG_THRESHOLD) {
    return '（此前已完成专利 Skill 流水线阶段处理，详细报告已从上下文省略。）';
  }

  return `${content.slice(0, 600)}…（后续内容已省略）`;
}

function estimateChars(messages) {
  return messages.reduce((sum, m) => sum + String(m.content || '').length, 0);
}

/**
 * Compress conversation history before LLM calls (chat / consult).
 */
function trimHistoryForLlm(messages, { maxChars = DEFAULT_MAX_CHARS, aggressive = false } = {}) {
  if (!Array.isArray(messages) || !messages.length) return messages;

  let trimmed = messages.map((m) => (
    m.role === 'assistant'
      ? { ...m, content: summarizeLargeContent(m.content) }
      : m
  ));

  if (estimateChars(trimmed) <= maxChars && !aggressive) return trimmed;

  const patentSource = findLastPatentContent(messages);
  const contextNote = patentSource
    ? [{
      role: 'assistant',
      content: `（本会话已有专利文稿《${extractInventionTitle(patentSource)}》，正文已压缩。请基于该专利回答用户，勿重复输出全文。）`,
    }]
    : [];

  const tail = [];
  const limit = aggressive ? 6 : 10;
  for (let i = trimmed.length - 1; i >= 0 && tail.length < limit; i -= 1) {
    const m = trimmed[i];
    if (m.role === 'assistant' && looksLikePatent(messages[i]?.content || '')) continue;
    tail.unshift(m);
  }

  const result = [...contextNote, ...tail];
  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'context-trim-v1',
        hypothesisId: 'H-input-too-long',
        location: 'messageTrim.js:trimHistoryForLlm',
        message: 'history trimmed for LLM',
        data: {
          originalCount: messages.length,
          originalChars: estimateChars(messages),
          resultCount: result.length,
          resultChars: estimateChars(result),
          aggressive,
          hasPatentNote: !!patentSource,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion
  return result.length ? result : trimmed.slice(-4);
}

function isRewriteRequest(message) {
  return /重新(撰写|生成|写)|重写|改写|修订|优化.*版本|完善.*版本|再写一版/.test(message || '');
}

function extractPatentExcerpt(rawContent, maxLen = PATENT_EXCERPT_MAX) {
  const md = extractMarkdownFromResponse(rawContent) || rawContent || '';
  if (md.length <= maxLen) return md;
  const sections = md.split(/\n(?=## )/);
  let result = '';
  for (const sec of sections) {
    if (result.length + sec.length > maxLen) {
      const remain = maxLen - result.length;
      if (remain > 300) result += `${sec.slice(0, remain)}\n…（本节后续已省略）\n`;
      break;
    }
    result += sec;
  }
  return result.trim() || `${md.slice(0, maxLen)}…`;
}

/**
 * Patent draft / rewrite: send anchor patent + current instruction, not full multi-turn history.
 */
function buildPatentDraftHistory(messages, llmUserContent, { minimal = false, maxChars = PATENT_DRAFT_MAX_CHARS } = {}) {
  const prior = messages.slice(0, -1);
  const priorPatent = findLastPatentContent(prior.length ? prior : messages);
  const excerptMax = minimal ? 5000 : PATENT_EXCERPT_MAX;

  if (priorPatent && (minimal || isRewriteRequest(llmUserContent))) {
    const title = extractInventionTitle(priorPatent);
    const excerpt = extractPatentExcerpt(priorPatent, excerptMax);
    const result = [
      {
        role: 'user',
        content: [
          `【参考专利】《${title}》`,
          '以下为已有交底书（供重写/优化参考，勿原样照抄）：',
          '```markdown',
          excerpt,
          '```',
        ].join('\n'),
      },
      { role: 'user', content: llmUserContent },
    ];
    logTrim('buildPatentDraftHistory:rewrite', messages, result, { minimal, title });
    return result;
  }

  const trimmed = trimHistoryForLlm(prior, { maxChars: Math.floor(maxChars * 0.5), aggressive: true });
  let result = [...trimmed, { role: 'user', content: llmUserContent }];
  if (estimateChars(result) > maxChars) {
    result = [{ role: 'user', content: llmUserContent }];
    if (priorPatent) {
      result.unshift({
        role: 'user',
        content: `【参考】\`${extractInventionTitle(priorPatent)}\` 要点摘要：\n\`\`\`markdown\n${extractPatentExcerpt(priorPatent, 4000)}\n\`\`\``,
      });
    }
  }
  logTrim('buildPatentDraftHistory:default', messages, result, { minimal });
  return result;
}

function logTrim(tag, original, result, extra = {}) {
  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'context-trim-v2',
        hypothesisId: 'H-patent-rewrite-trim',
        location: `messageTrim.js:${tag}`,
        message: 'patent draft context built',
        data: {
          originalCount: original.length,
          originalChars: estimateChars(original),
          resultCount: result.length,
          resultChars: estimateChars(result),
          ...extra,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion
}

function isContextTooLongError(err) {
  const msg = String(err?.message || err || '');
  return /too long|context length|maximum.*token|max_tokens|input is too long/i.test(msg);
}

module.exports = {
  trimHistoryForLlm,
  buildPatentDraftHistory,
  summarizeLargeContent,
  isContextTooLongError,
  isRewriteRequest,
};
