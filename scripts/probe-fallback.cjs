const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

async function probe(label, url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html,*/*', ...opts.headers },
      method: opts.method || 'GET',
      body: opts.body,
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    console.log(`\n=== ${label} ${res.status} len=${text.length} ===`);
    return text;
  } catch (e) {
    console.log(`\n=== ${label} ERR ${e.cause?.code || e.message} ===`);
    return '';
  }
}

(async () => {
  const q = 'android memory management patent';
  const qEnc = encodeURIComponent(q);

  const ddg = await probe('ddg', `https://html.duckduckgo.com/html/?q=${qEnc}`);
  const ddgTitles = [...ddg.matchAll(/<a[^>]+class="result__a"[^>]*>([^<]+)</g)].map((m) => m[1].trim()).slice(0, 5);
  console.log('ddg titles', ddgTitles);

  const bing = await probe('bing', `https://www.bing.com/search?q=${encodeURIComponent('android memory patent site:patents.google.com')}`);
  const bingTitles = [...bing.matchAll(/<li class="b_algo"[\s\S]*?<h2><a[^>]*>([^<]+)</g)].map((m) => m[1].trim()).slice(0, 5);
  console.log('bing titles', bingTitles);

  const wipoPost = await probe('wipo-post', 'https://patentscope.wipo.int/search/en/search.jsf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `query=${encodeURIComponent('android memory')}&office=&sortOption=Pub+Date+Desc&prevFilter=&numRecPage=10&page=1`,
  });
  const wipoHits = [...wipoPost.matchAll(/resultList[\s\S]{0,500}/g)].length;
  console.log('wipo resultList blocks', wipoHits);

  const lensApi = await probe('lens-scroll', 'https://www.lens.org/lens/api/search/patent/scroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: 'android memory', size: 5, include: ['biblio', 'lens_id'] }),
  });
  if (lensApi) console.log('lens api sample', lensApi.slice(0, 400));
})();
