// BT: backtester with the hedge fund strategy library (catalog 36 to 49, owner additions).
// Hypothetical results only. No order or paper-trading code exists anywhere (section 20).
import { useEffect, useMemo, useRef, useState } from 'react';
import { LineSeries } from 'lightweight-charts';
import { alignCloses } from '../../shared/align';
import { paramGrid, STRATEGIES, type Panel, type Result } from '../../shared/backtest';
import { heatColor } from '../../shared/heat';
import { line, makeChart, themeColors } from '../charts/lw';
import { multiBars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { fmt, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync } from '../state/sync';
import BacktestWorker from '../workers/backtest.worker.ts?worker';

type Out = { result?: Result; shuffle?: number; grid?: number[][]; gx?: number[]; gy?: number[]; walk?: { from: string; to: string; best: number; inSharpe: number; outSharpe: number; outReturn: number }[]; error?: string };

function useWorker() {
  const w = useRef<Worker | null>(null);
  const seq = useRef(0);
  const pending = useRef(new Map<number, (v: Out) => void>());
  useEffect(() => {
    w.current = new BacktestWorker();
    w.current.onmessage = (e: MessageEvent<Out & { seq: number; ok: boolean }>) => {
      pending.current.get(e.data.seq)?.(e.data);
      pending.current.delete(e.data.seq);
    };
    return () => w.current?.terminate();
  }, []);
  return (job: object) => new Promise<Out>((res) => {
    const id = ++seq.current;
    pending.current.set(id, res);
    w.current?.postMessage({ ...job, seq: id });
  });
}

const pct = (v: number) => fmtPct(v * 100, 1);

export default function BacktestPanel(_: PanelProps) {
  const [id, setId] = useState('tsmom');
  const strat = STRATEGIES.find((s) => s.id === id)!;
  const [params, setParams] = useState<Record<string, number>>({});
  const [universe, setUniverse] = useState('');
  const [years, setYears] = useState(10);
  const [cost, setCost] = useState(2);
  const [slip, setSlip] = useState(3);
  const [bench, setBench] = useState('SPY');
  const [out, setOut] = useState<Out | null>(null);
  const [busy, setBusy] = useState('');
  const work = useWorker();
  const box = useRef<HTMLDivElement>(null);

  // Reset inputs to the strategy's defaults when switching.
  const effParams = useMemo(() => ({ ...Object.fromEntries(strat.params.map((p) => [p.key, p.default])), ...params }), [strat, params]);
  const syms = useMemo(() => (universe.trim() ? universe.toUpperCase().split(/[\s,]+/).filter(Boolean) : strat.universe), [universe, strat]);
  const all = useMemo(() => [...new Set([...syms, bench])], [syms, bench]);

  const data = useData(`bt:${all.join(',')}:${years}`, async () => {
    const r = await multiBars(all, '1Day', startFor(years * 366), true);
    return { data: { bars: r.data, feed: r.feed }, fetchedAt: r.fetchedAt, fromCache: false };
  }, { source: 'Alpaca daily' });
  const panel: Panel | null = useMemo(() => {
    if (!data.data) return null;
    const al = alignCloses(all.map((s) => data.data!.bars[s] ?? []));
    if (al.dates.length < 60) return null;
    return { dates: al.dates, close: Object.fromEntries(all.map((s, i) => [s, al.closes[i]!])) };
  }, [data.data, all]);
  const missing = data.data ? all.filter((s) => !(data.data!.bars[s]?.length)) : [];

  // Strategies see only their own universe (the benchmark is not an extra holding).
  const runPanel = (): Panel | null => (panel ? { dates: panel.dates, close: Object.fromEntries(syms.filter((s) => panel.close[s]).map((s) => [s, panel.close[s]!])) } : null);
  const opts = { costBps: cost, slippageBps: slip, initial: 10_000 };

  async function go() {
    const p = runPanel();
    if (!p) return;
    setBusy('Running');
    const r = await work({ kind: 'run', panel: p, id, params: effParams, opts });
    // Benchmark curve over the same dates.
    if (r.result && panel?.close[bench]) {
      const start = p.dates.indexOf(r.result.dates[0]!);
      const b = panel.close[bench]!;
      r.result.benchmark = b.slice(start).map((v) => (v / b[start]!) * opts.initial);
    }
    setOut(r);
    setBusy('');
  }

  async function optimize() {
    const p = runPanel();
    if (!p || strat.params.length < 2) return;
    const [qx, qy] = strat.params as [typeof strat.params[0], typeof strat.params[0]];
    setBusy('Optimizing');
    const xs = paramGrid(qx, 6);
    const ys = paramGrid(qy, 6);
    const r = await work({ kind: 'optimize', panel: p, id, params: effParams, opts, kx: qx.key, ky: qy.key, xs, ys });
    setOut((o) => ({ ...o, grid: r.grid, gx: xs, gy: ys }));
    setBusy('');
  }

  async function walk() {
    const p = runPanel();
    const q = strat.params[0];
    if (!p || !q) return;
    setBusy('Walk-forward');
    const values = paramGrid(q, 5);
    const r = await work({ kind: 'walk', panel: p, id, params: effParams, opts, key: q.key, values });
    setOut((o) => ({ ...o, walk: r.walk }));
    setBusy('');
  }

  useEffect(() => {
    const r = out?.result;
    if (!box.current || !r) return;
    const c = themeColors();
    const chart = makeChart(box.current, { rightPriceScale: { mode: 1, borderColor: c.grid } });
    const t = r.dates.map((d) => Date.parse(d));
    chart.addSeries(LineSeries, { color: c.accent, lineWidth: 2, title: strat.name, priceLineVisible: false }).setData(line(t, r.equity));
    if (r.benchmark) chart.addSeries(LineSeries, { color: c.dim, lineWidth: 1, title: bench, priceLineVisible: false }).setData(line(t, r.benchmark));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [out?.result, strat.name, bench]);

  const r = out?.result;
  const bm = r?.benchmark ? (() => {
    const b = r.benchmark!;
    const rets = b.slice(1).map((v, i) => v / b[i]! - 1);
    const n = rets.length;
    const m = rets.reduce((s, x) => s + x, 0) / n;
    const sd = Math.sqrt(rets.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1));
    let peak = b[0]!;
    let dd = 0;
    for (const v of b) {
      peak = Math.max(peak, v);
      dd = Math.min(dd, v / peak - 1);
    }
    return { cagr: Math.pow(b.at(-1)! / b[0]!, 252 / n) - 1, vol: sd * Math.sqrt(252), sharpe: (m / sd) * Math.sqrt(252), maxDd: dd };
  })() : null;

  function save() {
    if (!r) return;
    const key = `bt${Date.now().toString(36)}`;
    void sync.put('strategies', key, {
      name: `${strat.name} (${syms.length > 3 ? `${syms.length} symbols` : syms.join('/')})`,
      strategy: id, params: effParams, universe: syms, years, costBps: cost, slippageBps: slip,
      from: r.dates[0], to: r.dates.at(-1), metrics: r.metrics, shuffle: out?.shuffle ?? null, savedAt: Date.now(), feed: data.data?.feed,
    });
  }

  return (
    <div className="bt">
      <div className="toolbar">
        <select value={id} onChange={(e) => { setId(e.target.value); setParams({}); setUniverse(''); setOut(null); }} aria-label="Strategy">
          {['Trend', 'Momentum', 'Mean reversion', 'Allocation', 'Relative value', 'Benchmark'].map((f) => (
            <optgroup key={f} label={f}>{STRATEGIES.filter((s) => s.family === f).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
          ))}
        </select>
        {[5, 10, 15, 20].map((y) => <button key={y} aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}
        <label className="toggle">Cost bps <input type="number" value={cost} min={0} max={50} onChange={(e) => setCost(Number(e.target.value))} style={{ width: 50 }} /></label>
        <label className="toggle">Slip bps <input type="number" value={slip} min={0} max={50} onChange={(e) => setSlip(Number(e.target.value))} style={{ width: 50 }} /></label>
        <label className="toggle">Bench <input value={bench} onChange={(e) => setBench(e.target.value.toUpperCase())} style={{ width: 60 }} /></label>
      </div>
      <p className="muted" style={{ margin: '2px 0' }}><span className="accent">{strat.family.toUpperCase()}:</span> {strat.description} Rebalance: {strat.rebalance === 'M' ? 'monthly' : strat.rebalance === 'W' ? 'weekly' : 'daily'}.</p>
      <div className="toolbar">
        {strat.params.map((q) => (
          <label key={q.key} className="toggle">
            {q.label}
            <input type="number" value={effParams[q.key]} min={q.min} max={q.max} step={q.step} onChange={(e) => setParams((p) => ({ ...p, [q.key]: Number(e.target.value) }))} style={{ width: 60 }} />
          </label>
        ))}
      </div>
      <div className="toolbar">
        <input value={universe || strat.universe.join(' ')} onChange={(e) => setUniverse(e.target.value)} aria-label="Universe" style={{ flex: 1, minWidth: 200 }} />
        <button className="cmd__go" disabled={!panel || !!busy} onClick={() => void go()}>{busy || 'RUN'}</button>
        <button disabled={!panel || !!busy || strat.params.length < 2} onClick={() => void optimize()}>HEATMAP</button>
        <button disabled={!panel || !!busy || !strat.params.length} onClick={() => void walk()}>WALK-FORWARD</button>
        <button disabled={!r} onClick={save}>SAVE TO LEADERBOARD</button>
      </div>
      <DataStatus state={data} keyName="Alpaca" />
      {missing.length > 0 && <p className="down">No data for: {missing.join(', ')}. Dates are limited to days where every symbol traded.</p>}
      {panel && <p className="muted">{panel.dates[0]} to {panel.dates.at(-1)} · {panel.dates.length} trading days · {data.data?.feed}</p>}
      {out?.error && <p className="down">{out.error}</p>}
      {r && (
        <>
          <table className="grid-table">
            <thead><tr><th /><th className="num">CAGR</th><th className="num">Vol</th><th className="num">Sharpe</th><th className="num">Sortino</th><th className="num">Max DD</th><th className="num">Calmar</th><th className="num">Exposure</th><th className="num">Turnover/yr</th></tr></thead>
            <tbody>
              <tr><td className="accent">{strat.name}</td><td className="num">{pct(r.metrics.cagr)}</td><td className="num">{pct(r.metrics.vol)}</td><td className="num">{fmt(r.metrics.sharpe)}</td><td className="num">{fmt(r.metrics.sortino)}</td><td className="num down">{pct(r.metrics.maxDd)}</td><td className="num">{fmt(r.metrics.calmar)}</td><td className="num">{pct(r.metrics.exposure)}</td><td className="num">{fmt(r.turnover, 1)}x</td></tr>
              {bm && <tr className="muted"><td>{bench} buy and hold</td><td className="num">{pct(bm.cagr)}</td><td className="num">{pct(bm.vol)}</td><td className="num">{fmt(bm.sharpe)}</td><td className="num">-</td><td className="num">{pct(bm.maxDd)}</td><td className="num">-</td><td className="num">100%</td><td className="num">0x</td></tr>}
            </tbody>
          </table>
          <p>
            Shuffle test: the strategy beat <span className={out?.shuffle != null && out.shuffle > 0.95 ? 'up' : 'accent'}>{out?.shuffle != null ? `${Math.round(out.shuffle * 100)}%` : '-'}</span> of 400 random-timing versions with the same volatility.
            {out?.shuffle != null && out.shuffle < 0.9 && <span className="down"> Below 90%: results could easily be luck.</span>} Final weights: {Object.entries(r.lastWeights).filter(([, w]) => Math.abs(w) > 0.001).map(([k, w]) => `${k} ${(w * 100).toFixed(0)}%`).join(', ') || 'cash'}.
          </p>
        </>
      )}
      <div ref={box} className="chart-box" style={{ height: 260, minHeight: 200 }} />
      {out?.grid && strat.params.length >= 2 && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>SHARPE BY PARAMETERS (look for broad plateaus, not single peaks)</h4>
          <table className="grid-table heat">
            <thead><tr><th>{strat.params[1]!.label} \ {strat.params[0]!.label}</th>{out.gx?.map((x) => <th key={x} className="num">{x}</th>)}</tr></thead>
            <tbody>
              {out.grid.map((row, yi) => (
                <tr key={yi}>
                  <td>{out.gy?.[yi]}</td>
                  {row.map((v, xi) => <td key={xi} className="cell" style={{ background: heatColor(Math.max(-1, Math.min(1, v / 1.5))) }}>{fmt(v)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      {out?.walk && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>WALK-FORWARD ({strat.params[0]!.label} re-picked on past data each fold)</h4>
          <table className="grid-table">
            <thead><tr><th>Out-of-sample</th><th className="num">Picked</th><th className="num">In-sample Sharpe</th><th className="num">Out-of-sample Sharpe</th><th className="num">OOS return</th></tr></thead>
            <tbody>{out.walk.map((w) => <tr key={w.from}><td>{w.from} to {w.to}</td><td className="num">{w.best}</td><td className="num">{fmt(w.inSharpe)}</td><td className={`num ${w.outSharpe < w.inSharpe * 0.5 ? 'down' : 'up'}`}>{fmt(w.outSharpe)}</td><td className="num">{pct(w.outReturn)}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <div className="disclaimer">
        Hypothetical backtest. Model estimate. Not financial advice. Past results do not predict future returns. Survivorship bias: stock universes are today&apos;s large companies, which flatters past results. Costs are a flat estimate per unit of turnover. Short legs (pairs) ignore borrow fees. Daily closes, dividend-adjusted.
      </div>
    </div>
  );
}
