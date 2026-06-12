const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

(async () => {
  const urls = [
    ['patentstar', 'http://cprs.patentstar.com.cn/Search/SearchResult?searchWord=' + encodeURIComponent('内存清理')],
    ['patentstar2', 'https://cprs.patentstar.com.cn/'],
    ['baiten-api', 'https://www.baiten.cn/so/s/' + encodeURIComponent('内存清理')],
  ];
  for (const [n, u] of urls) {
    try {
      const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      const t = await r.text();
      console.log(n, r.status, t.length);
      const titles = [...t.matchAll(/title[=:]["']([^"']{10,100})["']/gi)].slice(0, 5).map((m) => m[1]);
      if (titles.length) console.log(' titles', titles);
      const pn = [...t.matchAll(/CN\d{9,}/g)].slice(0, 5).map((m) => m[0]);
      if (pn.length) console.log(' CN', pn);
    } catch (e) {
      console.log(n, 'ERR', e.message);
    }
  }
})();
