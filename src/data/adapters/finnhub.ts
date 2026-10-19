// Finnhub adapter. Free tier: 60 calls/min. Fundamentals, estimates, calendars, news.
import type { NewsItem } from '../../../shared/market';
import { up, type Fetched } from '../client';
import { receivedAt } from './alpaca';

const DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);

export interface FhProfile { name: string; ticker: string; exchange: string; finnhubIndustry: string; ipo: string; marketCapitalization: number; shareOutstanding: number; weburl: string; logo: string; country: string; currency: string }
export const profile = (s: string) => up<FhProfile>('finnhub', '/api/v1/stock/profile2', { symbol: s }, { maxAgeMs: DAY });
export const metrics = (s: string) => up<{ metric: Record<string, number | string | null> }>('finnhub', '/api/v1/stock/metric', { symbol: s, metric: 'all' }, { maxAgeMs: 6 * 3600_000 });
export const peers = (s: string) => up<string[]>('finnhub', '/api/v1/stock/peers', { symbol: s }, { maxAgeMs: DAY });
export interface Rec { period: string; strongBuy: number; buy: number; hold: number; sell: number; strongSell: number }
export const recommendations = (s: string) => up<Rec[]>('finnhub', '/api/v1/stock/recommendation', { symbol: s }, { maxAgeMs: 6 * 3600_000 });
export interface Surprise { period: string; actual: number | null; estimate: number | null; surprise: number | null; surprisePercent: number | null }
export const earningsSurprises = (s: string) => up<Surprise[]>('finnhub', '/api/v1/stock/earnings', { symbol: s }, { maxAgeMs: 6 * 3600_000 });
export interface Insider { name: string; share: number; change: number; filingDate: string; transactionDate: string; transactionCode: string; transactionPrice: number }
export const insiders = (s: string) => up<{ data: Insider[] }>('finnhub', '/api/v1/stock/insider-transactions', { symbol: s }, { maxAgeMs: 3600_000 });

export interface EarningsRow { date: string; symbol: string; epsEstimate: number | null; epsActual: number | null; revenueEstimate: number | null; revenueActual: number | null; hour: string; quarter: number; year: number }
export function earningsCalendar(days = 14) {
  const from = new Date();
  return up<{ earningsCalendar: EarningsRow[] }>('finnhub', '/api/v1/calendar/earnings', { from: iso(from), to: iso(new Date(Date.now() + days * DAY)) }, { maxAgeMs: 3600_000 });
}
export interface IpoRow { date: string; exchange: string; name: string; numberOfShares: number | null; price: string | null; status: string; symbol: string; totalSharesValue: number | null }
export function ipoCalendar(days = 30) {
  return up<{ ipoCalendar: IpoRow[] }>('finnhub', '/api/v1/calendar/ipo', { from: iso(new Date(Date.now() - 7 * DAY)), to: iso(new Date(Date.now() + days * DAY)) }, { maxAgeMs: 3600_000 });
}

interface FhNews { id: number; headline: string; source: string; url: string; related: string; datetime: number; category: string }
const toNews = (n: FhNews): NewsItem => ({
  id: `finnhub:${n.id}`,
  headline: n.headline,
  source: n.source,
  url: n.url,
  symbols: n.related ? n.related.split(',').filter(Boolean) : [],
  publishedAt: n.datetime * 1000,
  receivedAt: receivedAt(`finnhub:${n.id}`),
  provider: 'Finnhub',
});

export async function companyNews(s: string, days = 7): Promise<Fetched<NewsItem[]>> {
  const r = await up<FhNews[]>('finnhub', '/api/v1/company-news', { symbol: s, from: iso(new Date(Date.now() - days * DAY)), to: iso(new Date()) });
  return { ...r, data: (r.data ?? []).map(toNews) };
}

export async function generalNews(category = 'general'): Promise<Fetched<NewsItem[]>> {
  const r = await up<FhNews[]>('finnhub', '/api/v1/news', { category });
  return { ...r, data: (r.data ?? []).map(toNews) };
}
