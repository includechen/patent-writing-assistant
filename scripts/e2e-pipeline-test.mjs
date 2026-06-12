import { runSkillPipeline } from '../server/src/patent/phases.js';

process.env.PATENT_USER_DATA = 'C:/Users/xinghua2.chen/AppData/Roaming/patent-assistant';
process.env.PATENT_SKILL_ROOT_SOURCE = 'D:/ai_skill/common agent/patent-draft-android';

const md = `# 专利

## 项 目
一种基于Android系统通知栏的智能聚合方法

## 技术术语
【本方案所涉及到的技术术语的解释，特别是英文大写字母缩写的技术术语，请给出全拼及对应的中文术语。】

## 背 景 技 术
【现有技术具体方案、存在的问题、导致问题的原因。】

## 本发明的技术方案
【简要描述本软件/算法/方法应用的设备和场景，结合技术问题和实施的效果详细描述本方法的实现过程，涉及软硬件结合的需结合具体步骤的执行主体来写。】

- 步骤1：采集通知事件
- 步骤2：若优先级高于阈值则置顶展示
- 步骤3：聚合同类通知

## 有 益 效 果
【与现有的产品、技术相比具有的优点。】

## 发明点
【最想保护的技术点是什么？】

## 图纸
【本软件/算法/方法实现的详细流程图，应用设备的组成框图（可选）】
`;

const r = await runSkillPipeline(md, '一种基于Android系统通知栏的智能聚合方法', { skipPhase36: true });
console.log(JSON.stringify({
  blocked: r.blocked,
  mermaidInjected: r.mermaidInjected,
  docxPath: r.export?.docxPath,
  blockReason: r.blockReason,
  errors: r.export?.errors || r.gates?.errors,
}, null, 2));
