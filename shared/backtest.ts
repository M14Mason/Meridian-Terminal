// Backtest engine and hedge fund strategy library (catalog 36 to 49, owner additions).
// Pure functions: runs in a Web Worker. Backtests only, no trading of any kind (section 20).
// No look-ahead: weights decided on bar i's close are applied to bar i+1's return.

import { rsi, sma, stdev } from './indicators';

export interface Panel {
  dates: string[]; // YYYY-MM-DD, common to every symbol
  close: Record<string, number[]>; // aligned to dates
}

export type Weights = Record<string, number>; // fractions of equity; sum <= 1 (cash is the rest)

export interface Ctx {
  i: number; // current bar index (decision at this close)
  p: Panel;
  params: Record<string, number>;
  symbols: string[];
}

export interface Strategy {
  id: string;
  name: string;
  family: 'Trend' | 'Mean reversion' | 'Momentum' | 'Allocation' | 'Relative value' | 'Benchmark';
  description: string; // the rule card, in plain English
  universe: string[]; // default symbols
  params: { key: string; label: string; default: number; min: number; max: number; step: number }[];
  rebalance: 'D' | 'W' | 'M';
  warmup: (params: Record<string, number>) => number;
  /** Stateless rule, or `factory` for rules that remember a position (fresh state every run). */
  weights?: (ctx: Ctx) => Weights;
  factory?: () => (ctx: Ctx) => Weights;
}

export interface Opts {
  costBps: number; // commission and fees per unit turnover
  slippageBps: number; // price impact per unit turnover
  initial: number;
}

export interface Result {
  dates: string[];
  equity: number[];
  benchmark: number[] | null;
  trades: number;
  turnover: number; // average annual, in multiples of equity
  metrics: Metrics;
  lastWeights: Weights;
}

export interface Metrics {
  cagr: number;
  vol: number;
  sharpe: number;
  sortino: number;
  maxDd: number;
  calmar: number;
  winRate: number; // share of positive days
  exposure: number; // average gross exposure
  years: number;
}

const isRebalance = (dates: string[], i: number, freq: Strategy['rebalance']) => {
  if (freq === 'D' || i === 0) return true;
  const a = new Date(dates[i - 1]!);
  const b = new Date(dates[i]!);
  if (freq === 'M') return a.getUTCMonth() !== b.getUTCMonth();
  // Weekly: first trading day of a new ISO week.
  return b.getUTCDay() < a.getUTCDay() || (Date.parse(dates[i]!) - Date.parse(dates[i - 1]!)) / 86_400_000 >= 7;
};

export function metrics(equity: number[], exposure: number[] = []): Metrics {
  const rets = equity.slice(1).map((v, i) => v / equity[i]! - 1);
  const n = rets.length || 1;
  const years = n / 252;
  const mean = rets.reduce((s, r) => s + r, 0) / n;
  const sd = Math.sqrt(rets.reduce((s, r) => s + (r - mean) ** 2, 0) / Math.max(1, n - 1));
  const down = Math.sqrt(rets.reduce((s, r) => s + Math.min(0, r) ** 2, 0) / n);
  let peak = equity[0] ?? 1;
  let maxDd = 0;
  for (const v of equity) {
    peak = Math.max(peak, v);
    maxDd = Math.min(maxDd, v / peak - 1);
  }
  const cagr = years > 0 ? Math.pow(equity.at(-1)! / equity[0]!, 1 / years) - 1 : 0;
  return {
    cagr,
    vol: sd * Math.sqrt(252),
    sharpe: sd ? (mean / sd) * Math.sqrt(252) : 0,
    sortino: down ? (mean / down) * Math.sqrt(252) : 0,
    maxDd,
    calmar: maxDd ? cagr / -maxDd : 0,
    winRate: rets.filter((r) => r > 0).length / n,
    exposure: exposure.length ? exposure.reduce((s, x) => s + x, 0) / exposure.length : 1,
    years,
  };
}

