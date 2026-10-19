// Technical indicators (catalog items 1 to 25). Pure functions, no DOM, safe for Web Workers.
// Convention: output arrays align with the input; warm-up values are NaN.
// "Code computes, Claude explains" (16.3): every number shown to the AI comes from here.

export interface Bar {
  t: number; // ms epoch (bar open)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

const nan = (n: number) => new Array<number>(n).fill(NaN);

// ---------- Moving averages ----------

export function sma(x: number[], n: number): number[] {
  const out = nan(x.length);
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    sum += x[i]!;
    if (i >= n) sum -= x[i - n]!;
    if (i >= n - 1) out[i] = sum / n;
  }
  return out;
}

/** EMA seeded with the SMA of the first n values (the common charting convention). */
export function ema(x: number[], n: number): number[] {
  const out = nan(x.length);
  if (x.length < n) return out;
  const k = 2 / (n + 1);
  let prev = 0;
  for (let i = 0; i < n; i++) prev += x[i]!;
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < x.length; i++) {
    prev = x[i]! * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** Wilder smoothing (RMA): alpha = 1/n, seeded with a simple average. Used by RSI and ATR. */
export function rma(x: number[], n: number): number[] {
  const out = nan(x.length);
  if (x.length < n) return out;
  let prev = 0;
  for (let i = 0; i < n; i++) prev += x[i]!;
  prev /= n;
  out[n - 1] = prev;
  for (let i = n; i < x.length; i++) {
    prev = (prev * (n - 1) + x[i]!) / n;
    out[i] = prev;
  }
  return out;
}

export function wma(x: number[], n: number): number[] {
  const out = nan(x.length);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < x.length; i++) {
    let s = 0;
    for (let j = 0; j < n; j++) s += x[i - j]! * (n - j);
    out[i] = s / denom;
  }
  return out;
}

export function stdev(x: number[], n: number): number[] {
  const out = nan(x.length);
  for (let i = n - 1; i < x.length; i++) {
    let m = 0;
    for (let j = i - n + 1; j <= i; j++) m += x[j]!;
    m /= n;
    let v = 0;
    for (let j = i - n + 1; j <= i; j++) v += (x[j]! - m) ** 2;
    out[i] = Math.sqrt(v / n); // population, as in Bollinger's definition
  }
  return out;
}

// ---------- Oscillators ----------

/** Wilder RSI. */
export function rsi(close: number[], n = 14): number[] {
  const out = nan(close.length);
  if (close.length <= n) return out;
  let gain = 0;
  let loss = 0;
  for (let i = 1; i <= n; i++) {
    const d = close[i]! - close[i - 1]!;
    if (d > 0) gain += d;
    else loss -= d;
  }
  gain /= n;
  loss /= n;
  out[n] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let i = n + 1; i < close.length; i++) {
    const d = close[i]! - close[i - 1]!;
    gain = (gain * (n - 1) + Math.max(d, 0)) / n;
    loss = (loss * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  }
  return out;
}

export function macd(close: number[], fast = 12, slow = 26, signal = 9) {
  const f = ema(close, fast);
  const s = ema(close, slow);
  const line = close.map((_, i) => f[i]! - s[i]!);
  const firstValid = line.findIndex((v) => !Number.isNaN(v));
  const sig = nan(close.length);
  if (firstValid >= 0) {
    const tail = ema(line.slice(firstValid), signal);
    for (let i = 0; i < tail.length; i++) sig[firstValid + i] = tail[i]!;
  }
  return { macd: line, signal: sig, hist: line.map((v, i) => v - sig[i]!) };
}

export function stochastic(bars: Bar[], kN = 14, dN = 3) {
  const k = nan(bars.length);
  for (let i = kN - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - kN + 1; j <= i; j++) {
      hi = Math.max(hi, bars[j]!.h);
      lo = Math.min(lo, bars[j]!.l);
    }
    k[i] = hi === lo ? 50 : (100 * (bars[i]!.c - lo)) / (hi - lo);
  }
  return { k, d: smaSkipNaN(k, dN) };
}

