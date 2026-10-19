import { describe, expect, it } from 'vitest';
import { compare, makeTickerMatcher, normName, parseInfoTable } from './thirteenf';

const XML = `<?xml version="1.0"?><ns1:informationTable xmlns:ns1="http://www.sec.gov/edgar/document/thirteenf/informationtable">
<ns1:infoTable><ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>037833100</ns1:cusip><ns1:value>1000</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>10</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt></ns1:infoTable>
<ns1:infoTable><ns1:nameOfIssuer>APPLE INC</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>037833100</ns1:cusip><ns1:value>500</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>5</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt></ns1:infoTable>
<ns1:infoTable><ns1:nameOfIssuer>BANK AMER CORP</ns1:nameOfIssuer><ns1:titleOfClass>COM</ns1:titleOfClass><ns1:cusip>060505104</ns1:cusip><ns1:value>300</ns1:value><ns1:shrsOrPrnAmt><ns1:sshPrnamt>30</ns1:sshPrnamt><ns1:sshPrnamtType>SH</ns1:sshPrnamtType></ns1:shrsOrPrnAmt><ns1:putCall>Put</ns1:putCall></ns1:infoTable>
</ns1:informationTable>`;

describe('13F', () => {
  it('parses namespaced XML and aggregates sub-manager lines', () => {
    const h = parseInfoTable(XML);
    expect(h).toHaveLength(2);
    expect(h[0]).toMatchObject({ cusip: '037833100', value: 1500, shares: 15, putCall: '' });
    expect(h[1]).toMatchObject({ putCall: 'Put', value: 300 });
  });
  it('compares quarters', () => {
    const prev = [{ cusip: 'A', issuer: 'A', cls: '', value: 100, shares: 10, shType: 'SH', putCall: '' as const }, { cusip: 'X', issuer: 'X', cls: '', value: 50, shares: 5, shType: 'SH', putCall: '' as const }];
    const cur = [{ cusip: 'A', issuer: 'A', cls: '', value: 300, shares: 20, shType: 'SH', putCall: '' as const }, { cusip: 'B', issuer: 'B', cls: '', value: 100, shares: 1, shType: 'SH', putCall: '' as const }];
    const c = compare(cur, prev);
    expect(c.total).toBe(400);
    expect(c.rows[0]).toMatchObject({ change: 'ADD', sharesChangePct: 100, weight: 0.75 });
    expect(c.rows[1]!.change).toBe('NEW');
    expect(c.exited.map((e) => e.cusip)).toEqual(['X']);
  });
  it('matches tickers by normalized name and class', () => {
    expect(normName('Apple Inc.')).toBe('APPLE');
    expect(normName("MOODY'S CORP /DE/")).toBe('MOODYS');
    const m = makeTickerMatcher([
      { ticker: 'AAPL', name: 'Apple Inc.' },
      { ticker: 'BRK-A', name: 'BERKSHIRE HATHAWAY INC' },
      { ticker: 'BRK-B', name: 'BERKSHIRE HATHAWAY INC' },
    ]);
    expect(m('APPLE INC', 'COM')).toBe('AAPL');
    expect(m('BERKSHIRE HATHAWAY INC DEL', 'CL B NEW')).toBe('BRK-B');
    expect(m('UNKNOWN CO', 'COM')).toBeNull();
    const m2 = makeTickerMatcher([
      { ticker: 'BAC', name: 'BANK OF AMERICA CORP /DE/' },
      { ticker: 'OXY', name: 'OCCIDENTAL PETROLEUM CORP /DE/' },
      { ticker: 'MCO', name: "MOODY'S CORP /DE/" },
      { ticker: 'SIRI', name: 'Sirius XM Holdings Inc.' },
      { ticker: 'COF', name: 'CAPITAL ONE FINANCIAL CORP' },
      { ticker: 'LPX', name: 'LOUISIANA-PACIFIC CORP' },
      { ticker: 'VRSN', name: 'VERISIGN INC/CA' },
    ]);
    expect(m2('BANK AMER CORP', 'COM')).toBe('BAC');
    expect(m2('OCCIDENTAL PETE CORP', 'COM')).toBe('OXY');
    expect(m2('MOODYS CORP', 'COM')).toBe('MCO');
    expect(m2('SIRIUSXM HOLDINGS INC', 'COM')).toBe('SIRI');
    expect(m2('CAPITAL ONE FINL CORP', 'COM')).toBe('COF');
    expect(m2('LOUISIANA PAC CORP', 'COM')).toBe('LPX');
    expect(m2('VERISIGN INC', 'COM')).toBe('VRSN');
  });
});