export function run(p: Panel, s: Strategy, params: Record<string, number>, opts: Opts, benchmark?: string): Result {
  const syms = Object.keys(p.close);
  const decide = s.factory ? s.factory() : s.weights!;
  const start = Math.min(p.dates.length - 2, Math.max(1, s.warmup(params)));
  let w: Weights = {};
  let equity = opts.initial;
  const eq: number[] = [equity];
  const dates: string[] = [p.dates[start]!];
  const expo: number[] = [];
  let trades = 0;
  let turnSum = 0;
  for (let i = start; i < p.dates.length - 1; i++) {
    if (i === start || isRebalance(p.dates, i, s.rebalance)) {
      const target = decide({ i, p, params, symbols: syms });
      let turn = 0;
      for (const k of new Set([...Object.keys(w), ...Object.keys(target)])) {
        const d = Math.abs((target[k] ?? 0) - (w[k] ?? 0));
        if (d > 1e-9) trades++;
        turn += d;
      }
      equity *= 1 - (turn * (opts.costBps + opts.slippageBps)) / 10_000;
      turnSum += turn;
      w = target;
    }
    let r = 0;
    for (const [k, wt] of Object.entries(w)) {
      const c = p.close[k];
      if (c && c[i]! > 0) r += wt * (c[i + 1]! / c[i]! - 1);
    }
    equity *= 1 + r;
    eq.push(equity);
    dates.push(p.dates[i + 1]!);
    expo.push(Object.values(w).reduce((a, b) => a + Math.abs(b), 0));
  }
  const bc = benchmark ? p.close[benchmark] : undefined;
  const bench = bc ? bc.slice(start).map((v) => (v / bc[start]!) * opts.initial) : null;
  const m = metrics(eq, expo);
  return { dates, equity: eq, benchmark: bench, trades, turnover: m.years ? turnSum / m.years : 0, metrics: m, lastWeights: w };
}

// ---------- Helpers for strategies ----------

const ret = (c: number[], i: number, n0: number) => {
  const n = Math.round(n0);
  return i >= n && c[i - n]! > 0 ? c[i]! / c[i - n]! - 1 : NaN;
};
const vol = (c: number[], i: number, n0: number) => {
  const n = Math.max(2, Math.round(n0));
  if (i < n + 1) return NaN;
  const r: number[] = [];
  for (let k = i - n + 1; k <= i; k++) r.push(c[k]! / c[k - 1]! - 1);
  const m = r.reduce((s, x) => s + x, 0) / n;
  return Math.sqrt(r.reduce((s, x) => s + (x - m) ** 2, 0) / (n - 1)) * Math.sqrt(252);
};
const topN = (scores: [string, number][], n: number) => scores.filter(([, v]) => Number.isFinite(v)).sort((a, b) => b[1] - a[1]).slice(0, n);
const equal = (syms: string[], gross = 1): Weights => Object.fromEntries(syms.map((s) => [s, syms.length ? gross / syms.length : 0]));

// Memoized indicator series per (symbol, kind, n) for speed inside daily loops.
const memo = new WeakMap<Panel, Map<string, number[]>>();
function series(p: Panel, key: string, f: () => number[]) {
  let m = memo.get(p);
  if (!m) memo.set(p, (m = new Map()));
  let v = m.get(key);
  if (!v) m.set(key, (v = f()));
  return v;
}

