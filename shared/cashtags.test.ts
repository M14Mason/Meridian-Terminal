import { describe, expect, it } from 'vitest';
import { cashtags } from './cashtags';

describe('cashtags', () => {
  it('finds uppercase cashtags only', () => {
    expect(cashtags('Long $NVDA and $brk, $100 calls, $BRK.B, ($TSLA) $NVDA x$AMD')).toEqual(['NVDA', 'BRK.B', 'TSLA']);
  });
});
