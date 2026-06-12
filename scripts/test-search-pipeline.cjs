const { runPatentSearchPipeline, extractKeywordList, buildQuery } = require('../server/src/patent/search');

const title = '一种基于应用使用频率的动态内存清理方法';
const md = `
## 发明点
- 根据应用使用频率动态调整内存回收策略
- 在 Android 低内存场景下优先保留高频应用进程

## 本发明的技术方案
通过 UsageStats 统计应用前台时长，结合 LMK 阈值动态清理低频应用缓存。
`;

(async () => {
  const kw = extractKeywordList(title, md);
  console.log('queries', buildQuery(title, kw, 0), buildQuery(title, kw, 1));
  const r = await runPatentSearchPipeline(title, md);
  console.log('query', r.phase3.query);
  console.log('hits', r.phase3.hits.length);
  console.log('sources', r.phase3.searchSources);
  r.phase3.hits.slice(0, 3).forEach((h) => console.log('-', h.source, h.title.slice(0, 80)));
})();