function smaSkipNaN(x: number[], n: number): number[] {
  const first = x.findIndex((v) => !Number.isNaN(v));
  const out = nan(x.length);
  if (first < 0) return out;
  const s = sma(x.slice(first), n);
  for (let i = 0; i < s.length; i++) out[first + i] = s[i]!;
  return out;
}

// ---------- Volatility and channels ----------

export function bollinger(close: number[], n = 20, mult = 2) {
  const mid = sma(close, n);
  const sd = stdev(close, n);
  return { mid, upper: mid.map((m, i) => m + mult * sd[i]!), lower: mid.map((m, i) => m - mult * sd[i]!) };
}

export function trueRange(bars: Bar[]): number[] {
  return bars.map((b, i) => (i === 0 ? b.h - b.l : Math.max(b.h - b.l, Math.abs(b.h - bars[i - 1]!.c), Math.abs(b.l - bars[i - 1]!.c))));
}

/** Wilder ATR. The first TR (no prior close) is included in the seed average. */
export function atr(bars: Bar[], n = 14): number[] {
  return rma(trueRange(bars), n);
}

export function donchian(bars: Bar[], n = 20) {
  const upper = nan(bars.length);
  const lower = nan(bars.length);
  for (let i = n - 1; i < bars.length; i++) {
    let hi = -Infinity;
    let lo = Infinity;
    for (let j = i - n + 1; j <= i; j++) {
      hi = Math.max(hi, bars[j]!.h);
      lo = Math.min(lo, bars[j]!.l);
    }
    upper[i] = hi;
    lower[i] = lo;
  }
  return { upper, lower, mid: upper.map((u, i) => (u + lower[i]!) / 2) };
}

/** Keltner channels: EMA of close plus/minus mult x ATR. */
export function keltner(bars: Bar[], n = 20, atrN = 10, mult = 2) {
  const mid = ema(bars.map((b) => b.c), n);
  const a = atr(bars, atrN);
  return { mid, upper: mid.map((m, i) => m + mult * a[i]!), lower: mid.map((m, i) => m - mult * a[i]!) };
}

/** Supertrend (item 8). direction: 1 up-trend, -1 down-trend. */
export function supertrend(bars: Bar[], n = 10, mult = 3) {
  const a = atr(bars, n);
  const line = nan(bars.length);
  const dir = new Array<number>(bars.length).fill(0);
  let upper = NaN;
  let lower = NaN;
  for (let i = 0; i < bars.length; i++) {
    if (Number.isNaN(a[i]!)) continue;
    const b = bars[i]!;
    const hl2 = (b.h + b.l) / 2;
    const bu = hl2 + mult * a[i]!;
    const bl = hl2 - mult * a[i]!;
    const prevClose = bars[i - 1]?.c ?? b.c;
    upper = Number.isNaN(upper) || bu < upper || prevClose > upper ? bu : upper;
    lower = Number.isNaN(lower) || bl > lower || prevClose < lower ? bl : lower;
    const prevDir = dir[i - 1] || 1;
    let d = prevDir;
    if (prevDir === 1 && b.c < lower) d = -1;
    else if (prevDir === -1 && b.c > upper) d = 1;
    dir[i] = d;
    line[i] = d === 1 ? lower : upper;
  }
  return { line, direction: dir };
}

// ---------- Volume ----------

export function obv(bars: Bar[]): number[] {
  const out: number[] = [];
  let acc = 0;
  bars.forEach((b, i) => {
    if (i > 0) acc += b.c > bars[i - 1]!.c ? b.v : b.c < bars[i - 1]!.c ? -b.v : 0;
    out.push(acc);
  });
  return out;
}

/** Session VWAP, reset when sessionKey changes (default: UTC date). */
export function vwap(bars: Bar[], sessionKey: (t: number) => string = (t) => new Date(t).toISOString().slice(0, 10)): number[] {
  let pv = 0;
  let vol = 0;
  let key = '';
  return bars.map((b) => {
    const k = sessionKey(b.t);
    if (k !== key) {
      key = k;
      pv = 0;
      vol = 0;
    }
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
    return vol ? pv / vol : NaN;
  });
}

