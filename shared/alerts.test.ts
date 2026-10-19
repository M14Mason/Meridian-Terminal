import { describe, expect, it } from 'vitest';
import { checkQuote, coolingDown, DEFAULT_SETTINGS, inQuietHours, lineAt, validRule, type Rule } from './alerts';

const q = (price: number, extra: Partial<Parameters<typeof checkQuote>[1]> = {}) => ({ price, prevClose: 100, volume: null, t: 1000, ...extra });
const r = (o: Partial<Rule>): Rule => ({ type: 'price_above', sym: 'AAPL', value: 110, enabled: true, email: true, ...o });

describe('alerts', () => {
  it('fires price levels only on the crossing', () => {
    expect(checkQuote(r({}), q(111), 109)).toMatch(/above 110/);
    expect(checkQuote(r({}), q(112), 111)).toBeNull();
    expect(checkQuote(r({ type: 'price_below', value: 95 }), q(94), null)).toMatch(/below 95/);
  });
  it('handles percent moves, volume and RSI', () => {
    expect(checkQuote(r({ type: 'pct_move', value: 3 }), q(96.5), null)).toMatch(/-3.50%/);
    expect(checkQuote(r({ type: 'volume_spike', value: 2 }), q(100, { volume: 3e6, avgVolume: 1e6 }), null)).toMatch(/3.0x/);
    expect(checkQuote(r({ type: 'rsi_below', value: 30 }), q(100, { rsi: 25 }), null)).toMatch(/RSI/);
  });
  it('detects chart line crossings on sloped lines', () => {
    const line = { a: { t: 0, p: 100 }, b: { t: 1000, p: 110 } };
    expect(lineAt(line, 500)).toBe(105);
    expect(checkQuote(r({ type: 'line_cross', line }), q(111, { t: 1000 }), 108)).toMatch(/upward/);
    expect(checkQuote(r({ type: 'line_cross', line }), q(109, { t: 1000 }), 108)).toBeNull();
  });
  it('applies quiet hours across midnight and cooldowns', () => {
    const s = { ...DEFAULT_SETTINGS, quietStart: 22 * 60, quietEnd: 7 * 60 };
    expect(inQuietHours(s, Date.parse('2026-10-20T03:00:00Z'))).toBe(true); // 23:00 New York
    expect(inQuietHours(s, Date.parse('2026-10-20T16:00:00Z'))).toBe(false); // 12:00 New York
    expect(coolingDown(r({}), 0, 60 * 60_000)).toBe(true);
    expect(coolingDown(r({}), 0, 5 * 60 * 60_000)).toBe(false);
  });
  it('validates rules', () => {
    expect(validRule(r({}))).toBe(true);
    expect(validRule(r({ sym: 'aapl' }))).toBe(false);
    expect(validRule({ type: 'news', keyword: 'tariff', enabled: true, email: false })).toBe(true);
    expect(validRule({ type: 'place_order', enabled: true })).toBe(false);
  });
});
