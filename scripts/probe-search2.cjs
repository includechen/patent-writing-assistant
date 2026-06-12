const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

async function tryFetch(label, url, opts = {}) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, ...opts.headers },
      method: opts.method || 'GET',
      body: opts.body,
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    console.log(`[${label}]`, res.status, text.length);
    return { ok: res.ok, status: res.status, text };
  } catch (e) {
    console.log(`[${label}] ERR`, e.cause?.code || e.message);
    return { ok: false, err: e.message };
  }
}

(async () => {
  const q = 'android memory management';
  const qEnc = encodeURIComponent(q);

  const pv = await tryFetch('patentsview', 'https://search.patentsview.org/api/v1/patent/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: { _text_any: { patent_title: q } },
      f: ['patent_id', 'patent_title', 'patent_date'],
      o: { per_page: 5 },
    }),
  });
  if (pv.text) {
    try {
      const j = JSON.parse(pv.text);
      console.log('patentsview hits', (j.patents || []).slice(0, 3).map((p) => p.patent_title));
    } catch {
      console.log('patentsview sample', pv.text.slice(0, 300));
    }
  }

  const wipo = await tryFetch('wipo', `https://patentscope.wipo.int/search/en/result.jsf?query=${qEnc}`);
  if (wipo.text) {
    const titles = [...wipo.text.matchAll(/<span class="ps-field--title[^"]*">([\s\S]*?)<\/span>/g)]
      .map((m) => m[1].replace(/<[^>]+>/g, '').trim())
      .filter(Boolean)
      .slice(0, 5);
    console.log('wipo titles', titles);
    const titles2 = [...wipo.text.matchAll(/title[^>]*>([^<]{10,120})</gi)].slice(0, 5).map((m) => m[1]);
    console.log('wipo titles2', titles2);
  }

  const lens = await tryFetch('lens', `https://www.lens.org/lens/search/patent/list?q=${qEnc}`);
  if (lens.text) {
    const inv = [...lens.text.matchAll(/invention_title/g)].length;
    console.log('lens invention_title count', inv);
    const blob = [...lens.text.matchAll(/"biblio":\{[^}]{0,2000}?"invention_title":\{[^}]*?"text":"([^"\\]+)"/g)]
      .map((m) => m[1])
      .slice(0, 5);
    console.log('lens biblio titles', blob);
  }

  const cnipa = await tryFetch('cnipa', `https://pss-system.cponline.cnipa.gov.cn/conventionalSearch?searchWord=${encodeURIComponent('内存清理')}`);
  if (cnipa.text) console.log('cnipa sample', cnipa.text.slice(0, 200));
})();
