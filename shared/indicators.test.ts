import { describe, expect, it } from 'vitest';
import {
  anchoredVwap, atr, autoFib, beta, bollinger, candlePatterns, correlation, donchian, ema, gapStats, heikinAshi, ichimoku,
  keltner, macd, obv, openingRange, pairsSpread, pivotPoints, pointAndFigure, renko, rsi, rsiDivergence, seasonality, sma,
  srZones, stochastic, supertrend, totalReturn, trueRange, volumeProfile, vwap, wma, type Bar,
} from './indicators';

const bar = (c: number, i = 0, o = c, h = Math.max(o, c), l = Math.min(o, c), v = 100): Bar => ({ t: i * 86_400_000, o, h, l, c, v });
const fromCloses = (cs: number[]) => cs.map((c, i) => bar(c, i, i ? cs[i - 1]! : c, Math.max(c, i ? cs[i - 1]! : c) + 0.5, Math.min(c, i ? cs[i - 1]! : c) - 0.5));
const close = (x: number, d = 2) => (v: number) => expect(v).toBeCloseTo(x, d);
// Bars whose high and low hug the close, so fractal swing detection sees clean peaks and troughs.
const tight = (cs: number[]) => cs.map((c, i) => bar(c, i, c, c + 0.1, c - 0.1));

// Data: the 14-day RSI worked example series from StockCharts ChartSchool ("Relative Strength
// Index (RSI)"). Expected values were computed independently in Python at full precision with
// Wilder's method (avg gain 0.238571, avg loss 0.100000 -> 70.4641, then 66.2496). The published
// table is an image that rounds intermediate averages, so it differs in the first decimal.
const CS_RSI = [44.34, 44.09, 44.15, 43.61, 44.33, 44.83, 45.1, 45.42, 45.84, 46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.0, 46.03, 46.41, 46.22, 45.64, 46.21, 46.25, 45.71, 46.45, 45.78, 45.35, 44.03, 44.18, 44.22, 44.57, 43.42, 42.66, 43.13];

describe('moving averages', () => {
  it('SMA, EMA, WMA match hand-computed values', () => {
    expect(sma([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4]);
    // EMA(3) seeded with SMA(1,2,3)=2, k=0.5: 4 -> 3, 5 -> 4
    expect(ema([1, 2, 3, 4, 5], 3).slice(2)).toEqual([2, 3, 4]);
    expect(ema([2, 4, 6, 8, 12], 3).slice(2)).toEqual([4, 6, 9]);
    // WMA(3) of 1,2,3 = (1*1+2*2+3*3)/6
    expect(wma([1, 2, 3], 3)[2]).toBeCloseTo(14 / 6, 10);
    expect(Number.isNaN(sma([1, 2], 3)[1]!)).toBe(true);
  });
});

describe('RSI', () => {
  it('matches the full-precision values for the StockCharts example series', () => {
    const r = rsi(CS_RSI, 14);
    close(70.4641, 3)(r[14]!);
    close(66.2496, 3)(r[15]!);
    expect(r.slice(0, 14).every(Number.isNaN)).toBe(true);
  });
  it('is 100 with no losses', () => {
    expect(rsi([1, 2, 3, 4, 5, 6], 3)[5]).toBe(100);
  });
});

describe('MACD', () => {
  it('line is EMA12 minus EMA26, signal is EMA9 of the line', () => {
    const cs = Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.1);
    const m = macd(cs);
    const e12 = ema(cs, 12);
    const e26 = ema(cs, 26);
    close(e12[40]! - e26[40]!, 10)(m.macd[40]!);
    expect(Number.isNaN(m.signal[32]!)).toBe(true);
    expect(Number.isNaN(m.signal[33]!)).toBe(false); // 26 - 1 + 9 - 1
    close(m.macd[50]! - m.signal[50]!, 10)(m.hist[50]!);
  });
});

