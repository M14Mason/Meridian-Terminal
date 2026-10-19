// Massive (formerly Polygon) free Stocks Basic: 5 calls/min, end of day. Used for dividends and splits.
import { up, type Fetched } from '../client';

export interface Dividend { ticker: string; cash_amount: number; ex_dividend_date: string; pay_date: string; declaration_date: string; frequency: number }

export async function dividends(params: Record<string, string | number>): Promise<Fetched<Dividend[]>> {
  const r = await up<{ results?: Dividend[] }>('massive', '/v3/reference/dividends', params, { maxAgeMs: 6 * 3600_000 });
  return { ...r, data: r.data.results ?? [] };
}

export const upcomingDividends = () => dividends({ 'ex_dividend_date.gte': new Date().toISOString().slice(0, 10), order: 'asc', sort: 'ex_dividend_date', limit: 1000 });
export const tickerDividends = (t: string) => dividends({ ticker: t, order: 'desc', limit: 40 });
