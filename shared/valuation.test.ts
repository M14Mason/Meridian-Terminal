import { describe, expect, it } from 'vitest';
import { codeValuation } from './valuation';

const base = { price: 100, shares: 1e9, fcf: 5e9, revenue: 50e9, revenuePrev: 45e9, netIncome: 5e9, netCash: 0, debt: 10e9, beta: 1, rf: 4, peerPE: 20, peerPS: 2 };

describe('codeValuation', () => {
  it('builds a range from DCF and peer multiples', () => {
    const v = codeValuation(base);
    expect(v.methods.map((m) => m.name)).toEqual(['DCF (base)', 'DCF (discount +1pt)', 'DCF (discount -1pt)', 'Peer median P/E', 'Peer median P/S']);
    expect(v.methods.find((m) => m.name === 'Peer median P/E')!.perShare).toBe(100);
    expect(v.low!).toBeLessThanOrEqual(v.high!);
    expect(['undervalued', 'fairly valued', 'overvalued']).toContain(v.verdict);
  });
  it('is unclear without enough methods', () => {
    expect(codeValuation({ ...base, fcf: -1, peerPE: null, peerPS: null }).verdict).toBe('unclear');
  });
  it('flags a price far above every method as overvalued', () => {
    expect(codeValuation({ ...base, price: 1000 }).verdict).toBe('overvalued');
  });
});
