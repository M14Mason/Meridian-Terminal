// Upstream gateway: allowlisted providers only, keys injected server side, edge cache,
// in-flight coalescing (5.4, 5.6, 5.7, 6.5.1, 6.6). Every provider is GET only.

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
  /** Read-only POST searches some public APIs require. Body must pass `validate`. */
  post?: { paths: RegExp[]; validate: (body: unknown) => boolean };
}

type Auth =
  | { kind: 'none' }
  | { kind: 'header'; header: string; key: string; optional?: boolean }
  | { kind: 'query'; param: string; key: string; extra?: Record<string, string> }
  /** The key goes in a path segment; the client sends the literal segment KEY. */
  | { kind: 'path'; key: string };

interface Spec {
  id: string;
  host: string;
  paths: RegExp[];
  auth: Auth;
  /** [pattern, seconds] pairs checked in order against path + search; last entry is the default. */
  ttl: [RegExp, number][];
  /** Extra static headers, for example a required User-Agent. */
  headers?: (key: KeyResolver) => Promise<Record<string, string> | null>;
  post?: Provider['post'];
}

function make(spec: Spec): Provider {
  return {
    id: spec.id,
    host: spec.host,
    post: spec.post,
    allow(method, url) {
      if (method === 'POST') {
        if (!spec.post || url.protocol !== 'https:' || url.hostname !== spec.host || url.port !== '' || url.username || url.password || url.search) return false;
        return spec.post.paths.some((re) => re.test(url.pathname));
      }
      if (method !== 'GET') return false;
      if (url.protocol !== 'https:' || url.hostname !== spec.host || url.port !== '' || url.username || url.password) return false;
      // Clients never choose auth params; the proxy adds them.
      if (spec.auth.kind === 'query' && url.searchParams.has(spec.auth.param)) return false;
      return spec.paths.some((re) => re.test(url.pathname));
    },
    async authorize(url, headers, key) {
      if (spec.headers) {
        const h = await spec.headers(key);
        if (!h) return false;
        for (const [k, v] of Object.entries(h)) headers.set(k, v);
      }
      const a = spec.auth;
      if (a.kind === 'none') return true;
      const k = await key(a.key);
      if (!k) return a.kind === 'header' && Boolean(a.optional);
      if (a.kind === 'header') headers.set(a.header, k);
      else if (a.kind === 'path') {
        if (!/^[A-Za-z0-9_-]{8,128}$/.test(k)) return false;
        url.pathname = url.pathname.replace('/KEY/', `/${k}/`);
      } else {
        url.searchParams.set(a.param, k);
        for (const [p, v] of Object.entries(a.extra ?? {})) url.searchParams.set(p, v);
      }
      return true;
    },
    ttl(url) {
      const s = url.pathname + url.search;
      for (const [re, sec] of spec.ttl) if (re.test(s)) return sec;
      return spec.ttl.at(-1)?.[1] ?? 60;
    },
  };
}

const DAY = 86_400;
const SEC_UA = async (key: KeyResolver) => {
  // SEC requires a declared User-Agent with contact info (22.2). Stored as a Worker secret.
  const ua = await key('SEC_USER_AGENT');
  return ua ? { 'user-agent': `MeridianTerminal/1.0 ${ua}` } : null;
};

