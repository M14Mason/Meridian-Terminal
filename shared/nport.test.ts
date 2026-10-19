import { describe, expect, it } from 'vitest';
import { overlap, parseNport } from './nport';

const xml = `<genInfo><seriesId>S000004310</seriesId><repPdDate>2026-06-30</repPdDate></genInfo><fundInfo><netAssets>1000.5</netAssets></fundInfo>
<invstOrSec><name>Brown &amp; Brown, Inc.</name><title>Brown</title><cusip>115236101</cusip><identifiers><isin value="US1152361010"/></identifiers><balance>10.0</balance><units>NS</units><valUSD>200.0</valUSD><pctVal>0.2</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>
<invstOrSec><name>CBRE</name><title>CBRE A</title><cusip>12504L109</cusip><identifiers><isin value="US12504L1098"/></identifiers><balance>5</balance><units>NS</units><valUSD>500</valUSD><pctVal>0.5</pctVal><assetCat>EC</assetCat><invCountry>US</invCountry></invstOrSec>`;

describe('parseNport', () => {
  it('reads header and holdings sorted by value', () => {
    const n = parseNport(xml);
    expect(n.series).toBe('S000004310');
    expect(n.period).toBe('2026-06-30');
    expect(n.netAssets).toBe(1000.5);
    expect(n.holdings.map((h) => h.name)).toEqual(['CBRE', 'Brown & Brown, Inc.']);
    expect(n.holdings[1]!.isin).toBe('US1152361010');
  });
  it('computes weight overlap', () => {
    const a = parseNport(xml).holdings;
    const b = a.map((h) => ({ ...h, pct: h.pct / 2 }));
    expect(overlap(a, b).pct).toBeCloseTo(0.35);
  });
});
