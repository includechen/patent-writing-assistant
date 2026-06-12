/** 从 LLM/对话回复中稳健提取专利 Markdown（支持 markdown 围栏内嵌套 mermaid） */

function extractMarkdownFence(content) {
  for (const marker of ['```markdown', '```md']) {
    let from = 0;
    while (from < content.length) {
      const idx = content.indexOf(marker, from);
      if (idx < 0) break;
      const start = idx + marker.length;
      const rest = content.slice(start).replace(/^\r?\n/, '');
      const lines = rest.split(/\r?\n/);
      const bodyLines = [];
      let nestDepth = 0;
      for (const line of lines) {
        const t = line.trim();
        if (t === '```') {
          if (nestDepth > 0) {
            nestDepth -= 1;
            bodyLines.push(line);
            continue;
          }
          break;
        }
        if (/^```\w+/.test(t)) {
          nestDepth += 1;
        }
        bodyLines.push(line);
      }
      const body = bodyLines.join('\n').trim();
      if (body.length > 80 && isPatentBody(body)) return body;
      from = idx + marker.length;
    }
  }
  return null;
}

function isPatentBody(text) {
  return (
    text.includes('## 项 目')
    || text.includes('## 项目')
    || text.includes('## 技术术语')
    || text.includes('本发明的技术方案')
  );
}

function extractPlainPatent(content) {
  if (!isPatentBody(content)) return null;
  const startMarkers = ['# 专利', '## 项 目', '## 项目', '## 技术术语'];
  let start = -1;
  for (const m of startMarkers) {
    const i = content.indexOf(m);
    if (i >= 0 && (start < 0 || i < start)) start = i;
  }
  if (start < 0) start = 0;
  let end = content.length;
  for (const stop of ['## Skill 流程执行报告', '## Phase 6', '\n---\n\n## Skill']) {
    const i = content.indexOf(stop, start);
    if (i > start) end = Math.min(end, i);
  }
  const body = content.slice(start, end).trim();
  return body.length > 80 ? body : null;
}

function extractOrphanMermaidBlocks(content) {
  const blocks = [];
  const re = /```mermaid\s*\r?\n([\s\S]*?)```/gi;
  let m;
  while ((m = re.exec(content)) !== null) {
    const body = m[1].trim();
    if (body.length > 10) blocks.push(body);
  }
  return blocks;
}

function mergeOrphanMermaid(md, fullContent) {
  if (/```mermaid[\s\S]+?```/m.test(md)) return md;
  const orphans = extractOrphanMermaidBlocks(fullContent);
  if (!orphans.length) return md;
  const block = `\n\n\`\`\`mermaid\n${orphans[orphans.length - 1]}\n\`\`\`\n`;
  const marker = '## 图纸';
  if (md.includes(marker)) {
    const idx = md.indexOf(marker);
    const tail = md.slice(idx + marker.length);
    const nextSec = tail.search(/\n## /);
    const insertAt = nextSec >= 0 ? idx + marker.length + nextSec : md.length;
    return md.slice(0, insertAt) + block + md.slice(insertAt);
  }
  return `${md.trim()}\n\n${marker}\n${block}`;
}

function resolvePatentMarkdown(content) {
  if (!content || typeof content !== 'string') return null;
  const fenced = extractMarkdownFence(content);
  const plain = fenced ? null : extractPlainPatent(content);
  let md = fenced || plain || (isPatentBody(content) ? content.trim() : null);
  if (!md) return null;
  md = mergeOrphanMermaid(md, content);

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      signal: AbortSignal.timeout(300),
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'resolve-md',
        hypothesisId: 'H15',
        location: 'resolveMarkdown.js:resolvePatentMarkdown',
        message: 'patent md resolved',
        data: {
          mdLen: md.length,
          hasMermaid: /```mermaid/.test(md),
          source: fenced ? 'fence' : plain ? 'plain' : 'raw',
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  return md;
}

module.exports = {
  resolvePatentMarkdown,
  extractMarkdownFence,
  extractPlainPatent,
  mergeOrphanMermaid,
  isPatentBody,
};
