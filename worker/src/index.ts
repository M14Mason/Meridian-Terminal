// The proxy (BUILD_PROMPT 5.2, 6). Every route except /api/health and /api/pair/* needs a device token.

import { KEY_NAMES } from '../../shared/keys';
import type { Env } from './env';
import { log } from './log';
import { fetchUpstream, PROVIDERS, buildUpstreamUrl } from './upstream';
import { satImage, SITES } from './sat';
import { runAi } from './ai';
import { toText } from './aishub';
import { testAllKeys } from './keytest';
import { finishAuth, snapshot, startAuth, type SecretStore } from './robinhood';
import { runAlerts, type AlertDeps } from './alerts';
import type { Fired } from '../../shared/alerts';
import { isStale, validSnapshot, type Snapshot } from '../../shared/portfolio';
import type { Result } from './vault';

export { Vault } from './vault';
export { AisHub } from './aishub';
import { hmacHex, timingSafeEqual } from './crypto';

const MAX_BODY = 16 * 1024;
// Relay instance name. Bump it to start a fresh relay on the new code at once (a running instance keeps its
// old code while devices stay connected). v2: AISStream frames arrive as Blobs. v3: permessage-deflate compression. v4: warm mode and saved ship registry (2026-10-19).
const AIS_INSTANCE = 'global-v4';
// Sync batches carry up to 200 records; individual records are capped at 32 KB in validateRecord.
const SYNC_MAX_BODY = 1024 * 1024;

function allowedOrigins(env: Env): Set<string> {
  return new Set(env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean));
}

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!origin || !allowedOrigins(env).has(origin)) return {};
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-expose-headers': 'x-fetched-at, x-cache',
    'access-control-max-age': '86400',
    vary: 'Origin',
  };
}

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store',
};

function json(data: unknown, status = 200, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra },
  });
}

function fromResult<T>(r: Result<T>, map: (d: T) => unknown = (d) => d): Response {
  return r.ok ? json(map(r.data)) : json({ error: r.error }, r.status);
}