describe('volatility', () => {
  it('Bollinger uses population standard deviation', () => {
    const b = bollinger([2, 4, 4, 4, 5, 5, 7, 9], 8, 2);
    expect(b.mid[7]).toBe(5);
    expect(b.upper[7]).toBe(9); // stdev 2
    expect(b.lower[7]).toBe(1);
  });
  it('true range uses the prior close', () => {
    const bars = [bar(10, 0, 10, 11, 9), bar(13, 1, 12, 14, 12)];
    expect(trueRange(bars)).toEqual([2, 4]);
  });
  it('ATR is Wilder smoothed true range', () => {
    const bars = [bar(10, 0, 10, 11, 9), bar(13, 1, 12, 14, 12), bar(12, 2, 13, 13, 11)];
    // TR = 2, 4, 2. ATR(2): seed (2+4)/2 = 3, then (3*1 + 2)/2 = 2.5
    expect(atr(bars, 2).slice(1)).toEqual([3, 2.5]);
  });
  it('Donchian and Keltner', () => {
    const bars = fromCloses([1, 2, 3, 4, 5, 6]);
    const d = donchian(bars, 3);
    expect(d.upper[5]).toBe(6.5);
    expect(d.lower[5]).toBe(2.5); // lows are min(close, prior close) - 0.5
    const k = keltner(bars, 3, 3, 2);
    expect(k.upper[5]! > k.mid[5]!).toBe(true);
    expect(k.mid[5]! - k.lower[5]!).toBeCloseTo(k.upper[5]! - k.mid[5]!, 10);
  });
  it('Supertrend flips direction on a trend change', () => {
    const up = Array.from({ length: 30 }, (_, i) => 100 + i);
    const down = Array.from({ length: 30 }, (_, i) => 129 - i * 2);
    const st = supertrend(fromCloses([...up, ...down]), 5, 2);
    expect(st.direction[25]).toBe(1);
    expect(st.direction[59]).toBe(-1);
    expect(st.line[25]! < 125).toBe(true);
  });
});

describe('volume', () => {
  it('OBV adds on up days and subtracts on down days', () => {
    const bars = [bar(10), bar(11, 1, 10, 11, 10, 50), bar(10.5, 2, 11, 11, 10.5, 30), bar(10.5, 3, 10.5, 10.5, 10.5, 99)];
    expect(obv(bars)).toEqual([0, 50, 20, 20]);
  });
  it('VWAP resets per session and anchored VWAP starts at the anchor', () => {
    const bars = [bar(10, 0, 10, 10, 10, 100), bar(20, 0, 20, 20, 20, 300), bar(30, 1, 30, 30, 30, 100)];
    const v = vwap(bars);
    expect(v[1]).toBe(17.5);
    expect(v[2]).toBe(30);
    const a = anchoredVwap(bars, 1);
    expect(Number.isNaN(a[0]!)).toBe(true);
    expect(a[2]).toBe(22.5);
  });
  it('volume profile conserves volume and finds the point of control', () => {
    const bars = [bar(10, 0, 10, 10, 10, 500), bar(20, 1, 20, 20, 20, 100), bar(15, 2, 15, 15, 15, 50)];
    const vp = volumeProfile(bars, 10);
    expect(vp.bins.reduce((s, b) => s + b.volume, 0)).toBeCloseTo(650, 10);
    expect(vp.pocIndex).toBe(0);
  });
});

describe('Ichimoku', () => {
  it('tenkan is the 9-bar high-low midpoint', () => {
    const bars = Array.from({ length: 60 }, (_, i) => bar(i, i, i, i + 1, i - 1));
    const ich = ichimoku(bars);
    expect(ich.tenkan[8]).toBe((9 + -1) / 2);
    expect(ich.kijun[25]).toBe((26 + -1) / 2);
    expect(ich.spanA[30]).toBe((ich.tenkan[30]! + ich.kijun[30]!) / 2);
    expect(Number.isNaN(ich.spanB[50]!)).toBe(true);
    expect(ich.displacement).toBe(26);
  });
});

describe('alternative bars', () => {
  it('Heikin Ashi', () => {
    const ha = heikinAshi([bar(12, 0, 10, 13, 9), bar(14, 1, 12, 15, 11)]);
    expect(ha[0]).toMatchObject({ o: 11, c: 11, h: 13, l: 9 });
    expect(ha[1]).toMatchObject({ o: 11, c: 13, h: 15, l: 11 });
  });
  it('Renko needs two boxes to reverse', () => {
    const r = renko(fromCloses([100, 103, 105, 104, 102, 99]), 2);
    expect(r.map((b) => (b.up ? 'U' : 'D')).join('')).toBe('UUD');
    expect(r[2]).toMatchObject({ open: 102, close: 100 });
  });
  it('Point and figure with 3-box reversal', () => {
    const cols = pointAndFigure(fromCloses([10, 11, 12, 13, 12, 11, 10, 9, 10, 13]), 1, 3);
    expect(cols.map((c) => c.kind).join('')).toBe('XOX');
    expect(cols[0]).toMatchObject({ from: 11, to: 13 });
    expect(cols[1]).toMatchObject({ from: 9, to: 12 });
  });
});

