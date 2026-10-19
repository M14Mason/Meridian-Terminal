import { describe, expect, it } from 'vitest';
import { compact, dataDigest, findBars, isBars, techDigest } from './digest';

const bars = Array.from({ length: 260 }, (_, i) => ({ t: Date.UTC(2025, 0, 1) + i * 86_400_000, o: 100 + i, h: 101 + i, l: 99 + i, c: 100 + i, v: 1000 }));

describe('digest', () => {
  it('detects bars and computes technicals', () => {
    expect(isBars(bars)).toBe(true);
    const t = techDigest(bars);
    expect(t).toMatch(/RSI\(14\): 100 \(overbought zone\)/);
    expect(t).toMatch(/golden/);
    expect(t).toMatch(/52-week range/);
  });
  it('compacts long arrays and wide objects', () => {
    const big = Array.from({ length: 100 }, (_, i) => ({ n: i }));
    const c = compact(big) as unknown[];
    expect(c.length).toBe(41);
    expect(c[30]).toMatch(/60 more/);
    expect(compact('x'.repeat(500))).toHaveLength(241);
  });
  it('finds nested bars and stays inside the budget', () => {
    expect(findBars({ a: { bars } })).toHaveLength(1);
    const d = dataDigest([{ source: 'Alpaca', data: { bars, news: Array.from({ length: 300 }, (_, i) => ({ headline: `h${i}`.repeat(30) })) } }], 4000);
    expect(d).toMatch(/RSI/);
    expect(d.length).toBeLessThan(6100);
  });
});
