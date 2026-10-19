// GP / GIP: price chart with indicators, drawings, scale modes and replay (catalog items 1 to 22).
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type MouseEventParams,
  type SeriesType,
} from 'lightweight-charts';
import * as I from '../../shared/indicators';
import type { Bar } from '../../shared/market';
import { line, makeChart, PALETTE, themeColors, ts } from '../charts/lw';
import { chartBars, nyDate, prevClose, startFor, type Timeframe } from '../data/adapters/alpaca';
import { dir } from '../lib/format';
import { useData } from '../data/useData';
import { sync, useRecord } from '../state/sync';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

type Range = '1D' | '5D' | '1M' | '3M' | '6M' | '1Y' | '5Y' | 'MAX';
// [timeframe, days to fetch (extra for indicator warm-up), bars to show]
const RANGES: Record<Range, [Timeframe, number, number]> = {
  '1D': ['5Min', 4, 80],
  '5D': ['15Min', 9, 140],
  '1M': ['1Hour', 60, 160],
  '3M': ['1Day', 500, 66],
  '6M': ['1Day', 600, 130],
  '1Y': ['1Day', 760, 252],
  '5Y': ['1Week', 2600, 260],
  MAX: ['1Month', 9500, 400],
};

type Kind = 'candle' | 'ha' | 'line' | 'renko' | 'pnf';
type Overlay = 'vprofile' | 'sma20' | 'sma50' | 'sma200' | 'ema21' | 'bb' | 'vwap' | 'keltner' | 'donchian' | 'ichimoku' | 'supertrend' | 'pivots' | 'fib' | 'sr' | 'patterns' | 'divergence';
type Osc = 'none' | 'rsi' | 'macd' | 'stoch';

const OVERLAYS: [Overlay, string][] = [
  ['sma20', 'SMA 20'], ['sma50', 'SMA 50'], ['sma200', 'SMA 200'], ['ema21', 'EMA 21'], ['bb', 'Bollinger'], ['vwap', 'VWAP'],
  ['keltner', 'Keltner'], ['donchian', 'Donchian'], ['ichimoku', 'Ichimoku'], ['supertrend', 'Supertrend'], ['pivots', 'Pivots'],
  ['fib', 'Auto Fib'], ['sr', 'S/R zones'], ['patterns', 'Candle patterns'], ['divergence', 'RSI divergence'], ['vprofile', 'Volume profile'],
];

interface Point { t: number; p: number }
interface Drawing { kind: 'trend' | 'hline' | 'fib'; a: Point; b?: Point }
const px2 = (p: number) => (p >= 100 ? p.toFixed(1) : p.toFixed(2));
const drawLabel = (d: Drawing) => (d.kind === 'hline' ? `H ${px2(d.a.p)}` : `${d.kind === 'fib' ? 'FIB' : 'TREND'} ${px2(d.a.p)}→${d.b ? px2(d.b.p) : '?'}`);

