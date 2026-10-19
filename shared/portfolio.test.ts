import { describe, expect, it } from 'vitest';
import { findAccounts, findPositions, isStale, maskId, toolJson, validSnapshot } from './portfolio';

describe('portfolio normalizer', () => {
  it('finds positions in nested tool output and masks accounts', () => {
    const json = { accounts: [{ account_number: '5RX12345678', positions: [{ symbol: 'aapl', quantity: '3.5', average_buy_price: '150.00', last_trade_price: '200' }, { symbol: 'MSFT', quantity: '0' }] }] };
    const p = findPositions(json, 'equity');
    expect(p).toEqual([{ symbol: 'AAPL', type: 'equity', qty: 3.5, avgCost: 150, price: 200, value: 700, name: null, account: '••••5678' }]);
  });
  it('reads accounts and MCP text content', () => {
    const r = { content: [{ type: 'text', text: JSON.stringify([{ account_number: '12345678', type: 'cash', portfolio_value: '1,000.50', cash: { amount: '20' } }]) }] };
    expect(findAccounts(toolJson(r))).toEqual([{ id: '••••5678', type: 'cash', value: 1000.5, cash: 20 }]);
  });
  it('rejects snapshots with full account numbers', () => {
    expect(validSnapshot({ at: 1, source: 'fallback', accounts: [{ id: '••••5678', type: 'cash', value: 1, cash: 0 }], positions: [], notes: [] })).toBe(true);
    expect(validSnapshot({ at: 1, source: 'fallback', accounts: [{ id: '12345678', type: 'cash', value: 1, cash: 0 }], positions: [], notes: [] })).toBe(false);
    expect(maskId('ABCDEFGH')).toBe('••••EFGH');
  });
  it('stale rules allow weekends', () => {
    const fri = Date.parse('2026-10-16T20:00:00Z');
    expect(isStale(fri, fri + 30 * 3600_000)).toBe(false); // Saturday
    expect(isStale(fri, Date.parse('2026-10-20T20:00:00Z'))).toBe(true); // Tuesday
  });
});
