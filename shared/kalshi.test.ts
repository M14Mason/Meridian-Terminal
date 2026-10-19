import { describe, expect, it } from 'vitest';
import { chanceOf, matchEvent, normEvents, normMarket, normSearch } from './kalshi';

describe('kalshi', () => {
  it('parses the new dollar and fixed-point string fields', () => {
    const m = normMarket({ ticker: 'KXELONMARS-99', yes_sub_title: 'Mars', yes_bid_dollars: '0.1000', yes_ask_dollars: '0.1200', last_price_dollars: '0.1000', volume_fp: '122944.64', volume_24h_fp: '2.50', open_interest_fp: '500.00', close_time: '2099-08-01T04:59:00Z' });
    expect(m).toMatchObject({ label: 'Mars', bid: 10, ask: 12, last: 10, vol: 122944.64, vol24: 2.5, oi: 500, chance: 11 });
  });
  it('still reads legacy integer cents', () => {
    expect(normMarket({ ticker: 'A', yes_bid: 46, yes_ask: 53, last_price: 46, volume: 436 })).toMatchObject({ bid: 46, ask: 53, last: 46, vol: 436, chance: 49.5 });
  });
  it('chance falls back to last trade when the book is wide or one-sided', () => {
    expect(chanceOf(5, 60, 30)).toBe(30);
    expect(chanceOf(0, 0, 0)).toBeNull();
    expect(chanceOf(0, 4, null)).toBe(4);
    expect(chanceOf(0, 100, 0)).toBeNull();
  });
  it('drops settled markets and sorts by chance', () => {
    const ev = normEvents({ events: [{ event_ticker: 'E', title: 'T', category: 'Economics', markets: [{ ticker: 'a', last_price_dollars: '0.2' }, { ticker: 'b', last_price_dollars: '0.7' }, { ticker: 'c', result: 'yes', last_price_dollars: '0.99' }] }] });
    expect(ev[0]!.markets.map((m) => m.ticker)).toEqual(['b', 'a']);
  });
  it('normalizes search results and filters by text', () => {
    const ev = normSearch({ current_page: [{ event_ticker: 'KXNVDA-1', event_title: 'NVIDIA call', category: 'Mentions', markets: [{ ticker: 'KXNVDA-1-T', yes_subtitle: 'Taiwan', yes_bid_dollars: '0.46', yes_ask_dollars: '0.53', result: '' }] }] });
    expect(ev[0]!.markets[0]).toMatchObject({ label: 'Taiwan', chance: 49.5 });
    expect(matchEvent(ev[0]!, 'taiwan')).toBe(true);
    expect(matchEvent(ev[0]!, 'tesla')).toBe(false);
  });
});
