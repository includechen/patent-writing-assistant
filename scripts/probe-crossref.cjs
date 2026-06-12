(async () => {
  const q = 'android memory management';
  const r = await fetch(`https://api.crossref.org/works?query=${encodeURIComponent(q)}&rows=5`, {
    headers: { 'User-Agent': 'PatentAssistant/1.0 (mailto:dev@local)' },
    signal: AbortSignal.timeout(20000),
  });
  const j = await r.json();
  console.log('status', r.status);
  for (const item of j.message?.items || []) {
    console.log('-', item.title?.[0], item.DOI);
  }
})();
