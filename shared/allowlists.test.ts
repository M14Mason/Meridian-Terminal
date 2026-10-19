import { describe, expect, it } from 'vitest';
import { isAlpacaRequestAllowed, isRobinhoodToolAllowed, ROBINHOOD_READ_TOOLS } from './allowlists';

const a = (u: string, m = 'GET') => isAlpacaRequestAllowed(m, new URL(u));

describe('Alpaca allowlist', () => {
  it('allows market data and news', () => {
    expect(a('https://data.alpaca.markets/v2/stocks/bars?symbols=AAPL&timeframe=1Day')).toBe(true);
    expect(a('https://data.alpaca.markets/v2/stocks/AAPL/snapshot')).toBe(true);
    expect(a('https://data.alpaca.markets/v1beta1/news?symbols=AAPL')).toBe(true);
    expect(a('https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=BTC/USD')).toBe(true);
  });
  it('blocks trading hosts and account paths', () => {
    for (const u of [
      'https://api.alpaca.markets/v2/orders',
      'https://paper-api.alpaca.markets/v2/orders',
      'https://api.alpaca.markets/v2/account',
      'https://paper-api.alpaca.markets/v2/positions',
      'https://data.alpaca.markets/v2/orders',
      'https://data.alpaca.markets/v2/account',
      'https://data.alpaca.markets.evil.com/v2/stocks/bars',
      'http://data.alpaca.markets/v2/stocks/bars',
      'https://data.alpaca.markets:8443/v2/stocks/bars',
      'https://user:pw@data.alpaca.markets/v2/stocks/bars',
      'https://data.alpaca.markets/v2/stocks/../orders',
    ]) {
      expect(a(u), u).toBe(false);
    }
  });
  it('blocks non-GET methods', () => {
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(a('https://data.alpaca.markets/v2/stocks/bars', m)).toBe(false);
    }
  });
  it('limits crypto to Bitcoin', () => {
    expect(a('https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=ETH/USD')).toBe(false);
    expect(a('https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=BTC/USD,DOGE/USD')).toBe(false);
    expect(a('https://data.alpaca.markets/v1beta3/crypto/us/bars')).toBe(false);
  });
});

describe('Robinhood read allowlist', () => {
  const blocked = [
    'place_equity_order', 'place_option_order', 'place_crypto_order', 'place_advanced_order',
    'cancel_equity_order', 'cancel_option_order', 'cancel_crypto_order', 'cancel_advanced_order',
    'cancel_option_exercise', 'exercise_option', 'review_equity_order', 'review_option_order',
    'review_advanced_order', 'preview_crypto_order', 'decline_trade_approval', 'create_alert',
    'create_scan', 'create_watchlist', 'update_alert', 'update_watchlist', 'update_scan_config',
    'add_to_watchlist', 'remove_from_watchlist', 'follow_watchlist', 'unfollow_watchlist',
    'delete_alert', 'mark_alerts_read', 'set_legend_chart_settings', 'add_legend_indicator',
    'get_portfolio_and_place_order', 'GET_PORTFOLIO', 'get_portfolio ', '', 'unknown_tool',
  ];
  it.each(blocked)('blocks %s', (name) => {
    expect(isRobinhoodToolAllowed(name)).toBe(false);
  });
  it('allows every listed read tool', () => {
    for (const t of ROBINHOOD_READ_TOOLS) expect(isRobinhoodToolAllowed(t), t).toBe(true);
  });
  it('allowlist contains no mutating verbs', () => {
    for (const t of ROBINHOOD_READ_TOOLS) expect(t.startsWith('get_'), t).toBe(true);
  });
});
