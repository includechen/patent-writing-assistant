async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0' },
    signal: AbortSignal.timeout(20000),
  });
  return { status: res.status, html: await res.text() };
}

(async () => {
  const lens = await fetchText('https://www.lens.org/lens/search/patent/list?q=android+memory');
  const lensTitles = [...lens.html.matchAll(/"title":"([^"\\]{15,200})"/g)]
    .map((m) => m[1])
    .filter((t) => !t.includes('Lens') && !t.includes('http'))
    .slice(0, 8);
  console.log('lens titles', lensTitles);

  const wipo = await fetchText('https://patentscope.wipo.int/search/en/search.jsf?query=android+memory');
  const wipoTitles = [...wipo.html.matchAll(/class="resultTitle"[\s\S]*?<a[^>]*>([^<]+)</g)]
    .map((m) => m[1].trim()).slice(0, 5);
  console.log('wipo len', wipo.html.length, 'titles', wipoTitles);

  // Lens API attempt
  const api = await fetch('https://api.lens.org/patent/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 PatentAssistant/1.0',
    },
    body: JSON.stringify({ query: { match_phrase: { title: 'android memory' } }, size: 5 }),
    signal: AbortSignal.timeout(20000),
  }).catch((e) => ({ ok: false, err: e.message }));
  if (api.err) console.log('lens api err', api.err);
  else console.log('lens api', api.status, (await api.text()).slice(0, 300));
})();
