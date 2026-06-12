const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

(async () => {
  const bing = await fetch(`https://www.bing.com/search?q=${encodeURIComponent('android memory management patent US')}&count=10`, {
    headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
    signal: AbortSignal.timeout(20000),
  });
  const bh = await bing.text();
  fs.writeFileSync(path.join(__dirname, 'bing-sample.html'), bh.slice(0, 120000));

  const algos = [...bh.matchAll(/<li class="b_algo"[\s\S]*?<\/li>/g)].slice(0, 5);
  console.log('b_algo blocks', algos.length);
  for (const block of algos) {
    const title = (block[0].match(/<h2><a[^>]*>([\s\S]*?)<\/a><\/h2>/) || [])[1];
    const href = (block[0].match(/<h2><a href="([^"]+)"/) || [])[1];
    if (title) console.log('-', title.replace(/<[^>]+>/g, '').trim(), href?.slice(0, 80));
  }

  const wipo = await fetch('https://patentscope.wipo.int/search/en/result.jsf?query=android+memory', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(25000),
  });
  const wh = await wipo.text();
  const wo = [...wh.matchAll(/WO\d{4}\/\d{6,}/g)].slice(0, 10).map((m) => m[0]);
  console.log('\nWIPO WO numbers', wo);
  const spans = [...wh.matchAll(/<span[^>]*class="[^"]*ps-patent-result--title[^"]*"[^>]*>([\s\S]*?)<\/span>/g)]
    .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
    .slice(0, 5);
  console.log('WIPO ps-patent-result titles', spans);
  const anyTitle = [...wh.matchAll(/detail\.jsf\?docId=[^"']+[^>]*>([^<]{15,200})</g)].slice(0, 5).map((m) => m[1].trim());
  console.log('WIPO detail links', anyTitle);
})();
