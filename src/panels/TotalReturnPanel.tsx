import { useEffect, useMemo, useRef, useState } from 'react';
import { LineSeries } from 'lightweight-charts';
import { alignCloses, rebase } from '../../shared/align';
import { line, makeChart, themeColors } from '../charts/lw';
import { ALPACA_NOTE, bars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dir, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import type { Fetched } from '../data/client';
import type { Bar } from '../../shared/market';

// TRA: price return vs total return. Total return uses dividend-adjusted prices (dividends reinvested).
export default function TotalReturnPanel({ security }: PanelProps) {
  const sym = security!;
  const [years, setYears] = useState(5);
  const state = useData(`tra:${sym}:${years}`, async (): Promise<Fetched<{ price: Bar[]; total: Bar[] }>> => {
    const start = startFor(years * 366);
    const [p, t] = await Promise.all([bars(sym, '1Day', start, undefined, 5000, 'split'), bars(sym, '1Day', start, undefined, 5000, 'all')]);
    return { data: { price: p.data, total: t.data }, fetchedAt: Math.min(p.fetchedAt, t.fetchedAt), fromCache: false };
  }, { source: 'Alpaca', note: ALPACA_NOTE });
  const al = useMemo(() => (state.data ? alignCloses([state.data.price, state.data.total]) : null), [state.data]);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || !al || al.dates.length < 2) return;
    const c = themeColors();
    const chart = makeChart(box.current);
    chart.addSeries(LineSeries, { color: c.dim, lineWidth: 2, title: 'Price', priceLineVisible: false }).setData(line(al.times, rebase(al.closes[0]!)));
    chart.addSeries(LineSeries, { color: c.accent, lineWidth: 2, title: 'Total', priceLineVisible: false }).setData(line(al.times, rebase(al.closes[1]!)));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [al]);
  const pr = al ? (al.closes[0]!.at(-1)! / al.closes[0]![0]! - 1) * 100 : null;
  const tr = al ? (al.closes[1]!.at(-1)! / al.closes[1]![0]! - 1) * 100 : null;
  const yrs = al ? (al.times.at(-1)! - al.times[0]!) / (365.25 * 86_400_000) : 1;
  const ann = (x: number | null) => (x == null ? null : (Math.pow(1 + x / 100, 1 / yrs) - 1) * 100);
  return (
    <div className="panel-fill">
      <div className="toolbar">
        <strong className="accent">{sym}</strong>
        {[1, 3, 5, 10].map((y) => <button key={y} aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}
      </div>
      <DataStatus state={state} keyName="Alpaca" />
      {al && (
        <dl className="kv">
          <dt>Price return</dt><dd className={dir(pr)}>{fmtPct(pr)} ({fmtPct(ann(pr))} a year)</dd>
          <dt>Total return</dt><dd className={dir(tr)}>{fmtPct(tr)} ({fmtPct(ann(tr))} a year)</dd>
          <dt>From dividends</dt><dd>{fmtPct(tr != null && pr != null ? tr - pr : null)}</dd>
        </dl>
      )}
      <div ref={box} className="chart-box grow" />
      <div className="disclaimer">Total return is estimated from Alpaca's dividend-adjusted prices, which assume dividends reinvested on the ex-date. Before taxes and fees.</div>
    </div>
  );
}
