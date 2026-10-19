import { describe, expect, it } from 'vitest';
import { alignCloses, rebase } from './align';

const b = (d: string, c: number) => ({ t: Date.parse(d), o: c, h: c, l: c, c, v: 0 });

describe('alignCloses', () => {
  it('keeps only common dates', () => {
    const r = alignCloses([[b('2024-01-02', 1), b('2024-01-03', 2), b('2024-01-04', 3)], [b('2024-01-03', 20), b('2024-01-04', 30), b('2024-01-05', 40)]]);
    expect(r.dates).toEqual(['2024-01-03', '2024-01-04']);
    expect(r.closes).toEqual([[2, 3], [20, 30]]);
  });
  it('rebases to 100', () => {
    expect(rebase([50, 75])).toEqual([100, 150]);
  });
});
