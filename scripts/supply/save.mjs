// Saves shards written during Claude Code extraction sessions. Reads a JSON array on stdin:
// [{ t, industry, hq: {city, state?, country}, facilities: [...], rels: [{n, t?, k, what, share?, geo?, conf, ev, per?}], gaps }]
// Fills cik, name, filing and src from the prep header, validates (schema + source + short evidence), writes
// public/supply/c/<T>.json and updates public/supply/progress.json. Invalid shards are reported, not written.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checkShard, edges, toRows } from '../../shared/supply.ts';

const input = JSON.parse(readFileSync(0, 'utf8'));
mkdirSync('public/supply/c', { recursive: true });
const files = readdirSync('.cache/supply');
const today = new Date().toISOString().slice(0, 10);
const progPath = 'public/supply/progress.json';
const prog = existsSync(progPath) ? JSON.parse(readFileSync(progPath, 'utf8')) : { done: [], noFiling: [], updated: '' };
for (const x of input) {
  const f = files.find((n) => n.endsWith(`-${x.t}.txt`));
  if (!f) { console.log(`${x.t}: no prep file`); continue; }
  const head = readFileSync(`.cache/supply/${f}`, 'utf8').split('\n').slice(0, 3);
  const [, cik, name] = /CIK (\d+) \| ([^|]+) \|/.exec(head[0]) ?? [];
  const [, form, date, , url] = /FILING (\S+) (\S+) period (\S*) (\S+)/.exec(head[2]) ?? [];
  const shard = {
    v: 1, t: x.t, cik: Number(cik), name: name.trim(), industry: x.industry,
    hq: x.hq, filing: { form, date, url }, facilities: x.facilities ?? [],
    rels: (x.rels ?? []).map((r) => ({ ...r, src: r.src ?? url })),
    gaps: x.gaps ?? '', model: 'claude-opus-5-5 (Claude Code session)', at: today,
  };
  const err = checkShard(shard);
  if (err) { console.log(`${x.t}: INVALID ${err}`); continue; }
  writeFileSync(`public/supply/c/${x.t}.json`, JSON.stringify(shard));
  if (!prog.done.includes(x.t)) prog.done.push(x.t);
  console.log(`${x.t}: saved ${shard.rels.length} relationships`);
}
prog.updated = today;
// Rebuild the compact edge index from every saved shard.
const shards = readdirSync('public/supply/c').filter((n) => n.endsWith('.json')).map((n) => JSON.parse(readFileSync(`public/supply/c/${n}`, 'utf8')));
writeFileSync('public/supply/edges.json', JSON.stringify({ at: today, companies: shards.length, edges: toRows(edges(shards)) }));
writeFileSync(progPath, JSON.stringify(prog, null, 1));
console.log(`progress: ${prog.done.length} companies`);
