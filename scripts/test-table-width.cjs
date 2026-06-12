const fs = require('fs');
const path = require('path');
const os = require('os');
const { runPowerShellScript, ensurePs1DirUtf8Bom } = require('../server/src/patent/powershell');

const scriptsDir = path.join(__dirname, '../../patent-draft-android/scripts');
for (const f of fs.readdirSync(scriptsDir)) {
  if (f.endsWith('.ps1')) ensurePs1DirUtf8Bom(path.join(scriptsDir, f));
}

const md = path.join(
  process.env.APPDATA,
  'patent-assistant/data/outputs',
  '专利_一种基于场景感知的动态权限管理方法_技术交底书与说明书.md',
);
const fallbackMd = fs.readdirSync(path.join(process.env.APPDATA, 'patent-assistant/data/outputs'))
  .filter((f) => f.endsWith('_技术交底书与说明书.md'))
  .sort()
  .pop();
const patentMd = fs.existsSync(md) ? md : path.join(process.env.APPDATA, 'patent-assistant/data/outputs', fallbackMd);
const out = path.join(os.tmpdir(), 'patent_table_width_test.docx');
const tpl = path.join(process.env.APPDATA, 'patent-assistant/skill/templates/专利模板_一种实现TopActivity的有序广播保护状态设定的方法+技术交底书 .docx');
const fill = path.join(scriptsDir, 'patent-fill-template-word.ps1');

(async () => {
  console.log('md', patentMd);
  const r = await runPowerShellScript(fill, [
    '-PatentFullMd', patentMd,
    '-OutputDocx', out,
    '-TemplateDoc', tpl,
    '-NoArtifacts',
  ], {}, 180000);
  console.log(r.stdout);
  const buf = fs.readFileSync(out);
  console.log('magic', buf.slice(0, 4).toString('hex'), 'size', buf.length);
  const log = path.join(os.tmpdir(), 'debug-36d6f3.log');
  if (fs.existsSync(log)) {
    const lines = fs.readFileSync(log, 'utf8').trim().split('\n').filter((l) => l.includes('H-table-width'));
    console.log('table log', lines[lines.length - 1]);
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
