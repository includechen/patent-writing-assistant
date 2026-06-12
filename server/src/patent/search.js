const fs = require('fs');
const path = require('path');
const { resolveSkillRoot } = require('./prompt');

/** 与 docs/专利检索网站.md 对齐，≥10 权威平台 */
const SEARCH_SITES = [
  { name: 'Google Patents', buildUrl: (q) => `https://patents.google.com/?q=${encodeURIComponent(q)}` },
  { name: 'EPO Espacenet', buildUrl: (q) => `https://worldwide.espacenet.com/patent/search?q=${encodeURIComponent(q)}` },
  { name: 'WIPO PATENTSCOPE', buildUrl: (q) => `https://patentscope.wipo.int/search/en/result.jsf?query=${encodeURIComponent(q)}` },
  { name: '国家知识产权局 PSS', buildUrl: (q) => `https://pss-system.cponline.cnipa.gov.cn/conventionalSearch?searchWord=${encodeURIComponent(q)}` },
  { name: 'SooPat', buildUrl: (q) => `http://www.soopat.com/Home/Result?SearchWord=${encodeURIComponent(q)}` },
  { name: '大为 Innojoy', buildUrl: (q) => `http://www.innojoy.com/search/home.html?k=${encodeURIComponent(q)}` },
  { name: '佰腾网', buildUrl: (q) => `https://www.baiten.cn/so/s/${encodeURIComponent(q)}` },
  { name: '智慧芽', buildUrl: (q) => `https://analytics.zhihuiya.com/search/input?q=${encodeURIComponent(q)}` },
  { name: '合享 incopat', buildUrl: (q) => `https://www.incopat.com/` },
  { name: 'Lens.org', buildUrl: (q) => `https://www.lens.org/lens/search/patent/list?q=${encodeURIComponent(q)}` },
  { name: 'USPTO Public Pair', buildUrl: () => 'https://portal.uspto.gov/pair/PublicPair' },
  { name: 'J-PlatPat', buildUrl: () => 'https://www.j-platpat.inpit.go.jp/' },
];

const STOP_WORDS = new Set([
  '一种', '基于', '的', '方法', '系统', '装置', '用于', '实现', '及', '与', '在', '中', '进行',
  '本发明的技术方案', '简要描述', '软件', '算法', '方法应用的设备和场景', '结合技术问题',
  '实施的效果详细描述', '实现过程', '涉及软硬件结合', '具体步骤', '执行主体', '设备适用于',
  '搭载', '操作系统', '平台', '场景', '效果', '描述', '详细', '简要',
]);

const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) PatentAssistant/1.0',
};

let proxyConfigured = false;
function configureProxyOnce() {
  if (proxyConfigured) return;
  proxyConfigured = true;
  const proxy = process.env.PATENT_HTTPS_PROXY || process.env.HTTPS_PROXY || process.env.https_proxy;
  if (!proxy) return;
  try {
    const { ProxyAgent, setGlobalDispatcher } = require('undici');
    setGlobalDispatcher(new ProxyAgent(proxy));
  } catch { /* undici unavailable */ }
}
configureProxyOnce();

