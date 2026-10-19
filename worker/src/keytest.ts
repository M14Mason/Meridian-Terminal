// Settings > Keys > TEST ALL: one minimal, free request per saved key, run inside the proxy so keys never leave
// it. Results say OK, missing, rejected (bad or expired key) or error (provider problem), never the key itself.
import type { KeyResolver } from './upstream';
import { toText } from './aishub';

export type KeyStatus = 'ok' | 'missing' | 'rejected' | 'error' | 'unused';
export interface KeyResult { group: string; keys: string[]; status: KeyStatus; detail: string; ms: number }

const TIMEOUT = 8000;

async function get(url: string, headers: Record<string, string> = {}, init: RequestInit = {}): Promise<{ status: number; text: string }> {
  const r = await fetch(url, { ...init, headers: { 'user-agent': 'MeridianTerminal/1.0 (key test)', ...headers }, signal: AbortSignal.timeout(TIMEOUT) });
  return { status: r.status, text: (await r.text()).slice(0, 400) };
}

/** Maps an HTTP status to a result; 401 and 403 mean the key was refused. */
function byStatus(status: number, okDetail: string): [KeyStatus, string] {
  if (status >= 200 && status < 300) return ['ok', okDetail];
  if (status === 401 || status === 403) return ['rejected', `refused the key (HTTP ${status})`];
  if (status === 429) return ['ok', 'key accepted but rate limited right now (HTTP 429)'];
  return ['error', `provider returned HTTP ${status}`];
}

async function aisTest(key: string): Promise<[KeyStatus, string]> {
  const resp = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Extensions': 'permessage-deflate' } });
  const ws = resp.webSocket;
  if (!ws) return ['error', `could not open the stream (HTTP ${resp.status})`];
  ws.accept();
  return new Promise((resolve) => {
    const done = (r: [KeyStatus, string]) => { clearTimeout(timer); try { ws.close(); } catch { /* already closed */ } resolve(r); };
    // A busy shipping lane near Singapore; any message proves the key. A bad key closes the socket with an error.
    const timer = setTimeout(() => done(['ok', 'stream accepted the key, but no ship data arrived within 6 s (the map may stay empty)']), 6000);
    ws.addEventListener('message', (e) => void toText(e.data).then((t) => {
      if (/SubscriptionConfirmation/.test(t)) return; // wait for real ship data
      done(/error|invalid|api key/i.test(t) && !/MessageType/.test(t) ? ['rejected', 'AISStream refused the key'] : ['ok', 'live ship data received']);
    }));
    ws.addEventListener('close', () => done(['rejected', 'AISStream closed the connection (usually an invalid key)']));
    ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [[[1.1, 103.6], [1.4, 104.1]]], FilterMessageTypes: ['PositionReport'] }));
  });
}

interface Test { group: string; keys: string[]; optional?: boolean; unused?: string; run?: (k: Record<string, string>) => Promise<[KeyStatus, string]> }

