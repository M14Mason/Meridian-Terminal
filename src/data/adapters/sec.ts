// SEC EDGAR adapter. Free, no key, max 10 requests/second, declared User-Agent (set in the proxy).
import type { CompanyProfile, Filing, TickerInfo } from '../../../shared/market';
import { up, type Fetched } from '../client';

const DAY = 86_400_000;

export const cik10 = (cik: number) => String(cik).padStart(10, '0');

let tickerP: Promise<TickerInfo[]> | null = null;

/** Every SEC-registered ticker with exchange (about 10,000 rows). Cached for a day. */
export function tickers(): Promise<TickerInfo[]> {
  tickerP ??= up<{ fields: string[]; data: [number, string, string, string][] }>('secwww', '/files/company_tickers_exchange.json', undefined, {
    maxAgeMs: DAY,
    priority: 2,
  })
    .then((r) => r.data.data.map(([cik, name, ticker, exchange]) => ({ cik, name, ticker: ticker.toUpperCase(), exchange: exchange ?? '' })))
    .catch((e) => {
      tickerP = null;
      throw e;
    });
  return tickerP;
}

export async function lookup(ticker: string): Promise<TickerInfo | undefined> {
  const t = ticker.toUpperCase();
  return (await tickers()).find((x) => x.ticker === t || x.ticker === t.replace('.', '-'));
}

interface Submissions {
  cik: string;
  name: string;
  sic: string;
  sicDescription: string;
  tickers: string[];
  exchanges: string[];
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  website: string;
  phone: string;
  addresses: { business: { street1: string; city: string; stateOrCountry: string; zipCode: string } };
  filings: { recent: { accessionNumber: string[]; form: string[]; filingDate: string[]; reportDate: string[]; primaryDocument: string[]; primaryDocDescription: string[]; items?: string[] } };
}

export function filingUrl(cik: number, accession: string, doc: string): string {
  return `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}/${doc}`;
}

export async function profile(ticker: string): Promise<Fetched<CompanyProfile>> {
  const info = await lookup(ticker);
  if (!info) throw new Error(`${ticker} not found in SEC ticker list`);
  const r = await up<Submissions>('sec', `/submissions/CIK${cik10(info.cik)}.json`, undefined, { maxAgeMs: 10 * 60_000 });
  const s = r.data;
  const rec = s.filings.recent;
  const filings: Filing[] = rec.accessionNumber.map((a, i) => ({
    accession: a,
    form: rec.form[i]!,
    filed: rec.filingDate[i]!,
    reportDate: rec.reportDate[i] ?? '',
    description: rec.primaryDocDescription[i] ?? '',
    url: filingUrl(info.cik, a, rec.primaryDocument[i] ?? ''),
    items: rec.items?.[i] ?? '',
    primaryDoc: rec.primaryDocument[i] ?? '',
  }));
  const b = s.addresses?.business;
  return {
    ...r,
    data: {
      ticker: info.ticker,
      cik: info.cik,
      name: s.name,
      sic: s.sic,
      sicDescription: s.sicDescription,
      exchanges: s.exchanges ?? [],
      fiscalYearEnd: s.fiscalYearEnd,
      stateOfIncorporation: s.stateOfIncorporation,
      address: b ? `${b.street1}, ${b.city}, ${b.stateOrCountry} ${b.zipCode}` : '',
      phone: s.phone,
      website: s.website,
      filings,
    },
  };
}

export interface FactPoint { end: string; val: number; fy: number; fp: string; form: string; filed: string; frame?: string; start?: string }
export interface CompanyFacts { cik: number; entityName: string; facts: Record<string, Record<string, { label: string; description: string; units: Record<string, FactPoint[]> }>> }

export async function companyFacts(ticker: string): Promise<Fetched<CompanyFacts>> {
  const info = await lookup(ticker);
  if (!info) throw new Error(`${ticker} not found in SEC ticker list`);
  return up<CompanyFacts>('sec', `/api/xbrl/companyfacts/CIK${cik10(info.cik)}.json`, undefined, { maxAgeMs: 6 * 3600_000 });
}
