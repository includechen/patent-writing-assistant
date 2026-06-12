const { extractMarkdownFromResponse } = require('./export');
const { isPatentBody } = require('./resolveMarkdown');

function isWordExportRequest(message) {
  const t = (message || '').trim();
  if (/^(随机)?生成(一个)?专利$/.test(t)) return false;
  return /word|docx|导出|重新导出|输出.*word|转成.*word|转换.*word|phase\s*6/i.test(t);
}

function isPatentGenerationRequest(message) {
  const t = (message || '').trim();
  return /^(随机)?生成(一个)?专利$|随机生成.*专利|帮我(撰写|写|生成).*专利|撰写.*专利.*交底书/i.test(t);
}

function expandPatentGenerationMessage(message) {
  const t = (message || '').trim();
  if (!isPatentGenerationRequest(t)) return message;
  if (/^(随机)?生成(一个)?专利$/.test(t)) {
    return '请随机生成一个软件或硬件技术相关的发明专利，严格按 Skill Phase 1～6 输出完整交底书（单个 ```markdown 代码块，含八节、【】引导语、Mermaid 流程图含菱形判断分支、Phase 3～5 附录），完成后自动导出 Word。';
  }
  return `${t}。请严格按专利 Skill Phase 1～6 撰写完整交底书，输出须为单个 \`\`\`markdown 代码块，含八节正文、【】六句引导语、Mermaid 流程图（含菱形判断+是/否分支）及 Phase 3～5 附录。`;
}

function looksLikePatent(content) {
  if (!content) return false;
  const md = extractMarkdownFromResponse(content) || content;
  return (
    md.includes('## 项 目')
    || md.includes('## 技术术语')
    || md.includes('本发明的技术方案')
    || md.includes('专利质量自评')
    || md.includes('Phase 5')
    || (md.includes('```markdown') && md.length > 2000)
  );
}

function findLastPatentContent(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== 'assistant' || !m.content) continue;
    if (m.content.startsWith('❌')) continue;
    if (m.content.includes('Phase 6 — Word 交付') && !m.content.includes('```markdown')) continue;
    const md = extractMarkdownFromResponse(m.content);
    if (md && isPatentBody(md) && md.length >= 200) return m.content;
  }
  return null;
}

function extractInventionTitle(content) {
  const md = extractMarkdownFromResponse(content) || content;
  const m1 = md.match(/^##\s*项\s*目\s*\r?\n+(.+)/m) || md.match(/^##\s*项目\s*\r?\n+(.+)/m);
  if (m1) return m1[1].trim().slice(0, 80);
  const m2 = md.match(/^#\s*专利[_\—-]*(.+?)_/m);
  if (m2) return m2[1].trim().slice(0, 80);
  return '专利输出';
}

function formatExportSection(exportResult) {
  if (!exportResult) return '';
  const lines = ['\n\n---\n\n## Phase 6 — Word 交付（Skill：厂商模板复制→填表→另存）'];
  if (exportResult.docxPath) {
    lines.push(`✅ **Word 文档已生成**`);
    lines.push(`- Word: \`${exportResult.docxPath}\``);
  } else {
    lines.push(`⚠️ **Word 未能自动生成**`);
  }
  if (exportResult.mdPath) lines.push(`- Markdown: \`${exportResult.mdPath}\``);
  if (exportResult.pngPath) lines.push(`- 流程图 PNG: \`${exportResult.pngPath}\``);
  if (exportResult.errors?.length) {
    lines.push(`- 备注: ${exportResult.errors.join('；')}`);
  }
  lines.push('\n> 可直接在资源管理器中打开上述路径。');
  return lines.join('\n');
}

module.exports = {
  isWordExportRequest,
  isPatentGenerationRequest,
  expandPatentGenerationMessage,
  looksLikePatent,
  findLastPatentContent,
  extractInventionTitle,
  formatExportSection,
};
