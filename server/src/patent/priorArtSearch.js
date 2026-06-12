const {
  runPatentSearchPipeline,
  extractKeywordList,
  SEARCH_SITES,
} = require('./search');
const { extractInventionTitle, findLastPatentContent } = require('./pipeline');
const { extractMarkdownFromResponse } = require('./export');

const PRIOR_ART_TRIGGER_PATTERNS = [
  /^(请)?(帮我|给我|帮忙)?(联网)?查重[：:，,\s]/,
  /^(只做|只要|仅|单独)(技术方案)?查重/,
  /技术方案.*查重/,
  /查重.*技术方案/,
  /^检索现有技术/,
  /^现有技术检索/,
  /^prior[\s-]?art\s*(check|search)/i,
  /^联网检索[：:，,\s]/,
];

/** 询问能力/网站列表，而非对技术方案执行查重 */
const SEARCH_META_PATTERNS = [
  /(有多少|几个|多少家|哪些|什么|哪一些).*(网站|平台)/,
  /(网站|平台).*(多少|几个|列出|列出来|清单|列表|详细)/,
  /(能够|可以|能不能|能否|会不会).*(联网)?查重/,
  /联网查重.*(网站|平台)/,
  /(网站|平台).*联网查重/,
  /查重.*(网站|平台).*(多少|几个|列出|列出来)/,
  /怎么(做|进行|使用|让|让).*(联网)?查重/,
  /如何.*(联网)?查重/,
  /支持哪些.*(检索|查重)/,
  /(列出|列出来|介绍).*(检索|查重).*(网站|平台)/,
  /专利网站.*(多少|几个|列出)/,
];

function stripSearchCommandPrefix(text) {
  return (text || '')
    .replace(/^(请)?(帮我|给我|帮忙)?(联网)?(查重|检索现有技术|现有技术检索)[：:，,\s]*/i, '')
    .replace(/^(只做|只要|仅|单独)(技术方案)?查重[：:，,\s]*/i, '')
    .trim();
}

function extractTitleFromText(text) {
  const t = (text || '').trim();
  if (!t) return '技术方案查重';
  const line = t.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || t;
  const named = line.match(/(?:发明名称|项目名称|标题)[：:]\s*(.+)/i);
  if (named) return named[1].trim().slice(0, 80);
  if (/^一种/.test(line) && line.length <= 80) return line;
  if (line.length <= 60) return line;
  return `${line.slice(0, 56)}…`;
}

function buildPseudoPatentMd(title, content) {
  const body = (content || '').trim();
  return [
    '## 项 目',
    title,
    '',
    '## 本发明的技术方案',
    body,
    '',
    '## 发明点',
    body.slice(0, 800),
  ].join('\n');
}

/**
 * @returns {{ title: string, content: string, source: 'message'|'history'|'attachment' }}
 */
function isSearchMetaQuestion(message) {
  const t = (message || '').trim();
  if (!t) return false;
  return SEARCH_META_PATTERNS.some((p) => p.test(t));
}

function looksLikeTechnicalSolution(text) {
  const t = stripSearchCommandPrefix(text || '').trim();
  if (!t || isSearchMetaQuestion(t)) return false;
  if (/^一种/.test(t)) return true;
  if (/(方法|系统|装置|模块|步骤|流程|机制|算法|架构|设备)/.test(t) && t.length >= 30) return true;
  if (t.length >= 60 && /(包括|采用|通过|实现|用于|配置|处理|优化)/.test(t)) return true;
  return false;
}

function resolvePriorArtSubject(message, priorHistory = [], attachmentText = '') {
  if (isSearchMetaQuestion(message)) return null;

  const stripped = stripSearchCommandPrefix(message);
  if (stripped.length >= 40 && looksLikeTechnicalSolution(stripped)) {
    return {
      title: extractTitleFromText(stripped),
      content: stripped,
      source: 'message',
    };
  }

  if (attachmentText && attachmentText.trim().length >= 30) {
    return {
      title: extractTitleFromText(attachmentText),
      content: attachmentText.trim(),
      source: 'attachment',
    };
  }

  const lastPatent = findLastPatentContent(priorHistory);
  if (lastPatent) {
    const md = extractMarkdownFromResponse(lastPatent) || lastPatent;
    return {
      title: extractInventionTitle(md),
      content: md,
      source: 'history',
    };
  }

  for (let i = priorHistory.length - 1; i >= 0; i--) {
    const m = priorHistory[i];
    if (m.role !== 'user' || !m.content) continue;
    const userText = stripSearchCommandPrefix(m.content);
    if (userText.length >= 40) {
      return {
        title: extractTitleFromText(userText),
        content: userText,
        source: 'history',
      };
    }
  }

  return null;
}