const TESTS: Test[] = [
  { group: 'Alpaca', keys: ['ALPACA_KEY_ID', 'ALPACA_SECRET_KEY'], run: async (k) => byStatus((await get('https://data.alpaca.markets/v2/stocks/snapshots?symbols=SPY&feed=iex', { 'APCA-API-KEY-ID': k.ALPACA_KEY_ID!, 'APCA-API-SECRET-KEY': k.ALPACA_SECRET_KEY! })).status, 'market data works') },
  { group: 'Anthropic', keys: ['ANTHROPIC_API_KEY'], run: async (k) => byStatus((await get('https://api.anthropic.com/v1/models?limit=1', { 'x-api-key': k.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' })).status, 'key valid (no tokens used)') },
  { group: 'Finnhub', keys: ['FINNHUB_API_KEY'], run: async (k) => byStatus((await get('https://finnhub.io/api/v1/quote?symbol=AAPL', { 'X-Finnhub-Token': k.FINNHUB_API_KEY! })).status, 'quotes work') },
  { group: 'Massive (Polygon)', keys: ['MASSIVE_API_KEY'], run: async (k) => byStatus((await get(`https://api.massive.com/v2/aggs/ticker/AAPL/prev?apiKey=${encodeURIComponent(k.MASSIVE_API_KEY!)}`)).status, 'end-of-day data works') },
  {
    group: 'FRED', keys: ['FRED_API_KEY'], run: async (k) => {
      const r = await get(`https://api.stlouisfed.org/fred/series?series_id=DGS10&file_type=json&api_key=${encodeURIComponent(k.FRED_API_KEY!)}`);
      return r.status === 400 && /api_key/i.test(r.text) ? ['rejected', 'FRED says the API key is not valid'] : byStatus(r.status, 'macro series work');
    },
  },
  { group: 'EIA', keys: ['EIA_API_KEY'], run: async (k) => byStatus((await get(`https://api.eia.gov/v2/?api_key=${encodeURIComponent(k.EIA_API_KEY!)}`)).status, 'energy data works') },
  { group: 'AISStream', keys: ['AISSTREAM_API_KEY'], run: (k) => aisTest(k.AISSTREAM_API_KEY!) },
  { group: 'CoinGecko (optional)', keys: ['COINGECKO_API_KEY'], optional: true, run: async (k) => byStatus((await get('https://api.coingecko.com/api/v3/ping', { 'x-cg-demo-api-key': k.COINGECKO_API_KEY! })).status, 'demo key works') },
  {
    group: 'USDA NASS (optional)', keys: ['USDA_NASS_API_KEY'], optional: true, run: async (k) => {
      const r = await get(`https://quickstats.nass.usda.gov/api/get_param_values/?param=sector_desc&key=${encodeURIComponent(k.USDA_NASS_API_KEY!)}`);
      return /unauthorized|invalid/i.test(r.text) && r.status !== 200 ? ['rejected', 'NASS refused the key'] : byStatus(r.status, 'crop data works');
    },
  },
  {
    group: 'NASA FIRMS (optional)', keys: ['NASA_FIRMS_KEY'], optional: true, run: async (k) => {
      const r = await get(`https://firms.modaps.eosdis.nasa.gov/mapserver/mapkey_status/?MAP_KEY=${encodeURIComponent(k.NASA_FIRMS_KEY!)}`);
      return /invalid/i.test(r.text) ? ['rejected', 'FIRMS says the map key is invalid'] : byStatus(r.status, 'map key valid');
    },
  },
  {
    group: 'Copernicus (optional)', keys: ['COPERNICUS_CLIENT_ID', 'COPERNICUS_CLIENT_SECRET'], optional: true, run: async (k) => {
      const r = await get('https://identity.dataspace.copernicus.eu/auth/realms/CDSE/protocol/openid-connect/token', { 'content-type': 'application/x-www-form-urlencoded' }, { method: 'POST', body: new URLSearchParams({ grant_type: 'client_credentials', client_id: k.COPERNICUS_CLIENT_ID!, client_secret: k.COPERNICUS_CLIENT_SECRET! }) });
      return r.status === 400 || r.status === 401 ? ['rejected', 'Copernicus refused the client ID or secret'] : byStatus(r.status, 'OAuth client works');
    },
  },
  {
    group: 'Resend (alert email)', keys: ['RESEND_API_KEY'], optional: true, run: async (k) => {
      const r = await get('https://api.resend.com/domains', { authorization: `Bearer ${k.RESEND_API_KEY!}` });
      // Sending-only keys cannot list domains but are fine for alerts.
      if (r.status === 401 && /restricted/i.test(r.text)) return ['ok', 'send-only key (that is fine for alerts)'];
      return byStatus(r.status, 'key valid (no email sent; use ALRT > TEST ALERT to send one)');
    },
  },
  { group: 'Marketaux', keys: ['MARKETAUX_API_KEY'], optional: true, unused: 'saved keys are not used: news comes from Alpaca and Finnhub' },
  { group: 'API Ninjas', keys: ['API_NINJAS_KEY'], optional: true, unused: 'not used: earnings call transcripts are premium only' },
];

export async function testAllKeys(resolve: KeyResolver): Promise<KeyResult[]> {
  return Promise.all(TESTS.map(async (t): Promise<KeyResult> => {
    const t0 = Date.now();
    const vals: Record<string, string> = {};
    for (const k of t.keys) { const v = await resolve(k); if (v) vals[k] = v; }
    const have = t.keys.every((k) => vals[k]);
    if (t.unused) return { group: t.group, keys: t.keys, status: 'unused', detail: t.unused, ms: 0 };
    if (!have) {
      const missing = t.keys.filter((k) => !vals[k]);
      return { group: t.group, keys: t.keys, status: 'missing', detail: `${t.optional ? 'optional, ' : ''}not set: ${missing.join(', ')}`, ms: 0 };
    }
    try {
      const [status, detail] = await t.run!(vals);
      return { group: t.group, keys: t.keys, status, detail, ms: Date.now() - t0 };
    } catch (e) {
      const msg = e instanceof Error && e.name === 'TimeoutError' ? 'no answer within 8 s (provider slow or down)' : 'could not reach the provider';
      return { group: t.group, keys: t.keys, status: 'error', detail: msg, ms: Date.now() - t0 };
    }
  }));
}
