// The app's single path to market data (5.4 to 5.6). UI code calls adapters, adapters call this.
// Every call: rate-limited by provider, cached in IndexedDB, reported to the data health panel.

import { api, ApiError } from '../lib/api';
import { idb } from '../sync/idb';
import { report } from './health';
import { PRIORITY, Scheduler, type Priority } from './scheduler';

// Client-side budgets, set a little under each free tier (verified limits in docs/DATA_SOURCES.md).
const MIN = 60_000;
export const scheduler = new Scheduler({
  alpaca: { capacity: 180, windowMs: MIN },
  finnhub: { capacity: 55, windowMs: MIN },
  massive: { capacity: 5, windowMs: MIN },
  sec: { capacity: 300, windowMs: MIN },
  secwww: { capacity: 300, windowMs: MIN },
  efts: { capacity: 60, windowMs: MIN },
  fred: { capacity: 100, windowMs: MIN },
  eia: { capacity: 60, windowMs: MIN },
  coingecko: { capacity: 25, windowMs: MIN },
  gdelt: { capacity: 20, windowMs: MIN },
});

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    scheduler.hidden = document.visibilityState === 'hidden';
  });
}

export interface Fetched<T> {
  data: T;
  fetchedAt: number;
  fromCache: boolean;
}

export interface UpOptions {
  priority?: Priority;
  /** Serve from the local cache without a network call if younger than this. */
  maxAgeMs?: number;
  /** Response is text (filings), not JSON. */
  text?: boolean;
}

export type Params = Record<string, string | number | boolean | string[] | undefined>;

function qs(params?: Params): string {
  if (!params) return '';
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) for (const x of v) u.append(k, x);
    else if (v !== undefined && v !== '') u.set(k, String(v));
  }
  const s = u.toString();
  return s ? `?${s}` : '';
}

const memo = new Map<string, Fetched<unknown>>();

export async function cached<T>(key: string): Promise<Fetched<T> | null> {
  const m = memo.get(key) as Fetched<T> | undefined;
  if (m) return m;
  try {
    const v = await idb.get<{ data: T; fetchedAt: number }>('cache', key);
    return v ? { ...v, fromCache: true } : null;
  } catch {
    return null;
  }
}

/** GET through the proxy gateway: /api/up/<provider><path>?<params>. */
export async function up<T>(provider: string, path: string, params?: Params, opts: UpOptions = {}): Promise<Fetched<T>> {
  const full = `/api/up/${provider}${path}${qs(params)}`;
  const key = `up:${full}`;
  if (opts.maxAgeMs) {
    const c = await cached<T>(key);
    if (c && Date.now() - c.fetchedAt < opts.maxAgeMs) return c;
  }
  return scheduler.request(
    provider,
    async () => {
      const t0 = performance.now();
      try {
        const data = await api<T>(full, opts.text ? { text: true } : {});
        const out: Fetched<T> = { data, fetchedAt: Date.now(), fromCache: false };
        memo.set(key, out);
        if (memo.size > 300) memo.delete(memo.keys().next().value!);
        void idb.set('cache', key, { data, fetchedAt: out.fetchedAt }).catch(() => undefined);
        report(provider, { ok: true, latencyMs: Math.round(performance.now() - t0), headroom: scheduler.headroom(provider) });
        return out;
      } catch (e) {
        report(provider, { ok: false, error: e instanceof ApiError ? e.message : 'network error' });
        throw e;
      }
    },
    opts.priority ?? PRIORITY.visible,
  );
}

/** Thrown message when the owner has not saved a provider key yet. */
export function isMissingKey(e: unknown): boolean {
  return e instanceof ApiError && e.status === 424;
}
