// Supply chain data (M9): static shards for the top 1,000 (extracted in Claude Code sessions, public/supply),
// plus on-demand Sonnet extraction for any other company, kept in the synced "supply" collection.
import { FEATURES, estimateUsd } from '../../../shared/ai';
import { htmlToText } from '../../../shared/filingtext';
import { checkShard, fromRows, relevantText, type Edge, type EdgeRow, type Rel, type Shard } from '../../../shared/supply';
import { makeTickerMatcher } from '../../../shared/thirteenf';
import { askAi } from '../../ai/client';
import { up } from '../client';
import { profile, tickers } from './sec';

const BASE = `${import.meta.env.BASE_URL}supply`;

async function getJson<T>(path: string): Promise<T | null> {
  const r = await fetch(`${BASE}/${path}`);
  return r.ok ? ((await r.json()) as T) : null;
}

export async function staticEdges(): Promise<{ at: string; companies: number; edges: Edge[] }> {
  const j = await getJson<{ at: string; companies: number; edges: EdgeRow[] }>('edges.json');
  return j ? { at: j.at, companies: j.companies, edges: fromRows(j.edges) } : { at: '', companies: 0, edges: [] };
}

export const staticShard = (t: string) => getJson<Shard>(`c/${encodeURIComponent(t)}.json`);
export const universe = () => getJson<{ at: string; counts: Record<string, number>; top: { rank: number; t: string; name: string }[] }>('universe.json');

/** Builds the on-demand extraction input for a ticker. Returns it with a cost estimate so the UI can confirm first. */
export async function prepareOnDemand(sym: string) {
  const p = await profile(sym);
  const f = p.data.filings.find((x) => x.form === '10-K' || x.form === '20-F' || x.form === '40-F');
  if (!f) throw new Error(`${sym} has no 10-K, 20-F or 40-F on EDGAR.`);
  const dir = `/Archives/edgar/data/${p.data.cik}/${f.accession.replace(/-/g, '')}`;
  const html = await up<string>('secwww', `${dir}/${f.primaryDoc}`, undefined, { text: true, maxAgeMs: 30 * 86_400_000, priority: 0 });
  const { body, properties } = relevantText(htmlToText(html.data), 24000);
  const url = `https://www.sec.gov${dir}/${f.primaryDoc}`;
  const input = [`COMPANY: ${p.data.name} (${sym}), ${p.data.sicDescription}. FILING: ${f.form} filed ${f.filed}.`, `PROPERTIES:\n${properties || '(not found)'}`, `RELEVANT PARAGRAPHS:\n${body}`].join('\n\n').slice(0, FEATURES.supply.maxInput);
  return { input, usd: estimateUsd('supply', input.length), profile: p.data, filing: { form: f.form, date: f.filed, url } };
}

const words = (s: string) => s.trim().split(/\s+/);

export async function runOnDemand(sym: string, prep: Awaited<ReturnType<typeof prepareOnDemand>>): Promise<{ shard: Shard; usd: number; dropped: number }> {
  const r = await askAi<{ industry: string; rels: Omit<Rel, 'src' | 't'>[]; facilities: Shard['facilities']; gaps: string }>('supply', prep.input, true);
  const match = makeTickerMatcher(await tickers());
  let dropped = 0;
  const rels: Rel[] = [];
  for (const x of r.result.rels) {
    // Honesty rules: the evidence must be a short quote that appears in the text we sent.
    const ev = words(x.ev).length >= 15 ? words(x.ev).slice(0, 14).join(' ') : x.ev;
    const probe = ev.replace(/[^\w\s%.$]/g, '').split(/\s+/).slice(0, 5).join(' ');
    if (!prep.input.replace(/[^\w\s%.$]/g, '').includes(probe)) { dropped++; continue; }
    rels.push({ ...x, ev, t: x.n.includes('unnamed') ? null : match(x.n, ''), src: prep.filing.url });
  }
  const shard: Shard = {
    v: 1, t: sym, cik: prep.profile.cik, name: prep.profile.name, industry: r.result.industry,
    hq: { city: prep.profile.address.split(',')[0] ?? '', country: 'see filing' }, filing: prep.filing,
    facilities: r.result.facilities, rels, gaps: r.result.gaps, model: r.model, at: new Date().toISOString().slice(0, 10),
  };
  const err = checkShard(shard);
  if (err) throw new Error(`Extraction failed validation: ${err}`);
  return { shard, usd: r.usd, dropped };
}
