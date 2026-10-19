import { describe, expect, it } from 'vitest';
import { buildUpstreamUrl, PROVIDERS } from './upstream';

const p = (id: string) => PROVIDERS[id]!;
const ok = (id: string, path: string, search = '') => {
  const u = buildUpstreamUrl(p(id), path, search);
  return Boolean(u && p(id).allow('GET', u));
};

describe('buildUpstreamUrl', () => {
  it('stays on the provider host', () => {
    expect(buildUpstreamUrl(p('alpaca'), '/v2/stocks/bars', '?symbols=AAPL')?.host).toBe('data.alpaca.markets');
    expect(buildUpstreamUrl(p('alpaca'), '//evil.com/x', '')).toBeNull();
    expect(buildUpstreamUrl(p('alpaca'), '@evil.com/x', '')).toBeNull();
    expect(buildUpstreamUrl(p('alpaca'), '/a\\b', '')).toBeNull();
  });
  it('normalized traversal still hits the allowlist', () => {
    expect(ok('alpaca', '/v2/stocks/../../v2/orders')).toBe(false);
    expect(ok('sec', '/submissions/../../etc/passwd')).toBe(false);
  });
});

describe('provider allowlists', () => {
  it('allows the documented read endpoints', () => {
    expect(ok('finnhub', '/api/v1/stock/profile2', '?symbol=AAPL')).toBe(true);
    expect(ok('sec', '/submissions/CIK0000320193.json')).toBe(true);
    expect(ok('sec', '/api/xbrl/companyfacts/CIK0000320193.json')).toBe(true);
    expect(ok('secwww', '/files/company_tickers_exchange.json')).toBe(true);
    expect(ok('fred', '/fred/series/observations', '?series_id=DGS10')).toBe(true);
    expect(ok('eia', '/v2/petroleum/pri/spt/data/')).toBe(true);
    expect(ok('massive', '/v2/aggs/ticker/AAPL/range/1/day/2024-01-01/2024-12-31')).toBe(true);
    expect(ok('usgs', '/earthquakes/feed/v1.0/summary/4.5_day.geojson')).toBe(true);
  });
  it('blocks unknown paths', () => {
    expect(ok('finnhub', '/api/v1/admin')).toBe(false);
    expect(ok('sec', '/cgi-bin/anything')).toBe(false);
    expect(ok('fred', '/fred/category')).toBe(false);
  });
  it('refuses client-supplied auth parameters', () => {
    expect(ok('fred', '/fred/series/observations', '?series_id=DGS10&api_key=stolen')).toBe(false);
    expect(ok('eia', '/v2/petroleum/pri/spt/data/', '?api_key=x')).toBe(false);
    expect(ok('massive', '/v2/aggs/ticker/AAPL/prev', '?apiKey=x')).toBe(false);
  });
  it('is GET only for every provider', () => {
    for (const prov of Object.values(PROVIDERS)) {
      const u = new URL(`https://${prov.host}/`);
      expect(prov.allow('POST', u), prov.id).toBe(false);
    }
  });
  it('injects query keys on a copy so the caller URL stays clean', async () => {
    const u = buildUpstreamUrl(p('fred'), '/fred/series/observations', '?series_id=DGS10')!;
    const target = new URL(u.toString());
    const ok2 = await p('fred').authorize(target, new Headers(), async () => 'k123');
    expect(ok2).toBe(true);
    expect(target.searchParams.get('api_key')).toBe('k123');
    expect(target.searchParams.get('file_type')).toBe('json');
    expect(u.searchParams.has('api_key')).toBe(false);
  });
  it('SEC requests need the User-Agent secret', async () => {
    const h = new Headers();
    expect(await p('sec').authorize(new URL('https://data.sec.gov/x'), h, async () => null)).toBe(false);
    expect(await p('sec').authorize(new URL('https://data.sec.gov/x'), h, async () => 'Name mail@example.com')).toBe(true);
    expect(h.get('user-agent')).toContain('mail@example.com');
  });
});
