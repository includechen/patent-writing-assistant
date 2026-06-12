const { runAllGates } = require('./gates');
const { runPatentSearchPipeline } = require('./search');
const { exportPatentToWord, extractMarkdownFromResponse } = require('./export');
const { normalizePatentMarkdown } = require('./normalize');

function formatPhaseReport(result) {
  const lines = ['\n\n---\n\n## Skill 流程执行报告'];
  lines.push(`- Word 填表门禁：${result.gates?.word?.pass ? '✅ 通过' : '❌ 未通过'}`);
  if (result.sectionsRepaired?.length) {
    const unique = [...new Set(result.sectionsRepaired)];
    lines.push(`- Phase 2 补全：已自动撰写/补全章节（${unique.join('、')}）`);
  }
  if (result.mermaidInjected) lines.push('- Phase 2 补全：已根据「本发明的技术方案」自动生成 Mermaid 流程图（含判断分支）');
  if (result.gates?.errors?.length) lines.push(`  - ${result.gates.errors.join('；')}`);
  if (result.gates?.warnings?.length) lines.push(`  - ${result.gates.warnings.join('；')}`);
  if (result.search) {
    const srcSummary = (result.search.phase3?.searchSources || [])
      .filter((s) => s.ok && (s.count || 0) > 0)
      .map((s) => `${s.name}(${s.count})`)
      .join('、') || '无联网命中';
    lines.push(`- Phase 3 查重：${result.search.phase3?.siteCount || 0} 平台入口 + 联网命中 ${result.search.phase3?.hits?.length || 0}（${srcSummary}）`);
    lines.push(`- Phase 3.5 自检：\`${result.search.phase35?.query || '-'}\``);
    lines.push(`- Phase 3.6：${result.search.phase36?.pass ? '✅ 通过' : '❌ 未通过'}`);
  }
  if (result.export) {
    const p2b = result.export.phase2b;
    if (p2b?.skipped && result.export.pngPath) {
      lines.push('- Phase 2b PNG：✅（已存在）');
    } else {
      lines.push(`- Phase 2b PNG：${result.export.pngPath ? '✅' : '❌'}`);
    }
    lines.push(`- Phase 6 Word（厂商模板填表）：${result.export.docxPath ? '✅' : '❌'}`);
    if (result.export.diagramInserted === true) lines.push('- Phase 6 图纸插图：✅（已写入 Word「图纸」格）');
    else if (result.export.diagramInserted === false) lines.push('- Phase 6 图纸插图：⚠️ COM 失败，已尝试 OpenXML 补插');
    if (result.export.templatePath) lines.push(`  - 模板：\`${result.export.templatePath}\``);
    if (result.export.docxPath) lines.push(`  - 输出：\`${result.export.docxPath}\``);
    if (result.export.errors?.length) lines.push(`  - ${result.export.errors.join('；')}`);
  }
  return lines.join('\n');
}

async function runSkillPipeline(rawContent, inventionTitle, options = {}) {
  let md = extractMarkdownFromResponse(rawContent) || rawContent;
  if (!md || md.length < 200) {
    throw new Error('未找到有效专利 Markdown');
  }

  const norm = normalizePatentMarkdown(md, { title: inventionTitle });
  md = norm.md;
  const sectionsRepaired = [...(norm.sectionsRepaired || [])];

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'skill-pipeline',
        hypothesisId: 'H12',
        location: 'phases.js:normalize',
        message: 'md normalized',
        data: { mermaidInjected: norm.mermaidInjected, mdLen: md.length },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  // Phase 3～5：服务端自动补全（Skill 规定由 Agent 执行，桌面端代为写入查重/自检等节）
  const search = await runPatentSearchPipeline(inventionTitle, md);
  md = search.enrichedMd;

  // 查重节注入后再次规范化，确保流程图/八节齐全
  const norm2 = normalizePatentMarkdown(md, { title: inventionTitle });
  if (norm2.mermaidInjected) norm.mermaidInjected = true;
  sectionsRepaired.push(...(norm2.sectionsRepaired || []));
  md = norm2.md;

  const gates = runAllGates(md);
  const result = {
    gates,
    search,
    export: null,
    enrichedMd: md,
    blocked: false,
    mermaidInjected: norm.mermaidInjected,
    sectionsRepaired,
  };

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'skill-pipeline',
        hypothesisId: 'H3',
        location: 'phases.js:gates',
        message: 'gate check after repair',
        data: {
          pass: gates.pass,
          errors: gates.word?.errors || [],
          sectionsRepaired,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  if (!gates.pass) {
    result.blocked = true;
    result.blockReason = `无法导出 Word：${gates.word.errors.join('；')}`;
    // #region agent log
    try {
      fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
        body: JSON.stringify({
          sessionId: '36d6f3',
          runId: 'skill-pipeline',
          hypothesisId: 'H12',
          location: 'phases.js:blocked',
          message: 'export blocked',
          data: { errors: gates.word.errors },
          timestamp: Date.now(),
        }),
      }).catch(() => {});
    } catch { /* ignore */ }
    // #endregion
    return result;
  }

  if (!options.skipPhase36 && !search.phase36.pass) {
    result.blocked = true;
    result.blockReason = search.phase36.reason;
    return result;
  }

  result.export = await exportPatentToWord(md, inventionTitle);
  return result;
}

module.exports = { runSkillPipeline, formatPhaseReport };