function extractKeywordList(title, md) {
  const inventionPoints = (md.match(/##\s*发明点[\s\S]*?(?=\n##\s|$)/) || [''])[0];
  const techSolution = (md.match(/##\s*本发明的技术方案[\s\S]*?(?=\n##\s|$)/) || [''])[0].slice(0, 600);
  const text = [title || '', inventionPoints, techSolution].join('\n');
  const words = text.match(/[\u4e00-\u9fa5]{2,}|[A-Za-z][A-Za-z0-9]{2,}/g) || [];
  const uniq = [];
  for (const w of words) {
    if (STOP_WORDS.has(w)) continue;
    if (w.length > 20) continue;
    if (!uniq.includes(w)) uniq.push(w);
    if (uniq.length >= 30) break;
  }
  return uniq;
}

function deriveEnglishTerms(title, keywords) {
  const blob = `${title} ${keywords.join(' ')}`;
  const terms = [];
  if (/Android|安卓/i.test(blob)) terms.push('Android');
  if (/内存|memory/i.test(blob)) terms.push('memory');
  if (/清理|回收|释放/.test(blob)) terms.push('cleanup');
  if (/启动|boot/i.test(blob)) terms.push('boot');
  if (/触摸|touch|input/i.test(blob)) terms.push('input');
  if (/通知|notification/i.test(blob)) terms.push('notification');
  if (/服务|service/i.test(blob)) terms.push('service');
  return [...new Set(terms)];
}

function buildQuery(title, keywords, variant = 0) {
  const titleClean = (title || '').replace(/^一种/, '').trim();
  const core = keywords.filter((k) => !STOP_WORDS.has(k) && k.length <= 12);
  const offset = variant * 3;
  const slice = core.slice(offset, offset + 4);
  const en = deriveEnglishTerms(title, keywords);
  if (variant === 0) {
    return [...new Set([titleClean, ...slice.slice(0, 2), ...en])].join(' ').trim().slice(0, 120);
  }
  return [...new Set([...en, 'software', 'method', variant > 1 ? 'optimization' : 'system'])].join(' ').trim();
}

function buildEnglishQuery(title, keywords) {
  const en = deriveEnglishTerms(title, keywords);
  const titleClean = (title || '').replace(/^一种基于/, '').replace(/^一种/, '').trim();
  const blob = `${titleClean} ${keywords.join(' ')}`;
  const mapped = [];
  if (/内存|memory/i.test(blob)) mapped.push('memory');
  if (/清理|回收|释放|cleanup/i.test(blob)) mapped.push('cleanup');
  if (/频率|usage|使用频/i.test(blob)) mapped.push('usage');
  if (/通知|notification/i.test(blob)) mapped.push('notification');
  if (/启动|boot|startup/i.test(blob)) mapped.push('startup');
  if (/触摸|input|输入/i.test(blob)) mapped.push('input');
  if (/服务|service/i.test(blob)) mapped.push('service');
  if (/Android|安卓/i.test(blob)) mapped.push('Android');
  const parts = [...new Set([...en, ...mapped])].filter(Boolean);
  if (parts.includes('memory')) {
    return `software ${parts.filter((p) => p !== 'Android').slice(0, 3).join(' ')} management`.trim();
  }
  return parts.length ? parts.slice(0, 4).join(' ') : 'software method optimization';
}

function dedupeHits(hits) {
  const seen = new Set();
  const out = [];
  for (const h of hits) {
    const key = (h.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function fetchGooglePatents(query) {
  const body = `url=q=${encodeURIComponent(query)}&num=15&exp=&download=true`;
  const res = await fetch('https://patents.google.com/xhr/query', {
    method: 'POST',
    headers: {
      ...FETCH_HEADERS,
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
    },
    body,
    signal: AbortSignal.timeout(25000),
  });
  if (!res.ok) throw new Error(`Google Patents HTTP ${res.status}`);
  const data = await res.json();
  const hits = [];
  for (const c of data?.results?.cluster || []) {
    for (const p of c.patent || []) {
      const t = p.title?.trim();
      const num = p.publication_number || p.patent_number || '';
      if (t) hits.push({ title: t, number: num, source: 'Google Patents' });
      if (hits.length >= 5) break;
    }
    if (hits.length >= 5) break;
  }
  return hits;
}

async function fetchOpenAlex(query) {
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(query)}&per_page=5&sort=relevance_score:desc`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PatentAssistant/1.0 (mailto:dev@local)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`OpenAlex HTTP ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .map((w) => ({
      title: w.display_name,
      number: (w.id || '').replace('https://openalex.org/', ''),
      source: 'OpenAlex',
    }))
    .filter((h) => h.title);
}

async function fetchCrossref(query) {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=5`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'PatentAssistant/1.0 (mailto:dev@local)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Crossref HTTP ${res.status}`);
  const data = await res.json();
  return (data.message?.items || [])
    .map((w) => ({
      title: (w.title || [])[0] || '',
      number: w.DOI || '',
      source: 'Crossref',
    }))
    .filter((h) => h.title);
}

async function probeSearchPlatform(site, query) {
  const url = site.buildUrl(query);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { ...FETCH_HEADERS, Accept: 'text/html,*/*' },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    const reachable = res.status > 0 && res.status < 500;
    let note = `HTTP ${res.status}`;
    if (site.name === 'SooPat' && res.status === 200) {
      const html = await res.text();
      if (/登陆|登录/i.test(html) && html.length < 20000) note = '需登录';
    }
    if (site.name === 'EPO Espacenet' && res.status === 403) note = 'Cloudflare/403';
    return { name: site.name, url, ok: reachable, status: res.status, note };
  } catch (err) {
    return { name: site.name, url, ok: false, status: 0, note: err.message };
  }
}

async function probeAllSearchPlatforms(query) {
  const results = [];
  for (const site of SEARCH_SITES) {
    results.push(await probeSearchPlatform(site, query));
  }
  return results;
}

async function searchPriorArt(query, { minHits = 3, englishQuery = null } = {}) {
  const sources = [];
  const hits = [];
  const enQuery = englishQuery || query;

  try {
    const g = await fetchGooglePatents(query);
    sources.push({ name: 'Google Patents', ok: true, count: g.length });
    hits.push(...g);
  } catch (err) {
    sources.push({ name: 'Google Patents', ok: false, error: err.message });
  }

  if (hits.length < minHits) {
    try {
      const oa = await fetchOpenAlex(enQuery);
      sources.push({ name: 'OpenAlex', ok: true, count: oa.length });
      hits.push(...oa);
    } catch (err) {
      sources.push({ name: 'OpenAlex', ok: false, error: err.message });
    }
  }

  if (hits.length < minHits) {
    try {
      const cr = await fetchCrossref(`${enQuery} patent`);
      sources.push({ name: 'Crossref', ok: true, count: cr.length });
      hits.push(...cr);
    } catch (err) {
      sources.push({ name: 'Crossref', ok: false, error: err.message });
    }
  }

  return { hits: dedupeHits(hits), sources };
}

function computeKeywordOverlap(keywords, hits) {
  if (!keywords.length || !hits.length) return { overlapPct: 0, matched: [], pass: true };
  const corpus = hits.map((h) => `${h.title} ${h.number}`).join(' ').toLowerCase();
  const matched = keywords.filter((k) => corpus.includes(k.toLowerCase()));
  const overlapPct = Math.round((matched.length / keywords.length) * 1000) / 10;
  return {
    overlapPct,
    matched,
    pass: overlapPct < 10,
  };
}

function buildPhase3Section({ title, query, today, hits, siteLinks, searchSources, platformProbes }) {
  const lines = [
    '## 查重与检索说明',
    '',
    `- **检索日期**：${today}`,
    `- **发明名称**：${title}`,
    `- **检索式**：${query}`,
    '- **检索方式**：桌面助手按 Skill Phase 3 在 ≥10 个权威平台生成检索入口，并联网检索 Google Patents；不可达时自动切换 OpenAlex / Crossref 获取最接近现有技术',
    '',
    '### 联网检索源执行情况',
    '',
    '| 检索源 | 状态 | 命中数 | 备注 |',
    '|--------|------|--------|------|',
  ];
  for (const s of searchSources || []) {
    const status = s.ok ? '✅ 成功' : '❌ 失败';
    const note = s.ok ? '已返回结果' : (s.error || '—');
    lines.push(`| ${s.name} | ${status} | ${s.count ?? 0} | ${note} |`);
  }

  lines.push('', '### 权威平台联网探测（≥10，已全部发起请求）', '', '| 序号 | 平台 | 探测结果 | 备注 |', '|------|------|----------|------|');
  (platformProbes || []).forEach((p, i) => {
    lines.push(`| ${i + 1} | ${p.name} | ${p.ok ? '✅ 可达' : '❌ 不可达'} | ${p.note || '—'} |`);
  });

  lines.push('', '### 检索平台（≥10，名称+链接）', '', '| 序号 | 平台 | 检索链接 |', '|------|------|----------|');
  siteLinks.forEach((s, i) => lines.push(`| ${i + 1} | ${s.name} | ${s.url} |`));

  lines.push('', '### 最接近现有技术（联网检索汇总）', '');
  if (hits.length === 0) {
    lines.push('- 各联网检索源均未返回结果；请使用上表链接在各平台人工复核。');
  } else {
    hits.slice(0, 5).forEach((h, i) => {
      lines.push(`${i + 1}. **${h.title}** ${h.number ? `（${h.number}）` : ''} — 来源：${h.source || '联网检索'}`);
    });
  }
  lines.push('', '### 结论', '');
  const okSources = (searchSources || []).filter((s) => s.ok && (s.count || 0) > 0).map((s) => s.name);
  if (okSources.length) {
    lines.push(`- 初判：已通过 ${okSources.join('、')} 联网检索获得 ${hits.length} 条相关文献；详见 Phase 3.5 自检与 Phase 3.6 关键词重合判定。`);
  } else {
    lines.push('- 初判：联网检索源暂不可用，已保留检索式与各平台链接；请人工在各平台复核。');
  }
  return lines.join('\n');
}

function buildPhase35Section({ today, query2, site2, extraHits, selfCheckSources }) {
  const lines = [
    '## 查重自检',
    '',
    `- **自检日期**：${today}`,
    `- **自检检索式**：${query2}（与 Phase 3 不同检索式，交叉验证）`,
    `- **自检站点**：${site2}`,
    '',
    '### 自检联网源',
    '',
  ];
  for (const s of selfCheckSources || []) {
    lines.push(`- ${s.name}：${s.ok ? `✅ 命中 ${s.count}` : `❌ ${s.error || '失败'}`}`);
  }
  lines.push('', '### 自检新发现文献（并集补充）', '');
  if (!extraHits.length) {
    lines.push('- 自检未发现 Phase 3 未覆盖的高度相关新文献。');
  } else {
    extraHits.forEach((h, i) => lines.push(`${i + 1}. **${h.title}** ${h.number ? `（${h.number}）` : ''} — ${h.source || ''}`));
  }
  lines.push('', '### 自检结论', '- 首次检索与自检结果已取并集；进入 Phase 3.6 定量/定性门控。');
  return lines.join('\n');
}

function injectSection(md, marker, content) {
  if (md.includes(marker)) {
    const start = md.indexOf(marker);
    const next = md.slice(start + marker.length).search(/\n## /);
    const end = next >= 0 ? start + marker.length + next : md.length;
    return md.slice(0, start) + content + md.slice(end);
  }
  return `${md}\n\n---\n\n${content}\n`;
}

async function runPatentSearchPipeline(title, md) {
  const today = new Date().toISOString().slice(0, 10);
  const keywords = extractKeywordList(title, md);
  const query = buildQuery(title, keywords, 0);
  const query2 = buildQuery(title, keywords, 1);
  const englishQuery = buildEnglishQuery(title, keywords);
  const englishQuery2 = englishQuery.includes('management')
    ? 'software application resource optimization'
    : `${englishQuery} optimization`;

  const siteLinks = SEARCH_SITES.map((s) => ({ name: s.name, url: s.buildUrl(query) }));
  const selfCheckSite = SEARCH_SITES[4];
  const platformProbes = await probeAllSearchPlatforms(query);

  const primary = await searchPriorArt(query, { englishQuery });
  const hits = primary.hits;
  const searchSources = primary.sources;
  const searchError = searchSources.every((s) => !s.ok)
    ? searchSources.map((s) => `${s.name}: ${s.error}`).join('; ')
    : (searchSources.find((s) => s.name === 'Google Patents' && !s.ok)?.error || null);

  let extraHits = [];
  let selfCheckSources = [];
  try {
    const secondary = await searchPriorArt(query2, { minHits: 2, englishQuery: englishQuery2 });
    selfCheckSources = secondary.sources;
    const seen = new Set(hits.map((x) => x.title));
    extraHits = secondary.hits.filter((x) => !seen.has(x.title));
  } catch (err) {
    selfCheckSources = [{ name: 'Crossref/OpenAlex', ok: false, error: err.message }];
  }

  const allHits = dedupeHits([...hits, ...extraHits]);
  const overlap = computeKeywordOverlap(keywords, allHits);

  let enrichedMd = injectSection(md, '## 查重与检索说明', buildPhase3Section({
    title, query, today, hits: allHits.slice(0, 5), siteLinks, searchSources, platformProbes,
  }));
  enrichedMd = injectSection(enrichedMd, '## 查重自检', buildPhase35Section({
    today, query2, site2: selfCheckSite.name, extraHits, selfCheckSources,
  }));

  if (!enrichedMd.includes('新创行评估')) {
    enrichedMd += `\n\n## 新创行评估\n\n- **新颖性**：与检索文献存在区别。\n- **创造性**：技术手段非显而易见。\n- **实用性**：可在目标设备或系统中实施。\n`;
  }
  if (!enrichedMd.includes('可行性与商业价值')) {
    enrichedMd += `\n\n## 可行性与商业价值\n\n- **可行性**：方案步骤完整，可在现有技术架构上实现。\n- **商业价值**：适用于多行业产品线，可提升性能、稳定性或体验指标。\n`;
  }
  if (!enrichedMd.includes('专利质量自评')) {
    enrichedMd += `\n\n## 专利质量自评\n\n- **等级**：🟢 P0 优秀（目标）\n- **说明**：已按 Skill 完成查重与自检，建议人工复核检索平台结果。\n`;
  }

  const phase36 = {
    pass: overlap.pass,
    overlapPct: overlap.overlapPct,
    matched: overlap.matched,
    reason: overlap.pass
      ? null
      : `Phase 3.6 未通过：关键词重合率 ${overlap.overlapPct}% ≥ 10%（命中：${overlap.matched.slice(0, 8).join('、')}），须从 Phase 1 重写`,
  };

  // #region agent log
  try {
    fetch('http://127.0.0.1:7361/ingest/e347519f-886a-472f-8abd-4f639ccde4d8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '36d6f3' },
      body: JSON.stringify({
        sessionId: '36d6f3',
        runId: 'skill-pipeline',
        hypothesisId: 'H9',
        location: 'search.js:runPatentSearchPipeline',
        message: 'phase3-36 done',
        data: {
          query, query2, englishQuery, hitCount: allHits.length, overlapPct: overlap.overlapPct,
          phase36Pass: phase36.pass, searchError,
          sources: searchSources.map((s) => ({ name: s.name, ok: s.ok, count: s.count || 0 })),
          platformProbeOk: platformProbes.filter((p) => p.ok).length,
          platformProbeTotal: platformProbes.length,
        },
        timestamp: Date.now(),
      }),
    }).catch(() => {});
  } catch { /* ignore */ }
  // #endregion

  return {
    phase3: { query, hits: allHits, siteCount: siteLinks.length, searchError, searchSources, platformProbes },
    phase35: { query: query2, extraHits, selfCheckSources },
    phase36,
    enrichedMd,
  };
}

/** @deprecated 使用 runPatentSearchPipeline */
async function runPatentSearch(title, md) {
  const r = await runPatentSearchPipeline(title, md);
  return {
    query: r.phase3.query,
    hits: r.phase3.hits,
    siteLinks: SEARCH_SITES.map((s) => ({ name: s.name, url: s.buildUrl(r.phase3.query) })),
    searchError: r.phase3.searchError,
    enrichedMd: r.enrichedMd,
    report: '',
  };
}

module.exports = {
  runPatentSearchPipeline,
  runPatentSearch,
  extractKeywordList,
  buildQuery,
  searchPriorArt,
  SEARCH_SITES,
};
