import { useEffect, useRef, useState } from 'react';
import { CandlestickSeries, type IChartApi, type ISeriesApi, type SeriesType } from 'lightweight-charts';
import { makeChart, themeColors, ts } from '../charts/lw';
import { ALPACA_NOTE, multiBars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { useWatchlists } from '../state/watchlists';

// MCHT: 2x2 chart grid with a synced crosshair (item 16).
export default function MultiChartPanel({ security, run }: PanelProps) {
  const lists = useWatchlists();
  const [input, setInput] = useState(() => [security, ...lists[0]!.value.symbols].filter(Boolean).slice(0, 4).join(' '));
  const syms = [...new Set(input.toUpperCase().split(/[\s,]+/).filter((s) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(s)))].slice(0, 4);
  const state = useData(`mcht:${syms.join(',')}`, () => multiBars(syms, '1Day', startFor(200)), { source: 'Alpaca', note: ALPACA_NOTE, everyMs: 600_000 });
  const boxes = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (!state.data) return;
    const c = themeColors();
    const charts: { chart: IChartApi; series: ISeriesApi<SeriesType>; closes: Map<number, number> }[] = [];
    syms.forEach((s, i) => {
      const el = boxes.current[i];
      const data = state.data![s] ?? [];
      if (!el) return;
      const chart = makeChart(el);
      const series = chart.addSeries(CandlestickSeries, { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false });
      series.setData(data.map((b) => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
      chart.timeScale().fitContent();
      charts.push({ chart, series, closes: new Map(data.map((b) => [ts(b.t), b.c])) });
    });
    // Moving the crosshair on one chart moves it on the others at the same date.
    charts.forEach((src) => {
      src.chart.subscribeCrosshairMove((p) => {
        for (const dst of charts) {
          if (dst === src) continue;
          const price = p.time != null ? dst.closes.get(p.time as number) : undefined;
          if (p.time == null || price == null) dst.chart.clearCrosshairPosition();
          else dst.chart.setCrosshairPosition(price, p.time, dst.series);
        }
      });
    });
    return () => charts.forEach((x) => x.chart.remove());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.data, syms.join(',')]);

  return (
    <div className="panel-fill">
      <div className="toolbar">
        <input value={input} onChange={(e) => setInput(e.target.value)} aria-label="Up to 4 tickers" style={{ width: 220 }} />
        <span className="muted">6 months, daily</span>
      </div>
      <DataStatus state={state} keyName="Alpaca" />
      <div className="grow" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 4 }}>
        {syms.map((s, i) => (
          <div key={s} style={{ display: 'flex', flexDirection: 'column', minHeight: 200 }}>
            <button className="link-btn" style={{ textAlign: 'left' }} onClick={() => run(`${s} GP`)}>{s}</button>
            <div ref={(el) => void (boxes.current[i] = el)} className="chart-box" style={{ minHeight: 180 }} />
          </div>
        ))}
      </div>
    </div>
  );
}