function isPriorArtSearchRequest(message, priorHistory = []) {
  const t = (message || '').trim();
  if (!t || isSearchMetaQuestion(t)) return false;

  const subject = resolvePriorArtSubject(t, priorHistory);
  if (!subject) return false;

  if (PRIOR_ART_TRIGGER_PATTERNS.some((p) => p.test(t))) return true;
  if (/^prior[\s-]?art\s*(check|search)/i.test(t)) return true;

  if (/^(请)?(帮我|给我|帮忙)?(联网)?查重/.test(t)) return true;
  if (/^(只做|只要|仅|单独)(技术方案)?查重/.test(t)) return true;
  if (/检索现有技术|^现有技术检索/.test(t)) return true;

  if (/查重/.test(t) && looksLikeTechnicalSolution(subject.content)) return true;

  return false;
}

function formatSearchSitesInfoReply(locale = 'zh') {
  const isEn = locale === 'en';
  const liveApis = [
    { name: 'Google Patents', note: isEn ? 'Live API search in app' : '应用内自动 API 检索' },
    { name: 'OpenAlex', note: isEn ? 'Live API fallback' : '应用内 API 回退检索' },
    { name: 'Crossref', note: isEn ? 'Live API fallback' : '应用内 API 回退检索' },
  ];

  const lines = [];
  lines.push(isEn ? '## Patent search platforms supported' : '## 联网查重支持的专利检索平台');
  lines.push('');
  lines.push(isEn
    ? '> This answers **which sites the assistant uses**. To search **your technical solution**, send `Prior-art check:` + description — do not use this question as the search topic.'
    : '> 这是**平台能力说明**，不是对当前问题做查重。若要对**技术方案**查重，请发送「帮我查重：」+ 方案正文，不要把本问题当作查重主题。');
  lines.push('');
  lines.push(isEn
    ? `### Live API sources (${liveApis.length})`
    : `### 应用内自动联网 API（${liveApis.length} 个）`);
  lines.push('');
  liveApis.forEach((api, i) => {
    lines.push(`${i + 1}. **${api.name}** — ${api.note}`);
  });
  lines.push('');
  lines.push(isEn
    ? `### Platform entry points probed in Phase 3 (${SEARCH_SITES.length})`
    : `### Phase 3 权威平台入口（${SEARCH_SITES.length} 个，生成检索链接并探测可达性）`);
  lines.push('');
  lines.push('| ' + (isEn ? 'No. | Platform | Entry URL' : '序号 | 平台 | 入口链接') + ' |');
  lines.push('|------|------|------|');
  const sampleQuery = isEn ? 'sample query' : '示例检索式';
  SEARCH_SITES.forEach((s, i) => {
    const url = s.buildUrl(sampleQuery);
    lines.push(`| ${i + 1} | ${s.name} | ${url} |`);
  });
  lines.push('');
  lines.push(isEn ? '### Skill-recognized sites (≥10 required for full patent draft)' : '### Skill 认可的权威站点（撰写完整专利时须 ≥10 个）');
  lines.push('');
  lines.push(isEn
    ? 'Full patent drafting also references **20+ sites** in `docs/专利检索网站.md` (智慧芽、EPO、WIPO、国知局 PSS、soopat、佰腾、incopat, etc.). Standalone check uses the 12 entries above plus live APIs.'
    : '完整专利撰写流程还会引用 `docs/专利检索网站.md` 中 **20+ 权威站点**（智慧芽、EPO、WIPO、国知局 PSS、soopat、佰腾、合享 incopat 等）。**单独查重**使用上表 12 个入口 + 上述 3 个 API。');
  lines.push('');
  lines.push(isEn ? '### How to run a real prior-art check' : '### 如何对技术方案真正查重');
  lines.push(isEn
    ? '1. Send `Prior-art check:` + your technical steps/modules/effects'
    : '1. 发送「帮我查重：」+ 技术方案（步骤、模块、效果）');
  lines.push(isEn
    ? '2. Or describe your solution first, then send `Prior-art check`'
    : '2. 或先描述方案，再发「帮我查重」');
  lines.push(isEn
    ? '3. The server will query live APIs and return overlap analysis — **not** for meta questions like this one.'
    : '3. 服务端将联网检索并返回文献与重合分析——**不会**把「有哪些网站」这类问题当作查重主题。');

  return lines.join('\n');
}