/** Anchored VWAP from a chosen bar (item 5). */
export function anchoredVwap(bars: Bar[], anchor: number): number[] {
  let pv = 0;
  let vol = 0;
  return bars.map((b, i) => {
    if (i < anchor) return NaN;
    pv += ((b.h + b.l + b.c) / 3) * b.v;
    vol += b.v;
    return vol ? pv / vol : NaN;
  });
}

/** Volume profile (item 4): volume per price bin, each bar's volume spread evenly over its range. */
export function volumeProfile(bars: Bar[], bins = 24) {
  const lo = Math.min(...bars.map((b) => b.l));
  const hi = Math.max(...bars.map((b) => b.h));
  const step = (hi - lo) / bins || 1;
  const vol = new Array<number>(bins).fill(0);
  for (const b of bars) {
    const a = Math.min(bins - 1, Math.floor((b.l - lo) / step));
    const z = Math.min(bins - 1, Math.floor((b.h - lo) / step));
    const share = b.v / (z - a + 1);
    for (let k = a; k <= z; k++) vol[k]! += share;
  }
  const poc = vol.indexOf(Math.max(...vol));
  return { bins: vol.map((v, i) => ({ from: lo + i * step, to: lo + (i + 1) * step, volume: v })), pocIndex: poc };
}

// ---------- Ichimoku (item 6) ----------

function midpoint(bars: Bar[], i: number, n: number): number {
  if (i < n - 1) return NaN;
  let hi = -Infinity;
  let lo = Infinity;
  for (let j = i - n + 1; j <= i; j++) {
    hi = Math.max(hi, bars[j]!.h);
    lo = Math.min(lo, bars[j]!.l);
  }
  return (hi + lo) / 2;
}

/**
 * Unshifted lines. Plot spanA/spanB `displacement` bars ahead and chikou `displacement` bars back.
 */
export function ichimoku(bars: Bar[], conv = 9, base = 26, spanBN = 52, displacement = 26) {
  const tenkan = bars.map((_, i) => midpoint(bars, i, conv));
  const kijun = bars.map((_, i) => midpoint(bars, i, base));
  return {
    tenkan,
    kijun,
    spanA: tenkan.map((t, i) => (t + kijun[i]!) / 2),
    spanB: bars.map((_, i) => midpoint(bars, i, spanBN)),
    chikou: bars.map((b) => b.c),
    displacement,
  };
}

// ---------- Alternative bar types (items 1 to 3) ----------

export function heikinAshi(bars: Bar[]): Bar[] {
  const out: Bar[] = [];
  bars.forEach((b, i) => {
    const c = (b.o + b.h + b.l + b.c) / 4;
    const o = i === 0 ? (b.o + b.c) / 2 : (out[i - 1]!.o + out[i - 1]!.c) / 2;
    out.push({ t: b.t, o, c, h: Math.max(b.h, o, c), l: Math.min(b.l, o, c), v: b.v });
  });
  return out;
}

export interface Brick {
  t: number;
  open: number;
  close: number;
  up: boolean;
}

/**
 * Classic Renko on closes. Tracking the last brick's top and bottom means a reversal
 * automatically needs two boxes (price must clear the far side of the last brick).
 */
export function renko(bars: Bar[], box: number): Brick[] {
  if (!bars.length || box <= 0) return [];
  const out: Brick[] = [];
  let top = bars[0]!.c;
  let bottom = bars[0]!.c;
  for (const b of bars) {
    while (b.c >= top + box) {
      out.push({ t: b.t, open: top, close: top + box, up: true });
      bottom = top;
      top += box;
    }
    while (b.c <= bottom - box) {
      out.push({ t: b.t, open: bottom, close: bottom - box, up: false });
      top = bottom;
      bottom -= box;
    }
  }
  return out;
}

