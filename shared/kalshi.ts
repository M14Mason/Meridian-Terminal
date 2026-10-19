// Kalshi prediction markets. Kalshi moved prices to dollar strings ("0.4600") and volumes to fixed-point strings
// ("122944.64"); the old integer cent fields (yes_bid, last_price, volume) are gone from /trade-api/v2. The site
// search (/v1/search/series) still sends both. This normalizes either shape to cents (0 to 100).

export interface KMarket {
  ticker: string;
  label: string;
  bid: number | null;
  ask: number | null;
  last: number | null;
  prev: number | null;
  vol: number | null;
  vol24: number | null;
  oi: number | null;
  close: string | null;
  /** Market-implied chance the YES side settles true, in percent. */
  chance: number | null;
}

type Raw = Record<string, unknown>;

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};
/** Cents from "<name>_dollars" (preferred) or the legacy integer "<name>". */
const cents = (m: Raw, name: string): number | null => {
  const d = num(m[`${name}_dollars`]);
  if (d != null) return Math.round(d * 10000) / 100;
  return num(m[name]);
};

/**
 * Chance to hit: the bid/ask midpoint when the book is two-sided and tight (it reflects where people trade now),
 * otherwise the last trade, otherwise whichever side exists. A 0 bid or 100 ask means "no order on that side".
 */
export function chanceOf(bid: number | null, ask: number | null, last: number | null): number | null {
  const b = bid != null && bid > 0 ? bid : null;
  const a = ask != null && ask > 0 && ask < 100 ? ask : null;
  if (b != null && a != null && a - b <= 10) return (a + b) / 2;
  if (last != null && last > 0) return last;
  if (b != null && a != null) return (a + b) / 2;
  return b ?? a ?? null;
}

export function normMarket(m: Raw): KMarket {
  const bid = cents(m, 'yes_bid');
  const ask = cents(m, 'yes_ask');
  const last = cents(m, 'last_price');
  const str = (k: string) => (typeof m[k] === 'string' && m[k] ? (m[k] as string) : null);
  return {
    ticker: String(m.ticker ?? ''),
    label: str('yes_sub_title') ?? str('yes_subtitle') ?? str('subtitle') ?? str('title') ?? String(m.ticker ?? ''),
    bid, ask, last,
    prev: cents(m, 'previous_price'),
    vol: num(m.volume_fp) ?? num(m.volume),
    vol24: num(m.volume_24h_fp) ?? num(m.volume_24h),
    oi: num(m.open_interest_fp) ?? num(m.open_interest),
    close: str('close_time') ?? str('close_ts'),
    chance: chanceOf(bid, ask, last),
  };
}

export interface KEvent { ticker: string; title: string; sub: string; category: string; markets: KMarket[] }

const open = (m: Raw) => (m.status == null || m.status === 'active' || m.status === 'open') && !m.result;
const byChance = (a: KMarket, b: KMarket) => (b.chance ?? -1) - (a.chance ?? -1);

/** /trade-api/v2/events?with_nested_markets=true */
export function normEvents(j: { events?: Raw[] } | null | undefined): KEvent[] {
  return (j?.events ?? []).map((e) => ({
    ticker: String(e.event_ticker ?? ''),
    title: String(e.title ?? ''),
    sub: String(e.sub_title ?? ''),
    category: String(e.category ?? 'Other'),
    markets: ((e.markets as Raw[] | undefined) ?? []).filter(open).map(normMarket).sort(byChance),
  }));
}

/** /v1/search/series?query=... (results are grouped by event). */
export function normSearch(j: { current_page?: Raw[] } | null | undefined): KEvent[] {
  return (j?.current_page ?? []).map((e) => ({
    ticker: String(e.event_ticker ?? e.series_ticker ?? ''),
    title: String(e.event_title ?? e.series_title ?? ''),
    sub: String(e.event_subtitle ?? ''),
    category: String(e.category ?? 'Other'),
    markets: ((e.markets as Raw[] | undefined) ?? []).filter(open).map(normMarket).sort(byChance),
  })).filter((e) => e.markets.length);
}

/** Local text filter for already-loaded events (ticker, title, subtitle or outcome name). */
export function matchEvent(e: KEvent, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [e.ticker, e.title, e.sub, ...e.markets.flatMap((m) => [m.ticker, m.label])].some((x) => x.toLowerCase().includes(s));
}
