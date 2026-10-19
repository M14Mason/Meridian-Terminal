// Robinhood portfolio (BUILD_PROMPT 17), READ ONLY. The proxy is the MCP client for Robinhood's official
// Trading MCP server. OAuth 2.1 with PKCE and dynamic client registration; the owner signs in on Robinhood's
// own page. Tokens and snapshots are stored encrypted in the vault. Every tool call passes the read allowlist
// (6.7); order tools can never be called.
import { isRobinhoodToolAllowed } from '../../shared/allowlists';
import { findAccounts, findPositions, toolJson, type Snapshot } from '../../shared/portfolio';

export const RH = {
  mcp: 'https://agent.robinhood.com/mcp/trading',
  register: 'https://agent.robinhood.com/oauth/trading/register',
  authorize: 'https://robinhood.com/oauth',
  token: 'https://api.robinhood.com/oauth2/token/',
};

export interface SecretStore {
  get(name: string): Promise<string | null>;
  put(name: string, value: string): Promise<void>;
  del(name: string): Promise<void>;
  log(event: string, detail: string): Promise<void>;
}

interface Tokens { access: string; refresh: string | null; exp: number }

const b64url = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b instanceof Uint8Array ? b : new Uint8Array(b)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const rand = (n = 32) => b64url(crypto.getRandomValues(new Uint8Array(n)));

async function clientId(store: SecretStore, redirect: string): Promise<string> {
  const saved = await store.get('rh_client');
  if (saved) {
    const c = JSON.parse(saved) as { id: string; redirect: string };
    if (c.redirect === redirect) return c.id;
  }
  const r = await fetch(RH.register, {
    signal: AbortSignal.timeout(20_000),
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Meridian Terminal (personal, read only)', redirect_uris: [redirect], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
  });
  if (!r.ok) throw new Error(`registration failed (${r.status})`);
  const j = (await r.json()) as { client_id: string };
  await store.put('rh_client', JSON.stringify({ id: j.client_id, redirect }));
  return j.client_id;
}

/** Step 1: returns Robinhood's sign-in URL. State and the PKCE verifier are kept for 10 minutes, single use. */
export async function startAuth(store: SecretStore, origin: string, deviceId: string): Promise<string> {
  const redirect = `${origin}/api/rh/callback`;
  const id = await clientId(store, redirect);
  const verifier = rand(48);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const state = rand(24);
  await store.put('rh_pending', JSON.stringify({ state, verifier, deviceId, exp: Date.now() + 10 * 60_000 }));
  const u = new URL(RH.authorize);
  for (const [k, v] of Object.entries({ response_type: 'code', client_id: id, redirect_uri: redirect, state, code_challenge: challenge, code_challenge_method: 'S256', scope: 'internal', resource: RH.mcp })) u.searchParams.set(k, v);
  return u.toString();
}

async function tokenRequest(form: Record<string, string>): Promise<Tokens> {
  const r = await fetch(RH.token, { method: 'POST', signal: AbortSignal.timeout(20_000), headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' }, body: new URLSearchParams(form) });
  if (!r.ok) throw new Error(`token endpoint returned ${r.status}`);
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!j.access_token) throw new Error('token endpoint returned no access token');
  return { access: j.access_token, refresh: j.refresh_token ?? null, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
}

/** Step 2: Robinhood redirects here with a code. Exchanges it and stores tokens encrypted. */
export async function finishAuth(store: SecretStore, origin: string, code: string, state: string): Promise<void> {
  const raw = await store.get('rh_pending');
  await store.del('rh_pending'); // single use, success or not
  if (!raw) throw new Error('no sign-in in progress');
  const p = JSON.parse(raw) as { state: string; verifier: string; exp: number };
  if (p.exp < Date.now() || p.state !== state) throw new Error('sign-in expired or state mismatch');
  const redirect = `${origin}/api/rh/callback`;
  const id = await clientId(store, redirect);
  const t = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: id, code_verifier: p.verifier, resource: RH.mcp });
  await store.put('rh_tokens', JSON.stringify(t));
  await store.log('rh.connected', 'oauth complete');
}

async function accessToken(store: SecretStore): Promise<string | null> {
  const raw = await store.get('rh_tokens');
  if (!raw) return null;
  const t = JSON.parse(raw) as Tokens;
  if (t.exp - Date.now() > 120_000) return t.access;
  if (!t.refresh) return null;
  const c = JSON.parse((await store.get('rh_client')) ?? '{}') as { id?: string };
  if (!c.id) return null;
  const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: c.id, resource: RH.mcp });
  await store.put('rh_tokens', JSON.stringify({ ...n, refresh: n.refresh ?? t.refresh }));
  return n.access;
}

