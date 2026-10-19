import { describe, expect, it } from 'vitest';
import { buildRow, passes, screen } from './screener';

const t = { ticker: 'ACME', name: 'Acme', exchange: 'NYSE', cik: 1 };

describe('screener', () => {
  it('derives ratios', () => {
    const r = buildRow(t, { revenue: 1000, revenuePrev: 800, netIncome: 100, netIncomePrev: 80, equity: 500, ltDebt: 250, shares: 100, ocf: 150, capex: 50 }, { c: 20, v: 1000 });
    expect(r.mcap).toBe(2000);
    expect(r.pe).toBe(20);
    expect(r.ps).toBe(2);
    expect(r.pb).toBe(4);
    expect(r.roe).toBe(0.2);
    expect(r.de).toBe(0.5);
    expect(r.revGrowth).toBeCloseTo(0.25, 10);
    expect(r.fcfYield).toBe(0.05);
  });
  it('treats losses and negative equity as not meaningful', () => {
    const r = buildRow(t, { revenue: 100, netIncome: -5, equity: -10, shares: 10 }, { c: 1, v: 1 });
    expect(r.pe).toBeNull();
    expect(r.pb).toBeNull();
    expect(r.roe).toBeNull();
  });
  it('filters with percent and money units', () => {
    const r = buildRow(t, { revenue: 1000, netIncome: 200, equity: 500, shares: 1e8 }, { c: 50, v: 1 });
    expect(passes(r, { field: 'netMargin', op: '>', value: 15 })).toBe(true);
    expect(passes(r, { field: 'mcap', op: '>', value: 4000 })).toBe(true); // $5B > $4,000M
    expect(passes(r, { field: 'pe', op: '<', value: 10 })).toBe(false);
  });
  it('sorts with missing values last', () => {
    const a = buildRow({ ...t, ticker: 'A' }, { revenue: 10, netIncome: 1, shares: 1 }, { c: 10, v: 1 });
    const b = buildRow({ ...t, ticker: 'B' }, { revenue: 10, netIncome: 2, shares: 1 }, { c: 10, v: 1 });
    const c = buildRow({ ...t, ticker: 'C' }, undefined, undefined);
    expect(screen([c, a, b], [], 'pe', false).map((r) => r.ticker)).toEqual(['B', 'A', 'C']);
  });
});
