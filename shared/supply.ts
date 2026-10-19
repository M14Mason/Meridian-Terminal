// Supply chain shard schema, relevance filter and graph helpers (BUILD_PROMPT 15). Pure, tested.
import { validate, type Schema } from './ai';

export type RelKind = 'supplier' | 'customer' | 'partner';
export interface Rel {
  n: string; // counterparty name as disclosed
  t?: string | null; // ticker if public and known
  k: RelKind; // what the counterparty is TO this company
  what: string; // product or service traded
  share?: number | null; // % of this company's revenue (customers) or spend (suppliers), only if disclosed
  geo?: string | null;
  conf: number; // 0..1
  ev: string; // evidence, under 15 words, quoted from the filing
  src: string; // filing URL
  per?: string | null; // fiscal period
}
export interface Facility { type: string; place: string; country: string; lat?: number | null; lon?: number | null }
export interface Shard {
  v: 1;
  t: string; cik: number; name: string; industry: string;
  hq: { city: string; state?: string | null; country: string; lat?: number | null; lon?: number | null };
  filing: { form: string; date: string; url: string };
  facilities: Facility[];
  rels: Rel[];
  gaps: string; // what the filing does not disclose
  model: string; at: string;
}

const s = (max: number): Schema => ({ t: 'string', max });
export const SHARD_SCHEMA: Schema = {
  t: 'object', props: {
    v: { t: 'number', min: 1, max: 1 }, t: s(10), cik: { t: 'number', min: 1 }, name: s(120), industry: s(120),
    hq: { t: 'object', optional: ['state', 'lat', 'lon'], props: { city: s(80), state: s(40), country: s(60), lat: { t: 'number', min: -90, max: 90 }, lon: { t: 'number', min: -180, max: 180 } } },
    filing: { t: 'object', props: { form: s(10), date: s(10), url: s(300) } },
    facilities: { t: 'array', max: 40, of: { t: 'object', optional: ['lat', 'lon'], props: { type: s(40), place: s(120), country: s(60), lat: { t: 'number', min: -90, max: 90 }, lon: { t: 'number', min: -180, max: 180 } } } },
    rels: { t: 'array', max: 80, of: { t: 'object', optional: ['t', 'share', 'geo', 'per'], props: { n: s(120), t: s(10), k: { t: 'string', enum: ['supplier', 'customer', 'partner'] }, what: s(160), share: { t: 'number', min: 0, max: 100 }, geo: s(80), conf: { t: 'number', min: 0, max: 1 }, ev: s(140), src: s(300), per: s(20) } } },
    gaps: s(400), model: s(40), at: s(10),
  },
};

