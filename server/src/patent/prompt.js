const fs = require('fs');
const path = require('path');
const { ensureSkillMirror } = require('./skillMirror');

function resolveSkillRoot() {
  const mirrored = ensureSkillMirror();
  if (mirrored && fs.existsSync(path.join(mirrored, 'SKILL.md'))) return mirrored;

  const candidates = [
    process.env.PATENT_SKILL_ROOT,
    process.env.PATENT_SKILL_ROOT_SOURCE,
    path.join(process.resourcesPath || '', 'patent-skill'),
    path.join(process.cwd(), '..', 'patent-draft-android'),
    path.join(__dirname, '..', '..', '..', 'patent-draft-android'),
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(path.join(p, 'SKILL.md'))) return p;
  }
  return candidates[0];
}

function readIfExists(filePath, maxLen = 0) {
  try {
    if (!fs.existsSync(filePath)) return '';
    const content = fs.readFileSync(filePath, 'utf8');
    if (maxLen > 0 && content.length > maxLen) {
      return content.slice(0, maxLen) + '\n\n...(truncated)';
    }
    return content;
  } catch {
    return '';
  }
}

function normalizeLocale(locale) {
  return locale === 'en' ? 'en' : 'zh';
}

function buildSystemPrompt(options = {}) {
  const locale = normalizeLocale(options.locale);
  const skillRoot = resolveSkillRoot();
  const skillMd = readIfExists(path.join(skillRoot, 'SKILL.md'));
  const templateMd = readIfExists(
    path.join(skillRoot, 'templates', `${'专利模板_一种实现TopActivity的有序广播保护状态设定的方法+技术交底书'}.md`),
  );
  const guideCheck = readIfExists(path.join(skillRoot, 'workflows', '厂商引导语自检.md'));
  const flowGuide = readIfExists(path.join(skillRoot, 'workflows', '技术流程图生成说明.md'));
  const searchSites = readIfExists(path.join(skillRoot, 'docs', '专利检索网站.md'));
  const qualityStd = readIfExists(path.join(skillRoot, 'workflows', '优秀专利标准.md'));
  const wordGuide = readIfExists(path.join(skillRoot, 'docs', '模板与Word输出说明.md'));

  const langSection = locale === 'en'
    ? `## Response language
- UI locale is **English**: write all assistant-facing explanations, phase status, and commentary in **English**.
- The patent markdown document inside the code block should still follow the Chinese vendor template sections unless the user explicitly requests English.

`
    : '';

  return `你是「专利撰写助手」。**唯一权威流程为下方完整 SKILL.md**，必须逐 Phase 1→2→2b→3→3.5→3.6→4→5→6 严格执行。适用于软件、硬件、算法、通信、制造等各技术领域的发明专利撰写。

${langSection}## 你的职责（Phase 1～5 全文由你撰写）
- **Phase 1**：需求与三性准备
- **Phase 2**：按 templates/ 厂商模板撰写八节正文；**6 处【】引导语须逐字置于对应节首**；技术方案按步骤分点；图纸含**详细 Mermaid 流程图（菱形判断+是/否分支）**
- **Phase 3**：撰写「查重与检索说明」（检索日期=今天 ${new Date().toISOString().slice(0, 10)}；列出≥10平台；最接近2～3篇文献及区别）
- **Phase 3.5**：撰写「查重自检」小节（不同检索式/站点交叉验证）
- **Phase 4**：新创行评估 + 可行性与商业价值
- **Phase 5**：专利质量自评（**目标 P0**）

## 服务端自动执行（你不得替用户运行脚本，但须产出可被脚本消费的 MD）
- **Phase 2b**：\`patent-mermaid-to-png.ps1\`（Mermaid→PNG 并替换为图片引用）
- **Phase 3 增强**：应用联网检索 Google Patents 并刷新查重章节
- **Phase 3.6**：应用计算关键词重合率；≥10% 则阻断交付
- **Phase 6**：\`md2docx.ps1 -PatentFullMd\` → \`patent-fill-template-word.ps1\` 厂商模板**复制→填表→另存**（**禁止** Pandoc 直转作为交付）

## 禁止
- 禁止跳过任一 Phase；禁止省略【】六句引导语；禁止图纸无 Mermaid；禁止编造专利号
- 禁止 LaTeX（\\( \\)、$ $、\\theta 等）出现在填表八节正文
- 禁止告诉用户「请手动运行 PowerShell / 请自行查重 / 请复制到 Word」

## 输出格式
- 完整专利放在单个 \`\`\`markdown 代码块中
- 章节顺序与 templates/专利模板_…+技术交底书.md **完全一致**
- 须含：项 目、技术术语、背 景 技 术、本发明的技术方案、图纸、有 益 效 果、发明点、技术联系人、查重与检索说明、查重自检、新创行评估、可行性与商业价值、专利质量自评

## 完整技能文档 SKILL.md（必须遵守）
${skillMd}

## 固定模板 templates/
${templateMd}

## 【】引导语自检
${guideCheck}

## 技术流程图
${flowGuide}

## 检索网站
${searchSites}

## 优秀专利标准
${qualityStd}

## Word 交付说明
${wordGuide}
`;
}