export interface PnfColumn {
  kind: 'X' | 'O';
  from: number; // box index low end
  to: number; // box index high end
}

/** Point and figure on closes, box size and reversal count (item 3). Box indexes, multiply by box for price. */
export function pointAndFigure(bars: Bar[], box: number, reversal = 3): PnfColumn[] {
  if (!bars.length) return [];
  const cols: PnfColumn[] = [];
  const idx = (p: number) => Math.floor(p / box);
  let cur: PnfColumn | null = null;
  let anchor = idx(bars[0]!.c);
  for (const b of bars) {
    const k = idx(b.c);
    if (!cur) {
      if (k >= anchor + 1) cur = { kind: 'X', from: anchor + 1, to: k };
      else if (k <= anchor - 1) cur = { kind: 'O', from: k, to: anchor - 1 };
      if (cur) cols.push(cur);
      continue;
    }
    if (cur.kind === 'X') {
      if (k > cur.to) cur.to = k;
      else if (k <= cur.to - reversal) {
        cur = { kind: 'O', from: k, to: cur.to - 1 };
        cols.push(cur);
      }
    } else {
      if (k < cur.from) cur.from = k;
      else if (k >= cur.from + reversal) {
        cur = { kind: 'X', from: cur.from + 1, to: k };
        cols.push(cur);
      }
    }
    anchor = k;
  }
  return cols;
}

// ---------- Levels (items 9, 10, 13) ----------

/** Classic floor-trader pivots from one prior period's high, low, close. */
export function pivotPoints(prev: { h: number; l: number; c: number }) {
  const p = (prev.h + prev.l + prev.c) / 3;
  const r = prev.h - prev.l;
  return { p, r1: 2 * p - prev.l, s1: 2 * p - prev.h, r2: p + r, s2: p - r, r3: prev.h + 2 * (p - prev.l), s3: prev.l - 2 * (prev.h - p) };
}

export const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

export function fibLevels(high: number, low: number, upTrend = true) {
  const r = high - low;
  return FIB_RATIOS.map((f) => ({ ratio: f, price: upTrend ? high - r * f : low + r * f }));
}

export interface Swing {
  index: number;
  price: number;
  kind: 'high' | 'low';
}

/** Fractal swing points: a bar higher (lower) than `left` bars before and `right` bars after. */
export function swings(bars: Bar[], left = 3, right = 3): Swing[] {
  const out: Swing[] = [];
  for (let i = left; i < bars.length - right; i++) {
    let isHi = true;
    let isLo = true;
    for (let j = i - left; j <= i + right; j++) {
      if (j === i) continue;
      if (bars[j]!.h >= bars[i]!.h) isHi = false;
      if (bars[j]!.l <= bars[i]!.l) isLo = false;
    }
    if (isHi) out.push({ index: i, price: bars[i]!.h, kind: 'high' });
    if (isLo) out.push({ index: i, price: bars[i]!.l, kind: 'low' });
  }
  return out;
}

/** Auto Fibonacci (item 9) on the highest high and lowest low of the lookback window. */
export function autoFib(bars: Bar[], lookback = 120) {
  const w = bars.slice(-lookback);
  if (!w.length) return null;
  let hi = 0;
  let lo = 0;
  w.forEach((b, i) => {
    if (b.h > w[hi]!.h) hi = i;
    if (b.l < w[lo]!.l) lo = i;
  });
  const upTrend = lo < hi;
  return { high: w[hi]!.h, low: w[lo]!.l, upTrend, levels: fibLevels(w[hi]!.h, w[lo]!.l, upTrend) };
}

