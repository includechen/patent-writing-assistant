const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

(async () => {
  const q = 'android memory management';
  const urls = [
    `https://patents.google.com/?q=${encodeURIComponent(q)}`,
    `https://patents.google.com/xhr/query?url=q%3D${encodeURIComponent(q)}%26num%3D10`,
  ];
  for (const u of urls) {
    try {
      const r = await fetch(u, {
        headers: { 'User-Agent': UA, Accept: 'text/html,application/json' },
        signal: AbortSignal.timeout(25000),
      });
      const t = await r.text();
      console.log(u.split('?')[0], r.status, t.length);
      if (u.includes('xhr')) {
        try {
          const j = JSON.parse(t);
          console.log(' clusters', j?.results?.cluster?.length);
        } catch { console.log(' xhr sample', t.slice(0, 200)); }
      } else {
        const titles = [...t.matchAll(/data-result="([^"]+)"/g)].slice(0, 3);
        const titles2 = [...t.matchAll(/<span itemprop="title">([^<]+)</g)].slice(0, 3).map((m) => m[1]);
        console.log(' titles2', titles2);
        const pub = [...t.matchAll(/patent\/([A-Z]{2}\d+)/g)].slice(0, 5).map((m) => m[1]);
        console.log(' pub', pub);
      }
    } catch (e) {
      console.log(u.split('?')[0], 'ERR', e.cause?.code || e.message);
    }
  }
})();
