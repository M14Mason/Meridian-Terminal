import { describe, expect, it } from 'vitest';
import { goodness, heatColor, percentile, squarify } from './heat';

describe('heat', () => {
  it('percentile', () => {
    expect(percentile(5, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(0.5);
    expect(percentile(11, [1, 2, 3])).toBe(1);
    expect(Number.isNaN(percentile(1, []))).toBe(true);
  });
  it('goodness flips for metrics where low is good', () => {
    expect(goodness(1, 'high')).toBe(1);
    expect(goodness(1, 'low')).toBe(-1);
    expect(goodness(0.5, 'high')).toBe(0);
  });
  it('colors', () => {
    expect(heatColor(1)).toBe('rgb(0,140,100)');
    expect(heatColor(-1)).toBe('rgb(180,40,36)');
    expect(heatColor(0)).toBe('rgb(20,20,20)');
    expect(heatColor(NaN)).toBe('rgb(26,26,26)');
  });
  it('squarified treemap fills the box with area proportional to value', () => {
    const r = squarify([6, 6, 4, 3, 2, 2, 1].map((v, i) => ({ value: v, data: i })), { x: 0, y: 0, w: 6, h: 4 });
    expect(r).toHaveLength(7);
    const area = r.reduce((s, x) => s + x.w * x.h, 0);
    expect(area).toBeCloseTo(24, 6);
    for (const x of r) expect(x.w * x.h).toBeCloseTo(x.value, 6);
    for (const x of r) {
      expect(x.x).toBeGreaterThanOrEqual(-1e-9);
      expect(x.x + x.w).toBeLessThanOrEqual(6 + 1e-9);
      expect(x.y + x.h).toBeLessThanOrEqual(4 + 1e-9);
    }
  });
});
