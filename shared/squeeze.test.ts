import { describe, expect, it } from 'vitest';
import { squeeze } from './squeeze';

describe('squeeze', () => {
  it('ranks high days-to-cover, rising short interest and expensive borrow first', () => {
    const r = squeeze([
      { sym: 'LOW', dtc: 1, siChg: -10, shortQty: 1, adv: 1, fee: 0.3, avail: 1e6 },
      { sym: 'HOT', dtc: 9, siChg: 40, shortQty: 1, adv: 1, fee: 80, avail: 0 },
      { sym: 'MID', dtc: 5, siChg: 5, shortQty: 1, adv: 1, fee: null, avail: null },
    ]);
    expect(r.map((x) => x.sym)).toEqual(['HOT', 'MID', 'LOW']);
    expect(r[0]!.score).toBe(1);
  });
});