describe('levels', () => {
  it('classic pivots', () => {
    const p = pivotPoints({ h: 110, l: 90, c: 100 });
    expect(p).toEqual({ p: 100, r1: 110, s1: 90, r2: 120, s2: 80, r3: 130, s3: 70 });
  });
  it('auto Fibonacci picks the swing range and direction', () => {
    const bars = [...fromCloses([50, 40, 30, 20, 30, 40, 60, 80, 100])];
    const f = autoFib(bars)!;
    expect(f.upTrend).toBe(true);
    expect(f.levels.find((l) => l.ratio === 0.5)!.price).toBeCloseTo((f.high + f.low) / 2, 10);
  });
  it('support and resistance zones cluster repeated swing levels', () => {
    const cs = [10, 12, 15, 12, 10, 12, 15.1, 12, 10.1, 12, 15, 12, 10, 12, 14];
    const zones = srZones(tight(cs), 0.5, 2);
    expect(zones.length).toBeGreaterThanOrEqual(2);
  });
});

describe('patterns', () => {
  it('detects engulfing, hammer and doji', () => {
    const bars = [bar(9, 0, 10, 10.2, 8.9), bar(10.5, 1, 8.8, 10.6, 8.7), bar(10, 2, 9.6, 10.05, 8.5), bar(10, 3, 10.0, 10.5, 9.5)];
    const p = candlePatterns(bars).map((x) => `${x.index}:${x.pattern}`);
    expect(p).toContain('1:bullish_engulfing');
    expect(p).toContain('2:hammer');
    expect(p).toContain('3:doji');
  });
  it('finds a bullish RSI divergence', () => {
    // Sharp fall to a low, bounce, then a slow drift to a slightly lower low: RSI makes a higher low.
    const cs = [...Array.from({ length: 20 }, (_, i) => 100 - i * 3), 45, 50, 55, 58, 60, 58, 56, 54, 52, 50, 48, 46, 44, 42, 40.5, 39.5, 42, 45, 48, 50];
    const d = rsiDivergence(tight(cs), 14, 3, 3);
    expect(d.some((x) => x.kind === 'bullish')).toBe(true);
  });
});

describe('statistics', () => {
  it('correlation and beta', () => {
    const x = [0.01, -0.02, 0.03, 0.0, 0.01];
    expect(correlation(x, x)).toBeCloseTo(1, 10);
    expect(correlation(x, x.map((v) => -v))).toBeCloseTo(-1, 10);
    const b = beta(x.map((v) => 2 * v + 0.001), x);
    expect(b.beta).toBeCloseTo(2, 10);
    expect(b.alpha).toBeCloseTo(0.001, 10);
    expect(b.r2).toBeCloseTo(1, 10);
  });
  it('total return reinvests dividends', () => {
    expect(totalReturn([100, 100], new Map([[1, 2]]))).toEqual([1, 1.02]);
  });
  it('pairs spread hedge ratio and z-score', () => {
    const b = Array.from({ length: 100 }, (_, i) => 50 + Math.sin(i / 5) * 3);
    const a = b.map((v, i) => 2 * v + (i === 99 ? 5 : 0));
    const p = pairsSpread(a, b, 30);
    expect(p.hedge).toBeCloseTo(2, 1);
    expect(p.z[99]! > 3).toBe(true);
  });
  it('gap statistics', () => {
    const bars = [bar(100, 0), bar(103, 1, 102, 104, 99.5), bar(106, 2, 105, 107, 104)];
    const g = gapStats(bars);
    expect(g.count).toBe(2);
    expect(g.gaps[0]!.filled).toBe(true);
    expect(g.gaps[1]!.filled).toBe(false);
    expect(g.fillRate).toBe(0.5);
  });
  it('seasonality by calendar month', () => {
    const jan = Date.UTC(2024, 0, 2);
    const feb = Date.UTC(2024, 1, 2);
    const s = seasonality([{ t: jan, o: 100, h: 0, l: 0, c: 110, v: 0 }, { t: feb, o: 110, h: 0, l: 0, c: 99, v: 0 }]);
    expect(s[0]!.avg).toBeCloseTo(0.1, 10);
    expect(s[1]!.hitRate).toBe(0);
  });
  it('opening range breakout', () => {
    const t0 = Date.UTC(2024, 0, 2, 14, 30);
    const mk = (m: number, h: number, l: number, c: number): Bar => ({ t: t0 + m * 60_000, o: c, h, l, c, v: 1 });
    const r = openingRange([mk(0, 101, 99, 100), mk(15, 102, 100, 101), mk(30, 102, 100, 101), mk(45, 104, 101, 103)], 30)!;
    expect(r).toMatchObject({ high: 102, low: 99, breakout: 'up', breakoutIndex: 3 });
  });
  it('stochastic %K bounds', () => {
    const s = stochastic(fromCloses(Array.from({ length: 30 }, (_, i) => 100 + i)), 14, 3);
    expect(s.k[29]! > 90).toBe(true);
    expect(Number.isNaN(s.d[14]!)).toBe(true);
    expect(Number.isNaN(s.d[15]!)).toBe(false);
  });
});
