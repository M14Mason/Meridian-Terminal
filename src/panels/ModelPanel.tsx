// MODEL: Meridian rules index, tracked forward from its first rebalance (no backfilled history).
import { useEffect, useMemo } from 'react';
import { chain, MODEL_RULES, modelPicks, type Period } from '../../shared/model';
import { Lines } from '../charts/Lines';
import { quotes } from '../data/adapters/alpaca';
import { screenerUniverse } from '../data/adapters/universe';
import { useData } from '../data/useData';
import { dir, fmt, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

export default function ModelPanel({ run }: PanelProps) {
  const uni = useData('eqs:universe', screenerUniverse, { source: 'SEC XBRL frames, Massive EOD', everyMs: 6 * 3600_000 });
  const recs = useCollection<Period>('strategies').filter((r) => r.id.startsWith('model:'));
  const periods = useMemo(() => recs.map((r) => r.value).sort((a, b) => a.month.localeCompare(b.month)), [recs]);
  const open = periods.at(-1);
  const month = new Date().toISOString().slice(0, 7);
  const picks = useMemo(() => (uni.data ? modelPicks(uni.data.rows) : []), [uni.data]);

  // Monthly rebalance: close the previous period at today's EOD prices and open a new one.
  useEffect(() => {
    const d = uni.data;
    if (!d || !picks.length || d.spy == null || open?.month === month) return;
    if (open) {
      const px = new Map(d.rows.map((r) => [r.ticker, r.price]));
      const exit = Object.fromEntries(open.holdings.map((h) => [h.t, px.get(h.t) ?? h.px]));
      void sync.put('strategies', `model:${open.month}`, { ...open, exit, spyExit: d.spy });
    }
    void sync.put('strategies', `model:${month}`, { month, date: d.priceDate, spy: d.spy, holdings: picks.map((p) => ({ t: p.ticker, px: p.price })) });
  }, [uni.data, picks, open, month]);

  const syms = useMemo(() => (open ? [...open.holdings.map((h) => h.t), 'SPY'] : []), [open]);
  const live = useData(syms.length ? `model:q:${syms.join(',')}` : null, () => quotes(syms), { source: 'Alpaca quotes', everyMs: 60_000 });
  const pts = useMemo(() => {
    const q = live.data ?? {};
    return chain(periods, Object.fromEntries(Object.entries(q).map(([k, v]) => [k, v.price])), q.SPY?.price ?? null);
  }, [periods, live.data]);
  const series = useMemo(() => {
    const nowAt = live.fetchedAt ?? 0;
    const t = (d: string) => (d === 'now' ? Math.max(nowAt, Date.parse(periods.at(-1)?.date ?? '1970-01-01') + 86_400_000) : Date.parse(d));
    return [{ name: 'MODEL', rows: pts.map((p) => ({ t: t(p.date), v: p.model })) }, { name: 'SPY', rows: pts.map((p) => ({ t: t(p.date), v: p.spy })) }];
  }, [pts, live.fetchedAt, periods]);
  const last = pts.at(-1);
  return (
    <div>
      <DataStatus state={uni} keyName="Massive" />
      <ul className="muted" style={{ margin: '2px 0 6px', paddingLeft: 18 }}>{MODEL_RULES.map((r) => <li key={r}>{r}</li>)}</ul>
      {last && <p>Since {periods[0]!.date}: MODEL <strong className={dir(last.model - 100)}>{fmtPct(last.model - 100)}</strong> vs SPY <span className={dir(last.spy - 100)}>{fmtPct(last.spy - 100)}</span> ({periods.length} rebalance{periods.length === 1 ? '' : 's'}).</p>}
      {pts.length > 2 && <Lines series={series} height={200} />}
      {pts.length <= 2 && <p className="muted">Tracking started this month. The chart fills in as months pass; there is no backfilled history, so no hindsight.</p>}
      <table className="grid-table">
        <thead><tr><th>#</th><th>Ticker</th><th>Name</th><th className="num">Entry</th><th className="num">Now</th><th className="num">Return</th></tr></thead>
        <tbody>{(open?.holdings ?? []).map((h, i) => { const now = live.data?.[h.t]?.price; const r = now ? (now / h.px - 1) * 100 : null; return <tr key={h.t} className="clickable" onClick={() => run(`${h.t} DES`)}><td>{i + 1}</td><td className="accent">{h.t}</td><td>{picks.find((p) => p.ticker === h.t)?.name ?? ''}</td><td className="num">{fmt(h.px)}</td><td className="num">{fmt(now)}</td><td className={`num ${dir(r)}`}>{fmtPct(r)}</td></tr>; })}</tbody>
      </table>
      <div className="disclaimer">Model estimate. Not financial advice. Hypothetical paper index: no trades are placed, no costs, taxes or dividends. Live prices are IEX quotes; rebalance prices are end of day. Rules are fixed in code so results cannot be tuned after the fact.</div>
    </div>
  );
}
