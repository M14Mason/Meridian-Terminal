// The proxy (BUILD_PROMPT 5.2, 6). Every route except /api/health and /api/pair/* needs a device token.

import { KEY_NAMES } from '../../shared/keys';
import type { Env } from './env';
import { log } from './log';
import { fetchUpstream, PROVIDERS, buildUpstreamUrl } from './upstream';
import type { Result } from './vault';

export { Vault } from './vault';
export { AisHub } from './aishub';
import { hmacHex, timingSafeEqual } from './crypto';

const MAX_BODY = 16 * 1024;
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
    return env.AIS.get(env.AIS.idFromName('global')).fetch(new Request('https://ais/ws', req));
  }
  if (path === '/api/ais/ingest' && method === 'POST') {
    if (!(await isAdmin(req, env))) return json({ error: 'unauthorized' }, 401);
    return env.AIS.get(env.AIS.idFromName('global')).fetch(new Request('https://ais/ingest', { method: 'POST', body: await req.text() }));
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
  if (path === '/api/ais/snapshot' && method === 'GET') {
    const r = await env.AIS.get(env.AIS.idFromName('global')).fetch('https://ais/snapshot');
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

  // Upstream gateway: /api/up/<provider>/<path>
  const up = path.match(/^\/api\/up\/([a-z0-9-]+)(\/.*)$/);
  if (up && method === 'GET') {
    const provider = PROVIDERS[up[1]!];
    if (!provider) return json({ error: 'unknown provider' }, 404);
    const target = buildUpstreamUrl(provider, up[2]!, url.search);
    if (!target || !provider.allow('GET', target)) {
      ctx.waitUntil(vault.logBlocked('upstream', `${provider.id} ${up[2]!.slice(0, 80)}`));
      log('upstream.blocked', { provider: provider.id });
      return json({ error: 'blocked by allowlist' }, 403);
    }
    const resolve = async (n: string) => {
      const r = await vault.resolveKey(n);
      return r.ok ? r.data : null;
    };
    const t0 = Date.now();
    const out = await fetchUpstream(provider, target, resolve, ctx);
    if ('error' in out) return json({ error: out.error }, out.status);
    log('upstream', { provider: provider.id, status: out.res.status, cache: out.cache, ms: Date.now() - t0 });
    if (out.res.status !== 200) {
      if (out.res.status === 424) return json({ error: `${provider.id} key not set (Settings > Keys)` }, 424);
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
} satisfies ExportedHandler<Env>;
