// Upstream gateway: allowlisted providers only, keys injected server side, edge cache,
// in-flight coalescing (5.6, 5.7, 6.5.1, 6.6). M3 adds more providers to PROVIDERS.

import { ALPACA_DATA_HOST, isAlpacaRequestAllowed } from '../../shared/allowlists';

export type KeyResolver = (name: string) => Promise<string | null>;

export interface Provider {
  id: string;
  host: string;
  /** Final say on whether a fully built upstream URL may be fetched. */
  allow(method: string, url: URL): boolean;
  /** Adds auth to the outgoing request. Returns false if a required key is missing. */
  authorize(url: URL, headers: Headers, key: KeyResolver): Promise<boolean>;
  /** Edge cache TTL in seconds, matched to how fast the data actually changes (5.5). */
  ttl(url: URL): number;
}

export const PROVIDERS: Record<string, Provider> = {
  alpaca: {
    id: 'alpaca',
    host: ALPACA_DATA_HOST,
    allow: isAlpacaRequestAllowed,
    async authorize(_url, headers, key) {
      const [id, secret] = await Promise.all([key('ALPACA_KEY_ID'), key('ALPACA_SECRET_KEY')]);
      if (!id || !secret) return false;
      headers.set('APCA-API-KEY-ID', id);
      headers.set('APCA-API-SECRET-KEY', secret);
      return true;
    },
    ttl(url) {
      const p = url.pathname;
      if (p.includes('/news')) return 30;
      if (p.includes('/latest') || p.includes('snapshot')) return 5;
      if (p.includes('/screener/')) return 60;
      if (p.includes('/meta/')) return 86_400;
      return url.searchParams.get('timeframe')?.match(/Day|Week|Month/) ? 900 : 30;
    },
  },
};

interface Cached {
  status: number;
  body: ArrayBuffer;
  contentType: string;
  fetchedAt: number;
}

const inflight = new Map<string, Promise<Cached>>();

/** Builds the upstream URL from the client path. Returns null if it escapes the provider host. */
export function buildUpstreamUrl(provider: Provider, restPath: string, search: string): URL | null {
  if (!restPath.startsWith('/') || restPath.includes('//') || restPath.includes('\\')) return null;
  let url: URL;
  try {
    url = new URL(`https://${provider.host}${restPath}${search}`);
  } catch {
    return null;
  }
  if (url.hostname !== provider.host) return null;
  return url;
}

export async function fetchUpstream(
  provider: Provider,
  url: URL,
  key: KeyResolver,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<{ res: Cached; cache: 'HIT' | 'MISS' | 'COALESCED' } | { error: string; status: number }> {
  if (!provider.allow('GET', url)) return { error: 'blocked by allowlist', status: 403 };

  const cacheKey = new Request(`https://cache.meridian.invalid/${provider.id}${url.pathname}${url.search}`);
  const cache = (caches as unknown as { default: Cache }).default;
  const hit = await cache.match(cacheKey);
  if (hit) {
    return {
      cache: 'HIT',
      res: {
        status: hit.status,
        body: await hit.arrayBuffer(),
        contentType: hit.headers.get('content-type') ?? 'application/json',
        fetchedAt: Number(hit.headers.get('x-fetched-at') ?? Date.now()),
      },
    };
  }

  const k = cacheKey.url;
  const pending = inflight.get(k);
  if (pending) return { res: await pending, cache: 'COALESCED' };

  const p = (async (): Promise<Cached> => {
    const headers = new Headers({ accept: 'application/json', 'user-agent': 'meridian-terminal-proxy/1.0' });
    if (!(await provider.authorize(url, headers, key))) {
      return { status: 424, body: new TextEncoder().encode('{"error":"provider key not set"}').buffer as ArrayBuffer, contentType: 'application/json', fetchedAt: Date.now() };
    }
    const r = await fetch(url.toString(), { method: 'GET', headers, redirect: 'manual' });
    const out: Cached = {
      status: r.status >= 300 && r.status < 400 ? 502 : r.status,
      body: await r.arrayBuffer(),
      contentType: r.headers.get('content-type') ?? 'application/json',
      fetchedAt: Date.now(),
    };
    if (out.status === 200) {
      const stored = new Response(out.body, {
        headers: {
          'content-type': out.contentType,
          'cache-control': `public, max-age=${provider.ttl(url)}`,
          'x-fetched-at': String(out.fetchedAt),
        },
      });
      ctx.waitUntil(cache.put(cacheKey, stored));
    }
    return out;
  })();
  inflight.set(k, p);
  try {
    return { res: await p, cache: 'MISS' };
  } finally {
    inflight.delete(k);
  }
}
