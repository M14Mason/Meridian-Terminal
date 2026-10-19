// Normalized shapes every adapter returns (5.4). UI code only sees these.
export type { Bar } from './indicators';

export interface Quote {
  symbol: string;
  price: number;
  prevClose: number | null;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  /** Last trade time, ms. */
  time: number | null;
  /** Honesty label: where the price comes from. */
  venue: string;
}

export interface NewsItem {
  id: string;
  headline: string;
  source: string;
  url: string;
  symbols: string[];
  publishedAt: number;
  /** When this app first saw it (latency badge, 12.2). */
  receivedAt: number;
  sentiment?: number | null;
  provider: string;
}

export interface TickerInfo {
  ticker: string;
  cik: number;
  name: string;
  exchange: string;
}

export interface Filing {
  accession: string;
  form: string;
  filed: string;
  reportDate: string;
  description: string;
  url: string;
  /** 8-K item numbers, for example "2.02,9.01" (empty for other forms). */
  items: string;
  primaryDoc: string;
}

export interface CompanyProfile {
  ticker: string;
  cik: number;
  name: string;
  sic: string;
  sicDescription: string;
  exchanges: string[];
  fiscalYearEnd: string;
  stateOfIncorporation: string;
  address: string;
  phone: string;
  website: string;
  filings: Filing[];
}

export const pct = (a: number, b: number) => (b ? a / b - 1 : NaN);
