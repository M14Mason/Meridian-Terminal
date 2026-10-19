// Alpaca market data adapter. Free plan = IEX exchange only (single venue, 8.1), so volume
// and anything volume-based is approximate. Base: data.alpaca.markets. Limit: 200 calls/min.
import type { Bar, NewsItem, Quote } from '../../../shared/market';
import { up, type Fetched } from '../client';

export const ALPACA_NOTE = 'IEX only';

interface ABar { t: string; o: number; h: number; l: number; c: number; v: number }
interface ASnap {
  latestTrade?: { p: number; t: string };
  dailyBar?: ABar;
  prevDailyBar?: ABar;
  minuteBar?: ABar;
}

export type Timeframe = '1Min' | '5Min' | '15Min' | '1Hour' | '1Day' | '1Week' | '1Month';

const toBar = (b: ABar): Bar => ({ t: Date.parse(b.t), o: b.o, h: b.h, l: b.l, c: b.c, v: b.v });

export function snapToQuote(symbol: string, s: ASnap): Quote {
  const price = s.latestTrade?.p ?? s.dailyBar?.c ?? NaN;
  const prev = s.prevDailyBar?.c ?? null;
  return {
    symbol,
    price,
    prevClose: prev,
    change: prev != null ? price - prev : null,
    changePct: prev ? (price / prev - 1) * 100 : null,
    open: s.dailyBar?.o ?? null,
    high: s.dailyBar?.h ?? null,
    low: s.dailyBar?.l ?? null,
    volume: s.dailyBar?.v ?? null,
    time: s.latestTrade ? Date.parse(s.latestTrade.t) : null,
    venue: 'IEX',
  };
}

/** One request for many symbols, to protect the proxy's daily request budget. */
export async function quotes(symbols: string[]): Promise<Fetched<Record<string, Quote>>> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))].filter(Boolean);
  const out: Record<string, Quote> = {};
  let fetchedAt = Date.now();
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200);
    const r = await up<Record<string, ASnap>>('alpaca', '/v2/stocks/snapshots', { symbols: chunk.join(','), feed: 'iex' });
    fetchedAt = Math.min(fetchedAt, r.fetchedAt);
    for (const [sym, s] of Object.entries(r.data ?? {})) if (s) out[sym] = snapToQuote(sym, s);
  }
  return { data: out, fetchedAt, fromCache: false };
}

export function startFor(lookbackDays: number): string {
  return new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
}

/** Bars with pagination. Adjusted for splits and dividends. */
export async function bars(symbol: string, tf: Timeframe, start: string, end?: string, maxBars = 5000, adjustment: 'all' | 'split' | 'raw' = 'all'): Promise<Fetched<Bar[]>> {
  const out: Bar[] = [];
  let token: string | undefined;
  let fetchedAt: number;
  do {
    const r = await up<{ bars: ABar[] | null; next_page_token: string | null }>(`alpaca`, `/v2/stocks/${encodeURIComponent(symbol)}/bars`, {
      timeframe: tf,
      start,
      end,
      limit: 10000,
      adjustment,
      feed: 'iex',
      page_token: token,
    });
    fetchedAt = r.fetchedAt;
    for (const b of r.data.bars ?? []) out.push(toBar(b));
    token = r.data.next_page_token ?? undefined;
  } while (token && out.length < maxBars);
  return { data: out, fetchedAt, fromCache: false };
}

/**
 * Daily bars for several symbols at once (COMP, correlation, breadth, backtests).
 * `history: true` asks for the all-exchange SIP feed ending 16 minutes ago (allowed on the free
 * plan for historical data); if refused, it falls back to IEX.
 */
export async function multiBars(symbols: string[], tf: Timeframe, start: string, history = false): Promise<Fetched<Record<string, Bar[]>> & { feed: string }> {
  if (history) {
    try {
      const r = await multiBarsFeed(symbols, tf, start, 'sip', new Date(Date.now() - 16 * 60_000).toISOString());
      return { ...r, feed: 'SIP (all exchanges)' };
    } catch {
      // fall through to IEX
    }
  }
  const r = await multiBarsFeed(symbols, tf, start, 'iex');
  return { ...r, feed: 'IEX' };
}

async function multiBarsFeed(symbols: string[], tf: Timeframe, start: string, feed: 'iex' | 'sip', end?: string): Promise<Fetched<Record<string, Bar[]>>> {
  const out: Record<string, Bar[]> = {};
  let token: string | undefined;
  let fetchedAt: number;
  let pages = 0;
  do {
    const r = await up<{ bars: Record<string, ABar[]> | null; next_page_token: string | null }>('alpaca', '/v2/stocks/bars', {
      symbols: symbols.join(','),
      timeframe: tf,
      start,
      end,
      limit: 10000,
      adjustment: 'all',
      feed,
      page_token: token,
    });
    fetchedAt = r.fetchedAt;
    for (const [s, list] of Object.entries(r.data.bars ?? {})) (out[s] ??= []).push(...list.map(toBar));
    token = r.data.next_page_token ?? undefined;
  } while (token && ++pages < 60);
  return { data: out, fetchedAt, fromCache: false };
}

interface ANews { id: number; headline: string; source: string; url: string; symbols: string[]; created_at: string }

const seen = new Map<string, number>();
/** First time this device saw a headline, for the latency badge (12.2). */
export function receivedAt(id: string): number {
  let t = seen.get(id);
  if (!t) {
    t = Date.now();
    seen.set(id, t);
  }
  return t;
}

export async function news(symbols?: string[], limit = 50): Promise<Fetched<NewsItem[]>> {
  const r = await up<{ news: ANews[] }>('alpaca', '/v1beta1/news', { symbols: symbols?.join(','), limit, sort: 'desc' });
  return {
    ...r,
    data: (r.data.news ?? []).map((n) => ({
      id: `alpaca:${n.id}`,
      headline: n.headline,
      source: n.source || 'Benzinga',
      url: n.url,
      symbols: n.symbols ?? [],
      publishedAt: Date.parse(n.created_at),
      receivedAt: receivedAt(`alpaca:${n.id}`),
      provider: 'Alpaca (Benzinga)',
    })),
  };
}

export interface Mover { symbol: string; price: number; change: number; percentChange: number }

export async function movers(top = 20) {
  return up<{ gainers: Mover[]; losers: Mover[]; last_updated: string }>('alpaca', '/v1beta1/screener/stocks/movers', { top });
}

export async function mostActives(top = 20) {
  return up<{ most_actives: { symbol: string; volume: number; trade_count: number }[]; last_updated: string }>('alpaca', '/v1beta1/screener/stocks/most-actives', { by: 'volume', top });
}