async function readJson(req: Request, max = MAX_BODY): Promise<Record<string, unknown> | null> {
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > max) return null;
  const text = await req.text();
  if (text.length > max) return null;
  try {
    const v: unknown = JSON.parse(text || '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function ipKey(req: Request): Promise<string> {
  // Hash so raw IPs never sit in memory longer than needed.
  const ip = req.headers.get('cf-connecting-ip') ?? 'unknown';
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip));
  return [...new Uint8Array(d).slice(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time admin token check (HMAC both sides so length differences do not leak). */
async function isAdmin(req: Request, env: Env): Promise<boolean> {
  const admin = typeof env.ADMIN_TOKEN === 'string' ? env.ADMIN_TOKEN : '';
  const given = req.headers.get('authorization')?.startsWith('Bearer ') ? req.headers.get('authorization')!.slice(7).trim() : '';
  if (!admin || !given) return false;
  return timingSafeEqual(await hmacHex(admin, given), await hmacHex(admin, admin));
}

function bearer(req: Request): string | null {
  const h = req.headers.get('authorization') ?? '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}


type VaultStub = ReturnType<Env['VAULT']['get']>;
/** Encrypted internal store for the Robinhood module (tokens and snapshot never leave the proxy). */
function secretStore(vault: VaultStub): SecretStore {
  return {
    get: async (n) => { const r = await vault.getSecret(n); return r.ok && r.data ? r.data.value : null; },
    put: async (n, v) => { const r = await vault.putSecret(n, v); if (!r.ok) throw new Error(r.error); },
    del: async (n) => { await vault.deleteSecret(n); },
    log: async (e, d) => { await vault.logEvent(e, d); },
  };
}

interface PortfolioState { snap: Snapshot | null; lastTry: number; lastError: string | null; disconnected: boolean }
async function readPortfolio(store: SecretStore): Promise<PortfolioState> {
  const raw = await store.get('portfolio');
  return raw ? (JSON.parse(raw) as PortfolioState) : { snap: null, lastTry: 0, lastError: null, disconnected: true };
}
/** Refreshes from Robinhood and keeps the last good snapshot when a refresh fails. */
async function refreshPortfolio(store: SecretStore): Promise<PortfolioState> {
  const cur = await readPortfolio(store);
  const r = await snapshot(store);
  const next: PortfolioState = r.ok ? { snap: r.snap, lastTry: Date.now(), lastError: null, disconnected: false } : { ...cur, lastTry: Date.now(), lastError: r.error, disconnected: r.disconnected };
  await store.put('portfolio', JSON.stringify(next));
  if (!r.ok) await store.log('portfolio.refresh_failed', r.error);
  return next;
}
const callbackPage = (title: string, body: string, status = 200) =>
  new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><body style="background:#000;color:#ffa028;font:14px monospace;padding:24px"><h1 style="font-size:16px">${title}</h1><p style="color:#fff">${body}</p></body>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'", ...SECURITY_HEADERS } });

let lastManualRun = 0;
let lastKeyTest = 0;
function alertDeps(env: Env, vault: VaultStub, ctx: { waitUntil(p: Promise<unknown>): void }, rules: { id: string; v: unknown }[]): AlertDeps {
  const store = secretStore(vault);
  return {
    rules,
    key: async (n) => { const r = await vault.resolveKey(n); return r.ok ? r.data : null; },
    get: store.get,
    put: store.put,
    usage: async () => { const r = await vault.usage(15); return r.ok ? r.data : []; },
    portfolio: () => readPortfolio(store),
    email: typeof env.ALERT_EMAIL === 'string' && env.ALERT_EMAIL ? env.ALERT_EMAIL : null,
    ctx,
  };
}
async function alertsNow(env: Env, vault: VaultStub, ctx: { waitUntil(p: Promise<unknown>): void }, mode: 'market' | 'hourly' | 'manual') {
  const rules = await vault.listCollection('alerts');
  return runAlerts(alertDeps(env, vault, ctx, rules.ok && 'data' in rules ? (rules.data as { id: string; v: unknown }[]) : []), mode);
}

async function route(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const vault = env.VAULT.get(env.VAULT.idFromName('main'));

  // ----- Public -----
  if (path === '/api/health' && method === 'GET') {
    return json({ ok: true, time: Date.now() });
  }
  if (path === '/api/pair/setup' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json({ error: 'bad request' }, 400);
    const r = await vault.pairSetup(await ipKey(req), body.secret, body.deviceName);
    log('pair.setup', { ok: r.ok });
    return fromResult(r);
  }
  if (path === '/api/pair/code' && method === 'POST') {
    const body = await readJson(req);
    if (!body) return json({ error: 'bad request' }, 400);
    const r = await vault.pairCode(await ipKey(req), body.code, body.deviceName);
    log('pair.code', { ok: r.ok });
    return fromResult(r);
  }


  // Robinhood OAuth callback (17.2). Public because Robinhood's page redirects the browser here; protected by the
  // single-use state and PKCE verifier created by an authenticated device.
  if (path === '/api/rh/callback' && method === 'GET') {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    if (!code || !state) return callbackPage('Robinhood not connected', 'Robinhood did not return an authorization code. Close this tab and try again from PORT.', 400);
    try {
      await finishAuth(secretStore(vault), url.origin, code, state);
      ctx.waitUntil(refreshPortfolio(secretStore(vault)).then(() => undefined, () => undefined));
      return callbackPage('Robinhood connected (read only)', 'You can close this tab. The portfolio loads in PORT within a minute.');
    } catch (e) {
      log('rh.callback.failed', { name: e instanceof Error ? e.message.slice(0, 60) : 'error' });
      return callbackPage('Robinhood not connected', 'The sign-in could not be completed (expired or rejected). Close this tab and try again from PORT. If it keeps failing, use the fallback in scripts/update-portfolio.md.', 400);
    }
  }
  // Fallback snapshot (17.4): written by the owner-run Claude session with the admin token. Write only.
  if (path === '/api/portfolio/snapshot' && method === 'POST') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    const body = await readJson(req, 512 * 1024);
    if (!validSnapshot(body)) return json({ error: 'invalid snapshot' }, 400);
    const store = secretStore(vault);
    const cur = await readPortfolio(store);
    await store.put('portfolio', JSON.stringify({ ...cur, snap: { ...body, source: 'fallback', at: Date.now() }, lastError: null }));
    await store.log('portfolio.fallback', `${body.positions.length} positions`);
    return json({ ok: true });
  }

  // AIS live feed. Browsers cannot set headers on WebSockets, so the device first gets a
  // signed 60 s ticket over an authenticated call; the token never appears in a URL.
  if (path === '/api/ais/ws') {
    const t = url.searchParams.get('ticket') ?? '';
    const [dev, exp, sig] = t.split('.');
    const key = typeof env.KEY_ENCRYPTION_KEY === 'string' ? env.KEY_ENCRYPTION_KEY : '';
    if (!dev || !exp || !sig || !key || Number(exp) < Date.now()) return json({ error: 'unauthorized' }, 401);
    if (!timingSafeEqual(await hmacHex(key, `ais:${dev}:${exp}`), sig)) return json({ error: 'unauthorized' }, 401);
    const exists = await vault.deviceExists(dev);
    if (!exists.ok || !exists.data) return json({ error: 'unauthorized' }, 401);
    return env.AIS.get(env.AIS.idFromName(AIS_INSTANCE)).fetch(new Request('https://ais/ws', req));
  }
  // Upstream check for the owner's admin token: fixed SEC requests the app makes, status only (no caching).
  if (path === '/api/admin/upcheck' && method === 'GET') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    const ua = typeof env.SEC_USER_AGENT === 'string' ? env.SEC_USER_AGENT : '';
    const targets = ['https://data.sec.gov/submissions/CIK0000320193.json', 'https://www.sec.gov/files/company_tickers_exchange.json', 'https://efts.sec.gov/LATEST/search-index?q=%22going%20concern%22&forms=10-K'];
    const results = await Promise.all(targets.map(async (t) => {
      const r = await fetch(t, { headers: { 'user-agent': `MeridianTerminal/1.0 ${ua}`, accept: 'application/json' } });
      const body = (await r.text()).slice(0, 160);
      return { url: t.replace(/\?.*/, ''), status: r.status, uaSet: ua.length > 0, uaHasEmail: /@/.test(ua), sample: r.ok ? '' : body };
    }));
    return json(results);
  }
  // AISStream probe for the owner's admin token: 10 s on a busy area, reports frame counts and the first control frame.
  if (path === '/api/ais/probe' && method === 'GET') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    const k = await vault.resolveKey('AISSTREAM_API_KEY');
    const key = k.ok ? k.data : null;
    if (!key) return json({ error: 'no AISStream key' });
    const resp = await fetch('https://stream.aisstream.io/v0/stream', { headers: { Upgrade: 'websocket', 'Sec-WebSocket-Extensions': 'permessage-deflate' } });
    const ws = resp.webSocket;
    if (!ws) return json({ error: `upgrade failed ${resp.status}` });
    ws.accept();
    const out = { frames: 0, ships: 0, uniqueShips: 0, firstFrame: '', close: '', types: {} as Record<string, number> };
    const mmsis = new Set<string>();
    await new Promise<void>((resolve) => {
      const t = setTimeout(resolve, Math.min(30_000, Number(url.searchParams.get('secs') ?? 10) * 1000));
      ws.addEventListener('message', (e) => void toText(e.data).then((text) => {
        out.frames++;
        if (!out.firstFrame) out.firstFrame = text.slice(0, 200);
        const mt = /"MessageType":"(\w+)"/.exec(text)?.[1] ?? 'other';
        out.types[mt] = (out.types[mt] ?? 0) + 1;
        if (mt === 'PositionReport') { out.ships++; const m = /"MMSI":(\d+)/.exec(text)?.[1]; if (m) mmsis.add(m); }
      }));
      ws.addEventListener('close', (e) => { out.close = `${e.code} ${e.reason}`.slice(0, 160); clearTimeout(t); resolve(); });
      // Optional ?box=lat1,lon1,lat2,lon2 (default English Channel).
      const b = (url.searchParams.get('box') ?? '49.5,-2.5,51.5,2.5').split(',').map(Number);
      const box = b.length === 4 && b.every(Number.isFinite) ? [[b[0], b[1]], [b[2], b[3]]] : [[49.5, -2.5], [51.5, 2.5]];
      ws.send(JSON.stringify({ APIKey: key, BoundingBoxes: [box], FilterMessageTypes: ['PositionReport', 'ShipStaticData'] }));
    });
    try { ws.close(); } catch { /* closed */ }
    // Never echo the key: the first frame is AISStream's reply, not our request.
    out.uniqueShips = mmsis.size;
    return json({ ...out, firstFrame: out.firstFrame.replace(key, '[key]') });
  }
  // AI self-test for the owner's admin token: runs one feature on a tiny input (a cent or less) and returns the result or error.
  if (path === '/api/ai/selftest' && method === 'GET') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    const feature = url.searchParams.get('feature') ?? 'explain';
    const inputs: Record<string, string> = {
      explain: 'PANEL: TEST. VISIBLE CONTENT: SPY 700.00 +0.50%',
      analyze: 'PANEL: GP for TEST: Chart.\nPRICE BARS (code computed): Last close: 100. RSI(14): 74 (overbought zone). MACD histogram 0.8 (falling). SMA50 92 (price above by 8.7%); SMA200 85 (price above by 17.6%). 52-week range 70 to 102.\nFUNDAMENTALS: P/E 30, revenue growth 12%, net margin 20%.',
      ask: 'FUNCTIONS: GP: Chart; EQS: Screener\n\nREQUEST: profitable companies over $50B with ROE above 20%',
      valuation: 'COMPANY: TEST. PRICE: $100. CODE VALUATION METHODS: DCF (base): $90; Peer median P/E: $110. CODE RANGE: 90 to 110; CODE VERDICT: fairly valued',
      predict: 'TICKER: TEST. HORIZON: Next week. LAST CLOSE: 100. CODE RANGE (80%): 96 to 104. BASELINE P(up) = 0.55.',
      brief: 'DATE: 2026-10-19\nETF QUOTES: SPY 700 +0.5%\nHEADLINES:\n- Stocks rise',
      critic: 'STATS: 4 closed trades, win rate 50%.\nTRADES:\ndate|ticker|side|pnl|notes\n2026-10-01|AAPL|long|50|breakout\n2026-10-02|MSFT|long|-80|chased',
      filing: 'COMPANY: TEST. CURRENT RELEASE: Revenue rose 10% to $5 billion. Net income was $1 billion.',
      supply: 'COMPANY: TEST. PROPERTIES: Plant in Ohio.\nRELEVANT PARAGRAPHS:\nSales to Walmart Inc. accounted for 18% of our net sales. We rely on Foxconn Ltd. for assembly.',
      cmp: 'DATE: 2026-10-19\nCANDIDATES:\nt|capB|pe|roe\nAAPL|5000|35|150\nMSFT|3900|33|35\nNVDA|5100|45|90\nJPM|900|14|17\nXOM|700|14|15\nJNJ|600|16|25\nLLY|1100|50|70\nWMT|900|38|22\nV|800|30|50\nPG|380|25|30\nKO|300|24|40\nCOST|440|52|30',
    };
    const out = await runAi({ feature, input: inputs[feature] ?? inputs.explain, fresh: true }, async (n) => { const r = await vault.resolveKey(n); return r.ok ? r.data : null; }, (f, m, i, o, usd) => vault.recordUsage(f, m, i, o, usd), ctx);
    return json(out.body, out.status);
  }
  // Relay diagnostics for the owner's admin token (no ship or key data, just counters and the last control frame).
  if (path === '/api/ais/debug' && method === 'GET') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    return env.AIS.get(env.AIS.idFromName(AIS_INSTANCE)).fetch(new Request('https://ais/debug'));
  }
  if (path === '/api/ais/ingest' && method === 'POST') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    return env.AIS.get(env.AIS.idFromName(AIS_INSTANCE)).fetch(new Request('https://ais/ingest', { method: 'POST', body: await req.text() }));
  }

  // Job data cache: GitHub Actions write (and read back their own state) with the admin token.
  const cacheAdmin = path.match(/^\/api\/cache\/([a-z0-9-]{1,40})$/);
  if (cacheAdmin && (method === 'PUT' || method === 'GET') && (await isAdmin(req, env))) {
    if (method === 'PUT') return fromResult(await vault.putBlob(cacheAdmin[1]!, await req.text()), () => ({ ok: true }));
    const r = await vault.getBlob(cacheAdmin[1]!);
    if (!r.ok) return json({ error: r.error }, r.status);
    return r.data ? new Response(r.data.body, { headers: { 'content-type': 'application/json', ...SECURITY_HEADERS } }) : json({ error: 'no data yet' }, 404);
  }
  if (cacheAdmin && method === 'PUT') return json({ error: 'unauthorized' }, 401);

  // ----- Everything below needs a valid device token -----
  const auth = await vault.authorize(bearer(req));
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  const deviceId = auth.data;

  if (path === '/api/session' && method === 'GET') return json({ deviceId });

  if (path === '/api/ais/ticket' && method === 'GET') {
    const key = typeof env.KEY_ENCRYPTION_KEY === 'string' ? env.KEY_ENCRYPTION_KEY : '';
    if (!key) return json({ error: 'not configured' }, 503);
    const exp = Date.now() + 60_000;
    return json({ ticket: `${deviceId}.${exp}.${await hmacHex(key, `ais:${deviceId}:${exp}`)}` });
  }
  // The app pings this every few minutes while open, so ships are already loaded when the map opens.
  if (path === '/api/ais/warm' && method === 'POST') {
    const r = await env.AIS.get(env.AIS.idFromName(AIS_INSTANCE)).fetch(new Request('https://ais/warm'));
    return new Response(r.body, { headers: { 'content-type': 'application/json', ...SECURITY_HEADERS } });
  }
  if (path === '/api/ais/snapshot' && method === 'GET') {
    const r = await env.AIS.get(env.AIS.idFromName(AIS_INSTANCE)).fetch('https://ais/snapshot');
    return new Response(r.body, { headers: { 'content-type': 'application/json', ...SECURITY_HEADERS } });
  }

  if (path === '/api/devices' && method === 'GET') return fromResult(await vault.listDevices(deviceId));
  if (path === '/api/devices/code' && method === 'POST') return fromResult(await vault.createCode(deviceId));
  const dev = path.match(/^\/api\/devices\/([a-f0-9]{16})$/);
  if (dev) {
    const id = dev[1]!;
    if (method === 'DELETE') return fromResult(await vault.revokeDevice(id, deviceId), () => ({ ok: true }));
    if (method === 'PUT') {
      const body = await readJson(req);
      if (!body) return json({ error: 'bad request' }, 400);
      return fromResult(await vault.renameDevice(id, body.name), () => ({ ok: true }));
    }
  }

  if (path === '/api/keys' && method === 'GET') return fromResult(await vault.listKeys());
  // TEST ALL (Settings > Keys): one small request per key, inside the proxy. Rate limited to protect free tiers.
  if (path === '/api/keys/test' && method === 'POST') {
    if (Date.now() - lastKeyTest < 30_000) return json({ error: 'wait 30 seconds between tests' }, 429);
    lastKeyTest = Date.now();
    const results = await testAllKeys(async (n) => { const r = await vault.resolveKey(n); return r.ok ? r.data : null; });
    log('keys.test', { ok: results.filter((r) => r.status === 'ok').length, bad: results.filter((r) => r.status === 'rejected' || r.status === 'error').length });
    return json({ at: Date.now(), results });
  }
  const key = path.match(/^\/api\/keys\/([A-Z0-9_]{2,40})$/);
  if (key) {
    const name = key[1]!;
    if (!KEY_NAMES.has(name)) return json({ error: 'unknown key name' }, 400);
    if (method === 'PUT') {
      const body = await readJson(req);
      if (!body) return json({ error: 'bad request' }, 400);
      return fromResult(await vault.putKey(name, body.value), () => ({ ok: true }));
    }
    if (method === 'DELETE') return fromResult(await vault.deleteKey(name), () => ({ ok: true }));
  }

  if (path === '/api/sync' && method === 'POST') {
    const body = await readJson(req, SYNC_MAX_BODY);
    if (!body) return json({ error: 'bad request' }, 400);
    return fromResult(await vault.sync(deviceId, body.since, body.changes));
  }

  const cacheGet = path.match(/^\/api\/cache\/([a-z0-9-]{1,40})$/);
  if (cacheGet && method === 'GET') {
    const r = await vault.getBlob(cacheGet[1]!);
    if (!r.ok) return json({ error: r.error }, r.status);
    if (!r.data) return json({ error: 'no data yet' }, 404);
    return new Response(r.data.body, { headers: { 'content-type': 'application/json', 'x-fetched-at': String(r.data.at), ...SECURITY_HEADERS } });
  }

  if (path === '/api/usage' && method === 'GET') {
    const days = Math.min(90, Math.max(1, Number(url.searchParams.get('days') ?? '30') || 30));
    return fromResult(await vault.usage(days));
  }
  if (path === '/api/audit' && method === 'GET') return fromResult(await vault.audit(100));

  // AI layer (16): POST {feature, input, fresh?}. Prompts and models are fixed server side.
  if (path === '/api/ai' && method === 'POST') {
    const body = await readJson(req, 48 * 1024);
    const resolve = async (n: string) => {
      const r = await vault.resolveKey(n);
      return r.ok ? r.data : null;
    };
    const out = await runAi(body, resolve, (f, m, i, o, usd) => vault.recordUsage(f, m, i, o, usd), ctx);
    log('ai', { feature: typeof body?.feature === 'string' ? body.feature.slice(0, 20) : '?', status: out.status });
    return json(out.body, out.status);
  }

  // Satellite images (SAT): preset sites only.
  if (path === '/api/sat/sites' && method === 'GET') return json(Object.entries(SITES).map(([id, v]) => ({ id, ...v })));
  const sat = path.match(/^\/api\/sat\/([a-z]{1,20})$/);
  if (sat && method === 'GET') {
    const resolve = async (n: string) => {
      const r = await vault.resolveKey(n);
      return r.ok ? r.data : null;
    };
    const res = await satImage(sat[1]!, url.searchParams.get('date') ?? '', resolve, ctx);
    if (res.headers.get('content-type') === 'image/png') return new Response(res.body, { status: 200, headers: { 'content-type': 'image/png', 'x-fetched-at': res.headers.get('x-fetched-at') ?? '', ...SECURITY_HEADERS } });
    return json(await res.json(), res.status);
  }

  // ----- Alerts (18) -----
  if (path === '/api/alerts/history' && method === 'GET') {
    const raw = await secretStore(vault).get('alert_history');
    return json({ items: raw ? (JSON.parse(raw) as Fired[]).slice(0, 150) : [], email: typeof env.ALERT_EMAIL === 'string' && Boolean(env.ALERT_EMAIL) });
  }
  if (path === '/api/alerts/run' && method === 'POST') {
    if (Date.now() - lastManualRun < 60_000) return json({ error: 'wait a minute between manual runs' }, 429);
    lastManualRun = Date.now();
    const fired = await alertsNow(env, vault, ctx, 'manual');
    return json({ fired: fired.length });
  }
  // Failure drill (18.5): writes a test alert to history and sends a test email if email is configured.
  if (path === '/api/alerts/test' && method === 'POST') {
    const deps = alertDeps(env, vault, ctx, []);
    const key = await deps.key('RESEND_API_KEY');
    let emailed = false;
    if (key && deps.email) {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ from: 'Meridian Alerts <onboarding@resend.dev>', to: [deps.email], subject: 'Meridian test alert', text: 'This is a test alert from your Meridian Terminal proxy. Email delivery works.' }) });
      emailed = r.ok;
      if (!r.ok) log('alerts.test.email_failed', { status: r.status });
    }
    const item: Fired = { id: `test:${Date.now()}`, rule: 'test', type: 'system', at: Date.now(), title: 'Test alert', detail: emailed ? 'Email sent.' : key ? 'Email failed (check the Resend key and that ALERT_EMAIL is the Resend account email).' : 'No Resend key saved: banner only.', emailed };
    const hist = JSON.parse((await deps.get('alert_history')) ?? '[]') as Fired[];
    await deps.put('alert_history', JSON.stringify([item, ...hist].slice(0, 300)));
    return json({ ok: true, emailed });
  }

  // ----- Portfolio (17), read only -----
  if (path === '/api/portfolio' && method === 'GET') {
    const st = await readPortfolio(secretStore(vault));
    const tok = await vault.getSecret('rh_tokens');
    const connected = tok.ok && Boolean(tok.data);
    return json({ ...st, connected, stale: !st.snap || isStale(st.snap.at, Date.now()) });
  }
  if (path === '/api/portfolio/refresh' && method === 'POST') {
    const store = secretStore(vault);
    const cur = await readPortfolio(store);
    if (Date.now() - cur.lastTry < 5 * 60_000) return json({ error: 'refreshed less than 5 minutes ago' }, 429);
    return json(await refreshPortfolio(store));
  }
  if (path === '/api/rh/connect' && method === 'POST') {
    try {
      return json({ url: await startAuth(secretStore(vault), url.origin, deviceId) });
    } catch (e) {
      return json({ error: e instanceof Error ? e.message.slice(0, 120) : 'failed' }, 502);
    }
  }
  if (path === '/api/rh' && method === 'DELETE') {
    const store = secretStore(vault);
    await store.del('rh_tokens');
    await store.del('rh_pending');
    await store.log('rh.disconnected', deviceId);
    return json({ ok: true });
  }

  // Upstream gateway: /api/up/<provider>/<path>
  const up = path.match(/^\/api\/up\/([a-z0-9-]+)(\/.*)$/);
  if (up && (method === 'GET' || method === 'POST')) {
    const provider = PROVIDERS[up[1]!];
    if (!provider) return json({ error: 'unknown provider' }, 404);
    const target = buildUpstreamUrl(provider, up[2]!, url.search);
    if (!target || !provider.allow(method, target)) {
      ctx.waitUntil(vault.logBlocked('upstream', `${provider.id} ${up[2]!.slice(0, 80)}`));
      log('upstream.blocked', { provider: provider.id });
      return json({ error: 'blocked by allowlist' }, 403);
    }
    const resolve = async (n: string) => {
      const r = await vault.resolveKey(n);
      return r.ok ? r.data : null;
    };
    const t0 = Date.now();
    let postBody: string | undefined;
    if (method === 'POST') {
      postBody = await req.text();
      if (postBody.length > 8000) return json({ error: 'too large' }, 413);
    }
    const out = await fetchUpstream(provider, target, resolve, ctx, postBody);
    if ('error' in out) return json({ error: out.error }, out.status);
    log('upstream', { provider: provider.id, status: out.res.status, cache: out.cache, ms: Date.now() - t0 });
    if (out.res.status !== 200) {
      if (out.res.status === 424) return json({ error: `${provider.id} key not set (Settings > Keys)` }, 424);
      // 404 is "no such data" (for example a quarter not filed yet), not an outage: pass it through as 404.
      if (out.res.status === 404) return json({ error: `${provider.id} has no data for this request` }, 404);
      return json({ error: `upstream ${provider.id} returned ${out.res.status}` }, 502);
    }
    return new Response(out.res.body, {
      status: 200,
      headers: {
        'content-type': out.res.contentType,
        'x-fetched-at': String(out.res.fetchedAt),
        'x-cache': out.cache,
        ...SECURITY_HEADERS,
      },
    });
  }

  return json({ error: 'not found' }, 404);
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origin = req.headers.get('origin');
    const cors = corsHeaders(origin, env);
    // Strict CORS: a browser request from any other origin is refused outright.
    if (origin && !cors['access-control-allow-origin']) return json({ error: 'origin not allowed' }, 403);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    let res: Response;
    try {
      res = await route(req, env, ctx);
    } catch (e) {
      log('error', { name: e instanceof Error ? e.name : 'unknown' });
      res = json({ error: 'internal error' }, 500);
    }
    const out = new Response(res.body, res);
    for (const [k, v] of Object.entries(cors)) out.headers.set(k, v);
    return out;
  },
  // Hourly portfolio refresh during US market hours (17.2). Cron in wrangler.toml; free plan allows 5 triggers.
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const vault = env.VAULT.get(env.VAULT.idFromName('main'));
    if (event.cron.startsWith('30 ')) {
      const t = await vault.getSecret('rh_tokens');
      if (t.ok && t.data) ctx.waitUntil(refreshPortfolio(secretStore(vault)).then(() => undefined));
      return;
    }
    ctx.waitUntil(alertsNow(env, vault, ctx, event.cron.startsWith('*/10') ? 'market' : 'hourly').then(() => undefined, (e: unknown) => log('alerts.error', { name: e instanceof Error ? e.message.slice(0, 80) : 'error' })));
  },
} satisfies ExportedHandler<Env>;
