import { useEffect, useRef, useState } from 'react';
import { BaselineSeries } from 'lightweight-charts';
import { makeChart, themeColors, ts } from '../charts/lw';
import { series } from '../data/adapters/fred';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// SER: chart any FRED series (opened from heatmap rows, or typed: UNRATE SER).
export default function SeriesPanel({ security }: PanelProps) {
  const id = security!;
  const [units, setUnits] = useState<'lin' | 'pc1' | 'chg'>('lin');
  const [years, setYears] = useState(10);
  const state = useData(`ser:${id}:${units}:${years}`, () => series(id, new Date(Date.now() - years * 365.25 * 86_400_000).toISOString().slice(0, 10), { units: units === 'lin' ? undefined : units }), { source: 'FRED' });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || !state.data?.length) return;
    const c = themeColors();
    const chart = makeChart(box.current);
    const s = chart.addSeries(BaselineSeries, { baseValue: { type: 'price', price: 0 }, topLineColor: c.up, bottomLineColor: c.down, topFillColor1: c.up + '33', topFillColor2: c.up + '05', bottomFillColor1: c.down + '05', bottomFillColor2: c.down + '33', lineWidth: 2 });
    s.setData(state.data.map((o) => ({ time: ts(Date.parse(o.date)), value: o.value })));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [state.data]);
  const last = state.data?.at(-1);
  return (
    <div className="panel-fill">
      <div className="toolbar">
        <strong className="accent">{id}</strong>
        {last && <span>{fmt(last.value)} <span className="muted">({last.date})</span></span>}
        <button aria-pressed={units === 'lin'} onClick={() => setUnits('lin')}>LEVEL</button>
        <button aria-pressed={units === 'pc1'} onClick={() => setUnits('pc1')}>YOY %</button>
        <button aria-pressed={units === 'chg'} onClick={() => setUnits('chg')}>CHANGE</button>
        {[2, 5, 10, 30].map((y) => <button key={y} aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}
        <a href={`https://fred.stlouisfed.org/series/${id}`} target="_blank" rel="noreferrer noopener">FRED page</a>
      </div>
      <DataStatus state={state} keyName="FRED" empty={state.data?.length === 0} />
      <div ref={box} className="chart-box grow" />
      <div className="disclaimer">Source: FRED, Federal Reserve Bank of St. Louis. Dates are period starts as published.</div>
    </div>
  );
}
