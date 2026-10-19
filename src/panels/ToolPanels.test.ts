import { describe, expect, it } from 'vitest';
import { parseIndex } from './ToolPanels';

describe('parseIndex', () => {
  it('splits the remaining weight across tickers without weights', () => {
    expect(parseIndex('aapl 50, msft, nvda')).toEqual([{ t: 'AAPL', w: 50 }, { t: 'MSFT', w: 25 }, { t: 'NVDA', w: 25 }]);
  });
  it('ignores junk characters', () => {
    expect(parseIndex('BRK.B 10;$X 5')).toEqual([{ t: 'BRK.B', w: 10 }, { t: 'X', w: 5 }]);
  });
});