/** Support and resistance zones (item 10): swing prices clustered within `tol` (default half an ATR). */
export function srZones(bars: Bar[], tol?: number, minTouches = 2) {
  const a = atr(bars, 14).filter((v) => !Number.isNaN(v)).at(-1) ?? 0;
  const t = tol ?? a * 0.5;
  const pts = swings(bars).map((s) => s.price).sort((x, y) => x - y);
  const zones: { low: number; high: number; touches: number }[] = [];
  for (const p of pts) {
    const z = zones.at(-1);
    if (z && p - z.high <= t) {
      z.high = p;
      z.touches++;
    } else zones.push({ low: p, high: p, touches: 1 });
  }
  return zones.filter((z) => z.touches >= minTouches);
}

// ---------- Patterns (items 11, 12) ----------

export type CandlePattern = 'doji' | 'hammer' | 'shooting_star' | 'bullish_engulfing' | 'bearish_engulfing' | 'morning_star' | 'evening_star';

export function candlePatterns(bars: Bar[]): { index: number; pattern: CandlePattern }[] {
  const out: { index: number; pattern: CandlePattern }[] = [];
  const body = (b: Bar) => Math.abs(b.c - b.o);
  const range = (b: Bar) => b.h - b.l || 1e-12;
  for (let i = 0; i < bars.length; i++) {
    const b = bars[i]!;
    const up = Math.max(b.o, b.c);
    const dn = Math.min(b.o, b.c);
    if (body(b) / range(b) < 0.1) out.push({ index: i, pattern: 'doji' });
    else if (dn - b.l >= 2 * body(b) && b.h - up <= body(b) * 0.3) out.push({ index: i, pattern: 'hammer' });
    else if (b.h - up >= 2 * body(b) && dn - b.l <= body(b) * 0.3) out.push({ index: i, pattern: 'shooting_star' });
    if (i >= 1) {
      const p = bars[i - 1]!;
      if (p.c < p.o && b.c > b.o && b.o <= p.c && b.c >= p.o && body(b) > body(p)) out.push({ index: i, pattern: 'bullish_engulfing' });
      if (p.c > p.o && b.c < b.o && b.o >= p.c && b.c <= p.o && body(b) > body(p)) out.push({ index: i, pattern: 'bearish_engulfing' });
    }
    if (i >= 2) {
      const a = bars[i - 2]!;
      const m = bars[i - 1]!;
      const small = body(m) < body(a) * 0.3;
      if (a.c < a.o && small && b.c > b.o && b.c > (a.o + a.c) / 2) out.push({ index: i, pattern: 'morning_star' });
      if (a.c > a.o && small && b.c < b.o && b.c < (a.o + a.c) / 2) out.push({ index: i, pattern: 'evening_star' });
    }
  }
  return out;
}

/** RSI divergence (item 12) between consecutive swing lows (bullish) or swing highs (bearish). */
export function rsiDivergence(bars: Bar[], n = 14, left = 3, right = 3) {
  const r = rsi(bars.map((b) => b.c), n);
  const sw = swings(bars, left, right).filter((s) => !Number.isNaN(r[s.index]!));
  const out: { from: number; to: number; kind: 'bullish' | 'bearish' }[] = [];
  for (const kind of ['low', 'high'] as const) {
    const pts = sw.filter((s) => s.kind === kind);
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1]!;
      const b = pts[i]!;
      if (kind === 'low' && b.price < a.price && r[b.index]! > r[a.index]!) out.push({ from: a.index, to: b.index, kind: 'bullish' });
      if (kind === 'high' && b.price > a.price && r[b.index]! < r[a.index]!) out.push({ from: a.index, to: b.index, kind: 'bearish' });
    }
  }
  return out.sort((x, y) => x.to - y.to);
}

// ---------- Statistics (items 14, 19, 23, 24 and COMP/BETA/TRA) ----------

export function returns(close: number[]): number[] {
  return close.slice(1).map((c, i) => c / close[i]! - 1);
}

export function correlation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  let ma = 0;
  let mb = 0;
  for (let i = 0; i < n; i++) {
    ma += a[i]!;
    mb += b[i]!;
  }
  ma /= n;
  mb /= n;
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    sab += (a[i]! - ma) * (b[i]! - mb);
    saa += (a[i]! - ma) ** 2;
    sbb += (b[i]! - mb) ** 2;
  }
  return sab / Math.sqrt(saa * sbb);
}

