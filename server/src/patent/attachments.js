const path = require('path');

const TEXT_EXTS = new Set([
  '.txt', '.log', '.md', '.json', '.xml', '.yaml', '.yml', '.csv', '.properties',
  '.java', '.kt', '.c', '.cpp', '.h', '.py', '.js', '.ts', '.sql', '.ini', '.cfg',
]);

const MAX_TEXT_CHARS = 50000;

function isImageFile(file) {
  const name = file.originalname || '';
  const ext = path.extname(name).toLowerCase();
  return /^image\//i.test(file.mimetype || '')
    || /\.(png|jpe?g|gif|webp|bmp)$/i.test(ext);
}

function isLikelyText(buffer) {
  const sample = buffer.slice(0, 2000).toString('utf8');
  return sample.length > 0 && !/[\x00-\x08\x0e-\x1f]/.test(sample);
}

function parseUploadFiles(files = []) {
  const images = [];
  const textBlocks = [];
  const others = [];

  for (const file of files) {
    const name = file.originalname || 'file';
    const ext = path.extname(name).toLowerCase();

    if (isImageFile(file)) {
      const mime = (file.mimetype && file.mimetype.startsWith('image/'))
        ? file.mimetype
        : 'image/png';
      images.push({
        name,
        mime,
        dataUrl: `data:${mime};base64,${file.buffer.toString('base64')}`,
      });
      continue;
    }

    if (TEXT_EXTS.has(ext) || (file.mimetype || '').startsWith('text/')) {
      let content = file.buffer.toString('utf8');
      if (content.length > MAX_TEXT_CHARS) {
        content = `${content.slice(0, MAX_TEXT_CHARS)}\n...(已截断，原文共 ${file.buffer.length} 字节)`;
      }
      textBlocks.push({ name, content });
      continue;
    }

    if (/\.(pdf|docx?|xlsx?|pptx?)$/i.test(ext)) {
      others.push({ name, note: '办公文档附件（未自动解析正文，请结合文字说明或提供可读的 log/txt）' });
      continue;
    }

    if (/\.(zip|rar|7z|tar|gz)$/i.test(ext)) {
      others.push({ name, note: '压缩包附件（未自动解压，请上传日志文本或截图）' });
      continue;
    }

    if (isLikelyText(file.buffer)) {
      let content = file.buffer.toString('utf8');
      if (content.length > MAX_TEXT_CHARS) {
        content = `${content.slice(0, MAX_TEXT_CHARS)}\n...(已截断)`;
      }
      textBlocks.push({ name, content });
    } else {
      others.push({ name, note: '二进制文件（未解析）' });
    }
  }

  return { images, textBlocks, others };
}

function getAttachmentProfile(parsed = {}) {
  const others = parsed.others || [];
  let office = 0;
  let archive = 0;
  let binary = 0;

  for (const o of others) {
    if (/办公文档|pdf|docx?/i.test(o.note || '') || /\.(pdf|docx?|xlsx?|pptx?)$/i.test(o.name || '')) {
      office += 1;
    } else if (/压缩包|zip|rar|7z/i.test(o.note || '')) {
      archive += 1;
    } else {
      binary += 1;
    }
  }

  return {
    images: (parsed.images || []).length,
    text: (parsed.textBlocks || []).length,
    office,
    archive,
    binary,
  };
}

function buildAttachmentAppendix(parsed) {
  const parts = [];
  if (parsed.images?.length) {
    parts.push(`【图片附件 ${parsed.images.length} 张：${parsed.images.map((i) => i.name).join('、')}】请结合下方图片内容分析。`);
  }
  for (const t of parsed.textBlocks || []) {
    parts.push(`【文本附件：${t.name}】\n\`\`\`\n${t.content}\n\`\`\``);
  }
  for (const o of parsed.others || []) {
    parts.push(`【附件：${o.name}】${o.note}`);
  }
  return parts.length ? `\n\n---\n${parts.join('\n\n')}` : '';
}

function buildUserMessageWithAttachments(text, parsed) {
  const base = (text || '').trim();
  const appendix = buildAttachmentAppendix(parsed);
  if (!base && appendix) {
    return `请分析以下附件内容，并结合专利撰写/技术方案给出说明与建议。${appendix}`;
  }
  if (!base && !appendix) return '';
  return `${base}${appendix}`;
}

function formatAttachmentSummary(parsed) {
  const names = [
    ...(parsed.images || []).map((i) => `🖼 ${i.name}`),
    ...(parsed.textBlocks || []).map((t) => `📄 ${t.name}`),
    ...(parsed.others || []).map((o) => `📎 ${o.name}`),
  ];
  return names.length ? `\n\n📎 ${names.join(' · ')}` : '';
}

module.exports = {
  parseUploadFiles,
  getAttachmentProfile,
  buildAttachmentAppendix,
  buildUserMessageWithAttachments,
  formatAttachmentSummary,
};
