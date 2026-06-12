const path = require('path');
const fs = require('fs');
const { runPowerShellScript, ensurePs1DirUtf8Bom } = require('../server/src/patent/powershell');

const skillRoot = path.join(process.env.APPDATA, 'patent-assistant', 'skill');
const scriptsDir = path.join('d:/ai_skill/common agent/patent-draft-android/scripts');
for (const d of [scriptsDir, path.join(skillRoot, 'scripts')]) {
  if (fs.existsSync(d)) {
    for (const f of fs.readdirSync(d)) {
      if (f.endsWith('.ps1')) ensurePs1DirUtf8Bom(path.join(d, f));
    }
  }
}

const md = path.join(process.env.APPDATA, 'patent-assistant/data/outputs/专利_一种基于触发条件的自动化配置流程执行方法_技术交底书与说明书.md');
const out = path.join(require('os').tmpdir(), 'patent_diagram_test.docx');
const tpl = path.join(skillRoot, 'templates/专利模板_一种实现TopActivity的有序广播保护状态设定的方法+技术交底书 .docx');
const fill = path.join(scriptsDir, 'patent-fill-template-word.ps1');

(async () => {
  const r = await runPowerShellScript(fill, [
    '-PatentFullMd', md,
    '-OutputDocx', out,
    '-TemplateDoc', tpl,
    '-NoArtifacts',
  ], {}, 180000);
  console.log('stdout', r.stdout);
  const buf = fs.readFileSync(out);
  console.log('out magic', buf.slice(0, 4).toString('hex'), 'size', buf.length);
})().catch((e) => { console.error(e.message); process.exit(1); });
