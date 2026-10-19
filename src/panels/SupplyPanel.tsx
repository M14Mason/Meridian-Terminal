// SPLC: supply chain map (BUILD_PROMPT 15). Who a company buys from and sells to, from SEC filings, as a
// 3D network plus an accessible table. Top 1,000 extracted in advance; anything else on demand with Sonnet.
import { useMemo, useState } from 'react';
import { disrupt, edges as shardEdges, neighborhood, type Edge, type Shard } from '../../shared/supply';
import { AI_LABEL } from '../../shared/ai';
import { prepareOnDemand, runOnDemand, staticEdges, staticShard } from '../data/adapters/supply';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';
import { SupplyGraph, type GLink, type GNode } from '../three/SupplyGraph';

const KIND = { supplier: 'SUPPLIER', customer: 'CUSTOMER', partner: 'PARTNER' } as const;

export default function SupplyPanel({ security, run }: PanelProps) {
  const sym = (security ?? 'NVDA').toUpperCase();
  const [hops, setHops] = useState(1);
  const [view, setView] = useState<'3d' | 'table'>('3d');
  const [sel, setSel] = useState<string | null>(null);
  const [shock, setShock] = useState<string | null>(null);
  const [minConf, setMinConf] = useState(0);
  const [od, setOd] = useState<{ busy?: string; err?: string; note?: string }>({});
  const base = useData('splc:edges', async () => ({ data: await staticEdges(), fetchedAt: Date.now(), fromCache: false }), { source: 'SEC filings (Meridian extraction)', everyMs: 6 * 3600_000 });
  const mine = useCollection<Shard>('supply');
  const root = useData(`splc:shard:${sym}`, async () => ({ data: await staticShard(sym), fetchedAt: Date.now(), fromCache: false }), { source: 'SEC filings' });
  const odShard = mine.find((x) => x.id === sym)?.value ?? null;
  const shard = root.data ?? odShard;

  const all = useMemo<Edge[]>(() => {
    const extra = shardEdges(mine.map((x) => x.value).filter((s) => !base.data?.edges.some((e) => e.via === s.t)));
    return [...(base.data?.edges ?? []), ...extra].filter((e) => e.conf >= minConf);
  }, [base.data, mine, minConf]);
  const hood = useMemo(() => neighborhood(all, sym, hops), [all, sym, hops]);
  const impact = useMemo(() => (shock ? disrupt(all, shock, hops + 1) : null), [all, shock, hops]);
  const graph = useMemo(() => {
    const deg = new Map<string, number>();
    hood.edges.forEach((e) => { deg.set(e.from, (deg.get(e.from) ?? 0) + 1); deg.set(e.to, (deg.get(e.to) ?? 0) + 1); });
    const role = (id: string): GNode['role'] => {
      if (id === sym) return 'root';
      const e = hood.edges.find((x) => (x.from === id && x.to === sym) || (x.to === id && x.from === sym));
      if (!e) return 'other';
      return e.via === sym && shard?.rels.find((r) => (r.t || r.n) === id)?.k === 'partner' ? 'partner' : e.from === id ? 'supplier' : 'customer';
    };
    const nodes: GNode[] = [...hood.nodes.keys()].map((id) => ({ id, role: role(id), size: deg.get(id) ?? 1, impact: impact?.get(id) }));
    const links: GLink[] = hood.edges.map((e) => ({ from: e.from, to: e.to, w: e.share ?? 1 }));
    return { nodes, links };
  }, [hood, sym, shard, impact]);

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

  const selEdges = sel ? hood.edges.filter((e) => e.from === sel || e.to === sel) : [];
  const covered = Boolean(shard);
  const isTicker = (id: string) => /^[A-Z][A-Z.]{0,6}$/.test(id);
  return (
    <div>
      <div className="toolbar">
        <strong className="accent">{sym}</strong>
        {[1, 2, 3].map((h) => <button key={h} aria-pressed={hops === h} onClick={() => setHops(h)}>{h} HOP{h > 1 ? 'S' : ''}</button>)}
        <button aria-pressed={view === '3d'} onClick={() => setView('3d')}>3D</button>
        <button aria-pressed={view === 'table'} onClick={() => setView('table')}>TABLE</button>
        <label className="muted">min confidence <select value={minConf} onChange={(e) => setMinConf(Number(e.target.value))}>{[0, 0.6, 0.8, 0.9].map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
        <button aria-pressed={Boolean(shock)} onClick={() => setShock(shock ? null : sel ?? sym)}>{shock ? `CLEAR DISRUPTION (${shock})` : `DISRUPT ${sel ?? sym}`}</button>
      </div>
      <DataStatus state={base} />
      {base.data && <p className="muted">{base.data.companies} companies extracted so far (target: the 1,000 largest), plus {mine.length} on demand. {hood.nodes.size - 1} linked nodes within {hops} hop{hops > 1 ? 's' : ''}.</p>}
      {!covered && (
        <p>
          <span className="badge">NOT EXTRACTED</span> {sym} is not in the extracted set yet{hood.edges.length ? `, but ${hood.edges.length} links come from other companies' filings` : ''}.{' '}
          <button disabled={Boolean(od.busy)} onClick={() => void extract()}>{od.busy ? 'WORKING...' : 'EXTRACT WITH SONNET'}</button>
        </p>
      )}
      {od.busy && <p className="muted">{od.busy}</p>}
      {od.err && <p className="down">{od.err}</p>}
      {od.note && <p className="up">{od.note}</p>}
      {shock && <p className="down"><span className="badge">ESTIMATE</span> Disruption at {shock}: red = estimated knock-on exposure, using disclosed revenue shares (unknown shares count as 5%), halving per hop. A rough model, not a forecast.</p>}
      {view === '3d' && graph.nodes.length > 1 && <SupplyGraph nodes={graph.nodes} links={graph.links} selected={sel} onSelect={setSel} />}
      {graph.nodes.length <= 1 && <p className="muted">No relationships found yet for {sym}.</p>}
      {view === '3d' && graph.nodes.length > 1 && <p className="muted"><span style={{ color: '#4aa3ff' }}>●</span> supplier <span style={{ color: '#4af6c3' }}>●</span> customer <span style={{ color: '#b07cff' }}>●</span> partner <span style={{ color: '#8a8a8a' }}>●</span> further hops. Dots flow from supplier to customer. Click a node.</p>}
      {sel && (
        <div className="ai-block">
          <strong className="accent">{sel}</strong>{' '}
          {isTicker(sel) && <>{['SPLC', 'DES', 'GP', 'CF'].map((c) => <button key={c} className="link-btn" onClick={() => run(`${sel} ${c}`)}>{c}</button>)}</>}
          <ul style={{ margin: 0, paddingLeft: 18 }}>{selEdges.map((e, i) => <li key={i}>{e.from} supplies {e.to}: {e.what}{e.share != null ? ` (${fmt(e.share, 1)}%)` : ''} <span className="muted">conf {e.conf}, from {e.via}&apos;s filing</span></li>)}</ul>
        </div>
      )}
      {(view === 'table' || shard) && shard && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>{shard.name}: DISCLOSED RELATIONSHIPS ({shard.filing.form} {shard.filing.date})</h4>
          <table className="grid-table">
            <thead><tr><th>Counterparty</th><th>Role</th><th>What</th><th className="num">Share</th><th className="num">Conf</th><th>Evidence</th></tr></thead>
            <tbody>{shard.rels.map((r, i) => <tr key={i}><td>{r.t ? <button className="link-btn" onClick={() => run(`${r.t} SPLC`)}>{r.n} ({r.t})</button> : r.n}</td><td className={r.k === 'supplier' ? '' : r.k === 'customer' ? 'up' : 'muted'}>{KIND[r.k]}</td><td style={{ whiteSpace: 'normal' }}>{r.what}</td><td className="num">{r.share != null ? `${fmt(r.share, 1)}%` : '-'}</td><td className="num">{r.conf}</td><td style={{ whiteSpace: 'normal', maxWidth: 300 }} className="muted">&ldquo;{r.ev}&rdquo; <a href={r.src} target="_blank" rel="noreferrer noopener">source</a></td></tr>)}</tbody>
          </table>
          {shard.gaps && <p className="muted"><strong>Not disclosed:</strong> {shard.gaps}</p>}
          {shard.facilities.length > 0 && <p className="muted"><strong>Facilities:</strong> {shard.facilities.map((f) => `${f.type}: ${f.place}`).join('; ')}</p>}
          <p className="muted">Extracted by {shard.model} on {shard.at}.</p>
        </>
      )}
      {view === 'table' && (
        <table className="grid-table">
          <thead><tr><th>Supplier</th><th>Customer</th><th>What</th><th className="num">Share</th><th>Reported by</th></tr></thead>
          <tbody>{hood.edges.map((e, i) => <tr key={i}><td>{e.from}</td><td>{e.to}</td><td style={{ whiteSpace: 'normal' }}>{e.what}</td><td className="num">{e.share != null ? `${fmt(e.share, 1)}%` : '-'}</td><td className="muted">{e.via}</td></tr>)}</tbody>
        </table>
      )}
      <div className="disclaimer">Relationships only as disclosed in SEC filings; most companies name few suppliers or customers, so this map is never complete. Every edge has a confidence score and a quoted source. Global map of facilities arrives after geocoding. Extraction and disruption estimates: {AI_LABEL}</div>
    </div>
  );
}
