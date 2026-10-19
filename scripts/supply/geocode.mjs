// Geocodes supply shard HQs and facilities with Nominatim (OpenStreetMap), following its usage policy:
// at most 1 request per second, an identifying User-Agent, results cached in public/supply/geocache.json,
// and "© OpenStreetMap contributors" shown in the app. A one-time job, not a periodic one.
// Usage: node scripts/supply/geocode.mjs [maxRequests]
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';

// The app is identified by its public repo, so no personal email is sent to a third party.
const UA = 'MeridianTerminal/1.0 (personal research; +https://github.com/M14Mason/Meridian-Terminal)';
const MAX = Number(process.argv[2] ?? 2000);
const cachePath = 'public/supply/geocache.json';
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
const files = readdirSync('public/supply/c').filter((n) => n.endsWith('.json'));

// Multi-place strings ("China, India, Israel and Taiwan") cannot be one point; skip them.
const single = (p) => p && !/\band\b|;|\//.test(p) && p.split(',').length <= 3 && !/multiple|worldwide|various/i.test(p);
const key = (q) => q.toLowerCase().replace(/\s+/g, ' ').trim();

let n = 0;
async function geo(q) {
  const k = key(q);
  if (k in cache) return cache[k];
  if (n >= MAX) return undefined;
  n++;
  await new Promise((r) => setTimeout(r, 1100));
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(q)}`;
  const r = await fetch(u, { headers: { 'user-agent': UA } });
  if (!r.ok) { console.log(`HTTP ${r.status} for ${q}; stopping`); n = MAX; return undefined; }
  const j = await r.json();
  cache[k] = j[0] ? [Number(Number(j[0].lat).toFixed(4)), Number(Number(j[0].lon).toFixed(4))] : null;
  return cache[k];
}

for (const f of files) {
  const s = JSON.parse(readFileSync(`public/supply/c/${f}`, 'utf8'));
  let changed = false;
  const hq = [s.hq.city, s.hq.state, s.hq.country].filter((x) => x && x !== 'see filing').join(', ');
  if (s.hq.lat == null && hq) {
    const g = await geo(hq);
    if (g) { s.hq.lat = g[0]; s.hq.lon = g[1]; changed = true; }
  }
  for (const fac of s.facilities) {
    if (fac.lat != null) continue;
    const q = [fac.place, fac.country].filter((x) => x && x !== 'multiple').join(', ');
    if (!single(fac.place)) continue;
    const g = await geo(q);
    if (g) { fac.lat = g[0]; fac.lon = g[1]; changed = true; }
  }
  if (changed) writeFileSync(`public/supply/c/${f}`, JSON.stringify(s));
  if (n >= MAX) break;
}
writeFileSync(cachePath, JSON.stringify(cache));
console.log(`requests ${n}, cached places ${Object.keys(cache).length}`);

// Compact place index for the SPLC map: { TICKER: { n: name, hq: [lat, lon] | null, f: [[lat, lon, label], ...] } }
const places = {};
for (const f of readdirSync('public/supply/c').filter((x) => x.endsWith('.json'))) {
  const s = JSON.parse(readFileSync(`public/supply/c/${f}`, 'utf8'));
  places[s.t] = { n: s.name, hq: s.hq.lat != null ? [s.hq.lat, s.hq.lon] : null, f: s.facilities.filter((x) => x.lat != null).map((x) => [x.lat, x.lon, `${x.type}: ${x.place}`.slice(0, 80)]) };
}
writeFileSync('public/supply/places.json', JSON.stringify(places));
console.log(`places: ${Object.values(places).filter((p) => p.hq).length} with HQ coordinates`);
