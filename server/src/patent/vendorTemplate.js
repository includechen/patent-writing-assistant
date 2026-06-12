const fs = require('fs');
const path = require('path');

const VENDOR_TPL_BASE = '专利模板_一种实现TopActivity的有序广播保护状态设定的方法+技术交底书';
const MIN_VENDOR_DOCX_BYTES = 40000;

/**
 * 选用用户提供的厂商 Word 模板（体积最大的 TopActivity .doc/.docx），
 * 避免误用 Pandoc bootstrap 生成的小占位模板（约 13KB）。
 */
function resolveVendorTemplatePath(skillRoot) {
  const templatesDir = path.join(skillRoot, 'templates');
  if (!fs.existsSync(templatesDir)) return null;

  const canonical = path.join(templatesDir, `${VENDOR_TPL_BASE}.docx`);
  const canonicalDoc = path.join(templatesDir, `${VENDOR_TPL_BASE}.doc`);

  let candidates = [];
  try {
    candidates = fs.readdirSync(templatesDir)
      .filter((f) => /\.(docx?|DOCX?)$/.test(f))
      .filter((f) => f.includes('TopActivity') || f.includes(VENDOR_TPL_BASE.slice(0, 4)))
      .map((f) => {
        const full = path.join(templatesDir, f);
        const st = fs.statSync(full);
        return { full, size: st.size, name: f };
      })
      .filter((c) => c.size >= MIN_VENDOR_DOCX_BYTES)
      .sort((a, b) => b.size - a.size);
  } catch { /* ignore */ }

  if (candidates.length) return candidates[0].full;
  if (fs.existsSync(canonical) && fs.statSync(canonical).size >= MIN_VENDOR_DOCX_BYTES) return canonical;
  if (fs.existsSync(canonicalDoc) && fs.statSync(canonicalDoc).size >= MIN_VENDOR_DOCX_BYTES) return canonicalDoc;
  return null;
}

module.exports = { resolveVendorTemplatePath, VENDOR_TPL_BASE, MIN_VENDOR_DOCX_BYTES };
