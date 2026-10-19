import { useMemo, useState } from 'react';
import { findClusters, type InsiderBuy } from '../../shared/form4';
import { jobData } from '../data/adapters/jobs';
import { useData } from '../data/useData';
import { fmt, fmtBig } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// CLUS: insider cluster buys (owner idea 1). Open-market purchases only (Form 4 code P).
export default function ClusterPanel({ run }: PanelProps) {
  const state = useData('clus', () => jobData<{ at: number; days: string[]; buys: InsiderBuy[] }>('insiders'), { source: 'SEC Form 4 (daily job)', everyMs: 3600_000 });
  const [min, setMin] = useState(3);
  const [tab, setTab] = useState<'clusters' | 'all'>('clusters');
  const [officers, setOfficers] = useState(false);
  const buys = useMemo(() => (state.data?.buys ?? []).filter((b) => !officers || /chief|ceo|cfo|president/i.test(b.role)), [state.data, officers]);
  const clusters = useMemo(() => findClusters(buys, min, 10), [buys, min]);
  const days = state.data?.days ?? [];
  const open = (t: string) => (/^CIK/.test(t) ? undefined : () => run(`${t} INS`));
  return (
    <div>
      <div className="toolbar">
        <button aria-pressed={tab === 'clusters'} onClick={() => setTab('clusters')}>CLUSTERS</button>
        <button aria-pressed={tab === 'all'} onClick={() => setTab('all')}>ALL BUYS</button>
        {tab === 'clusters' && [2, 3, 4, 5].map((n) => <button key={n} aria-pressed={min === n} onClick={() => setMin(n)}>{n}+ INSIDERS</button>)}
        <label className="toggle" style={{ minHeight: 20 }}><input type="checkbox" checked={officers} onChange={(e) => setOfficers(e.target.checked)} /> C-suite only</label>
      </div>
      <DataStatus state={state} />
      {state.data && <p className="muted">Covers {days.length} SEC business days ({days[0] ?? '-'} to {days.at(-1) ?? '-'}), {buys.length} open-market purchases.</p>}
      {tab === 'clusters' ? (
        <table className="grid-table">
          <thead><tr><th>Company</th><th className="num">Insiders</th><th className="num">Total bought</th><th>Window</th><th>Who</th></tr></thead>
          <tbody>
            {clusters.map((c) => (
              <tr key={c.ticker} className={open(c.ticker) ? 'clickable' : ''} onClick={open(c.ticker)}>
                <td><span className="accent">{/^CIK/.test(c.ticker) ? '-' : c.ticker}</span> {c.issuer}</td>
                <td className="num up">{c.insiders.length}</td>
                <td className="num">${fmtBig(c.value)}</td>
                <td className="muted">{c.first} to {c.last}</td>
                <td style={{ whiteSpace: 'normal' }}>{c.insiders.slice(0, 6).join(', ')}{c.insiders.length > 6 ? '…' : ''}</td>
              </tr>
            ))}
            {state.data && clusters.length === 0 && <tr><td colSpan={5} className="muted">No clusters at this threshold in the covered window.</td></tr>}
          </tbody>
        </table>
      ) : (
        <table className="grid-table">
          <thead><tr><th>Date</th><th>Company</th><th>Insider</th><th>Role</th><th className="num">Shares</th><th className="num">Price</th><th className="num">Value</th></tr></thead>
          <tbody>
            {[...buys].sort((a, b) => b.value - a.value).slice(0, 300).map((b, i) => (
              <tr key={`${b.acc}${i}`}>
                <td>{b.date}</td>
                <td><span className="accent">{/^[A-Z]/.test(b.ticker) && b.ticker !== 'NONE' ? b.ticker : '-'}</span> {b.issuer}</td>
                <td>{b.owner}</td>
                <td className="muted">{b.role}</td>
                <td className="num">{fmtBig(b.shares)}</td>
                <td className="num">{fmt(b.price)}</td>
                <td className="num">${fmtBig(b.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="disclaimer">Source: SEC Form 4, open-market purchases (code P) only; awards, option exercises and sales excluded. Research shows clustered insider buying has historically carried information, but it is not a guarantee. Not financial advice.</div>
    </div>
  );
}
