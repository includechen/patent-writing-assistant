const fs = require('fs');
const path = require('path');
const { resolveSkillRoot } = require('./prompt');
const { getExportEnv, ensureBeforeExport } = require('./deps');
const { ensureSkillMirror } = require('./skillMirror');
const { runPowerShellScript } = require('./powershell');
const { checkWordExportGate } = require('./gates');
const { resolveVendorTemplatePath } = require('./vendorTemplate');
const { resolvePatentMarkdown } = require('./resolveMarkdown');
const { normalizePatentMarkdown } = require('./normalize');
const { runPhase2bMermaidToPng } = require('./phase2b');

function extractMarkdownFromResponse(content) {
  return resolvePatentMarkdown(content);
}

function getOutputDir() {
  const base = process.env.PATENT_USER_DATA
    ? path.join(process.env.PATENT_USER_DATA, 'data')
    : path.join(process.cwd(), 'server', 'data');
  const dir = path.join(base, 'outputs');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function sanitizeMermaidBlocks(md) {
  return md.replace(/```mermaid([\s\S]*?)```/g, (full, body) => {
    const fixed = body
      .replace(/\bend\(\[/g, 'doneNode([')
      .replace(/-->\s*end\b/g, '--> doneNode');
    return '```mermaid' + fixed + '```';
  });
}

/**
 * Phase 2b + Phase 6：直接调用 patent-fill-template-word.ps1（复制厂商模板→填数据→插图→另存）
 */
async function exportPatentToWord(markdownContent, inventionTitle) {
  await ensureBeforeExport();
  const exportEnv = await getExportEnv();
  const skillRoot = ensureSkillMirror() || resolveSkillRoot();

  const templatePath = resolveVendorTemplatePath(skillRoot);
  if (!templatePath) {
    throw new Error('未找到厂商 Word 模板（templates/ 下须有 ≥40KB 的 TopActivity 技术交底书 .doc/.docx）');
  }

  let md = extractMarkdownFromResponse(markdownContent) || markdownContent;
  if (!md || md.length < 100) throw new Error('未找到有效的专利 Markdown 内容');

  const norm = normalizePatentMarkdown(md, { title: inventionTitle });
  md = norm.md;

  const wordGate = checkWordExportGate(md);
  if (!wordGate.pass) {
    throw new Error(`Word 填表前置检查未通过：${wordGate.errors.join('；')}`);
  }

  if (md.includes('```mermaid')) md = sanitizeMermaidBlocks(md);

  const safeName = (inventionTitle || '专利输出').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  const outputDir = getOutputDir();
  const mdPath = path.join(outputDir, `专利_${safeName}_技术交底书与说明书.md`);
  fs.writeFileSync(mdPath, md, 'utf8');

  const scriptsDir = path.join(skillRoot, 'scripts');
  const fillScript = path.join(scriptsDir, 'patent-fill-template-word.ps1');
  const results = { mdPath, docxPath: null, pngPath: null, templatePath, errors: [] };

  if (process.platform !== 'win32') {
    throw new Error('Phase 6 厂商模板填表仅支持 Windows + Microsoft Word');
  }
  if (!fs.existsSync(fillScript)) {
    throw new Error('缺少 scripts/patent-fill-template-word.ps1');
  }

  // Phase 2b — 支持 mermaid 块、.mmd 侧车、或仅有 flowchart.png 占位但文件缺失
  try {
    const phase2b = await runPhase2bMermaidToPng({
      md,
      mdPath,
      outputDir,
      scriptsDir,
      exportEnv,
      inventionTitle: inventionTitle || safeName,
    });
    md = phase2b.md;
    results.pngPath = phase2b.pngPath;
    results.phase2b = { skipped: phase2b.skipped };
    if (phase2b.skipped && !phase2b.pngPath) {
      results.errors.push('Phase 2b 跳过：未找到可渲染的流程图来源');
    }
  } catch (err) {
    results.errors.push(err.message || 'Phase 2b 流程图生成失败');
  }

  // Phase 6 — 直接填表脚本（不经 md2docx 子进程 -File，避免路径空格截断）
  const docxOut = path.join(outputDir, `专利_${safeName}_技术交底书与说明书.docx`);
  await runPowerShellScript(fillScript, [
    '-PatentFullMd', mdPath,
    '-OutputDocx', docxOut,
    '-TemplateDoc', templatePath,
    '-ArtifactSubdir', '专利生成',
  ], exportEnv, 360000);

  if (fs.existsSync(docxOut)) {
    results.docxPath = docxOut;
  } else {
    const artifactDir = path.join(outputDir, '专利生成');
    if (fs.existsSync(artifactDir)) {
      const art = fs.readdirSync(artifactDir).filter((f) => f.endsWith('.docx') && !f.includes('模板'));
      if (art.length) results.docxPath = path.join(artifactDir, art[art.length - 1]);
    }
  }
  if (!results.docxPath) throw new Error('Phase 6 完成但未找到输出 .docx');

  if (results.pngPath && fs.existsSync(results.pngPath)) {
    const insertScript = path.join(scriptsDir, 'patent-insert-diagram-word.ps1');
    if (fs.existsSync(insertScript)) {
      const agentLog = path.join(outputDir, 'debug-333dff.log');
      try {
        await runPowerShellScript(insertScript, [
          '-WordDocx', results.docxPath,
          '-PatentFullMd', mdPath,
          '-ImagePath', results.pngPath,
          '-AgentDebugLog', agentLog,
        ], exportEnv, 180000);
        results.diagramInserted = true;
      } catch (err) {
        results.errors.push(`图纸补插：${err.message || '失败'}`);
        results.diagramInserted = false;
      }
    }
  }

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'vendor-fill-direct',
        hypothesisId: 'H11',
        location: 'export.js:exportPatentToWord',
        message: 'direct fill result',
        data: {
          docxPath: results.docxPath,
          pngPath: results.pngPath,
          diagramInserted: results.diagramInserted ?? null,
          templatePath,
          templateSize: fs.statSync(templatePath).size,
          skillRoot,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  return results;
}

module.exports = { exportPatentToWord, extractMarkdownFromResponse, getOutputDir };
