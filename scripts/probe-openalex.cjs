const UA = 'Mozilla/5.0 PatentAssistant/1.0';

(async () => {
  const q = 'android memory management';
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(q)}&filter=type:article&per_page=5`;
  const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  const j = await r.json();
  console.log('status', r.status, 'count', j.meta?.count);
  for (const w of j.results || []) {
    console.log('-', w.display_name, w.id);
  }

  const url2 = `https://api.openalex.org/works?search=${encodeURIComponent('mobile memory cleanup patent')}&per_page=5`;
  const r2 = await fetch(url2, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
  const j2 = await r2.json();
  console.log('\nsearch2 count', j2.meta?.count);
  for (const w of j2.results || []) {
    console.log('-', w.display_name?.slice(0, 100));
  }
})();
