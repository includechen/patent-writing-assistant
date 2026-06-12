const fs = require('fs');
const path = require('path');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

(async () => {
  const html = await fetch('https://www.lens.org/lens/search/patent/list?q=android+memory', {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(25000),
  }).then((r) => r.text());

  const markers = ['__NEXT_DATA__', '__INITIAL_STATE__', 'window.__', 'lens/search', 'biblio', 'invention_title'];
  for (const m of markers) {
    const idx = html.indexOf(m);
    console.log(m, idx >= 0 ? idx : 'N/A');
  }

  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]{200,8000}?)<\/script>/g)]
    .map((m) => m[1])
    .filter((s) => s.includes('patent') || s.includes('biblio') || s.includes('invention'));
  console.log('script blocks with patent', scripts.length);
  if (scripts[0]) console.log('sample script', scripts[0].slice(0, 500));

  const jsonLike = [...html.matchAll(/"invention_title"\s*:\s*\{[^}]{0,300}\}/g)].slice(0, 3);
  console.log('invention_title json', jsonLike.map((m) => m[0].slice(0, 200)));

  // try lens graphql
  const gql = await fetch('https://www.lens.org/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Origin: 'https://www.lens.org' },
    body: JSON.stringify({
      query: 'query { searchPatents(q: "android memory", size: 3) { title lensId } }',
    }),
    signal: AbortSignal.timeout(15000),
  }).catch((e) => ({ ok: false, err: e }));
  if (gql.err) console.log('gql err', gql.err.message);
  else console.log('gql', gql.status, (await gql.text()).slice(0, 300));
})();