async function runStandalonePriorArtSearch({ title, content }) {
  const pseudoMd = buildPseudoPatentMd(title, content);
  const keywords = extractKeywordList(title, pseudoMd);
  const result = await runPatentSearchPipeline(title, pseudoMd);
  return {
    title,
    keywords,
    ...result,
  };
}

function formatPriorArtSearchReply(result, locale = 'zh') {
  const isEn = locale === 'en';
  const today = new Date().toISOString().slice(0, 10);
  const { phase3, phase35, phase36, title, keywords } = result;
  const hits = phase3?.hits || [];
  const probes = phase3?.platformProbes || [];
  const sources = phase3?.searchSources || [];
  const query = phase3?.query || '—';
  const query2 = phase35?.query || '—';

  const lines = [];
  lines.push(isEn ? '## 🔍 Standalone prior-art search (live)' : '## 🔍 技术方案联网查重（已完成）');
  lines.push('');
  lines.push(isEn
    ? '> The assistant queried Google Patents, OpenAlex and Crossref via the local server, and probed 12 patent platforms. This is a **pre-filing self-check**, not an official search report.'
    : '> 已由桌面助手服务端联网检索 Google Patents、OpenAlex、Crossref，并对 12 个权威专利平台发起可达性探测。结果为**交底前自检**，不能替代正式申请的官方检索报告。');
  lines.push('');
  lines.push(isEn ? '### Summary' : '### 概要');
  lines.push(isEn ? `- **Subject**: ${title}` : `- **查重主题**：${title}`);
  lines.push(isEn ? `- **Date**: ${today}` : `- **检索日期**：${today}`);
  lines.push(isEn ? `- **Primary query**: \`${query}\`` : `- **主检索式**：\`${query}\``);
  lines.push(isEn ? `- **Self-check query**: \`${query2}\`` : `- **自检检索式**：\`${query2}\``);
  lines.push(isEn ? `- **Keywords (${keywords.length})**: ${keywords.slice(0, 12).join('、')}${keywords.length > 12 ? '…' : ''}` : `- **关键词（${keywords.length} 个）**：${keywords.slice(0, 12).join('、')}${keywords.length > 12 ? '…' : ''}`);
  lines.push('');

  lines.push(isEn ? '### Live API sources' : '### 联网检索源');
  lines.push('');
  lines.push('| ' + (isEn ? 'Source | Status | Hits | Note' : '检索源 | 状态 | 命中 | 备注') + ' |');
  lines.push('|------|------|------|------|');
  for (const s of sources) {
    const status = s.ok ? (isEn ? '✅ OK' : '✅ 成功') : (isEn ? '❌ Fail' : '❌ 失败');
    const note = s.ok ? (isEn ? 'results returned' : '已返回结果') : (s.error || '—');
    lines.push(`| ${s.name} | ${status} | ${s.count ?? 0} | ${note} |`);
  }
  lines.push('');

  lines.push(isEn ? '### Closest prior art' : '### 最接近现有技术');
  lines.push('');
  if (!hits.length) {
    lines.push(isEn
      ? '- No hits from live APIs. Use the platform links below for manual review.'
      : '- 联网 API 未返回命中结果，请使用下方平台链接人工复核。');
  } else {
    hits.slice(0, 8).forEach((h, i) => {
      lines.push(`${i + 1}. **${h.title}** ${h.number ? `（${h.number}）` : ''} — ${h.source || ''}`);
    });
  }
  lines.push('');

  const extra = phase35?.extraHits || [];
  if (extra.length) {
    lines.push(isEn ? '### Self-check additions' : '### 自检补充文献');
    lines.push('');
    extra.forEach((h, i) => {
      lines.push(`${i + 1}. **${h.title}** ${h.number ? `（${h.number}）` : ''}`);
    });
    lines.push('');
  }

  lines.push(isEn ? '### Keyword overlap (Phase 3.6)' : '### 关键词重合分析（Phase 3.6）');
  lines.push('');
  if (phase36?.pass) {
    lines.push(isEn
      ? `- ✅ Overlap **${phase36.overlapPct}%** (< 10%) — preliminary pass for standalone check.`
      : `- ✅ 关键词重合率 **${phase36.overlapPct}%**（< 10%），初判可通过。`);
  } else {
    lines.push(isEn
      ? `- ❌ Overlap **${phase36?.overlapPct ?? '?'}%** (≥ 10%) — consider differentiating the technical approach.`
      : `- ❌ 关键词重合率 **${phase36?.overlapPct ?? '?'}%**（≥ 10%），建议调整技术路径或发明点后再申请。`);
    if (phase36?.matched?.length) {
      lines.push(isEn
        ? `- Matched keywords: ${phase36.matched.slice(0, 10).join(', ')}`
        : `- 命中关键词：${phase36.matched.slice(0, 10).join('、')}`);
    }
  }
  lines.push('');

  lines.push(isEn ? '### Patent platform links (≥10)' : '### 权威检索平台链接（≥10）');
  lines.push('');
  SEARCH_SITES.forEach((s, i) => {
    const url = s.buildUrl(query);
    lines.push(`${i + 1}. [${s.name}](${url})`);
  });
  lines.push('');

  const probeOk = probes.filter((p) => p.ok).length;
  lines.push(isEn
    ? `### Platform reachability: ${probeOk}/${probes.length} reachable from this network`
    : `### 平台可达性：本网络下 ${probeOk}/${probes.length} 个平台可访问`);
  lines.push('');

  lines.push(isEn ? '### Next steps' : '### 建议下一步');
  lines.push(isEn
    ? '- Review hits and links above; refine differentiation if overlap is high.'
    : '- 对照上表文献与链接人工复核；若重合偏高，请优化发明点后再撰写完整交底书。');
  lines.push(isEn
    ? '- Say **「请按 Skill 撰写完整交底书」** when you are ready for full patent drafting + Word export.'
    : '- 方案成熟后，可说 **「请按 Skill 撰写完整交底书」** 生成八节正文并导出 Word。');

  return lines.join('\n');
}

