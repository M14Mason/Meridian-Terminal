import { useEffect, useMemo, useRef, useState } from 'react';
import { LineSeries } from 'lightweight-charts';
import { alignCloses, rebase } from '../../shared/align';
import { line, makeChart, PALETTE } from '../charts/lw';
import { ALPACA_NOTE, multiBars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dir, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const RANGES = { '1M': 31, '3M': 92, '6M': 183, YTD: 0, '1Y': 366, '3Y': 1096, '5Y': 1827 } as const;
type R = keyof typeof RANGES;
const daysFor = (r: R) => (r === 'YTD' ? Math.ceil((Date.now() - Date.UTC(new Date().getUTCFullYear(), 0, 1)) / 86_400_000) + 1 : RANGES[r]);

// COMP: performance vs a benchmark (default SPY), rebased to 100.
export default function ComparePanel({ security }: PanelProps) {
  const [extra, setExtra] = useState('SPY');
  const [range, setRange] = useState<R>('1Y');
  const syms = useMemo(() => [...new Set([security!, ...extra.toUpperCase().split(/[\s,]+/).filter((s) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(s))])].slice(0, 8), [security, extra]);
  const state = useData(`comp:${syms.join(',')}:${range}`, async () => {
    const days = daysFor(range);
    const r = await multiBars(syms, '1Day', startFor(days + 7));
    return { ...r, data: { bars: r.data, cutoff: Date.now() - days * 86_400_000 } };
  }, { source: 'Alpaca', note: ALPACA_NOTE, everyMs: 900_000 });
  const al = useMemo(() => {
    if (!state.data) return null;
    const full = alignCloses(syms.map((s) => state.data!.bars[s] ?? []));
    // Base = last close before the period starts (for YTD, the prior year's final close).
    const first = Math.max(0, full.times.findIndex((t) => t >= state.data!.cutoff) - 1);
    return { dates: full.dates.slice(first), times: full.times.slice(first), closes: full.closes.map((c) => c.slice(first)) };
  }, [state.data, syms]);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!box.current || !al || al.dates.length < 2) return;
    const chart = makeChart(box.current);
    al.closes.forEach((c, i) => {
      const s = chart.addSeries(LineSeries, { color: PALETTE[i % PALETTE.length], lineWidth: 2, title: syms[i], priceLineVisible: false });
      s.setData(line(al.times, rebase(c)));
    });
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [al, syms]);

  return (
    <div className="panel-fill">
      <div className="toolbar">
        <strong className="accent">{security}</strong> vs
        <input value={extra} onChange={(e) => setExtra(e.target.value)} aria-label="Compare with (comma separated)" style={{ width: 160 }} />
        {(Object.keys(RANGES) as R[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r}</button>
        ))}
      </div>
      <DataStatus state={state} keyName="Alpaca" />
      {al && al.dates.length > 1 && (
        <table className="grid-table">
          <thead><tr><th>Ticker</th><th className="num">Return {range}</th><th className="num">vs {syms[1] ?? '-'}</th></tr></thead>
          <tbody>
            {al.closes.map((c, i) => {
              const r = (c.at(-1)! / c[0]! - 1) * 100;
              const b = al.closes[1] ? (al.closes[1].at(-1)! / al.closes[1][0]! - 1) * 100 : null;
              return (
                <tr key={syms[i]}>
                  <td style={{ color: PALETTE[i % PALETTE.length] }}>{syms[i]}</td>
                  <td className={`num ${dir(r)}`}>{fmtPct(r)}</td>
                  <td className={`num ${dir(b == null || i === 1 ? null : r - b)}`}>{i === 1 || b == null ? '-' : fmtPct(r - b)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <div ref={box} className="chart-box grow" />
      <div className="disclaimer">Rebased to 100 on the first common trading day. Dividend-adjusted prices.</div>
    </div>
  );
}