export default function ChartPanel({ security, code }: PanelProps) {
  const sym = security ?? 'SPY';
  const [range, setRange] = useState<Range>(code === 'GIP' ? '1D' : '1Y');
  const [kind, setKind] = useState<Kind>('candle');
  const [profile, setProfile] = useState<{ y: number; h: number; w: number; poc: boolean }[]>([]);
  const [scale, setScale] = useState<PriceScaleMode>(PriceScaleMode.Normal);
  const [overlays, setOverlays] = useState<Set<Overlay>>(new Set(['sma50', 'sma200']));
  const [osc, setOsc] = useState<Osc>('rsi');
  const [tool, setTool] = useState<Drawing['kind'] | null>(null);
  const [replay, setReplay] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  // Phones get the range buttons up front and everything else behind TOOLS.
  const [tools, setTools] = useState(() => window.innerWidth >= 768);
  const [pending, setPending] = useState<Point | null>(null);

  const [tf, days, baseShow] = RANGES[range];
  const state = useData(`gp:${sym}:${range}`, async () => {
    const r = await chartBars(sym, tf, startFor(days));
    return { ...r, data: { bars: r.data, feed: r.feed } };
  }, {
    everyMs: tf.endsWith('Min') ? 30_000 : tf === '1Hour' ? 120_000 : 600_000,
    source: 'Alpaca',
    note: 'SIP history, IEX last 15 min',
  });
  const all = useMemo(() => state.data?.bars ?? [], [state.data]);
  // 1D and 5D show whole New York sessions (latest 1 or 5 trading days), not a fixed bar count that can
  // start in yesterday's afternoon. Earlier bars stay loaded for indicator warm-up.
  const show = useMemo(() => {
    const sessions = range === '1D' ? 1 : range === '5D' ? 5 : 0;
    if (!sessions || !all.length) return baseShow;
    const days = [...new Set(all.map((b) => nyDate(b.t)))].slice(-sessions);
    return all.filter((b) => nyDate(b.t) >= days[0]!).length;
  }, [all, range, baseShow]);
  // Day change = last price vs the official previous close (all exchanges), whatever the chart range.
  const lastT = all.at(-1)?.t ?? null;
  const pc = useData(lastT ? `gp:pc:${sym}:${nyDate(lastT)}` : null, async () => {
    const v = await prevClose(sym, lastT!);
    return { data: v, fetchedAt: Date.now(), fromCache: false };
  }, {});
  // Replay shows bars only up to the cursor, and indicators see only that history (no look-ahead).
  const data = useMemo(() => (replay == null ? all : all.slice(0, replay + 1)), [all, replay]);

  const saved = useRecord<{ items: Drawing[] }>('drawings', sym)?.items;
  const drawings = useMemo(() => saved ?? [], [saved]);
  const saveDrawings = (items: Drawing[]) => (items.length ? void sync.put('drawings', sym, { items: items.slice(-100) }) : void sync.remove('drawings', sym));

  const box = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<SeriesType> | null>(null);

  // Replay playback.
  useEffect(() => {
    if (!playing || replay == null) return;
    const id = setInterval(() => setReplay((r) => (r == null || r >= all.length - 1 ? (setPlaying(false), r) : r + 1)), 350);
    return () => clearInterval(id);
  }, [playing, replay, all.length]);

  // Build the whole chart from scratch when inputs change. Simple and leak-free; data sizes are small.
  useEffect(() => {
    const el = box.current;
    if (!el || data.length === 0 || kind === 'pnf') return;
    const c = themeColors();
    const chart = makeChart(el, { rightPriceScale: { mode: scale, borderColor: c.grid } });
    chartRef.current = chart;
    const times = data.map((b) => b.t);
    const close = data.map((b) => b.c);

    // ----- Main series -----
    let main: ISeriesApi<SeriesType>;
    const candleOpts = { upColor: c.up, downColor: c.down, wickUpColor: c.up, wickDownColor: c.down, borderVisible: false };
    if (kind === 'line') {
      main = chart.addSeries(LineSeries, { color: c.text, lineWidth: 2 });
      main.setData(data.map((b) => ({ time: ts(b.t), value: b.c })));
    } else if (kind === 'renko') {
      const atr = I.atr(data, 14).filter(Number.isFinite).at(-1) ?? 1;
      const boxSize = Number(atr.toPrecision(2));
      const bricks = I.renko(data, boxSize);
      main = chart.addSeries(CandlestickSeries, candleOpts);
      // Bricks can share a timestamp; space them one second apart so the time axis stays strictly increasing.
      let lastT = 0;
      main.setData(
        bricks.map((b) => {
          const t = Math.max(ts(b.t), lastT + 1);
          lastT = t;
          return { time: t as never, open: b.open, close: b.close, high: Math.max(b.open, b.close), low: Math.min(b.open, b.close) };
        }),
      );
    } else {
      const src = kind === 'ha' ? I.heikinAshi(data) : data;
      main = chart.addSeries(CandlestickSeries, candleOpts);
      main.setData(src.map((b) => ({ time: ts(b.t), open: b.o, high: b.h, low: b.l, close: b.c })));
    }
    mainRef.current = main;

    // ----- Volume (IEX only) -----
    if (kind !== 'renko') {
      const vol = chart.addSeries(HistogramSeries, { priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
      chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
      vol.setData(data.map((b, i) => ({ time: ts(b.t), value: b.v, color: (i && b.c < data[i - 1]!.c ? c.down : c.up) + '55' })));
    }

    // ----- Overlays -----
    let color = 0;
    const addLine = (values: number[], title: string, opts: { color?: string; style?: LineStyle; pane?: number } = {}) => {
      const s = chart.addSeries(LineSeries, { color: opts.color ?? PALETTE[color++ % PALETTE.length], lineWidth: 1, lineStyle: opts.style ?? LineStyle.Solid, title, priceLineVisible: false, lastValueVisible: false }, opts.pane ?? 0);
      s.setData(line(times, values));
      return s;
    };
    const on = (o: Overlay) => overlays.has(o) && kind !== 'renko';
    if (on('sma20')) addLine(I.sma(close, 20), 'SMA20');
    if (on('sma50')) addLine(I.sma(close, 50), 'SMA50');
    if (on('sma200')) addLine(I.sma(close, 200), 'SMA200');
    if (on('ema21')) addLine(I.ema(close, 21), 'EMA21');
    if (on('bb')) {
      const b = I.bollinger(close);
      addLine(b.upper, 'BB+', { color: c.dim, style: LineStyle.Dotted });
      addLine(b.mid, 'BB', { color: c.dim });
      addLine(b.lower, 'BB-', { color: c.dim, style: LineStyle.Dotted });
    }
    if (on('vwap')) addLine(tf.endsWith('Min') || tf === '1Hour' ? I.vwap(data, (t) => new Date(t - 4 * 3600_000).toISOString().slice(0, 10)) : I.anchoredVwap(data, Math.max(0, data.length - show)), tf.endsWith('Min') ? 'VWAP' : 'AVWAP');
    if (on('keltner')) {
      const k = I.keltner(data);
      addLine(k.upper, 'KC+', { style: LineStyle.Dashed });
      addLine(k.lower, 'KC-', { style: LineStyle.Dashed });
    }
    if (on('donchian')) {
      const d = I.donchian(data);
      addLine(d.upper, 'DC+', { style: LineStyle.Dashed });
      addLine(d.lower, 'DC-', { style: LineStyle.Dashed });
    }
    if (on('ichimoku')) {
      const ich = I.ichimoku(data);
      addLine(ich.tenkan, 'Tenkan', { color: '#4aa3ff' });
      addLine(ich.kijun, 'Kijun', { color: '#ff6ec7' });
      // Spans are plotted `displacement` bars ahead; we shift values onto existing timestamps only.
      const shift = (v: number[]) => v.map((_, i) => v[i - ich.displacement] ?? NaN);
      addLine(shift(ich.spanA), 'SpanA', { color: c.up, style: LineStyle.Dotted });
      addLine(shift(ich.spanB), 'SpanB', { color: c.down, style: LineStyle.Dotted });
    }
    if (on('supertrend')) {
      const st = I.supertrend(data);
      addLine(st.line.map((v, i) => (st.direction[i] === 1 ? v : NaN)), 'ST up', { color: c.up });
      addLine(st.line.map((v, i) => (st.direction[i] === -1 ? v : NaN)), 'ST dn', { color: c.down });
    }
    if (on('pivots') && data.length > 1) {
      const prev = data[data.length - 2]!;
      const p = I.pivotPoints(prev);
      for (const [k, v] of Object.entries(p)) main.createPriceLine({ price: v, color: k === 'p' ? c.accent : c.dim, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: k.toUpperCase() });
    }
    if (on('fib')) {
      const f = I.autoFib(data, show);
      f?.levels.forEach((l) => main.createPriceLine({ price: l.price, color: c.link, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `${(l.ratio * 100).toFixed(1)}%` }));
    }
    if (on('sr')) {
      for (const z of I.srZones(data.slice(-show * 2)).slice(-8)) {
        main.createPriceLine({ price: (z.low + z.high) / 2, color: c.accent, lineWidth: 2, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: `S/R x${z.touches}` });
      }
    }
    const markers: { time: ReturnType<typeof ts>; position: 'aboveBar' | 'belowBar'; color: string; shape: 'arrowUp' | 'arrowDown' | 'circle'; text: string }[] = [];
    // Short codes keep clustered markers readable: H hammer, SS shooting star, BE/SE engulfing, MS/ES stars.
    const CODE: Record<string, string> = { hammer: 'H', shooting_star: 'SS', bullish_engulfing: 'BE', bearish_engulfing: 'SE', morning_star: 'MS', evening_star: 'ES' };
    if (on('patterns')) {
      for (const p of I.candlePatterns(data).filter((x) => x.pattern !== 'doji').slice(-20)) {
        const bull = p.pattern === 'hammer' || p.pattern.startsWith('bullish') || p.pattern === 'morning_star';
        markers.push({ time: ts(data[p.index]!.t), position: bull ? 'belowBar' : 'aboveBar', color: bull ? c.up : c.down, shape: bull ? 'arrowUp' : 'arrowDown', text: CODE[p.pattern] ?? '' });
      }
    }
    if (on('divergence')) {
      for (const d of I.rsiDivergence(data).slice(-10)) {
        markers.push({ time: ts(data[d.to]!.t), position: d.kind === 'bullish' ? 'belowBar' : 'aboveBar', color: d.kind === 'bullish' ? c.up : c.down, shape: 'circle', text: d.kind === 'bullish' ? 'DIV+' : 'DIV-' });
      }
    }
    if (markers.length) createSeriesMarkers(main, markers.sort((a, b) => a.time - b.time));

    // ----- Oscillator pane -----
    if (osc === 'rsi') {
      const r = addLine(I.rsi(close), 'RSI 14', { color: c.text, pane: 1 });
      r.createPriceLine({ price: 70, color: c.down, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
      r.createPriceLine({ price: 30, color: c.up, lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: false, title: '' });
    } else if (osc === 'macd') {
      const m = I.macd(close);
      const h = chart.addSeries(HistogramSeries, { priceLineVisible: false, lastValueVisible: false }, 1);
      h.setData(line(times, m.hist).map((p) => ({ ...p, color: p.value >= 0 ? c.up + '99' : c.down + '99' })));
      addLine(m.macd, 'MACD', { color: c.link, pane: 1 });
      addLine(m.signal, 'Signal', { color: c.accent, pane: 1 });
    } else if (osc === 'stoch') {
      const s = I.stochastic(data);
      addLine(s.k, '%K', { color: c.link, pane: 1 });
      addLine(s.d, '%D', { color: c.accent, pane: 1 });
    }
    if (osc !== 'none') chart.panes()[1]?.setHeight(Math.round(el.clientHeight * 0.25));

    // ----- Saved drawings (item 21) -----
    for (const d of drawings) {
      if (d.kind === 'hline') main.createPriceLine({ price: d.a.p, color: c.link, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: 'H' });
      else if (d.kind === 'trend' && d.b) {
        const s = chart.addSeries(LineSeries, { color: c.link, lineWidth: 2, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
        const [p, q] = d.a.t <= d.b.t ? [d.a, d.b] : [d.b, d.a];
        if (p.t !== q.t) s.setData([{ time: ts(p.t), value: p.p }, { time: ts(q.t), value: q.p }]);
      } else if (d.kind === 'fib' && d.b) {
        const hi = Math.max(d.a.p, d.b.p);
        const lo = Math.min(d.a.p, d.b.p);
        for (const l of I.fibLevels(hi, lo, d.b.p > d.a.p)) main.createPriceLine({ price: l.price, color: c.accent, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: `F${(l.ratio * 100).toFixed(1)}` });
      }
    }

    const n = kind === 'renko' ? 200 : show;
    const len = kind === 'renko' ? Infinity : data.length;
    if (len > n) chart.timeScale().setVisibleLogicalRange({ from: len - n, to: len + 2 });
    else chart.timeScale().fitContent();

    // ----- Volume profile (item 4): volume by price for the visible bars, drawn beside the price axis -----
    let raf = 0;
    const drawProfile = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = chart.timeScale().getVisibleLogicalRange();
        if (!r) return;
        const vis = data.slice(Math.max(0, Math.floor(r.from)), Math.min(data.length, Math.ceil(r.to) + 1));
        if (vis.length < 2) return;
        const vp = I.volumeProfile(vis, 28);
        const max = Math.max(...vp.bins.map((b) => b.volume)) || 1;
        const rows = vp.bins.map((b, i) => {
          const y1 = main.priceToCoordinate(b.to);
          const y2 = main.priceToCoordinate(b.from);
          return y1 == null || y2 == null ? null : { y: Math.min(y1, y2), h: Math.max(1, Math.abs(y2 - y1) - 1), w: b.volume / max, poc: i === vp.pocIndex };
        }).filter((x): x is { y: number; h: number; w: number; poc: boolean } => x != null);
        setProfile(rows);
      });
    };
    if (overlays.has('vprofile') && kind !== 'renko') {
      chart.timeScale().subscribeVisibleLogicalRangeChange(drawProfile);
      drawProfile();
    }

    return () => {
      cancelAnimationFrame(raf);
      chart.timeScale().unsubscribeVisibleLogicalRangeChange(drawProfile);
      chart.remove();
      chartRef.current = null;
      mainRef.current = null;
    };
  }, [data, kind, scale, overlays, osc, drawings, tf, show]);

  // Drawing clicks: two clicks for trend and fib, one for a horizontal line.
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!chart || !main || !tool) return;
    const onClick = (p: MouseEventParams) => {
      if (!p.point || p.time == null) return;
      const price = main.coordinateToPrice(p.point.y);
      if (price == null) return;
      const pt: Point = { t: Number(p.time) * 1000, p: price };
      if (tool === 'hline') {
        saveDrawings([...drawings, { kind: 'hline', a: pt }]);
        setTool(null);
      } else if (!pending) setPending(pt);
      else {
        saveDrawings([...drawings, { kind: tool, a: pending, b: pt }]);
        setPending(null);
        setTool(null);
      }
    };
    chart.subscribeClick(onClick);
    return () => chart.unsubscribeClick(onClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, pending, drawings, data, kind, scale, overlays, osc]);

  const toggle = (o: Overlay) => setOverlays((s) => {
    const n = new Set(s);
    if (n.has(o)) n.delete(o);
    else n.add(o);
    return n;
  });

  const last = data.at(-1);
  return (
    <div className="panel-fill">
      <div className="toolbar">
        <strong className="accent">{sym}</strong>
        {last && replay == null && (() => {
          const base = pc.data ?? null;
          const chg = base ? last.c - base : null;
          return (
            <span className={dir(chg)} title={base ? `vs previous close ${base.toFixed(2)} (all exchanges)` : 'previous close loading'}>
              {last.c.toFixed(2)} {chg != null && base ? `${chg >= 0 ? '+' : ''}${chg.toFixed(2)} (${chg >= 0 ? '+' : ''}${((chg / base) * 100).toFixed(2)}%)` : ''}
            </span>
          );
        })()}
        {last && replay != null && <span className="muted">{last.c.toFixed(2)} (replay)</span>}
        {state.data && <span className="muted" title="SIP = every US exchange (free for data over 15 minutes old). IEX = one exchange.">{state.data.feed}</span>}
        {(Object.keys(RANGES) as Range[]).map((r) => (
          <button key={r} aria-pressed={range === r} onClick={() => { setRange(r); setReplay(null); }}>{r}</button>
        ))}
        <button aria-expanded={tools} onClick={() => setTools((v) => !v)}>TOOLS</button>
      </div>
      {tools && (
      <div className="toolbar">
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} aria-label="Chart type">
          <option value="candle">Candles</option>
          <option value="ha">Heikin Ashi</option>
          <option value="line">Line</option>
          <option value="renko">Renko (ATR box)</option>
          <option value="pnf">Point and figure</option>
        </select>
        <select value={scale} onChange={(e) => setScale(Number(e.target.value) as PriceScaleMode)} aria-label="Price scale">
          <option value={PriceScaleMode.Normal}>Linear</option>
          <option value={PriceScaleMode.Logarithmic}>Log</option>
          <option value={PriceScaleMode.Percentage}>Percent</option>
        </select>
        <select value={osc} onChange={(e) => setOsc(e.target.value as Osc)} aria-label="Lower pane">
          <option value="none">No oscillator</option>
          <option value="rsi">RSI 14</option>
          <option value="macd">MACD</option>
          <option value="stoch">Stochastic</option>
        </select>
        <button aria-expanded={showMenu} onClick={() => setShowMenu((v) => !v)}>STUDIES ({overlays.size})</button>
        <button aria-pressed={tool === 'trend'} onClick={() => { setPending(null); setTool(tool === 'trend' ? null : 'trend'); }} title="Trend line: click two points">TREND</button>
        <button aria-pressed={tool === 'hline'} onClick={() => setTool(tool === 'hline' ? null : 'hline')} title="Horizontal line: click once">HLINE</button>
        <button aria-pressed={tool === 'fib'} onClick={() => { setPending(null); setTool(tool === 'fib' ? null : 'fib'); }} title="Fibonacci: click swing start then end">FIB</button>
        <button aria-pressed={replay != null} onClick={() => { setPlaying(false); setReplay(replay == null ? Math.max(0, all.length - show) : null); }}>REPLAY</button>
      </div>
      )}
      {(drawings.length > 0 || overlays.has('fib') || pending) && (
        <div className="toolbar" aria-label="Drawings">
          <span className="muted">DRAWINGS</span>
          {pending && <button onClick={() => { setPending(null); setTool(null); }} title="Cancel the drawing in progress">CANCEL {tool?.toUpperCase()} ×</button>}
          {drawings.map((d, i) => (
            <button key={i} onClick={() => saveDrawings(drawings.filter((_, j) => j !== i))} title="Remove this drawing" aria-label={`Remove ${drawLabel(d)}`}>
              {drawLabel(d)} ×
            </button>
          ))}
          {overlays.has('fib') && <button onClick={() => toggle('fib')} title="Turn off the Auto Fib study">AUTO FIB ×</button>}
          {drawings.length > 0 && <button onClick={() => saveDrawings(drawings.slice(0, -1))} title="Remove the last drawing">UNDO</button>}
          {drawings.length > 1 && <button onClick={() => window.confirm(`Clear all ${drawings.length} drawings on ${sym}?`) && saveDrawings([])}>CLEAR ALL</button>}
        </div>
      )}
      {showMenu && (
        <div className="toolbar">
          {OVERLAYS.map(([o, label]) => (
            <button key={o} aria-pressed={overlays.has(o)} onClick={() => toggle(o)}>{label}</button>
          ))}
        </div>
      )}
      {replay != null && (
        <div className="toolbar">
          <button onClick={() => setReplay((r) => Math.max(0, (r ?? 0) - 1))} aria-label="Step back">◀</button>
          <button onClick={() => setPlaying((p) => !p)}>{playing ? 'PAUSE' : 'PLAY'}</button>
          <button onClick={() => setReplay((r) => Math.min(all.length - 1, (r ?? 0) + 1))} aria-label="Step forward">▶</button>
          <input type="range" min={0} max={Math.max(0, all.length - 1)} value={replay} onChange={(e) => setReplay(Number(e.target.value))} aria-label="Replay position" style={{ flex: 1, minWidth: 120 }} />
          <span className="muted">{data.at(-1) ? new Date(data.at(-1)!.t).toISOString().slice(0, 10) : ''}</span>
        </div>
      )}
      {tool && <div className="accent" style={{ fontSize: 11 }}>{tool === 'hline' ? 'Click a price level.' : pending ? 'Click the second point.' : 'Click the first point.'}</div>}
      <DataStatus state={state} keyName="Alpaca" empty={state.data?.bars.length === 0} />
      {kind === 'pnf' ? <PointFigure bars={data} /> : (
        <div className="grow" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
          <div ref={box} className="chart-box grow" />
          {overlays.has('vprofile') && kind !== 'renko' && (
            <svg className="vprofile" style={{ position: 'absolute', top: 0, right: 64, width: 120, height: '100%', pointerEvents: 'none' }} aria-label="Volume profile for the visible bars">
              {profile.map((r, i) => <rect key={i} x={120 - r.w * 120} y={r.y} width={r.w * 120} height={r.h} fill={r.poc ? 'var(--accent)' : 'var(--link)'} opacity={r.poc ? 0.55 : 0.28} />)}
            </svg>
          )}
        </div>
      )}
      <div className="disclaimer">
        IEX single-venue bars: volume and volume-based studies are approximate. Adjusted for splits and dividends.
        {overlays.has('patterns') && ' Patterns: H hammer, SS shooting star, BE bullish engulfing, SE bearish engulfing, MS morning star, ES evening star.'}
        {overlays.has('divergence') && ' DIV+/DIV- = bullish/bearish RSI divergence.'}
        {overlays.has('vprofile') && ' Volume profile: volume traded at each price over the visible bars; the brightest bar is the point of control.'}
        {kind === 'pnf' && ' Point and figure: X columns rise, O columns fall; box = ATR(14), 3-box reversal, on closes.'}
      </div>
    </div>
  );
}

