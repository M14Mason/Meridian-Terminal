import { describe, expect, it } from 'vitest';
import { findClusters, parseForm4, type InsiderBuy } from './form4';

const doc = (code: string, ad = 'A', price = '10.5') => `<SEC-DOCUMENT><XML><ownershipDocument>
<issuer><issuerCik>0000012345</issuerCik><issuerName>ACME &amp; CO</issuerName><issuerTradingSymbol>acme</issuerTradingSymbol></issuer>
<reportingOwner><reportingOwnerId><rptOwnerName>DOE JANE</rptOwnerName></reportingOwnerId><reportingOwnerRelationship><isDirector>1</isDirector><isOfficer>1</isOfficer><officerTitle>CFO</officerTitle></reportingOwnerRelationship></reportingOwner>
<nonDerivativeTable><nonDerivativeTransaction><transactionDate><value>2026-10-01</value></transactionDate><transactionCoding><transactionCode>${code}</transactionCode></transactionCoding>
<transactionAmounts><transactionShares><value>1000</value></transactionShares><transactionPricePerShare><value>${price}</value></transactionPricePerShare><transactionAcquiredDisposedCode><value>${ad}</value></transactionAcquiredDisposedCode></transactionAmounts></nonDerivativeTransaction></nonDerivativeTable>
</ownershipDocument></XML></SEC-DOCUMENT>`;

describe('form 4', () => {
  it('keeps open-market purchases only', () => {
    const b = parseForm4(doc('P'), 'acc1');
    expect(b).toHaveLength(1);
    expect(b[0]).toMatchObject({ issuerCik: 12345, issuer: 'ACME & CO', ticker: 'ACME', owner: 'DOE JANE', role: 'Director, CFO', shares: 1000, price: 10.5, value: 10500, date: '2026-10-01' });
    expect(parseForm4(doc('M'), 'a')).toHaveLength(0);
    expect(parseForm4(doc('S', 'D'), 'a')).toHaveLength(0);
    expect(parseForm4(doc('P', 'A', '0'), 'a')).toHaveLength(0);
  });
  it('finds clusters of 3+ insiders within 10 days', () => {
    const mk = (owner: string, date: string, ticker = 'ACME'): InsiderBuy => ({ acc: owner, issuerCik: 1, issuer: 'Acme', ticker, owner, role: 'Director', date, shares: 1, price: 100, value: 100 });
    const c = findClusters([mk('A', '2026-10-01'), mk('B', '2026-10-05'), mk('C', '2026-10-09'), mk('A', '2026-10-09'), mk('X', '2026-10-01', 'LONE'), mk('Y', '2026-09-01', 'SPREAD'), mk('Z', '2026-10-01', 'SPREAD'), mk('W', '2026-11-01', 'SPREAD')]);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ ticker: 'ACME', insiders: ['A', 'B', 'C'], value: 400, first: '2026-10-01', last: '2026-10-09' });
  });
});
