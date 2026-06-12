const fs = require('fs');
const path = require('path');
const { runPowerShellScript } = require('./powershell');
const { normalizePatentMarkdown } = require('./normalize');

function extractFlowchartPngName(md) {
  const img = md.match(/!\[[^\]]*\]\((\.\/)?([^)]*flowchart\.png)\)/i);
  if (img) return img[2].replace(/^\.\//, '');
  return null;
}

function findMmdSidecar(outputDir, preferredBase) {
  if (!fs.existsSync(outputDir)) return null;
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith('.mmd'));
  if (!files.length) return null;
  if (preferredBase) {
    const hit = files.find((f) => f.startsWith(preferredBase) || f.includes('flowchart'));
    if (hit) return path.join(outputDir, hit);
  }
  const sorted = files
    .map((f) => ({ f, p: path.join(outputDir, f), m: fs.statSync(path.join(outputDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return sorted[0]?.p || null;
}

function stripBrokenFlowchartPlaceholder(md, outputDir) {
  return md.replace(/!\[[^\]]*\]\((\.\/)?([^)]*flowchart\.png)\)/gi, (full, _dot, rel) => {
    const pngPath = path.join(outputDir, rel.replace(/^\.\//, ''));
    return fs.existsSync(pngPath) ? full : '';
  });
}

function prepareMdForPhase2b(md, outputDir, inventionTitle) {
  let out = stripBrokenFlowchartPlaceholder(md, outputDir);
  const expectedPng = extractFlowchartPngName(out);
  const pngPath = expectedPng ? path.join(outputDir, expectedPng) : null;
  const hasMermaid = /```mermaid\s*[\r\n]+[\s\S]+?```/im.test(out);

  if (!hasMermaid && (!pngPath || !fs.existsSync(pngPath))) {
    const norm = normalizePatentMarkdown(out);
    out = norm.md;
  }
  if (!/```mermaid/.test(out)) {
    const sidecar = findMmdSidecar(outputDir, inventionTitle?.slice(0, 20));
    return { md: out, expectedPngName: expectedPng || deriveDefaultPngName(inventionTitle), mmdSidecar: sidecar, hasMermaid: false };
  }
  return {
    md: out,
    expectedPngName: expectedPng || deriveDefaultPngName(inventionTitle),
    mmdSidecar: null,
    hasMermaid: true,
  };
}

function deriveDefaultPngName(inventionTitle) {
  const safe = (inventionTitle || 'patent_output').replace(/[\\/:*?"<>|]/g, '_').slice(0, 80);
  return `${safe}_flowchart.png`;
}

function resolveGeneratedPng(outputDir, expectedPngName) {
  if (expectedPngName) {
    const direct = path.join(outputDir, expectedPngName);
    if (fs.existsSync(direct)) return direct;
  }
  const pngs = fs.readdirSync(outputDir)
    .filter((f) => /flowchart\.png$/i.test(f))
    .map((f) => ({ f, p: path.join(outputDir, f), m: fs.statSync(path.join(outputDir, f)).mtimeMs }))
    .sort((a, b) => b.m - a.m);
  return pngs[0]?.p || null;
}

async function runPhase2bMermaidToPng({
  md,
  mdPath,
  outputDir,
  scriptsDir,
  exportEnv,
  inventionTitle,
}) {
  const prep = prepareMdForPhase2b(md, outputDir, inventionTitle);
  fs.writeFileSync(mdPath, prep.md, 'utf8');

  const mermaidScript = path.join(scriptsDir, 'patent-mermaid-to-png.ps1');
  if (!fs.existsSync(mermaidScript)) throw new Error('未找到 patent-mermaid-to-png.ps1');

  const needsRender = prep.hasMermaid || prep.mmdSidecar
    || (prep.expectedPngName && !fs.existsSync(path.join(outputDir, prep.expectedPngName)));

  if (!needsRender) {
    const existing = resolveGeneratedPng(outputDir, prep.expectedPngName);
    return { pngPath: existing, md: prep.md, skipped: true };
  }

  const args = ['-PatentMdPath', mdPath, '-OutPngName', prep.expectedPngName];
  if (prep.mmdSidecar && !prep.hasMermaid) {
    args.push('-InputMmdPath', prep.mmdSidecar, '-NoReplaceInMd');
  } else if (prep.expectedPngName && /[^\x00-\x7F]/.test(prep.expectedPngName)) {
    args.push('-NoReplaceInMd');
  }

  const startedAt = Date.now();
  await runPowerShellScript(mermaidScript, args, exportEnv, 300000);
  const pngPath = resolveGeneratedPng(outputDir, prep.expectedPngName);

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'phase2b',
        hypothesisId: 'H16',
        location: 'phase2b.js:runPhase2bMermaidToPng',
        message: 'phase2b render done',
        data: {
          hasMermaid: prep.hasMermaid,
          mmdSidecar: prep.mmdSidecar,
          expectedPngName: prep.expectedPngName,
          pngPath,
          elapsedMs: Date.now() - startedAt,
        },
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(300),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  if (!pngPath) {
    throw new Error(`Phase 2b 未生成流程图 PNG（预期：${prep.expectedPngName}）`);
  }

  let finalMd = fs.readFileSync(mdPath, 'utf8');
  if (!finalMd.includes(prep.expectedPngName) && prep.hasMermaid) {
    finalMd = finalMd.replace(
      /```mermaid[\s\S]*?```/m,
      `![图纸流程图](./${prep.expectedPngName})`,
    );
    fs.writeFileSync(mdPath, finalMd, 'utf8');
  }

  return { pngPath, md: finalMd, skipped: false };
}

module.exports = {
  runPhase2bMermaidToPng,
  prepareMdForPhase2b,
  extractFlowchartPngName,
  resolveGeneratedPng,
};