// Treasury (fiscaldata and TreasuryDirect) is NOT here: both refuse TLS from Cloudflare's network
// (HTTP 525, tested 2026-10-18). Auction data comes from a GitHub Actions cache job instead (5.3).
const SPECS: Spec[] = [
  {
    id: 'finnhub',
    host: 'finnhub.io',
    paths: [
      /^\/api\/v1\/(quote|search|news|company-news|stock\/(profile2|recommendation|earnings|metric|peers|insider-transactions|price-target|dividend2?|split|financials-reported)|calendar\/(earnings|ipo|economic))$/,
    ],
    auth: { kind: 'header', header: 'X-Finnhub-Token', key: 'FINNHUB_API_KEY' },
    ttl: [[/\/quote/, 10], [/news/, 60], [/calendar/, 3600], [/profile2|peers|split|dividend/, DAY], [/./, 3600]],
  },
  {
    id: 'massive',
    host: 'api.massive.com',
    paths: [/^\/v2\/aggs\/ticker\/[A-Za-z0-9.:-]{1,20}\/(prev|range\/\d+\/(minute|hour|day|week|month)\/[\d-]+\/[\d-]+)$/, /^\/v3\/reference\/(tickers|dividends|splits)(\/[A-Za-z0-9.]{1,12})?$/, /^\/v2\/aggs\/grouped\/locale\/us\/market\/stocks\/[\d-]+$/],
    auth: { kind: 'query', param: 'apiKey', key: 'MASSIVE_API_KEY' },
    ttl: [[/reference/, DAY], [/./, 3600]],
  },
  {
    id: 'sec',
    host: 'data.sec.gov',
    paths: [/^\/submissions\/CIK\d{10}(-submissions-\d{3})?\.json$/, /^\/api\/xbrl\/(companyfacts\/CIK\d{10}\.json|companyconcept\/CIK\d{10}\/[\w-]+\/\w+\.json|frames\/[\w-]+\/\w+\/[\w/]+\/CY\d{4}(Q[1-4]I?)?\.json)$/],
    auth: { kind: 'none' },
    headers: SEC_UA,
    ttl: [[/submissions/, 600], [/./, 6 * 3600]],
  },
  {
    id: 'secwww',
    host: 'www.sec.gov',
    paths: [/^\/files\/company_tickers(_exchange)?\.json$/, /^\/cgi-bin\/browse-edgar$/, /^\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/[\w.-]{1,120}$/, /^\/Archives\/edgar\/data\/\d{1,10}\/\d{18}\/index\.json$/],
    auth: { kind: 'none' },
    headers: SEC_UA,
    ttl: [[/company_tickers/, DAY], [/browse-edgar/, 120], [/./, 7 * DAY]],
  },
  {
    id: 'efts',
    host: 'efts.sec.gov',
    paths: [/^\/LATEST\/search-index$/],
    auth: { kind: 'none' },
    headers: SEC_UA,
    ttl: [[/./, 600]],
  },
  {
    id: 'fred',
    host: 'api.stlouisfed.org',
    paths: [/^\/fred\/(series|series\/observations|series\/search|release\/dates|releases\/dates|release\/series)$/],
    auth: { kind: 'query', param: 'api_key', key: 'FRED_API_KEY', extra: { file_type: 'json' } },
    ttl: [[/releases?\/dates/, 3600], [/./, 1800]],
  },
  {
    id: 'eia',
    host: 'api.eia.gov',
    paths: [/^\/v2\/[\w/-]{1,120}\/data\/?$/],
    auth: { kind: 'query', param: 'api_key', key: 'EIA_API_KEY' },
    ttl: [[/rto|electricity/, 900], [/./, 3600]],
  },
  {
    id: 'coingecko',
    host: 'api.coingecko.com',
    paths: [/^\/api\/v3\/(simple\/price|coins\/categories|coins\/bitcoin|coins\/bitcoin\/market_chart|coins\/markets)$/],
    auth: { kind: 'header', header: 'x-cg-demo-api-key', key: 'COINGECKO_API_KEY', optional: true },
    ttl: [[/simple\/price/, 30], [/market_chart/, 900], [/./, 300]],
  },
  {
    id: 'frankfurter',
    host: 'api.frankfurter.dev',
    paths: [/^\/v1\/(latest|currencies|\d{4}-\d{2}-\d{2}(\.\.(\d{4}-\d{2}-\d{2})?)?)$/],
    auth: { kind: 'none' },
    ttl: [[/./, 3600]],
  },
  {
    id: 'worldbank',
    host: 'api.worldbank.org',
    paths: [/^\/v2\/country\/[\w;]{1,400}\/indicator\/[\w.]{1,40}$/],
    auth: { kind: 'none' },
    ttl: [[/./, DAY]],
  },
  {
    id: 'gdelt',
    host: 'api.gdeltproject.org',
    paths: [/^\/api\/v2\/doc\/doc$/],
    auth: { kind: 'none' },
    ttl: [[/./, 900]],
  },
  {
    id: 'usgs',
    host: 'earthquake.usgs.gov',
    paths: [/^\/earthquakes\/feed\/v1\.0\/summary\/(significant|4\.5|2\.5|all)_(hour|day|week)\.geojson$/],
    auth: { kind: 'none' },
    ttl: [[/./, 300]],
  },
  {
    id: 'nhc',
    host: 'www.nhc.noaa.gov',
    paths: [/^\/CurrentStorms\.json$/],
    auth: { kind: 'none' },
    ttl: [[/./, 900]],
  },
  {
    id: 'finra',
    host: 'api.finra.org',
    paths: [],
    auth: { kind: 'none' },
    ttl: [[/./, 6 * 3600]],
    post: {
      // Public FINRA datasets need no login. Only these three, and only filter-style bodies.
      paths: [/^\/data\/group\/otcMarket\/name\/(consolidatedShortInterest|weeklySummary|regShoDaily)$/],
      validate: (b) => {
        if (!b || typeof b !== 'object' || Array.isArray(b)) return false;
        const allowed = new Set(['limit', 'offset', 'compareFilters', 'dateRangeFilters', 'fields']);
        return Object.keys(b).every((k) => allowed.has(k)) && JSON.stringify(b).length < 4000;
      },
    },
  },
  {
    id: 'kalshi',
    host: 'api.elections.kalshi.com',
    paths: [/^\/trade-api\/v2\/(events|markets|series)(\/[A-Z0-9-]{1,80})?$/],
    auth: { kind: 'none' },
    ttl: [[/./, 300]],
  },
  {
    id: 'usdm',
    host: 'usdmdataservices.unl.edu',
    paths: [/^\/api\/(USStatistics|StateStatistics)\/GetDroughtSeverityStatisticsByAreaPercent$/],
    auth: { kind: 'none' },
    ttl: [[/./, DAY]],
  },
  {
    id: 'fed',
    host: 'www.federalreserve.gov',
    paths: [/^\/monetarypolicy\/fomccalendars\.htm$/, /^\/newsevents\/pressreleases\/monetary\d{8}a\.htm$/],
    auth: { kind: 'none' },
    ttl: [[/calendars/, 6 * 3600], [/./, 30 * DAY]],
  },
  {
    id: 'wikipedia',
    host: 'en.wikipedia.org',
    paths: [/^\/w\/api\.php$/],
    auth: { kind: 'none' },
    ttl: [[/./, DAY]],
  },
  {
    id: 'nass',
    host: 'quickstats.nass.usda.gov',
    paths: [/^\/api\/api_GET\/$/],
    auth: { kind: 'query', param: 'key', key: 'USDA_NASS_API_KEY' },
    ttl: [[/./, 6 * 3600]],
  },
  {
    id: 'firms',
    host: 'firms.modaps.eosdis.nasa.gov',
    paths: [/^\/api\/(area|country)\/csv\/KEY\/(VIIRS_SNPP_NRT|VIIRS_NOAA20_NRT|MODIS_NRT)\/[\w.,-]{1,60}\/[1-5]$/],
    auth: { kind: 'path', key: 'NASA_FIRMS_KEY' },
    ttl: [[/./, 1800]],
  },
  {
    // IMF PortWatch daily chokepoint transits (ArcGIS open data). Free, no key.
    id: 'portwatch',
    host: 'services9.arcgis.com',
    paths: [/^\/weJ1QsnbMYJlCHdG\/arcgis\/rest\/services\/Daily_Chokepoints_Data\/FeatureServer\/0\/query$/],
    auth: { kind: 'none' },
    ttl: [[/./, 6 * 3600]],
  },
  {
    id: 'nyfed',
    host: 'markets.newyorkfed.org',
    paths: [/^\/api\/(rp\/(reverserepo\/propositions\/search|all\/all\/results\/last\/\d{1,3})|rates\/(all|unsecured\/(sofr|effr|obfr)|secured\/(sofr|bgcr|tgcr))\/last\/\d{1,3})\.json$/],
    auth: { kind: 'none' },
    ttl: [[/./, 1800]],
  },
  {
    id: 'clinicaltrials',
    host: 'clinicaltrials.gov',
    paths: [/^\/api\/v2\/studies$/],
    auth: { kind: 'none' },
    ttl: [[/./, 6 * 3600]],
  },
  {
    id: 'wikimedia',
    host: 'wikimedia.org',
    paths: [/^\/api\/rest_v1\/metrics\/pageviews\/per-article\/en\.wikipedia\/all-access\/user\/[^/]{1,200}\/daily\/\d{8}\/\d{8}$/],
    auth: { kind: 'none' },
    ttl: [[/./, 6 * 3600]],
  },
  {
    id: 'lda',
    // Senate LDA moved to lda.gov (301 from lda.senate.gov, checked 2026-10-18).
    host: 'lda.gov',
    paths: [/^\/api\/v1\/filings\/$/],
    auth: { kind: 'none' },
    ttl: [[/./, DAY]],
  },
  {
    id: 'cftc',
    host: 'publicreporting.cftc.gov',
    paths: [/^\/resource\/[a-z0-9]{4}-[a-z0-9]{4}\.json$/],
    auth: { kind: 'none' },
    ttl: [[/./, DAY]],
  },
];

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
      if (p.includes('/meta/')) return DAY;
      return url.searchParams.get('timeframe')?.match(/Day|Week|Month/) ? 900 : 30;
    },
  },
  ...Object.fromEntries(SPECS.map((s) => [s.id, make(s)])),
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
  body?: string,
): Promise<{ res: Cached; cache: 'HIT' | 'MISS' | 'COALESCED' } | { error: string; status: number }> {
  const method = body === undefined ? 'GET' : 'POST';
  if (!provider.allow(method, url)) return { error: 'blocked by allowlist', status: 403 };
  if (body !== undefined) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return { error: 'bad body', status: 400 };
    }
    if (!provider.post?.validate(parsed)) return { error: 'blocked by allowlist', status: 403 };
  }
  // POST searches are cached by a hash of the body. Built before auth, so keys never end up in cache keys.
  const bodyTag = body === undefined ? '' : `/__post/${[...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body)))].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('')}`;
  const cacheKey = new Request(`https://cache.meridian.invalid/${provider.id}${url.pathname}${url.search}${bodyTag}`);
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
    const target = new URL(url.toString());
    const headers = new Headers({ accept: 'application/json', 'user-agent': 'MeridianTerminal/1.0 (personal research tool)' });
    if (!(await provider.authorize(target, headers, key))) {
      return { status: 424, body: new TextEncoder().encode('{"error":"provider key not set"}').buffer as ArrayBuffer, contentType: 'application/json', fetchedAt: Date.now() };
    }
    if (body !== undefined) headers.set('content-type', 'application/json');
    const r = await fetch(target.toString(), { method, headers, body, redirect: 'manual' });
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