/** Schema check plus honesty rules: every relationship needs a source and short evidence. */
export function checkShard(x: unknown): string | null {
  const e = validate(x, SHARD_SCHEMA);
  if (e) return e;
  const sh = x as Shard;
  for (const [i, r] of sh.rels.entries()) {
    if (!/^https:\/\/www\.sec\.gov\//.test(r.src)) return `rels[${i}] source is not an SEC URL`;
    if (r.ev.trim().split(/\s+/).length >= 15) return `rels[${i}] evidence is 15 words or more`;
  }
  return null;
}

// ---------- Relevance filter for 10-K text ----------
const STRONG = /\b(accounted for|% of (?:our |the company's |its )?(?:total |net |consolidated )?(?:revenue|sales|net sales)|percent of (?:our |total |net )?(?:revenue|sales)|sole[- ]source|single[- ]source|sole supplier|limited number of suppliers|largest customers?|major customers?|significant customers?|contract manufactur|foundr(?:y|ies)|manufactured (?:for us )?by|we (?:purchase|source|buy) .{0,40} from|supply agreement|purchase agreement|offtake|distribution agreement|licens(?:e|ing) agreement with|collaboration (?:agreement )?with|partnership with|depend(?:s|ent)? (?:heavily |significantly )?on)\b/i;
const NOUN = /\b(customer|client|supplier|vendor|manufactur|distributor|partner|wholesaler|retailer|government|OEM|licensee|foundry|carrier|operator)/i;
const PROP = /^\s*item\s*2\.?\s*[-:]?\s*properties/im;

export function relevantText(text: string, maxChars = 18000): { body: string; properties: string } {
  const paras = text.split('\n').map((p) => p.trim()).filter((p) => p.length >= 80);
  const scored = paras.map((p, i) => ({ i, p, s: (STRONG.test(p) ? 2 : 0) + (NOUN.test(p) ? 1 : 0) + (/\b[A-Z][a-z]+(?: [A-Z][a-z]+)* (?:Inc|Corp|Corporation|Ltd|LLC|plc|Co)\b/.test(p) ? 1 : 0) }))
    .filter((x) => x.s >= 3 || (x.s >= 2 && STRONG.test(x.p)));
  const seen = new Set<string>();
  const picked: typeof scored = [];
  let n = 0;
  for (const x of [...scored].sort((a, b) => b.s - a.s || a.i - b.i)) {
    const key = x.p.slice(0, 120);
    if (seen.has(key)) continue;
    if (n + x.p.length > maxChars) continue;
    seen.add(key);
    picked.push(x);
    n += x.p.length;
  }
  const body = picked.sort((a, b) => a.i - b.i).map((x) => x.p.slice(0, 1500)).join('\n');
  const m = PROP.exec(text.split('\n').slice(Math.floor(text.split('\n').length * 0.05)).join('\n'));
  let properties = '';
  if (m) {
    const at = text.indexOf(m[0]);
    const rest = text.slice(at, at + 2500);
    const end = rest.slice(20).search(/^\s*item\s*3\.?\s/im);
    properties = end < 0 ? rest : rest.slice(0, end + 20);
  }
  return { body, properties };
}

// ---------- Graph ----------
export interface Edge { from: string; to: string; kind: 'supplies'; what: string; share: number | null; conf: number; ev: string; src: string; via: string }

/**
 * Directed "supplies" edges from all shards. A supplier listed by A becomes supplier->A; a customer
 * listed by A becomes A->customer. Nodes are tickers when known, else the disclosed name.
 */
export function edges(shards: Shard[]): Edge[] {
  const out: Edge[] = [];
  for (const sh of shards) {
    for (const r of sh.rels) {
      const other = r.t || r.n;
      const base = { kind: 'supplies' as const, what: r.what, share: r.share ?? null, conf: r.conf, ev: r.ev, src: r.src, via: sh.t };
      if (r.k === 'supplier') out.push({ ...base, from: other, to: sh.t });
      else if (r.k === 'customer') out.push({ ...base, from: sh.t, to: other });
      else out.push({ ...base, from: sh.t, to: other });
    }
  }
  return out;
}

/** Neighborhood within `hops` of a node (both directions). */
export function neighborhood(all: Edge[], root: string, hops: number): { nodes: Map<string, number>; edges: Edge[] } {
  const nodes = new Map<string, number>([[root, 0]]);
  let frontier = [root];
  const used = new Set<Edge>();
  for (let h = 1; h <= hops; h++) {
    const next: string[] = [];
    for (const e of all) {
      const a = frontier.includes(e.from), b = frontier.includes(e.to);
      if (!a && !b) continue;
      used.add(e);
      for (const n of [e.from, e.to]) if (!nodes.has(n)) { nodes.set(n, h); next.push(n); }
    }
    frontier = next;
    if (!frontier.length) break;
  }
  return { nodes, edges: [...used] };
}

/**
 * Disruption simulator (15.10): a disrupted node loses output; customers lose the disclosed share of
 * their supply and suppliers lose the disclosed share of their revenue. Unknown shares count as 5%.
 * Impact decays by half per hop. Returns impact 0..1 per node. An estimate, labeled as such in the UI.
 */
export function disrupt(all: Edge[], root: string, hops = 3): Map<string, number> {
  const impact = new Map<string, number>([[root, 1]]);
  let frontier = [root];
  for (let h = 1; h <= hops; h++) {
    const next: string[] = [];
    for (const n of frontier) {
      const base = impact.get(n)! * 0.5;
      for (const e of all) {
        const other = e.from === n ? e.to : e.to === n ? e.from : null;
        if (!other || other === root) continue;
        const v = base * ((e.share ?? 5) / 100) * 2 * e.conf;
        if (v > (impact.get(other) ?? 0)) { impact.set(other, Math.min(1, v)); next.push(other); }
      }
    }
    frontier = next;
  }
  return impact;
}