const ETF_MACRO = ['SPY', 'EFA', 'EEM', 'TLT', 'IEF', 'GLD', 'DBC', 'UUP'];
const SECTORS = ['XLK', 'XLC', 'XLY', 'XLP', 'XLE', 'XLF', 'XLV', 'XLI', 'XLB', 'XLRE', 'XLU'];
const LARGE = ['AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'BRK.B', 'JPM', 'V', 'UNH', 'XOM', 'JNJ', 'PG', 'MA', 'HD', 'COST', 'AVGO', 'LLY', 'MRK', 'PEP', 'KO', 'ABBV', 'WMT', 'BAC', 'CVX', 'ORCL', 'CRM', 'ADBE', 'NFLX'];

export const STRATEGIES: Strategy[] = [
  {
    id: 'buyhold', name: 'Buy and hold', family: 'Benchmark', universe: ['SPY'], rebalance: 'M', params: [], warmup: () => 1,
    description: 'Hold the first symbol 100% the whole time. The baseline every strategy must beat after costs.',
    weights: ({ symbols }) => ({ [symbols[0]!]: 1 }),
  },
  {
    id: 'sixty40', name: '60/40', family: 'Benchmark', universe: ['SPY', 'IEF'], rebalance: 'M', params: [], warmup: () => 1,
    description: '60% stocks (SPY), 40% 7 to 10 year Treasuries (IEF), rebalanced monthly. The classic balanced portfolio.',
    weights: () => ({ SPY: 0.6, IEF: 0.4 }),
  },
  {
    id: 'smacross', name: 'Moving average crossover', family: 'Trend', universe: ['SPY'], rebalance: 'D',
    params: [{ key: 'fast', label: 'Fast SMA', default: 50, min: 5, max: 100, step: 5 }, { key: 'slow', label: 'Slow SMA', default: 200, min: 50, max: 300, step: 10 }],
    warmup: (q) => q.slow!,
    description: 'Hold the asset when the fast moving average is above the slow one, otherwise cash. Classic trend following (the "golden cross").',
    weights: ({ i, p, params, symbols }) => {
      const s = symbols[0]!;
      const f = series(p, `sma:${s}:${params.fast}`, () => sma(p.close[s]!, params.fast!));
      const sl = series(p, `sma:${s}:${params.slow}`, () => sma(p.close[s]!, params.slow!));
      return f[i]! > sl[i]! ? { [s]: 1 } : {};
    },
  },
  {
    id: 'rsirev', name: 'RSI mean reversion', family: 'Mean reversion', universe: ['SPY'], rebalance: 'D',
    params: [{ key: 'n', label: 'RSI length', default: 2, min: 2, max: 14, step: 1 }, { key: 'buy', label: 'Buy below', default: 10, min: 5, max: 40, step: 5 }, { key: 'sell', label: 'Sell above', default: 70, min: 50, max: 90, step: 5 }, { key: 'trend', label: 'Trend filter SMA (0 off)', default: 200, min: 0, max: 300, step: 50 }],
    warmup: (q) => Math.max(q.n! + 1, q.trend!),
    description: 'Buy short-term oversold dips (RSI below threshold) only while price is above its long average; exit when RSI recovers. A Connors-style swing system.',
    factory: () => {
      let holding = false;
      return ({ i, p, params, symbols }: Ctx) => {
        const s = symbols[0]!;
        const r = series(p, `rsi:${s}:${params.n}`, () => rsi(p.close[s]!, params.n!));
        const t = params.trend ? series(p, `sma:${s}:${params.trend}`, () => sma(p.close[s]!, params.trend!)) : null;
        const up = !t || p.close[s]![i]! > t[i]!;
        if (!holding && r[i]! < params.buy! && up) holding = true;
        else if (holding && r[i]! > params.sell!) holding = false;
        return holding ? { [s]: 1 } : {};
      };
    },
  },
  {
    id: 'xsmom', name: 'Cross-sectional momentum (12-1)', family: 'Momentum', universe: LARGE, rebalance: 'M',
    params: [{ key: 'look', label: 'Lookback (days)', default: 252, min: 63, max: 252, step: 21 }, { key: 'skip', label: 'Skip recent (days)', default: 21, min: 0, max: 42, step: 21 }, { key: 'top', label: 'Hold top N', default: 6, min: 2, max: 15, step: 1 }],
    warmup: (q) => q.look! + 1,
    description: 'Each month, rank stocks by return over the past year excluding the most recent month, and hold the top N equally. The academic momentum factor (Jegadeesh and Titman).',
    weights: ({ i, p, params, symbols }) => equal(topN(symbols.map((s) => [s, ret(p.close[s]!, i - params.skip!, params.look! - params.skip!)]), params.top!).map(([s]) => s)),
  },
  {
    id: 'tsmom', name: 'Trend following (CTA style)', family: 'Trend', universe: ETF_MACRO, rebalance: 'M',
    params: [{ key: 'look', label: 'Lookback (days)', default: 252, min: 63, max: 252, step: 21 }, { key: 'tvol', label: 'Target vol per asset %', default: 10, min: 5, max: 20, step: 1 }],
    warmup: (q) => q.look! + 1,
    description: 'Across stocks, bonds, gold, commodities and the dollar, hold each asset only if its past-year return is positive, sized so each contributes similar volatility. A long-only version of managed futures (Moskowitz, Ooi, Pedersen).',
    weights: ({ i, p, params, symbols }) => {
      const out: Weights = {};
      for (const s of symbols) {
        const c = p.close[s]!;
        if (ret(c, i, params.look!) > 0) {
          const v = vol(c, i, 63);
          out[s] = Number.isFinite(v) && v > 0 ? Math.min(1, params.tvol! / 100 / v) / symbols.length : 0;
        }
      }
      const g = Object.values(out).reduce((a, b) => a + b, 0);
      if (g > 1) for (const k of Object.keys(out)) out[k]! /= g;
      return out;
    },
  },
  {
    id: 'dualmom', name: 'Dual momentum', family: 'Momentum', universe: ['SPY', 'EFA', 'AGG', 'BIL'], rebalance: 'M',
    params: [{ key: 'look', label: 'Lookback (days)', default: 252, min: 126, max: 252, step: 21 }],
    warmup: (q) => q.look! + 1,
    description: 'Hold whichever of US or international stocks did better over the past year, but only if it beat T-bills; otherwise hold bonds. Gary Antonacci\'s dual momentum.',
    weights: ({ i, p, params }) => {
      const r = (s: string) => ret(p.close[s]!, i, params.look!);
      const best = r('SPY') >= r('EFA') ? 'SPY' : 'EFA';
      return r(best) > r('BIL') ? { [best]: 1 } : { AGG: 1 };
    },
  },
  {
    id: 'riskparity', name: 'Risk parity (inverse volatility)', family: 'Allocation', universe: ['SPY', 'TLT', 'IEF', 'GLD', 'DBC'], rebalance: 'M',
    params: [{ key: 'vlook', label: 'Vol lookback (days)', default: 63, min: 21, max: 252, step: 21 }],
    warmup: (q) => q.vlook! + 2,
    description: 'Weight each asset by 1 / its recent volatility so each contributes similar risk. A simple version of the idea behind risk parity funds (no leverage here).',
    weights: ({ i, p, params, symbols }) => {
      const inv = symbols.map((s) => [s, 1 / vol(p.close[s]!, i, params.vlook!)] as [string, number]).filter(([, v]) => Number.isFinite(v));
      const tot = inv.reduce((a, [, v]) => a + v, 0);
      return Object.fromEntries(inv.map(([s, v]) => [s, v / tot]));
    },
  },
  {
    id: 'allweather', name: 'All-weather style mix', family: 'Allocation', universe: ['VTI', 'TLT', 'IEF', 'GLD', 'DBC'], rebalance: 'M', params: [], warmup: () => 1,
    description: '30% stocks, 40% long Treasuries, 15% intermediate Treasuries, 7.5% gold, 7.5% commodities. A popular public approximation of an "all weather" portfolio; not any firm\'s actual product.',
    weights: () => ({ VTI: 0.3, TLT: 0.4, IEF: 0.15, GLD: 0.075, DBC: 0.075 }),
  },
  {
    id: 'voltarget', name: 'Volatility targeting', family: 'Allocation', universe: ['SPY'], rebalance: 'W',
    params: [{ key: 'target', label: 'Target vol %', default: 12, min: 5, max: 20, step: 1 }, { key: 'vlook', label: 'Vol lookback (days)', default: 21, min: 10, max: 63, step: 1 }],
    warmup: (q) => q.vlook! + 2,
    description: 'Scale stock exposure up when recent volatility is low and down when it is high, aiming for a steady risk level (max 100%, no leverage).',
    weights: ({ i, p, params, symbols }) => {
      const s = symbols[0]!;
      const v = vol(p.close[s]!, i, params.vlook!);
      return { [s]: Number.isFinite(v) && v > 0 ? Math.min(1, params.target! / 100 / v) : 0 };
    },
  },
  {
    id: 'sectorrot', name: 'Sector rotation', family: 'Momentum', universe: SECTORS, rebalance: 'M',
    params: [{ key: 'look', label: 'Lookback (days)', default: 126, min: 21, max: 252, step: 21 }, { key: 'top', label: 'Hold top N', default: 3, min: 1, max: 6, step: 1 }],
    warmup: (q) => q.look! + 1,
    description: 'Each month hold the N sector funds with the strongest recent performance.',
    weights: ({ i, p, params, symbols }) => equal(topN(symbols.map((s) => [s, ret(p.close[s]!, i, params.look!)]), params.top!).map(([s]) => s)),
  },
  {
    id: 'reversal', name: 'Short-term reversal', family: 'Mean reversion', universe: LARGE, rebalance: 'W',
    params: [{ key: 'look', label: 'Lookback (days)', default: 5, min: 3, max: 21, step: 1 }, { key: 'top', label: 'Hold N biggest losers', default: 6, min: 2, max: 15, step: 1 }],
    warmup: (q) => q.look! + 1,
    description: 'Each week buy last week\'s biggest losers among large caps, betting on a bounce. A known short-horizon effect that is very sensitive to trading costs.',
    weights: ({ i, p, params, symbols }) => equal(topN(symbols.map((s) => [s, -ret(p.close[s]!, i, params.look!)]), params.top!).map(([s]) => s)),
  },
  {
    id: 'lowvol', name: 'Low volatility', family: 'Allocation', universe: LARGE, rebalance: 'M',
    params: [{ key: 'vlook', label: 'Vol lookback (days)', default: 252, min: 63, max: 252, step: 21 }, { key: 'top', label: 'Hold N least volatile', default: 8, min: 3, max: 15, step: 1 }],
    warmup: (q) => q.vlook! + 2,
    description: 'Hold the least volatile large caps. The low-volatility anomaly: calmer stocks have historically delivered similar returns with less risk.',
    weights: ({ i, p, params, symbols }) => equal(topN(symbols.map((s) => [s, -vol(p.close[s]!, i, params.vlook!)]), params.top!).map(([s]) => s)),
  },
  {
    id: 'pairs', name: 'Pairs trade (z-score)', family: 'Relative value', universe: ['KO', 'PEP'], rebalance: 'D',
    params: [{ key: 'look', label: 'Lookback (days)', default: 60, min: 20, max: 120, step: 10 }, { key: 'entry', label: 'Entry z', default: 2, min: 1, max: 3, step: 0.25 }, { key: 'exit', label: 'Exit z', default: 0.5, min: 0, max: 1.5, step: 0.25 }],
    warmup: (q) => q.look! + 1,
    description: 'Long the cheap leg and short the rich leg of two related stocks when their price ratio stretches beyond the entry z-score; close when it reverts. Shown with a short leg as a backtest only.',
    factory: () => {
      let pos = 0;
      return ({ i, p, params, symbols }: Ctx) => {
        const [a, b] = symbols as [string, string];
        const ratio = series(p, `ratio:${a}:${b}`, () => p.close[a]!.map((x, k) => Math.log(x / p.close[b]![k]!)));
        const m = series(p, `rm:${a}:${b}:${params.look}`, () => sma(ratio, params.look!));
        const sd = series(p, `rs:${a}:${b}:${params.look}`, () => stdev(ratio, params.look!));
        const z = (ratio[i]! - m[i]!) / sd[i]!;
        if (pos === 0 && z > params.entry!) pos = -1;
        else if (pos === 0 && z < -params.entry!) pos = 1;
        else if (pos !== 0 && Math.abs(z) < params.exit!) pos = 0;
        return pos === 0 ? {} : { [a]: 0.5 * pos, [b]: -0.5 * pos };
      };
    },
  },
];

export const strategy = (id: string): Strategy => STRATEGIES.find((s) => s.id === id)!;

/** `count` evenly spaced values for a parameter, snapped to its step. */
export function paramGrid(q: Strategy['params'][number], count: number): number[] {
  const out = new Set<number>();
  for (let k = 0; k < count; k++) out.add(+(q.min + Math.round(((q.max - q.min) * k) / (count - 1) / q.step) * q.step).toFixed(4));
  return [...out];
}

// ---------- Robustness (items 41 to 43) ----------

/** 2D parameter grid of Sharpe ratios (item 42). */
export function optimize(p: Panel, id: string, base: Record<string, number>, kx: string, ky: string, xs: number[], ys: number[], opts: Opts) {
  return ys.map((y) => xs.map((x) => run(p, strategy(id), { ...base, [kx]: x, [ky]: y }, opts).metrics.sharpe));
}

/**
 * Walk-forward (item 41): split into k folds; in each, pick the best parameter value on the
 * in-sample part by Sharpe, then measure it on the next out-of-sample part.
 */
export function walkForward(p: Panel, id: string, base: Record<string, number>, key: string, values: number[], opts: Opts, folds = 4) {
  const n = p.dates.length;
  const size = Math.floor(n / (folds + 1));
  const out: { from: string; to: string; best: number; inSharpe: number; outSharpe: number; outReturn: number }[] = [];
  const slice = (a: number, b: number): Panel => ({ dates: p.dates.slice(a, b), close: Object.fromEntries(Object.entries(p.close).map(([k, v]) => [k, v.slice(a, b)])) });
  for (let f = 0; f < folds; f++) {
    const isP = slice(0, size * (f + 1));
    const oos = slice(Math.max(0, size * (f + 1) - 300), size * (f + 2));
    let best = values[0]!;
    let bestS = -Infinity;
    for (const v of values) {
      const s = run(isP, strategy(id), { ...base, [key]: v }, opts).metrics.sharpe;
      if (s > bestS) {
        bestS = s;
        best = v;
      }
    }
    const r = run(oos, strategy(id), { ...base, [key]: best }, opts);
    out.push({ from: oos.dates[Math.min(oos.dates.length - 1, 300)] ?? '', to: oos.dates.at(-1) ?? '', best, inSharpe: bestS, outSharpe: r.metrics.sharpe, outReturn: r.equity.at(-1)! / r.equity[0]! - 1 });
  }
  return out;
}

/**
 * Shuffle test (item 43): compare the strategy's Sharpe with strategies that hold the same
 * exposure on randomly reshuffled daily returns. A low percentile suggests luck or overfitting.
 */
export function shuffleTest(result: Result, runs = 300, seed = 42): { percentile: number; sharpes: number[] } {
  const rets = result.equity.slice(1).map((v, i) => v / result.equity[i]! - 1);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  // Sign-flip randomization keeps the volatility but destroys any timing skill.
  const sharpes: number[] = [];
  for (let k = 0; k < runs; k++) {
    const flipped = rets.map((r) => (rnd() < 0.5 ? -r : r));
    const m = flipped.reduce((a, b) => a + b, 0) / flipped.length;
    const sd = Math.sqrt(flipped.reduce((a, b) => a + (b - m) ** 2, 0) / (flipped.length - 1));
    sharpes.push(sd ? (m / sd) * Math.sqrt(252) : 0);
  }
  const actual = result.metrics.sharpe;
  return { percentile: sharpes.filter((x) => x < actual).length / runs, sharpes };
}
