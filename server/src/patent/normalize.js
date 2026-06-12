/** 专利 MD 规范化：对齐 Skill 模板章节名，自动补全 Word 八节正文（无需用户手填） */



const { hasFlowchartSource, VENDOR_GUIDE_LINES, hasSection } = require('./gates');



const ACRONYM_GLOSSARY = {

  AMS: 'Activity Manager Service，活动管理器服务',

  ATMS: 'Activity Task Manager Service，活动任务管理器服务',

  PKMS: 'Package Manager Service，包管理服务',

  ANR: 'Application Not Responding，应用无响应',

  FGS: 'Foreground Service，前台服务',

  API: 'Application Programming Interface，应用程序编程接口',

  SDK: 'Software Development Kit，软件开发工具包',

  IPC: 'Inter-Process Communication，进程间通信',

  HAL: 'Hardware Abstraction Layer，硬件抽象层',

  UI: 'User Interface，用户界面',

  OS: 'Operating System，操作系统',

};



const THIN_MARKERS = /待补充|请补充|请描述|请结合|请填写|人工复核|导出时自动|自行填写|流程图将由系统/i;



function normalizeSectionHeaders(md) {

  return md

    .replace(/^##\s*项目\s*$/gm, '## 项 目')

    .replace(/^###\s*项目\s*$/gm, '## 项 目')

    .replace(/^##\s*背景技术\s*$/gm, '## 背 景 技 术')

    .replace(/^###\s*背景技术\s*$/gm, '## 背 景 技 术')

    .replace(/^##\s*有益效果\s*$/gm, '## 有 益 效 果')

    .replace(/^###\s*有益效果\s*$/gm, '## 有 益 效 果')

    .replace(/^##\s*发\s*明\s*点\s*$/gm, '## 发明点')

    .replace(/^###\s*发\s*明\s*点\s*$/gm, '## 发明点');

}



function getSectionContent(md, secName) {

  const re = new RegExp(`##\\s*${secName.replace(/\s+/g, '\\s*')}\\s*\\n([\\s\\S]*?)(?=\\n##\\s|$)`);

  const m = md.match(re);

  return m ? m[1].trim() : '';

}



function stripSectionNoise(text) {

  let body = text || '';

  for (const g of VENDOR_GUIDE_LINES) body = body.split(g.text).join('');

  return body

    .replace(/【[^】]*】/g, '')

    .replace(/（[^）]*）/g, '')

    .replace(/```[\s\S]*?```/g, '')

    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')

    .replace(/^[-*#\s\d\.、)]+/gm, '')

    .trim();

}



function isSectionThin(content) {

  const body = stripSectionNoise(content);

  if (!body) return true;

  if (body.length < 50) return true;

  if (THIN_MARKERS.test(content)) return true;

  return false;

}



function injectVendorGuide(md, section, guideText) {

  if (md.includes(guideText)) return md;

  const re = new RegExp(`(##\\s*${section.replace(/\s+/g, '\\s*')}\\s*\\n)`);

  if (!re.test(md)) return md;

  return md.replace(re, `$1\n${guideText}\n\n`);

}



function buildSectionBlock(sectionName, guideText, body) {

  const content = body.trim();

  const withGuide = guideText && !content.includes(guideText)

    ? `${guideText}\n\n${content}`.trim()

    : content;

  return `## ${sectionName}\n\n${withGuide}\n`;

}



function replaceSection(md, sectionName, guideText, body) {

  const block = buildSectionBlock(sectionName, guideText, body);

  const re = new RegExp(`##\\s*${sectionName.replace(/\s+/g, '\\s*')}[\\s\\S]*?(?=\\n##\\s|$)`);

  if (re.test(md)) return md.replace(re, block.trim());

  return null;

}



function findBodyInsertAnchor(md) {

  const markers = [

    '## 查重与检索说明', '## 查重自检', '## 新创行评估',

    '## 可行性与商业价值', '## 专利质量自评', '## 技术联系人', '## Skill',

  ];

  let pos = md.length;

  for (const m of markers) {

    const i = md.indexOf(m);

    if (i >= 0) pos = Math.min(pos, i);

  }

  return pos;

}



function getGuideText(section) {

  return VENDOR_GUIDE_LINES.find((g) => g.section === section)?.text || '';

}



function extractAcronyms(md) {

  const found = new Set();

  const re = /\b([A-Z]{2,10})\b/g;

  let m;

  while ((m = re.exec(md)) !== null) {

    if (!['MD', 'PNG', 'WORD', 'HTTP', 'HTTPS', 'URL', 'JSON', 'XML', 'COM'].includes(m[1])) {

      found.add(m[1]);

    }

  }

  return [...found].slice(0, 10);

}



function extractKeywords(text) {

  const words = (text || '')

    .replace(/[^\u4e00-\u9fa5a-zA-Z0-9\s]/g, ' ')

    .split(/\s+/)

    .filter((w) => w.length >= 2 && w.length <= 20);

  return [...new Set(words)].slice(0, 8);

}



function deriveProjectTitle(md, title) {

  if (title && title.trim().length > 2) return title.trim();

  const fromSec = getSectionContent(md, '项 目').replace(/【[^】]*】/g, '').trim();

  if (fromSec && !isSectionThin(fromSec)) return fromSec.split('\n')[0].trim();

  return '一种基于软件方法的技术改进方案';

}



function deriveTechnicalTerms(md, title) {

  const topic = deriveProjectTitle(md, title);

  const lines = [];

  for (const a of extractAcronyms(md)) {

    const gloss = ACRONYM_GLOSSARY[a] || `${a}，本方案上下文中的技术缩写术语`;

    lines.push(`- **${a}**：${gloss}`);

  }

  const keywords = extractKeywords(`${topic} ${getSectionContent(md, '本发明的技术方案')}`);

  for (const k of keywords) {

    if (lines.length >= 8) break;

    if (lines.some((l) => l.includes(k))) continue;

    if (/一种|方法|系统|装置|模块/.test(k)) continue;

    lines.push(`- **${k}**：与「${topic}」直接相关的技术概念或功能单元`);

  }

  if (!lines.length) {

    lines.push('- **终端设备**：实施本发明方法的移动终端、嵌入式设备或服务器节点');

    lines.push('- **系统服务**：操作系统或中间件层提供的协调、调度与状态管理能力');

    lines.push('- **业务模块**：承载核心逻辑的应用组件或后台处理单元');

  }

  return lines.join('\n');

}



function deriveBackgroundTech(md, title) {

  const topic = deriveProjectTitle(md, title);

  const tech = stripSectionNoise(getSectionContent(md, '本发明的技术方案'));

  const hint = tech.slice(0, 120);

  const lines = [

    `在「${topic}」相关场景中，现有产品通常采用固定流程、单一路径或粗粒度策略完成处理。`,

    '现有方案普遍存在以下问题：关键路径冗长、异常与边界场景覆盖不足、并发或资源紧张时易出现响应迟滞、状态不一致或恢复成本偏高。',

    '导致上述问题的主要原因在于：模块间缺少与本发明相匹配的联动控制与可回溯状态锚点，条件化分支与资源调度策略未能随运行态自适应调整。',

  ];

  if (hint) lines.push(`结合本发明拟解决的技术脉络（${hint}${tech.length > 120 ? '…' : ''}），有必要提出新的实现方式以提升可靠性与可维护性。`);

  else lines.push('因此需要一种新的软件方法，在兼容现有系统的前提下提升端到端效率与稳定性。');

  return lines.join('\n');

}



function deriveTechScheme(md, title) {

  const existing = stripSectionNoise(getSectionContent(md, '本发明的技术方案'));

  if (existing.length >= 80 && !THIN_MARKERS.test(getSectionContent(md, '本发明的技术方案'))) {

    return getSectionContent(md, '本发明的技术方案')

      .replace(/【[^】]*】/g, '')

      .replace(THIN_MARKERS, '')

      .trim() || existing;

  }

  const topic = deriveProjectTitle(md, title);

  return [

    `本发明适用于移动终端或服务器侧部署，面向「${topic}」提供可落地的软件/方法实现。`,

    '',

    '实现过程包括以下步骤：',

    '1. **初始化阶段**：加载配置与运行上下文，完成与系统服务或数据源的绑定；',

    '2. **触发与判定阶段**：响应事件或用户操作，依据实时状态判定是否进入核心处理分支；',

    '3. **核心处理阶段**：按预定策略执行主路径逻辑，写入中间状态并协调依赖模块；',

    '4. **异常与降级阶段**：针对超时、失败或资源不足执行重试、降级或回滚；',

    '5. **结果汇聚阶段**：聚合处理结果并向上层或用户侧输出，同时记录指标供后续优化。',

  ].join('\n');

}



function deriveBeneficialEffects(md, title) {

  const topic = deriveProjectTitle(md, title);

  const steps = extractTechSteps(md);

  const lines = [`与现有技术相比，本发明在「${topic}」中具有以下有益效果：`];

  const benefitRules = [

    [/缓存|命中|预加载|预注册/, '缩短响应时延并降低重复计算与冷启动开销'],

    [/异步|并行|并发|线程|调度/, '提升吞吐能力并保持关键线程可响应'],

    [/重试|降级|容错|异常|阻塞|ANR/, '增强鲁棒性，抑制故障传播并降低无响应风险'],

    [/状态|同步|一致|锚点/, '改善多模块协同下的一致性与可恢复性'],

    [/聚合|上报|监控|指标|权重/, '便于运行观测、策略迭代与问题定位'],

    [/权限|安全|校验|签名/, '提升安全性并降低误用与篡改风险'],

  ];

  const used = new Set();

  let idx = 1;

  for (const step of steps) {

    for (const [re, benefit] of benefitRules) {

      if (re.test(step) && !used.has(benefit)) {

        lines.push(`${idx}. ${benefit}；`);

        used.add(benefit);

        idx += 1;

        break;

      }

    }

    if (idx > 5) break;

  }

  const defaults = [

    '提高业务处理效率与系统整体稳定性',

    '降低资源占用、运维复杂度与长期维护成本',

    '改善用户体验并支持向同类场景平滑扩展',

  ];

  for (const d of defaults) {

    if (idx > 5) break;

    if (!used.has(d)) {

      lines.push(`${idx}. ${d}；`);

      used.add(d);

      idx += 1;

    }

  }

  return lines.join('\n');

}



function deriveInventionPoints(md, title) {

  const topic = deriveProjectTitle(md, title);

  const steps = extractTechSteps(md);

  const lines = [`围绕「${topic}」，本发明最想保护的技术点包括：`];

  if (steps.length) {

    steps.slice(0, 5).forEach((s, i) => lines.push(`${i + 1}. ${s}`));

  } else {

    lines.push('1. 上述步骤序列及其组合所形成的整体技术路径与执行顺序；');

    lines.push('2. 条件分支判定规则与异常/降级处理策略的配对设计；');

    lines.push('3. 与系统服务交互时的状态保持、结果聚合与策略反馈机制。');

  }

  return lines.join('\n');

}



function deriveDrawingsBody() {

  return '下图示出本发明方法的总体实施流程（含关键判断分支），由系统根据技术方案自动生成。';

}



function extractTechSteps(md) {

  const section = md.match(/##\s*本发明的技术方案[\s\S]*?(?=\n##\s|$)/)?.[0] || '';

  const steps = [];

  for (const line of section.split('\n')) {

    const m = line.match(/^\s*(?:[-*]|\d+[\.\)、])\s*(?:\*\*)?(?:步骤\s*\d+[:：]?\s*)?(.+?)(?:\*\*)?\s*$/);

    if (!m) continue;

    const text = m[1].trim().replace(/\*\*/g, '');

    if (text.length >= 4 && !text.startsWith('【')) steps.push(text);

    if (steps.length >= 8) break;

  }

  return steps;

}



/** 补全/增厚 Word 八节与【】厂商引导语 */

function repairWordExportSections(md, options = {}) {

  const title = options.title || '';

  const repaired = [];

  let out = md;



  const topic = deriveProjectTitle(out, title);



  const sectionSpecs = [

    {

      name: '项 目',

      order: 0,

      guide: '',

      needsWork: () => !hasSection(out, '项 目') || isSectionThin(getSectionContent(out, '项 目')),

      body: () => topic,

    },

    {

      name: '技术术语',

      order: 1,

      guide: getGuideText('技术术语'),

      needsWork: () => !hasSection(out, '技术术语') || isSectionThin(getSectionContent(out, '技术术语')),

      body: () => deriveTechnicalTerms(out, title),

    },

    {

      name: '背 景 技 术',

      order: 2,

      guide: getGuideText('背 景 技 术'),

      needsWork: () => !hasSection(out, '背 景 技 术') || isSectionThin(getSectionContent(out, '背 景 技 术')),

      body: () => deriveBackgroundTech(out, title),

    },

    {

      name: '本发明的技术方案',

      order: 3,

      guide: getGuideText('本发明的技术方案'),

      needsWork: () => !hasSection(out, '本发明的技术方案') || isSectionThin(getSectionContent(out, '本发明的技术方案')),

      body: () => deriveTechScheme(out, title),

    },

    {

      name: '有 益 效 果',

      order: 4,

      guide: getGuideText('有 益 效 果'),

      needsWork: () => !hasSection(out, '有 益 效 果') || isSectionThin(getSectionContent(out, '有 益 效 果')),

      body: () => deriveBeneficialEffects(out, title),

    },

    {

      name: '发明点',

      order: 5,

      guide: getGuideText('发明点'),

      needsWork: () => !hasSection(out, '发明点') || isSectionThin(getSectionContent(out, '发明点')),

      body: () => deriveInventionPoints(out, title),

    },

    {

      name: '图纸',

      order: 6,

      guide: getGuideText('图纸'),

      needsWork: () => {

        if (!hasSection(out, '图纸')) return true;

        const c = getSectionContent(out, '图纸');

        return isSectionThin(c) && !hasFlowchartSource(out);

      },

      body: () => deriveDrawingsBody(),

    },

  ];



  const toInsert = [];



  for (const spec of sectionSpecs) {

    if (!spec.needsWork()) {

      if (spec.guide && hasSection(out, spec.name) && !out.includes(spec.guide)) {

        out = injectVendorGuide(out, spec.name, spec.guide);

        repaired.push(`${spec.name}:引导语`);

      }

      continue;

    }

    const body = spec.body();

    const replaced = replaceSection(out, spec.name, spec.guide, body);

    if (replaced) {

      out = replaced;

      repaired.push(spec.name);

    } else {

      toInsert.push({ order: spec.order, block: buildSectionBlock(spec.name, spec.guide, body) });

      repaired.push(spec.name);

    }

  }



  for (const g of VENDOR_GUIDE_LINES) {

    if (hasSection(out, g.section) && !out.includes(g.text)) {

      out = injectVendorGuide(out, g.section, g.text);

      if (!repaired.includes(`${g.section}:引导语`)) repaired.push(`${g.section}:引导语`);

    }

  }



  if (toInsert.length) {

    const anchor = findBodyInsertAnchor(out);

    const blocks = toInsert.sort((a, b) => a.order - b.order).map((x) => x.block).join('\n');

    out = `${out.slice(0, anchor).trimEnd()}\n\n${blocks}\n${out.slice(anchor)}`;

  }



  // #region agent log

  try {

    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {

      method: 'POST',

      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },

      body: JSON.stringify({

        sessionId: '36d6f3',

        runId: 'normalize-repair',

        hypothesisId: 'H4-full-auto',

        location: 'normalize.js:repairWordExportSections',

        message: 'full auto sections repaired',

        data: { repaired, topic: topic.slice(0, 60) },

        timestamp: Date.now(),

      }),

    }).catch(() => {});

  } catch { /* ignore */ }

  // #endregion



  return { md: out, repaired };

}



function ensureTechnicalContactSection(md) {

  if (/##\s*技术联系人/m.test(md)) {

    const body = getSectionContent(md, '技术联系人');

    if (isSectionThin(body) || THIN_MARKERS.test(body)) {

      return replaceSection(md, '技术联系人', '', '—') || md;

    }

    return md;

  }

  return `${md.trim()}\n\n## 技术联系人\n\n—\n`;

}



function sanitizeMermaidLabel(text) {

  return text.slice(0, 32).replace(/["[\](){}|<>]/g, '').trim() || '处理步骤';

}



function buildMermaidFromTechScheme(md) {

  const steps = extractTechSteps(md);

  const lines = ['flowchart TB', '  Start([开始])'];

  let prev = 'Start';



  if (steps.length === 0) {

    lines.push('  P1[执行本发明技术方案]');

    lines.push('  Start --> P1 --> Done([结束])');

    return lines.join('\n');

  }



  steps.forEach((step, i) => {

    const sid = `S${i + 1}`;

    const label = sanitizeMermaidLabel(step);

    const hasCond = /若|是否|当.*时|判断|否则/.test(step);



    if (hasCond) {

      const did = `D${i + 1}`;

      const dlabel = sanitizeMermaidLabel(step.replace(/^若|当|是否/, ''));

      lines.push(`  ${sid}[${label}]`);

      lines.push(`  ${prev} --> ${sid}`);

      lines.push(`  ${did}{${dlabel}?}`);

      lines.push(`  ${sid} --> ${did}`);

      lines.push(`  ${did} -->|是| Y${i + 1}[执行对应分支]`);

      lines.push(`  ${did} -->|否| N${i + 1}[执行默认分支]`);

      lines.push(`  Y${i + 1} --> J${i + 1}([汇合])`);

      lines.push(`  N${i + 1} --> J${i + 1}`);

      prev = `J${i + 1}`;

    } else {

      lines.push(`  ${sid}[${label}]`);

      lines.push(`  ${prev} --> ${sid}`);

      prev = sid;

    }

  });

  lines.push(`  ${prev} --> Done([结束])`);

  return lines.join('\n');

}



function ensureMermaidInDrawings(md) {

  if (hasFlowchartSource(md)) return { md, injected: false };

  const mermaid = buildMermaidFromTechScheme(md);

  const block = `\n\n\`\`\`mermaid\n${mermaid}\n\`\`\`\n`;

  const marker = '## 图纸';

  if (md.includes(marker)) {

    const idx = md.indexOf(marker);

    const tail = md.slice(idx + marker.length);

    const nextSec = tail.search(/\n## /);

    const insertAt = nextSec >= 0 ? idx + marker.length + nextSec : md.length;

    return { md: md.slice(0, insertAt) + block + md.slice(insertAt), injected: true };

  }

  return { md: `${md.trim()}\n\n${marker}\n${block}`, injected: true };

}



function normalizePatentMarkdown(md, options = {}) {

  let out = normalizeSectionHeaders(md);

  const repair = repairWordExportSections(out, options);

  out = repair.md;

  out = ensureTechnicalContactSection(out);

  const mermaidFix = ensureMermaidInDrawings(out);

  out = mermaidFix.md;

  return {

    md: out,

    mermaidInjected: mermaidFix.injected,

    sectionsRepaired: repair.repaired,

  };

}



module.exports = {

  normalizePatentMarkdown,

  normalizeSectionHeaders,

  repairWordExportSections,

  ensureTechnicalContactSection,

  ensureMermaidInDrawings,

  buildMermaidFromTechScheme,

  isSectionThin,

};

