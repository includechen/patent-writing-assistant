process.env.PATENT_USER_DATA = 'C:/Users/xinghua2.chen/AppData/Roaming/patent-assistant';
process.env.PATENT_SKILL_ROOT_SOURCE = 'D:/ai_skill/common agent/patent-draft-android';

const fs = require('fs');
const path = require('path');
const { exportPatentToWord } = require('../server/src/patent/export');

const mdPath = 'C:/Users/xinghua2.chen/AppData/Roaming/patent-assistant/data/outputs/专利_一种基于前台服务状态的动态通知栏优先级管理方法_技术交底书与说明书.md';
const md = fs.readFileSync(mdPath, 'utf8');

exportPatentToWord(md, '一种基于前台服务状态的动态通知栏优先级管理方法')
  .then((r) => {
    console.log(JSON.stringify({ pngPath: r.pngPath, docxPath: r.docxPath, errors: r.errors }, null, 2));
    process.exit(r.pngPath ? 0 : 1);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
