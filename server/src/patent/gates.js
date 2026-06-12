/** Skill 门禁：Word 填表最低要求 + 完整 Skill 建议项 */

const VENDOR_GUIDE_LINES = [
  { section: '技术术语', text: '【本方案所涉及到的技术术语的解释，特别是英文大写字母缩写的技术术语，请给出全拼及对应的中文术语。】' },
  { section: '背 景 技 术', text: '【现有技术具体方案、存在的问题、导致问题的原因。】' },
  { section: '本发明的技术方案', text: '【简要描述本软件/算法/方法应用的设备和场景，结合技术问题和实施的效果详细描述本方法的实现过程，涉及软硬件结合的需结合具体步骤的执行主体来写。】' },
  { section: '有 益 效 果', text: '【与现有的产品、技术相比具有的优点。】' },
  { section: '发明点', text: '【最想保护的技术点是什么？】' },
  { section: '图纸', text: '【本软件/算法/方法实现的详细流程图，应用设备的组成框图（可选）】' },
];

const WORD_BODY_SECTIONS = [
  '项 目', '技术术语', '背 景 技 术', '本发明的技术方案',
  '有 益 效 果', '发明点', '图纸', '技术联系人',
];

function hasSection(md, sec) {
  if (sec === '项 目') return /##\s*项\s*目/m.test(md) || /##\s*项目/m.test(md);
  const re = new RegExp(`##\\s*${sec.replace(/\s+/g, '\\s*')}`, 'm');
  return re.test(md) || md.includes(`## ${sec}`);
}

function checkVendorGuideGate(md) {
  const missing = [];
  for (const g of VENDOR_GUIDE_LINES) {
    if (!md.includes(g.text)) missing.push(g.section);
  }
  return { pass: missing.length === 0, missing };
}

function hasFlowchartSource(md) {
  const mermaid = md.match(/```mermaid\s*[\r\n]+([\s\S]*?)```/im);
  if (mermaid && mermaid[1].trim().length > 8) return true;
  // 仅 PNG 图片引用不算流程图来源（须 Phase 2b 实际渲染）；占位符由 export 阶段补 mermaid
  return false;
}

/** Word 填表（Phase 6）最低门禁：八节 + 【】引导语 + 流程图来源 */
function checkWordExportGate(md) {
  const errors = [];
  for (const sec of WORD_BODY_SECTIONS) {
    if (!hasSection(md, sec)) errors.push(`缺少章节「## ${sec}」`);
  }
  if (!hasFlowchartSource(md)) {
    errors.push('缺少流程图：「## 图纸」须含 ```mermaid 或 Phase 2b 生成的 ![](*_flowchart.png)');
  }
  const guide = checkVendorGuideGate(md);
  if (!guide.pass) {
    errors.push(`【】厂商引导语未齐全：${guide.missing.join('、')}`);
  }
  return { pass: errors.length === 0, errors };
}

function checkPhase3To5Present(md) {
  const appendix = ['查重与检索说明', '查重自检', '新创行评估', '可行性与商业价值', '专利质量自评'];
  const missing = appendix.filter((sec) => !md.includes(sec));
  return { pass: missing.length === 0, missing };
}

function runAllGates(md) {
  const word = checkWordExportGate(md);
  const phase35 = checkPhase3To5Present(md);
  const allErrors = [...word.errors];
  if (!phase35.pass) {
    allErrors.push(`Phase 3～5 章节将由服务端自动补全：${phase35.missing.join('、')}`);
  }
  return {
    pass: word.pass,
    word,
    phase35,
    errors: allErrors,
    warnings: phase35.pass ? [] : [`将自动补全：${phase35.missing.join('、')}`],
  };
}

module.exports = {
  VENDOR_GUIDE_LINES,
  checkVendorGuideGate,
  checkWordExportGate,
  checkPhase3To5Present,
  runAllGates,
  hasSection,
  hasFlowchartSource,
};
