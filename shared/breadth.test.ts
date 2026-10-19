import { describe, expect, it } from 'vitest';
import { breadth, rvol, type Day } from './breadth';

const day = (date: string, rows: [string, number, number][]): Day => ({ date, bars: new Map(rows.map(([t, c, v]) => [t, { c, v, h: c, l: c }])) });

describe('breadth', () => {
  it('counts advancers and decliners and accumulates the A/D line', () => {
    const days = [day('d0', [['A', 10, 1], ['B', 10, 1], ['C', 10, 1]]), day('d1', [['A', 11, 1], ['B', 9, 1], ['C', 9, 1]]), day('d2', [['A', 12, 1], ['B', 10, 1], ['C', 10, 1]])];
    const b = breadth(days);
    expect(b.map((x) => [x.adv, x.dec, x.adLine])).toEqual([[1, 2, -1], [3, 0, 2]]);
    expect(b[0]!.mcclellan).toBeNull();
  });
  it('respects the universe filter', () => {
    const days = [day('d0', [['A', 10, 1], ['W', 1, 1]]), day('d1', [['A', 11, 1], ['W', 0.5, 1]])];
    expect(breadth(days, new Set(['A']))[0]!.dec).toBe(0);
  });
  it('computes percent above the 20-day average', () => {
    const days = Array.from({ length: 21 }, (_, i) => day(`d${i}`, [['A', 10 + i, 1], ['B', 30 - i, 1]]));
    const last = breadth(days).at(-1)!;
    expect(last.above20).toBe(0.5);
    expect(last.newHigh).toBe(1);
    expect(last.newLow).toBe(1);
  });
});

describe('rvol', () => {
  it('ranks by volume vs the prior average and applies filters', () => {
    const days = Array.from({ length: 10 }, (_, i) => day(`d${i}`, [['A', 10, i === 9 ? 1_000_000 : 200_000], ['B', 10, 200_000], ['P', 1, 5_000_000]]));
    const r = rvol(days);
    expect(r[0]!.ticker).toBe('A');
    expect(r[0]!.rvol).toBeCloseTo(5);
    expect(r.find((x) => x.ticker === 'P')).toBeUndefined();
  });
});
