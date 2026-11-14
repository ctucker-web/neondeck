// Checks which candidate streams answer with a real HLS playlist.
// Usage: node scripts/check-streams.cjs <outDir>
const fs = require('node:fs');
const path = require('node:path');
const outDir = path.resolve(process.argv[2] || 'ci-results');
fs.mkdirSync(outDir, { recursive: true });
const { candidates } = require('./stream-candidates.json');

async function probe(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 NEONDECK-check' } });
    const text = (await res.text()).slice(0, 4000);
    const isHls = text.trimStart().startsWith('#EXTM3U');
    // Follow one level to confirm media segments are listed.
    let media = null;
    if (isHls) {
      const variant = text.split(/\r?\n/).find((l) => l && !l.startsWith('#'));
      if (variant && /\.m3u8/.test(variant)) {
        const r2 = await fetch(new URL(variant, res.url), { signal: ctl.signal });
        const t2 = await r2.text();
        media = { status: r2.status, segments: (t2.match(/#EXTINF/g) || []).length };
      } else media = { status: res.status, segments: (text.match(/#EXTINF/g) || []).length };
    }
    return { url, status: res.status, isHls, cors: res.headers.get('access-control-allow-origin'), media, head: isHls ? undefined : text.slice(0, 120) };
  } catch (e) {
    return { url, error: String(e.cause?.code || e.message) };
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  const results = [];
  for (const c of candidates) {
    const probes = [];
    for (const url of c.urls) probes.push(await probe(url));
    results.push({ name: c.name, probes });
    console.log(c.name, probes.map((p) => (p.isHls && p.media?.segments ? 'OK' : p.error || p.status)).join(' | '));
  }
  fs.writeFileSync(path.join(outDir, 'streams.json'), JSON.stringify(results, null, 2));
})();
