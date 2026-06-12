const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0';

async function probe(label, url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
      redirect: 'follow',
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    console.log(`\n[${label}] ${res.status} len=${text.length}`);
    const titlePatterns = [
      [/<h\d[^>]*class="[^"]*title[^"]*"[^>]*>([^<]{8,120})/gi, 'h-title'],
      [/<a[^>]*title="([^"]{10,120})"/gi, 'a-title-attr'],
      [/"patentName":"([^"]+)"/gi, 'patentName'],
      [/"title":"([^"]{10,120})"/gi, 'json-title'],
      [/<span[^>]*class="[^"]*name[^"]*"[^>]*>([^<]{10,120})/gi, 'span-name'],
    ];
    for (const [re, name] of titlePatterns) {
      const hits = [...text.matchAll(re)].map((m) => m[1].trim()).filter((t) => !t.includes('http')).slice(0, 5);
      if (hits.length) console.log(`  ${name}:`, hits);
    }
    if (text.length < 3000) console.log('  sample:', text.replace(/\s+/g, ' ').slice(0, 300));
    return text;
  } catch (e) {
    console.log(`[${label}] ERR`, e.cause?.code || e.message);
    return '';
  }
}

(async () => {
  const q = encodeURIComponent('安卓 内存 清理');
  const q2 = encodeURIComponent('android memory');
  await probe('baiten', `https://www.baiten.cn/so/s/${q}`);
  await probe('innojoy', `http://www.innojoy.com/search/home.html?k=${q}`);
  await probe('bing-patent', `https://cn.bing.com/search?q=${encodeURIComponent('site:patentscope.wipo.int android memory')}`);
  await probe('bing-google-patent', `https://cn.bing.com/search?q=${encodeURIComponent('site:patents.google.com android memory management')}`);
  await probe('wipo-full', `https://patentscope.wipo.int/search/en/result.jsf?query=${q2}`);
})();