/** OLS beta of asset returns on benchmark returns. */
export function beta(asset: number[], bench: number[]): { beta: number; alpha: number; r2: number } {
  const n = Math.min(asset.length, bench.length);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += bench[i]!;
    my += asset[i]!;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (bench[i]! - mx) * (asset[i]! - my);
    sxx += (bench[i]! - mx) ** 2;
  }
  const b = sxy / sxx;
  const r = correlation(asset.slice(0, n), bench.slice(0, n));
  return { beta: b, alpha: my - b * mx, r2: r * r };
}

/** Total return index with dividends reinvested on the ex-date close. dividends: map of bar index to cash amount. */
export function totalReturn(close: number[], dividends: Map<number, number>): number[] {
  const out = [1];
  for (let i = 1; i < close.length; i++) out.push(out[i - 1]! * ((close[i]! + (dividends.get(i) ?? 0)) / close[i - 1]!));
  return out;
}

/** Pairs spread with OLS hedge ratio and rolling z-score (item 24). */
export function pairsSpread(a: number[], b: number[], lookback = 60) {
  const { beta: hedge } = beta(a, b);
  const spread = a.map((x, i) => x - hedge * b[i]!);
  const m = sma(spread, lookback);
  const sd = stdev(spread, lookback);
  return { hedge, spread, z: spread.map((s, i) => (s - m[i]!) / sd[i]!) };
}

/** Gap statistics (item 19): opening gaps and whether price traded back to the prior close the same day. */
export function gapStats(bars: Bar[], minPct = 0.005) {
  const gaps: { index: number; pct: number; filled: boolean }[] = [];
  for (let i = 1; i < bars.length; i++) {
    const prev = bars[i - 1]!.c;
    const b = bars[i]!;
    const pct = b.o / prev - 1;
    if (Math.abs(pct) < minPct) continue;
    gaps.push({ index: i, pct, filled: pct > 0 ? b.l <= prev : b.h >= prev });
  }
  const filled = gaps.filter((g) => g.filled).length;
  return { gaps, count: gaps.length, fillRate: gaps.length ? filled / gaps.length : NaN };
}

/** Seasonality (item 14): average and hit rate of monthly returns by calendar month (UTC). */
export function seasonality(bars: Bar[]) {
  const byMonth = new Map<string, { first: number; last: number; m: number }>();
  for (const b of bars) {
    const d = new Date(b.t);
    const k = `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
    const e = byMonth.get(k);
    if (e) e.last = b.c;
    else byMonth.set(k, { first: b.o, last: b.c, m: d.getUTCMonth() });
  }
  const acc = Array.from({ length: 12 }, () => ({ sum: 0, n: 0, up: 0 }));
  for (const e of byMonth.values()) {
    const r = e.last / e.first - 1;
    const a = acc[e.m]!;
    a.sum += r;
    a.n++;
    if (r > 0) a.up++;
  }
  return acc.map((a, month) => ({ month, avg: a.n ? a.sum / a.n : NaN, hitRate: a.n ? a.up / a.n : NaN, years: a.n }));
}

/** Opening range breakout (item 18) on one session's intraday bars. */
export function openingRange(sessionBars: Bar[], minutes = 30) {
  if (!sessionBars.length) return null;
  const start = sessionBars[0]!.t;
  const or = sessionBars.filter((b) => b.t < start + minutes * 60_000);
  const high = Math.max(...or.map((b) => b.h));
  const low = Math.min(...or.map((b) => b.l));
  const after = sessionBars.slice(or.length);
  const up = after.findIndex((b) => b.c > high);
  const down = after.findIndex((b) => b.c < low);
  const first = up >= 0 && (down < 0 || up < down) ? 'up' : down >= 0 ? 'down' : null;
  return { high, low, breakout: first, breakoutIndex: first === 'up' ? or.length + up : first === 'down' ? or.length + down : null };
}
