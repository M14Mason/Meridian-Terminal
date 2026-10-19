// Alpaca options data, free "indicative" feed (derived, delayed, not OPRA). No open interest.
import { up, type Fetched } from '../client';

export interface OptionRow {
  symbol: string;
  expiry: string; // YYYY-MM-DD
  type: 'call' | 'put';
  strike: number;
  bid: number | null;
  ask: number | null;
  last: number | null;
  volume: number;
  iv: number | null;
  delta: number | null;
  gamma: number | null;
  theta: number | null;
  vega: number | null;
}

/** OCC symbol: ROOT + YYMMDD + C/P + strike x 1000 (8 digits). */
export function parseOcc(sym: string): { root: string; expiry: string; type: 'call' | 'put'; strike: number } | null {
  const m = /^([A-Z.]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(sym);
  if (!m) return null;
  return { root: m[1]!, expiry: `20${m[2]}-${m[3]}-${m[4]}`, type: m[5] === 'C' ? 'call' : 'put', strike: Number(m[6]) / 1000 };
}

interface Snap {
  latestQuote?: { ap: number; bp: number };
  latestTrade?: { p: number };
  dailyBar?: { v: number };
  greeks?: { delta: number; gamma: number; theta: number; vega: number };
  impliedVolatility?: number;
}

export async function chain(underlying: string, opts: { expiry?: string; maxPages?: number } = {}): Promise<Fetched<OptionRow[]>> {
  const out: OptionRow[] = [];
  let token: string | undefined;
  let fetchedAt: number;
  let pages = 0;
  do {
    const r = await up<{ snapshots: Record<string, Snap>; next_page_token: string | null }>('alpaca', `/v1beta1/options/snapshots/${encodeURIComponent(underlying)}`, {
      feed: 'indicative',
      limit: 1000,
      expiration_date: opts.expiry,
      page_token: token,
    });
    fetchedAt = r.fetchedAt;
    for (const [sym, s] of Object.entries(r.data.snapshots ?? {})) {
      const o = parseOcc(sym);
      if (!o) continue;
      out.push({
        symbol: sym,
        expiry: o.expiry,
        type: o.type,
        strike: o.strike,
        bid: s.latestQuote?.bp ?? null,
        ask: s.latestQuote?.ap ?? null,
        last: s.latestTrade?.p ?? null,
        volume: s.dailyBar?.v ?? 0,
        iv: s.impliedVolatility ?? null,
        delta: s.greeks?.delta ?? null,
        gamma: s.greeks?.gamma ?? null,
        theta: s.greeks?.theta ?? null,
        vega: s.greeks?.vega ?? null,
      });
    }
    token = r.data.next_page_token ?? undefined;
  } while (token && ++pages < (opts.maxPages ?? 10));
  return { data: out, fetchedAt, fromCache: false };
}

/** At-the-money IV per expiry: average IV of the call and put nearest the spot price. */
export function atmTerm(rows: OptionRow[], spot: number) {
  const byExp = new Map<string, OptionRow[]>();
  for (const r of rows) (byExp.get(r.expiry) ?? byExp.set(r.expiry, []).get(r.expiry)!).push(r);
  return [...byExp.entries()]
    .map(([expiry, list]) => {
      const strikes = [...new Set(list.map((r) => r.strike))];
      const k = strikes.reduce((b, s) => (Math.abs(s - spot) < Math.abs(b - spot) ? s : b), strikes[0]!);
      const ivs = list.filter((r) => r.strike === k && r.iv).map((r) => r.iv!);
      return { expiry, strike: k, iv: ivs.length ? ivs.reduce((a, b) => a + b, 0) / ivs.length : null, days: Math.max(0, (Date.parse(expiry) - Date.now()) / 86_400_000) };
    })
    .filter((x) => x.iv)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
}
