const { resolvePatentMarkdown } = require('../server/src/patent/resolveMarkdown');

const fallback = `intro
\`\`\`markdown
# 专利_测试_技术交底书

## 项 目
测试发明

## 技术术语
【本方案所涉及到的技术术语的解释，特别是英文大写字母缩写的技术术语，请给出全拼及对应的中文术语。】

## 背 景 技 术
【现有技术具体方案、存在的问题、导致问题的原因。】

## 本发明的技术方案
【简要描述本软件/算法/方法应用的设备和场景，结合技术问题和实施的效果详细描述本方法的实现过程，涉及软硬件结合的需结合具体步骤的执行主体来写。】

步骤1：采集数据
步骤2：若超时则重试

## 有 益 效 果
【与现有的产品、技术相比具有的优点。】

## 发明点
【最想保护的技术点是什么？】

## 图纸
【本软件/算法/方法实现的详细流程图，应用设备的组成框图（可选）】

\`\`\`mermaid
flowchart TD
  A([开始]) --> B[采集]
\`\`\`

## 技术联系人

## 查重与检索说明
- 测试
\`\`\`

## Skill 流程执行报告`;

const md = resolvePatentMarkdown(fallback);
const result = {
  ok: Boolean(md),
  len: md?.length || 0,
  hasMermaid: /```mermaid/.test(md || ''),
  hasContacts: (md || '').includes('技术联系人'),
  hasPhase3: (md || '').includes('查重与检索说明'),
};
console.log(JSON.stringify(result, null, 2));
process.exit(result.ok && result.len > 300 && result.hasMermaid && result.hasContacts && result.hasPhase3 ? 0 : 1);
