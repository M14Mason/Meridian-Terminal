import { describe, expect, it } from 'vitest';
import { chain, modelPicks } from './model';
import type { Row } from './screener';

const row = (ticker: string, o: Partial<Row>): Row => ({ ticker, name: ticker, cik: 1, price: 10, mcap: 20_000e6, pe: 20, ps: null, pb: null, netMargin: 0.1, opMargin: null, roe: 0.1, de: 1, revGrowth: 0.05, epsGrowth: null, fcfYield: 0.03, revenue: null, volume: null, year: null, ...o } as Row);

describe('modelPicks', () => {
  it('filters the universe and ranks by composite score', () => {
    const rows = [row('A', { fcfYield: 0.1, roe: 0.3 }), row('B', {}), row('SMALL', { mcap: 1e9, fcfYield: 0.5 }), row('LOSS', { pe: null, fcfYield: 0.5 })];
    const p = modelPicks(rows, 5);
    expect(p.map((x) => x.ticker)).toEqual(['A', 'B']);
  });
});

describe('chain', () => {
  it('links monthly periods and closes the open one with live prices', () => {
    const pts = chain([
      { month: '2026-09', date: '2026-09-01', spy: 100, holdings: [{ t: 'A', px: 10 }, { t: 'B', px: 20 }], exit: { A: 11, B: 22 }, spyExit: 105 },
      { month: '2026-10', date: '2026-10-01', spy: 105, holdings: [{ t: 'C', px: 5 }] },
    ], { C: 5.5 }, 105);
    expect(pts.at(-1)!.model).toBeCloseTo(121);
    expect(pts.at(-1)!.spy).toBeCloseTo(105);
  });
});

import { chainWeighted } from './model';
describe('chainWeighted', () => {
  it('tracks a weighted portfolio and a 60/40 benchmark', () => {
    const pts = chainWeighted(
      [{ month: '2026-10', date: '2026-10-01', holdings: [{ t: 'A', w: 75, px: 10 }, { t: 'B', w: 25, px: 10 }], bench: { SPY: 100, AGG: 100 } }],
      { A: 12, B: 8, SPY: 110, AGG: 100 },
      { SPY: { SPY: 1 }, '60/40': { SPY: 0.6, AGG: 0.4 } },
    );
    const last = pts.at(-1)!;
    expect(last.model).toBeCloseTo(110);
    expect(last.bench.SPY).toBeCloseTo(110);
    expect(last.bench['60/40']).toBeCloseTo(106);
  });
});