// ---------- Minimal MCP client (Streamable HTTP) ----------
class Mcp {
  private session: string | null = null;
  private id = 0;
  constructor(private token: string) {}

  private async rpc(method: string, params: unknown, notify = false): Promise<unknown> {
    const headers: Record<string, string> = { authorization: `Bearer ${this.token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18' };
    if (this.session) headers['mcp-session-id'] = this.session;
    const id = notify ? undefined : ++this.id;
    const r = await fetch(RH.mcp, { method: 'POST', signal: AbortSignal.timeout(30_000), headers, body: JSON.stringify({ jsonrpc: '2.0', ...(id ? { id } : {}), method, params }) });
    if (r.status === 401) throw new AuthError();
    if (!r.ok && !(notify && r.status === 202)) throw new Error(`MCP ${method} returned ${r.status}`);
    this.session = r.headers.get('mcp-session-id') ?? this.session;
    if (notify) return null;
    const text = await r.text();
    const msgs = (r.headers.get('content-type') ?? '').includes('text/event-stream')
      ? text.split('\n').filter((l) => l.startsWith('data:')).map((l) => { try { return JSON.parse(l.slice(5)); } catch { return null; } })
      : [JSON.parse(text)];
    const m = msgs.find((x) => x && x.id === id) as { result?: unknown; error?: { message: string } } | undefined;
    if (!m) throw new Error(`MCP ${method}: no response`);
    if (m.error) throw new Error(`MCP ${method}: ${m.error.message.slice(0, 120)}`);
    return m.result;
  }

  async init() {
    await this.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'meridian-terminal', version: '1.0' } });
    await this.rpc('notifications/initialized', {}, true);
  }
  async tools(): Promise<{ name: string; inputSchema?: { required?: string[] } }[]> {
    const r = (await this.rpc('tools/list', {})) as { tools: { name: string; inputSchema?: { required?: string[] } }[] };
    return r.tools ?? [];
  }
  /** The only way to call a tool. Blocks anything not on the read allowlist (6.7). */
  async call(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    if (!isRobinhoodToolAllowed(name)) throw new Error(`blocked tool: ${name}`);
    return this.rpc('tools/call', { name, arguments: args });
  }
}
class AuthError extends Error {}

/** Reads accounts and positions and returns a normalized snapshot. */
export async function snapshot(store: SecretStore): Promise<{ ok: true; snap: Snapshot } | { ok: false; error: string; disconnected: boolean }> {
  try {
    const token = await accessToken(store);
    if (!token) return { ok: false, error: 'Robinhood not connected', disconnected: true };
    const c = new Mcp(token);
    await c.init();
    const list = await c.tools();
    const req = new Map(list.map((t) => [t.name, t.inputSchema?.required ?? []]));
    const unknownWrite = list.map((t) => t.name).filter((n) => !isRobinhoodToolAllowed(n));
    const notes: string[] = [];
    const accountsJson = req.has('get_accounts') ? toolJson(await c.call('get_accounts')) : null;
    const accounts = findAccounts(accountsJson);
    const rawIds: string[] = [];
    JSON.stringify(accountsJson ?? null, (k, v) => { if ((k === 'account_number' || k === 'account_id') && typeof v === 'string') rawIds.push(v); return v; });
    const positions: Snapshot['positions'] = [];
    for (const [tool, type] of [['get_equity_positions', 'equity'], ['get_option_positions', 'option'], ['get_crypto_positions', 'crypto']] as const) {
      if (!req.has(tool)) { notes.push(`${tool} not offered by the server`); continue; }
      const need = req.get(tool)!;
      const targets: Record<string, unknown>[] = need.includes('account_number') ? rawIds.map((a) => ({ account_number: a })) : need.length ? [] : [{}];
      if (!targets.length) { notes.push(`${tool} needs inputs ${need.join(', ')}; skipped`); continue; }
      for (const args of targets) {
        try {
          positions.push(...findPositions(toolJson(await c.call(tool, args)), type, typeof args.account_number === 'string' ? args.account_number : null));
        } catch (e) {
          notes.push(`${tool} failed: ${e instanceof Error ? e.message : 'error'}`);
        }
      }
    }
    if (unknownWrite.length) await store.log('rh.tools', `server offers ${unknownWrite.length} non-read tools (blocked)`);
    return { ok: true, snap: { at: Date.now(), source: 'mcp', accounts, positions, notes } };
  } catch (e) {
    if (e instanceof AuthError) return { ok: false, error: 'Robinhood sign-in expired; reconnect in PORT', disconnected: true };
    return { ok: false, error: e instanceof Error ? e.message.slice(0, 160) : 'error', disconnected: false };
  }
}
