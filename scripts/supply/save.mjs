// Saves shards written during Claude Code extraction sessions. Reads a JSON array on stdin:
// [{ t, industry, hq: {city, state?, country}, facilities: [...], rels: [{n, t?, k, what, share?, geo?, conf, ev, per?}], gaps }]
// Fills cik, name, filing and src from the prep header, validates (schema + source + short evidence), writes
// public/supply/c/<T>.json and updates public/supply/progress.json. Invalid shards are reported, not written.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checkShard, edges, toRows } from '../../shared/supply.ts';

const input = JSON.parse(readFileSync(0, 'utf8'));
mkdirSync('public/supply/c', { recursive: true });
const files = readdirSync('.cache/supply');
// Counterparty tickers must be real NYSE or Nasdaq listings (SEC list cached by the main session).
const listed = (() => { try { return new Set(JSON.parse(readFileSync('.cache/sec-tickers.json', 'utf8')).data.filter((r) => /^(NYSE|Nasdaq)$/.test(r[3])).map((r) => r[2])); } catch { return null; } })();
const uni = JSON.parse(readFileSync('public/supply/universe.json', 'utf8')).top;
const today = new Date().toISOString().slice(0, 10);
const progPath = 'public/supply/progress.json';

for (const x of input) {
  const f = files.find((n) => n.endsWith(`-${x.t}.txt`));
  if (!f) { console.log(`${x.t}: no prep file`); continue; }
  const head = readFileSync(`.cache/supply/${f}`, 'utf8').split('\n').slice(0, 3);
  const u = uni.find((r) => r.t === x.t);
  const [, cik, name] = /CIK (\d+) \| ([^|]+) \|/.exec(head[0]) ?? [null, String(u?.cik ?? 0), u?.name ?? x.t];
  // Companies with no annual report on EDGAR still get a shard (no relationships) so they count as done.
  const [, form, date, , url] = /FILING (\S+) (\S+) period (\S*) (\S+)/.exec(head[2] ?? '') ?? [null, 'none', '', '', 'https://www.sec.gov/'];
  const shard = {
    v: 1, t: x.t, cik: Number(cik), name: name.trim(), industry: x.industry,
    hq: x.hq, filing: { form, date, url }, facilities: x.facilities ?? [],
    rels: (x.rels ?? []).map((r) => { const t = r.t && listed && !listed.has(r.t) ? undefined : r.t; if (r.t && !t) console.log(`${x.t}: dropped unlisted ticker ${r.t}`); return { ...r, t, src: r.src ?? url }; }),
    gaps: x.gaps ?? '', model: 'claude-opus-5-5 (Claude Code session)', at: today,
  };
  const err = checkShard(shard);
  if (err) { console.log(`${x.t}: INVALID ${err}`); continue; }
  writeFileSync(`public/supply/c/${x.t}.json`, JSON.stringify(shard));
  console.log(`${x.t}: saved ${shard.rels.length} relationships`);
}
// Progress and the edge index are rebuilt from the saved files, so parallel extraction sessions cannot clobber each other.
// Rebuild the compact edge index from every saved shard.
const shards = readdirSync('public/supply/c').filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(`public/supply/c/${n}`, 'utf8')));
writeFileSync('public/supply/edges.json', JSON.stringify({ at: today, companies: shards.length, edges: toRows(edges(shards)) }));
writeFileSync(progPath, JSON.stringify({ updated: today, done: shards.map((x) => x.t).sort() }, null, 1));
console.log(`progress: ${shards.length} companies`);
