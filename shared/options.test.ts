import { describe, expect, it } from 'vitest';
import { bs, breakevens, cdf, expectedMove, impliedVol, ivRank, maxPain, payoff, sabrVol } from './options';

describe('options', () => {
  it('normal CDF', () => {
    expect(cdf(0)).toBeCloseTo(0.5, 7);
    expect(cdf(1.96)).toBeCloseTo(0.9750021, 5);
  });
  it('Black-Scholes textbook values (S=K=100, T=1, r=5%, vol=20%)', () => {
    // Hull, Options Futures and Other Derivatives: call 10.4506, put 5.5735.
    const c = bs({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: 'call' });
    const p = bs({ S: 100, K: 100, T: 1, r: 0.05, sigma: 0.2, type: 'put' });
    expect(c.price).toBeCloseTo(10.4506, 3);
    expect(p.price).toBeCloseTo(5.5735, 3);
    expect(c.delta).toBeCloseTo(0.6368, 3);
    expect(c.price - p.price).toBeCloseTo(100 - 100 * Math.exp(-0.05), 6); // put-call parity
  });
  it('implied vol inverts the price', () => {
    const price = bs({ S: 50, K: 55, T: 0.5, r: 0.03, sigma: 0.35, type: 'call' }).price;
    expect(impliedVol(price, { S: 50, K: 55, T: 0.5, r: 0.03, type: 'call' })).toBeCloseTo(0.35, 4);
  });
  it('payoff and breakevens of a bull call spread', () => {
    const legs = [{ type: 'call' as const, strike: 100, qty: 1, premium: 5 }, { type: 'call' as const, strike: 110, qty: -1, premium: 2 }];
    expect(payoff(legs, 90)).toBe(-3);
    expect(payoff(legs, 120)).toBe(7);
    expect(breakevens(legs, 80, 130)).toEqual([103]);
  });
  it('expected move, max pain, IV rank', () => {
    expect(expectedMove(100, 0.365, 365)).toBeCloseTo(36.5, 6);
    expect(maxPain([{ strike: 90, callOi: 100, putOi: 0 }, { strike: 100, callOi: 50, putOi: 50 }, { strike: 110, callOi: 0, putOi: 100 }])).toBe(100);
    expect(ivRank(0.3, [0.2, 0.4]).rank).toBeCloseTo(0.5, 10);
  });
  it('SABR reduces to flat vol when nu=0 and beta=1', () => {
    expect(sabrVol(100, 110, 1, 0.2, 1, 0, 0)).toBeCloseTo(0.2, 6);
    expect(sabrVol(100, 100, 1, 0.2, 1, 0, 0)).toBeCloseTo(0.2, 6);
    // Negative rho skews: lower strikes get higher vol.
    expect(sabrVol(100, 90, 1, 0.2, 1, -0.5, 0.5)).toBeGreaterThan(sabrVol(100, 110, 1, 0.2, 1, -0.5, 0.5));
  });
});
