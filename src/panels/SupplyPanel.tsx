// SPLC: supply chain map (BUILD_PROMPT 15). Who a company buys from and sells to, from SEC filings.
// Default view is the classic terminal layout (suppliers left, customers right, peers below); 3D network
// and a table are alternatives. Top 500 extracted in advance; anything else on demand with Sonnet.
import { useMemo, useState } from 'react';
import { AI_LABEL } from '../../shared/ai';
import { disrupt, edges as shardEdges, neighborhood, type Edge, type Rel, type Shard } from '../../shared/supply';
import { quotes } from '../data/adapters/alpaca';
import * as fh from '../data/adapters/finnhub';
import { prepareOnDemand, runOnDemand, staticEdges, staticShard } from '../data/adapters/supply';
import { profile } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';
import { SupplyGraph, type GLink, type GNode } from '../three/SupplyGraph';
import { SupplyChart, type Tile } from './SupplyChart';
import { SupplyMap, type Place } from './SupplyMap';
import { criticalReason } from './supplyCritical';

type Sort = 'share' | 'critical' | 'conf' | 'name';
const isTicker = (id: string) => /^[A-Z][A-Z.]{0,6}$/.test(id);
const short = (s: string, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export default function SupplyPanel({ security, run }: PanelProps) {
  const sym = (security ?? 'NVDA').toUpperCase();
  const [view, setView] = useState<'chart' | 'map' | 'table' | '3d'>('chart');
  const [hops, setHops] = useState(1);
  const [sort, setSort] = useState<Sort>('critical');
  const [sel, setSel] = useState<string | null>(null);
  const [shock, setShock] = useState(false);
  const [minConf, setMinConf] = useState(0);
  const [od, setOd] = useState<{ busy?: string; err?: string; note?: string }>({});
  const base = useData('splc:edges', async () => ({ data: await staticEdges(), fetchedAt: Date.now(), fromCache: false }), { source: 'SEC filings (Meridian extraction)', everyMs: 6 * 3600_000 });
  const mine = useCollection<Shard>('supply');
  const root = useData(`splc:shard:${sym}`, async () => ({ data: await staticShard(sym), fetchedAt: Date.now(), fromCache: false }), { source: 'SEC filings' });
  const placesSt = useData(view === 'map' ? 'splc:places' : null, async () => { const r = await fetch(`${import.meta.env.BASE_URL}supply/places.json`); return { data: (r.ok ? await r.json() : {}) as Record<string, Place>, fetchedAt: Date.now(), fromCache: false }; }, { source: 'OpenStreetMap Nominatim' });
  const peersSt = useData(`splc:peers:${sym}`, () => fh.peers(sym), { source: 'Finnhub peers' });
  const odShard = mine.find((x) => x.id === sym)?.value ?? null;
  // Prefer whichever extraction read the newer filing (an on-demand refresh beats an older static shard).
  const shard = root.data && odShard ? (odShard.filing.date > root.data.filing.date ? odShard : root.data) : root.data ?? odShard;
  const latest = useData(shard ? `splc:latest:${sym}` : null, async () => {
    const p = await profile(sym);
    const f = p.data.filings.find((x) => x.form === '10-K' || x.form === '20-F' || x.form === '40-F');
    return { data: f ? { form: f.form, date: f.filed } : null, fetchedAt: p.fetchedAt, fromCache: false };
  }, { source: 'SEC EDGAR' });
  const stale = shard && latest.data && latest.data.date > shard.filing.date ? latest.data : null;

  const all = useMemo<Edge[]>(() => {
    const extra = shardEdges(mine.map((x) => x.value).filter((s) => !base.data?.edges.some((e) => e.via === s.t)));
    return [...(base.data?.edges ?? []), ...extra].filter((e) => e.conf >= minConf);
  }, [base.data, mine, minConf]);
  const hood = useMemo(() => neighborhood(all, sym, view === '3d' ? hops : 1), [all, sym, hops, view]);
  const impact = useMemo(() => (shock ? disrupt(all, sym, 3) : null), [all, sym, shock]);

  // Sort counterparties into the three groups, using this company's own disclosures first.
  const groups = useMemo(() => {
    const relOf = (id: string): Rel | undefined => shard?.rels.find((r) => (r.t || r.n) === id);
    const sup = new Map<string, Edge>(), cus = new Map<string, Edge>(), par = new Map<string, Edge>();
    for (const e of hood.edges) {
      const other = e.to === sym ? e.from : e.from === sym ? e.to : null;
      if (!other || other === sym) continue;
      if (e.kind === 'partner' || relOf(other)?.k === 'partner') par.set(other, e);
      else (e.to === sym ? sup : cus).set(other, e);
    }
    return { sup, cus, par, relOf };
  }, [hood, sym, shard]);

  const tickersShown = useMemo(() => [...new Set([...groups.sup.keys(), ...groups.cus.keys(), ...groups.par.keys(), ...(peersSt.data ?? []).filter((p) => p !== sym).slice(0, 8)].filter(isTicker))].slice(0, 80), [groups, peersSt.data, sym]);
  const q = useData(tickersShown.length ? `splc:q:${sym}:${tickersShown.length}` : null, () => quotes(tickersShown), { source: 'Alpaca quotes', everyMs: 60_000 });

  const tiles = useMemo(() => {
    const mk = (id: string, e: Edge, role: 'supplier' | 'customer' | 'partner'): Tile => {
      const r = groups.relOf(id);
      const own = e.via === sym;
      const share = own ? e.share : null;
      const crit = r ? criticalReason({ k: r.k, share: r.share, ev: r.ev, what: r.what }) : null;
      const theirs = !own && e.share != null ? `${sym} = ${fmt(e.share, 0)}% of their ${role === 'supplier' ? 'revenue' : 'purchases'}` : null;
      const line = share != null ? `${role === 'customer' ? 'Rev' : 'Spend'}: ${fmt(share, 1)}%  ·  conf ${e.conf}` : theirs ?? `${short(e.what, 20)} · conf ${e.conf}`;
      return { id, label: r?.n && r.t ? `${r.n} (${r.t})` : id, ticker: isTicker(id) ? id : r?.t ?? null, line, share: share ?? e.share, conf: e.conf, chg: isTicker(id) ? q.data?.[id]?.changePct ?? null : null, impact: impact?.get(id), crit };
    };
    const order = (xs: Tile[]) => [...xs].sort((a, b) => sort === 'name' ? a.label.localeCompare(b.label) : sort === 'conf' ? b.conf - a.conf : sort === 'critical' ? Number(Boolean(b.crit)) - Number(Boolean(a.crit)) || (b.share ?? -1) - (a.share ?? -1) : (b.share ?? -1) - (a.share ?? -1));
    const peers: Tile[] = (peersSt.data ?? []).filter((p) => p !== sym).slice(0, 8).map((p) => ({ id: `peer:${p}`, label: p, ticker: p, line: q.data?.[p] ? `${fmt(q.data[p]!.price)}  ${fmt(q.data[p]!.changePct, 2)}%` : 'peer', share: null, conf: 1, chg: q.data?.[p]?.changePct ?? null }));
    return {
      suppliers: order([...groups.sup].map(([id, e]) => mk(id, e, 'supplier'))),
      customers: order([...groups.cus].map(([id, e]) => mk(id, e, 'customer'))),
      partners: order([...groups.par].map(([id, e]) => mk(id, e, 'partner'))),
      peers,
    };
  }, [groups, q.data, impact, sort, sym, peersSt.data]);

  const graph = useMemo(() => {
    const deg = new Map<string, number>();
    hood.edges.forEach((e) => { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); });
    const role = (id: string): GNode['role'] => (id === sym ? 'root' : groups.sup.has(id) ? 'supplier' : groups.cus.has(id) ? 'customer' : groups.par.has(id) ? 'partner' : 'other');
    const nodes: GNode[] = [...hood.nodes.keys()].map((id) => ({ id, role: role(id), size: deg.get(id) ?? 1, impact: impact?.get(id) }));
    const links: GLink[] = hood.edges.map((e) => ({ from: e.from, to: e.to, w: e.share ?? 1 }));
    return { nodes, links };
  }, [hood, sym, groups, impact]);

  const extract = async () => {
    setOd({ busy: 'Reading the latest annual report from SEC...' });
    try {
      const prep = await prepareOnDemand(sym);
      if (!window.confirm(`Extract ${sym}'s supply chain with Claude Sonnet?\n\nEstimated cost: about $${prep.usd.toFixed(3)} (${Math.round(prep.input.length / 4).toLocaleString()} input tokens).\nSource: ${prep.filing.form} filed ${prep.filing.date}.`)) { setOd({}); return; }
      setOd({ busy: 'Claude is reading the filing (30 to 90 seconds)...' });
      const r = await runOnDemand(sym, prep);
      await sync.put('supply', sym, r.shard);
      setOd({ note: `Saved ${r.shard.rels.length} relationships ($${r.usd.toFixed(3)}).${r.dropped ? ` ${r.dropped} dropped because their evidence quote was not found in the filing.` : ''}` });
    } catch (e) {
      setOd({ err: e instanceof Error ? e.message : 'failed' });
    }
  };

  const pick = (t: Tile) => setSel(t.id);
  const selTile = [...tiles.suppliers, ...tiles.customers, ...tiles.partners, ...tiles.peers].find((t) => t.id === sel);
  const selRel = sel ? groups.relOf(sel.replace(/^peer:/, '')) : undefined;
  const selEdges = sel ? all.filter((e) => (e.from === sel && e.to === sym) || (e.to === sel && e.from === sym)) : [];
  const nCrit = [...tiles.suppliers, ...tiles.customers].filter((t) => t.crit).length;
  const custShare = [...groups.cus.values()].filter((e) => e.via === sym && e.share != null).reduce((a, e) => a + e.share!, 0);
  const covered = Boolean(shard);

  return (
    <div>
      <div className="toolbar splc-bar">
        <strong className="accent">{sym}</strong>
        <span className="muted">Show as</span>
        {(['chart', 'map', 'table', '3d'] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === '3d' ? '3D' : v.toUpperCase()}</button>)}
        <span className="muted">Sort by</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort">
          <option value="critical">Critical first</option><option value="share">Quantified exposure</option><option value="conf">Confidence</option><option value="name">Name</option>
        </select>
        <label className="muted">Min conf <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}>{[0, 0.6, 0.8, 0.9].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        {view === '3d' && [1, 2, 3].map((h) => <button key={h} aria-pressed={hops === h} onClick={() => setHops(h)}>{h} HOP{h > 1 ? 'S' : ''}</button>)}
        <button aria-pressed={shock} onClick={() => setShock((s) => !s)}>{shock ? 'CLEAR DISRUPTION' : `DISRUPT ${sym}`}</button>
      </div>
      <DataStatus state={base} />
      {stale && (
        <p>
          <span className="badge">NEWER FILING</span> {sym} filed a {stale.form} on {stale.date}, after the {shard!.filing.date} filing this map was built from.{' '}
          <button disabled={Boolean(od.busy)} onClick={() => void extract()}>{od.busy ? 'WORKING...' : 'REFRESH WITH SONNET'}</button>
        </p>
      )}
      {!covered && (
        <p>
          <span className="badge">NOT EXTRACTED</span> {sym} is outside the extracted set{hood.edges.length ? `; ${hood.edges.length} links come from other companies' filings` : ''}.{' '}
          <button disabled={Boolean(od.busy)} onClick={() => void extract()}>{od.busy ? 'WORKING...' : 'EXTRACT WITH SONNET'}</button>
        </p>
      )}
      {od.busy && <p className="muted">{od.busy}</p>}
      {od.err && <p className="down">{od.err}</p>}
      {od.note && <p className="up">{od.note}</p>}
      {shock && <p className="down"><span className="badge">ESTIMATE</span> If {sym} stopped: tiles turn red by estimated knock-on exposure (disclosed shares, unknown counts as 5%, halving per hop). A rough model, not a forecast.</p>}

      {view === 'chart' && (
        <SupplyChart
          center={{ ticker: sym, name: shard?.name ?? sym, lines: [
            `Suppliers ${tiles.suppliers.length}  ·  Customers ${tiles.customers.length}`,
            `Critical links: ${nCrit}`,
            custShare > 0 ? `Customer revenue quantified: ${fmt(custShare, 1)}%` : 'Customer revenue: not quantified',
            shard ? `${shard.filing.form} ${shard.filing.date}` : 'via other filings only',
          ] }}
          suppliers={tiles.suppliers} customers={tiles.customers} partners={tiles.partners} peers={tiles.peers}
          selected={sel} onPick={pick}
        />
      )}
      {view === 'map' && <SupplyMap root={sym} places={placesSt.data ?? {}} links={[...tiles.suppliers.map((t) => ({ id: t.id, role: 'supplier' as const, crit: Boolean(t.crit) })), ...tiles.customers.map((t) => ({ id: t.id, role: 'customer' as const, crit: Boolean(t.crit) })), ...tiles.partners.map((t) => ({ id: t.id, role: 'partner' as const, crit: false }))]} onPick={setSel} />}
      {view === '3d' && graph.nodes.length > 1 && <SupplyGraph nodes={graph.nodes} links={graph.links} selected={sel} onSelect={setSel} />}
      {view !== 'table' && <p className="muted">Tile color: today&apos;s move (green up, red down, grey not listed). <span style={{ color: '#ff433d' }}>CRITICAL</span> = the filing says sole or single source, depends or relies on it, a limited number of suppliers, or a share of 10% or more. Click a tile.</p>}

      {selTile && (
        <div className="ai-block">
          <strong className="accent">{selTile.label}</strong>{' '}
          {selTile.ticker && ['SPLC', 'DES', 'GP', 'CF'].map((c) => <button key={c} className="link-btn" onClick={() => run(`${selTile.ticker} ${c}`, { replace: c === 'SPLC' })}>{c}</button>)}
          {selTile.crit && <p className="down"><span className="badge">CRITICAL</span> {selTile.crit}</p>}
          {selRel && <p>&ldquo;{selRel.ev}&rdquo; <span className="muted">({selRel.what}, conf {selRel.conf})</span> <a href={selRel.src} target="_blank" rel="noreferrer noopener">source filing</a></p>}
          {!selRel && selEdges.map((e, i) => <p key={i} className="muted">From {e.via}&apos;s filing: {e.from} supplies {e.to} ({e.what}{e.share != null ? `, ${fmt(e.share, 1)}%` : ''}). Open {e.via} SPLC for the quote.</p>)}
          {sel?.startsWith('peer:') && <p className="muted">Peer company (Finnhub peer list), not a disclosed relationship.</p>}
        </div>
      )}

      {(view === 'table' || covered) && shard && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>{shard.name}: DISCLOSED RELATIONSHIPS ({shard.filing.form} {shard.filing.date})</h4>
          <table className="grid-table">
            <thead><tr><th>Counterparty</th><th>Role</th><th>What</th><th className="num">Share</th><th className="num">Conf</th><th>Critical</th><th>Evidence</th></tr></thead>
            <tbody>{shard.rels.map((r, i) => { const c = criticalReason(r); return <tr key={i}><td>{r.t ? <button className="link-btn" onClick={() => run(`${r.t} SPLC`, { replace: true })}>{r.n} ({r.t})</button> : r.n}</td><td className={r.k === 'customer' ? 'up' : r.k === 'partner' ? 'muted' : ''}>{r.k.toUpperCase()}</td><td style={{ whiteSpace: 'normal' }}>{r.what}</td><td className="num">{r.share != null ? `${fmt(r.share, 1)}%` : '-'}</td><td className="num">{r.conf}</td><td className="down">{c ?? ''}</td><td style={{ whiteSpace: 'normal', maxWidth: 300 }} className="muted">&ldquo;{r.ev}&rdquo; <a href={r.src} target="_blank" rel="noreferrer noopener">source</a></td></tr>; })}</tbody>
          </table>
          {shard.gaps && <p className="muted"><strong>Not disclosed:</strong> {shard.gaps}</p>}
          {shard.facilities.length > 0 && <p className="muted"><strong>Facilities:</strong> {shard.facilities.map((f) => `${f.type}: ${f.place}`).join('; ')}</p>}
          <p className="muted">Extracted by {shard.model} on {shard.at}.</p>
        </>
      )}
      {view === 'table' && hood.edges.some((e) => e.via !== sym) && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>LINKS REPORTED BY OTHER COMPANIES</h4>
          <table className="grid-table">
            <thead><tr><th>Supplier</th><th>Customer</th><th>What</th><th className="num">Share</th><th>Reported by</th></tr></thead>
            <tbody>{hood.edges.filter((e) => e.via !== sym).map((e, i) => <tr key={i}><td>{e.from}</td><td>{e.to}</td><td style={{ whiteSpace: 'normal' }}>{e.what}</td><td className="num">{e.share != null ? `${fmt(e.share, 1)}%` : '-'}</td><td className="muted">{e.via}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <div className="disclaimer">Relationships only as disclosed in SEC filings; most companies name few suppliers or customers, so this is never complete. Shares are as reported by the filing company. Peers are Finnhub&apos;s peer list. Extraction and disruption estimates: {AI_LABEL}</div>
    </div>
  );
}
