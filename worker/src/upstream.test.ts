import { describe, expect, it } from 'vitest';
import { buildUpstreamUrl, PROVIDERS } from './upstream';

const alpaca = PROVIDERS.alpaca!;

describe('buildUpstreamUrl', () => {
  it('stays on the provider host', () => {
    expect(buildUpstreamUrl(alpaca, '/v2/stocks/bars', '?symbols=AAPL')?.host).toBe('data.alpaca.markets');
    expect(buildUpstreamUrl(alpaca, '//evil.com/x', '')).toBeNull();
    expect(buildUpstreamUrl(alpaca, '@evil.com/x', '')).toBeNull();
    expect(buildUpstreamUrl(alpaca, '/a\\b', '')).toBeNull();
  });
  it('normalized traversal still hits the allowlist', () => {
    const u = buildUpstreamUrl(alpaca, '/v2/stocks/../../v2/orders', '');
    expect(u && alpaca.allow('GET', u)).toBe(false);
  });
});
