import { describe, expect, it } from 'vitest';
import { atmTerm, parseOcc } from './options';

describe('options adapter', () => {
  it('parses OCC symbols', () => {
    expect(parseOcc('AAPL261120C00250000')).toEqual({ root: 'AAPL', expiry: '2026-11-20', type: 'call', strike: 250 });
    expect(parseOcc('SPY261120P00512500')).toMatchObject({ type: 'put', strike: 512.5 });
    expect(parseOcc('BAD')).toBeNull();
  });
  it('builds an ATM term structure', () => {
    const row = (expiry: string, strike: number, iv: number) => ({ symbol: '', expiry, type: 'call' as const, strike, bid: 1, ask: 1, last: 1, volume: 0, iv, delta: 0, gamma: 0, theta: 0, vega: 0 });
    const t = atmTerm([row('2030-01-17', 95, 0.3), row('2030-01-17', 100, 0.2), row('2030-03-21', 100, 0.25)], 101);
    expect(t.map((x) => [x.expiry, x.strike, x.iv])).toEqual([['2030-01-17', 100, 0.2], ['2030-03-21', 100, 0.25]]);
  });
});
