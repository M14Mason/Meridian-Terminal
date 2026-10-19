// Small multi-line time chart (Lightweight Charts) shared by several panels.
import { useEffect, useRef } from 'react';
import { LineSeries } from 'lightweight-charts';
import { line, makeChart, PALETTE } from './lw';

export interface LineSpec { name: string; rows: { t: number; v: number }[]; color?: string }

export function Lines({ series, height = 240 }: { series: LineSpec[]; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || !series.some((s) => s.rows.length)) return;
    const chart = makeChart(box.current);
    series.forEach((s, i) => chart.addSeries(LineSeries, { color: s.color ?? PALETTE[i % PALETTE.length], lineWidth: 2, title: s.name, priceLineVisible: false }).setData(line(s.rows.map((r) => r.t), s.rows.map((r) => r.v))));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [series]);
  return <div ref={box} className="chart-box" style={{ height, minHeight: 180 }} />;
}