/** Point and figure chart (item 3) as an SVG grid: box size from ATR(14), 3-box reversal, on closes. */
function PointFigure({ bars }: { bars: Bar[] }) {
  const res = useMemo(() => {
    if (bars.length < 20) return null;
    const atr = I.atr(bars, 14).filter(Number.isFinite).at(-1) ?? 1;
    const box = Number(atr.toPrecision(2));
    const cols = I.pointAndFigure(bars, box, 3).slice(-60);
    if (!cols.length) return null;
    const lo = Math.min(...cols.map((c) => c.from));
    const hi = Math.max(...cols.map((c) => c.to));
    return { box, cols, lo, hi };
  }, [bars]);
  if (!res) return <p className="muted">Not enough data for point and figure.</p>;
  const cell = Math.max(8, Math.min(16, Math.floor(420 / (res.hi - res.lo + 1))));
  const w = res.cols.length * cell + 60;
  const h = (res.hi - res.lo + 1) * cell + 8;
  return (
    <div className="grow" style={{ overflow: 'auto' }}>
      <svg width={w} height={h} role="img" aria-label="Point and figure chart">
        {Array.from({ length: res.hi - res.lo + 1 }, (_, k) => res.hi - k).filter((b) => b % 5 === 0).map((b) => <text key={b} x={w - 56} y={(res.hi - b) * cell + cell * 0.8 + 4} fill="var(--text-dim)" fontSize={9}>{(b * res.box).toFixed(2)}</text>)}
        {res.cols.map((c, i) => Array.from({ length: c.to - c.from + 1 }, (_, k) => c.from + k).map((b) => (
          <text key={`${i}-${b}`} x={i * cell + cell / 2} y={(res.hi - b) * cell + cell * 0.8 + 4} fill={c.kind === 'X' ? 'var(--up)' : 'var(--down)'} fontSize={cell - 2} textAnchor="middle">{c.kind}</text>
        )))}
      </svg>
    </div>
  );
}

export type { Bar };
