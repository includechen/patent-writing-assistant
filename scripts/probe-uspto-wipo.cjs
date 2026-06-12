const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';
const fs = require('fs');
const path = require('path');

(async () => {
  const q = 'android memory';

  const ped = await fetch('https://ped.uspto.gov/api/queries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA },
    body: JSON.stringify({
      searchText: q,
      start: 0,
      rows: 5,
    }),
    signal: AbortSignal.timeout(20000),
  }).catch((e) => ({ ok: false, err: e }));
  if (ped.err) console.log('ped ERR', ped.err.message);
  else {
    const t = await ped.text();
    console.log('ped', ped.status, t.slice(0, 500));
  }

  const wipo = await fetch(`https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(q)}`, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(20000),
  });
  const html = await wipo.text();
  fs.writeFileSync(path.join(__dirname, 'wipo-sample.html'), html.slice(0, 50000));
  console.log('wipo', wipo.status, html.length);

  const patterns = [
    [/class="[^"]*result[^"]*title[^"]*"[^>]*>([^<]{10,})/gi, 'result-title-class'],
    [/<a[^>]+class="[^"]*title[^"]*"[^>]*>([^<]{10,})/gi, 'a-title-class'],
    [/data-result-title="([^"]+)"/gi, 'data-result-title'],
    [/"title":"([^"]{15,200})"/gi, 'json-title'],
    [/WO\d{4}\/\d+[^<]{0,80}/g, 'wo-numbers'],
  ];
  for (const [re, name] of patterns) {
    const m = [...html.matchAll(re)].slice(0, 5).map((x) => x[1] || x[0]);
    if (m.length) console.log(name, m);
  }

  const bing = await fetch(`https://cn.bing.com/search?q=${encodeURIComponent('android memory 专利')}`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    signal: AbortSignal.timeout(20000),
  });
  const bh = await bing.text();
  const bt = [...bh.matchAll(/<h2[^>]*><a[^>]*>([\s\S]*?)<\/a><\/h2>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .filter((t) => t.length > 5)
    .slice(0, 8);
  console.log('bing cn titles', bt);
})();
