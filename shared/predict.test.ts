import { describe, expect, it } from 'vitest';
import { brier, calibration, priceSetup, resolvePrice, score, type Pred } from './predict';

describe('predict', () => {
  it('builds a range around the last price and a base rate', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 100 * Math.exp(0.001 * i + 0.01 * Math.sin(i)));
    const s = priceSetup(closes, 5);
    expect(s.low).toBeLessThan(s.last);
    expect(s.high).toBeGreaterThan(s.last);
    expect(s.pBase).toBeGreaterThan(0.5);
    expect(s.baseN).toBe(195);
  });
  it('scores with Brier and hit rate', () => {
    expect(brier(0.7, true)).toBeCloseTo(0.09);
    const mk = (pAi: number, up: boolean): Pred => ({ kind: 'price', sym: 'X', horizon: '1d', days: 1, made: '2026-01-01', at: 0, start: 1, low: 0.9, high: 1.1, pBase: 0.5, pAi, resolved: { at: '2026-01-02', end: up ? 1.05 : 0.95, up, inRange: true } });
    const s = score([mk(0.8, true), mk(0.3, false), mk(0.6, false)]);
    expect(s.n).toBe(3);
    expect(s.hitAi).toBeCloseTo(2 / 3);
    expect(s.brierBase).toBeCloseTo(0.25);
    expect(s.coverage).toBe(1);
    expect(calibration([mk(0.8, true)])[4]!.observed).toBe(1);
  });
  it('resolves after the horizon passes', () => {
    const p: Pred = { kind: 'price', sym: 'X', horizon: '1w', days: 2, made: '2026-01-05', at: 0, start: 10, low: 9, high: 11, pBase: 0.5, pAi: 0.6 };
    const day = (d: string, c: number) => ({ t: Date.parse(`${d}T21:00:00Z`), c });
    expect(resolvePrice(p, [day('2026-01-05', 10), day('2026-01-06', 10.5)])).toBeNull();
    expect(resolvePrice(p, [day('2026-01-05', 10), day('2026-01-06', 10.5), day('2026-01-07', 11.5)])).toEqual({ at: '2026-01-07', end: 11.5, up: true, inRange: false });
  });
});