function formatPriorArtNeedContentReply(locale = 'zh') {
  if (locale === 'en') {
    return [
      '## Prior-art search needs technical content',
      '',
      'Please provide one of the following:',
      '1. Paste your **technical solution** (steps, modules, effects) in this message, e.g. `Prior-art check: a method for …`',
      '2. Attach a **text/log document** describing the invention',
      '3. Run search on an **existing draft** in this chat (after you have discussed a solution here)',
      '',
      'Example: `Prior-art check\\nA method for optimizing Android memory by …`',
    ].join('\n');
  }
  return [
    '## 需要技术方案内容才能联网查重',
    '',
    '请任选一种方式：',
    '1. 在本条消息中**粘贴技术方案**（步骤、模块、效果等），例如：`帮我查重：一种基于……的方法`',
    '2. **上传**描述发明的文本/日志附件',
    '3. 在本对话中**先描述技术方案**，再发送「帮我查重」（将基于上文查重）',
    '',
    '示例：`帮我查重\\n一种基于使用频率与内存占用动态清理后台应用的方法，包括……`',
  ].join('\n');
}

module.exports = {
  isSearchMetaQuestion,
  isPriorArtSearchRequest,
  resolvePriorArtSubject,
  runStandalonePriorArtSearch,
  formatPriorArtSearchReply,
  formatPriorArtNeedContentReply,
  formatSearchSitesInfoReply,
  looksLikeTechnicalSolution,
};
