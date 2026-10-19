// SAT: Sentinel-2 true-colour images of fixed sites via the Copernicus Data Space Sentinel Hub
// Processing API. OAuth client credentials stay in the proxy; only preset sites, so no open relay.
import type { KeyResolver } from './upstream';

export const SITES: Record<string, { name: string; lat: number; lon: number; km: number }> = {
  cushing: { name: 'Cushing, OK oil storage hub', lat: 35.955, lon: -96.75, km: 8 },
  houston: { name: 'Houston Ship Channel refineries', lat: 29.73, lon: -95.12, km: 12 },
  lalb: { name: 'Ports of Los Angeles and Long Beach', lat: 33.745, lon: -118.24, km: 10 },
  rotterdam: { name: 'Port of Rotterdam (Maasvlakte)', lat: 51.955, lon: 4.03, km: 10 },
  yangshan: { name: 'Shanghai Yangshan deep-water port', lat: 30.62, lon: 122.07, km: 10 },
  singapore: { name: 'Singapore container terminals', lat: 1.27, lon: 103.78, km: 10 },
  rastanura: { name: 'Ras Tanura oil terminal (Saudi Arabia)', lat: 26.65, lon: 50.16, km: 10 },
  portsaid: { name: 'Suez Canal north entrance (Port Said)', lat: 31.25, lon: 32.31, km: 10 },
  gatun: { name: 'Panama Canal (Gatun Lake and locks)', lat: 9.27, lon: -79.92, km: 10 },
  gigatexas: { name: 'Tesla Gigafactory Texas', lat: 30.222, lon: -97.617, km: 4 },
};

const EVAL = `//VERSION=3
function setup(){return{input:["B02","B03","B04","dataMask"],output:{bands:4}}}
function evaluatePixel(s){return[2.5*s.B04,2.5*s.B03,2.5*s.B02,s.dataMask]}`;

let token: { value: string; exp: number } | null = null;

async function getToken(resolve: KeyResolver): Promise<string | null> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  const [id, secret] = await Promise.all([resolve('COPERNICUS_CLIENT_ID'), resolve('COPERNICUS_CLIENT_SECRET')]);
  if (!id || !secret) return null;
  const r = await fetch('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret }),
  });
  if (!r.ok) throw new Error(`copernicus auth ${r.status}`);
  const j = (await r.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

/** PNG for a site, best (least cloudy) scene in the 20 days ending `date`. Cached 7 days at the edge. */
export async function satImage(site: string, date: string, resolve: KeyResolver, ctx: ExecutionContext): Promise<Response> {
  const s = SITES[site];
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) return new Response(JSON.stringify({ error: 'bad request' }), { status: 400 });
  const cacheKey = new Request(`https://cache.meridian.internal/sat/${site}/${date}`);
  const cache = caches.default;
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  const tok = await getToken(resolve);
  if (!tok) return new Response(JSON.stringify({ error: 'copernicus key not set (Settings > Keys)' }), { status: 424 });
  const dLat = s.km / 111;
  const dLon = s.km / (111 * Math.cos((s.lat * Math.PI) / 180));
  const to = new Date(`${date}T23:59:59Z`);
  const from = new Date(to.getTime() - 20 * 86_400_000);
  const body = {
    input: {
      bounds: { bbox: [s.lon - dLon, s.lat - dLat, s.lon + dLon, s.lat + dLat], properties: { crs: 'http://www.opengis.net/def/crs/OGC/1.3/CRS84' } },
      data: [{ type: 'sentinel-2-l2a', dataFilter: { timeRange: { from: from.toISOString(), to: to.toISOString() }, mosaickingOrder: 'leastCC', maxCloudCoverage: 60 } }],
    },
    output: { width: 768, height: 768, responses: [{ identifier: 'default', format: { type: 'image/png' } }] },
    evalscript: EVAL,
  };
  const r = await fetch('https://sh.dataspace.copernicus.eu/api/v1/process', {
    method: 'POST',
    headers: { authorization: `Bearer ${tok}`, 'content-type': 'application/json', accept: 'image/png' },
    body: JSON.stringify(body),
  });
  if (!r.ok) return new Response(JSON.stringify({ error: `copernicus returned ${r.status}` }), { status: 502 });
  const out = new Response(r.body, { headers: { 'content-type': 'image/png', 'cache-control': 'public, max-age=604800', 'x-fetched-at': String(Date.now()) } });
  ctx.waitUntil(cache.put(cacheKey, out.clone()));
  return out;
}