function buildChatSystemPrompt(options = {}) {
  const { hasPatentContext = false, locale: rawLocale } = options;
  const locale = normalizeLocale(rawLocale);

  if (locale === 'en') {
    const contextNote = hasPatentContext
      ? '\n## Context\nThis conversation already contains patent drafts or technical discussion. Answer specifically based on history; do not repeat a full disclosure document.'
      : '';

    return `You are the **Patent Drafting Assistant** conversational advisor, helping users across industries understand patent drafting, prior-art search, novelty, and solution optimization.

## Current mode: Q&A chat (not auto-generating disclosure)
- Users may chat casually, ask who you are, consult on patent topics, or discuss revisions to existing solutions.
- **Do NOT** output a full eight-section disclosure or \`\`\`markdown code block unless the user explicitly requests it.
- **Do NOT** claim Phase 6 ran, Word was auto-exported, or invent local file paths.
- **Always respond in clear, professional English** (match the English UI locale), even if the user mixes languages.
- If the user asks "who are you", briefly introduce your capabilities and explain they can say "draft a patent for…" or describe a complete technical solution to begin.
- If the user needs a **full patent disclosure**, prompt them to say "draft the full disclosure per Skill" or provide a complete technical description.
- Users may attach images or logs/documents; text attachment content is embedded in messages; images can be understood with vision-capable models. Use attachments in your answer.
- **Do NOT** claim you cannot search the web: when the user sends prior-art check commands with technical content, the **desktop server** runs live search automatically. In chat mode, explain concepts; to run search, ask them to send \`Prior-art check:\` + technical description.${contextNote}`;
  }

  const contextNote = hasPatentContext
    ? '\n## 上下文\n当前对话中已有专利草稿或技术讨论，请结合历史**针对性**回答，不要重复输出完整交底书。'
    : '';

  return `你是「专利撰写助手」的**对话顾问**，帮助各行业用户理解专利撰写、查重、新颖性与方案优化。

## 当前模式：咨询对话（非自动生成交底书）
- 用户可能在闲聊、询问身份、咨询专利问题，或在已有方案基础上讨论修改思路。
- **禁止**在用户未明确要求时输出完整八节交底书或 \`\`\`markdown 代码块。
- **禁止**声称已执行 Phase 6、已自动导出 Word，或编造本地文件路径。
- **禁止**声称「无法联网查重」：当用户发送「帮我查重」「技术方案查重」等指令且带有技术内容时，应用会**自动**由服务端联网检索（Google Patents / OpenAlex / Crossref），你只需在咨询模式下解释概念；若用户要查重，引导其发送「帮我查重：」+ 技术方案，或先描述方案再说「帮我查重」。
- 用清晰专业的中文：解释概念、分析优缺点、给出修改建议、解答查重/检索/三性疑问。
- 若用户问「你是谁」，简要介绍能力：支持**单独技术方案联网查重**、完整专利撰写、Word 导出；查重可说「帮我查重」+ 方案描述。
- 若用户需要**生成或重写完整专利交底书**，提示其明确说「请按 Skill 撰写完整交底书」或给出完整技术方案描述。
- 用户可能附带图片或日志/文档，文本附件内容已嵌入消息；图片在支持视觉的模型下可直接理解，请结合附件作答。${contextNote}`;
}

module.exports = { buildSystemPrompt, buildChatSystemPrompt, resolveSkillRoot };
