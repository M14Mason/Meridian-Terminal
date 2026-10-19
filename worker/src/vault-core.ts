// Security core of the proxy: devices, pairing, encrypted keys, usage meter, audit log.
// Pure logic over a small SQL interface so it runs in a Durable Object (SqlStorage)
// and in tests (node:sqlite). See BUILD_PROMPT section 6.

import type { AddDeviceCode, DeviceInfo, UsageRow } from '../../shared/api-types';
import { KEY_NAMES, type KeyMeta } from '../../shared/keys';
import { decrypt, encrypt, hmacHex, randomId, randomSixDigits, randomToken, sha256Hex, timingSafeEqual } from './crypto';

export type SqlValue = string | number | null | ArrayBuffer;
export interface Sql {
  exec(query: string, ...bindings: SqlValue[]): { toArray(): Record<string, SqlValue>[] };
}

export class VaultError extends Error {
  constructor(
    readonly status: number,
    readonly publicMessage: string,
  ) {
    super(publicMessage);
  }
}

export const POLICY = {
  setupMaxFailures: 5,
  setupWindowMs: 60 * 60_000,
  codeTtlMs: 3 * 60_000,
  codeMaxWrong: 5,
  codeGlobalMaxWrong: 15,
  codeGlobalWindowMs: 15 * 60_000,
  maxDevices: 10,
  lastSeenThrottleMs: 5 * 60_000,
  auditMaxRows: 500,
} as const;

export interface VaultConfig {
  /** SETUP_SECRET Worker secret. Empty disables setup pairing. */
  setupSecret: string;
  /** KEY_ENCRYPTION_KEY Worker secret, 32 bytes base64. Also peppers pairing code hashes. */
  encryptionKey: string;
  now?: () => number;
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL, last_seen INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS pair_codes (
  id INTEGER PRIMARY KEY, code_hash TEXT NOT NULL, created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL, wrong INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS failures (kind TEXT NOT NULL, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS api_keys (
  name TEXT PRIMARY KEY, iv TEXT NOT NULL, ct TEXT NOT NULL, last4 TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS usage (
  day TEXT NOT NULL, feature TEXT NOT NULL, model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
  usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, feature, model));
CREATE TABLE IF NOT EXISTS audit (at INTEGER NOT NULL, event TEXT NOT NULL, detail TEXT NOT NULL);
`;

export function cleanDeviceName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw : '';
  const cleaned = s.replace(/[^\p{L}\p{N} ._'()-]/gu, '').trim().slice(0, 40);
  return cleaned || 'Unnamed device';
}

export class VaultCore {
  private readonly now: () => number;

  constructor(
    private readonly sql: Sql,
    private readonly cfg: VaultConfig,
  ) {
    this.now = cfg.now ?? Date.now;
    for (const stmt of SCHEMA.split(';').map((s) => s.trim()).filter(Boolean)) sql.exec(stmt);
  }

  private rows(q: string, ...b: SqlValue[]) {
    return this.sql.exec(q, ...b).toArray();
  }

  private audit(event: string, detail = '') {
    this.sql.exec('INSERT INTO audit (at, event, detail) VALUES (?, ?, ?)', this.now(), event, detail.slice(0, 200));
    this.sql.exec(
      'DELETE FROM audit WHERE rowid NOT IN (SELECT rowid FROM audit ORDER BY at DESC LIMIT ?)',
      POLICY.auditMaxRows,
    );
  }

  private countFailures(kind: string, windowMs: number): number {
    const r = this.rows('SELECT COUNT(*) AS n FROM failures WHERE kind = ? AND at > ?', kind, this.now() - windowMs);
    return Number(r[0]?.n ?? 0);
  }

  private addFailure(kind: string) {
    this.sql.exec('INSERT INTO failures (kind, at) VALUES (?, ?)', kind, this.now());
    this.sql.exec('DELETE FROM failures WHERE at < ?', this.now() - 24 * 60 * 60_000);
  }

  private async issueDevice(name: string): Promise<{ token: string; deviceId: string }> {
    const count = Number(this.rows('SELECT COUNT(*) AS n FROM devices')[0]?.n ?? 0);
    if (count >= POLICY.maxDevices) throw new VaultError(409, 'device limit reached, revoke one first');
    const token = randomToken();
    const id = randomId();
    const t = this.now();
    this.sql.exec(
      'INSERT INTO devices (id, name, token_hash, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
      id,
      cleanDeviceName(name),
      await sha256Hex(token),
      t,
      t,
    );
    this.audit('device.paired', id);
    return { token, deviceId: id };
  }

  // ---------- Pairing: first device via setup secret (6.2) ----------

  async pairWithSetupSecret(secret: unknown, deviceName: unknown) {
    if (!this.cfg.setupSecret) throw new VaultError(503, 'setup not configured');
    if (this.countFailures('setup', POLICY.setupWindowMs) >= POLICY.setupMaxFailures) {
      throw new VaultError(429, 'too many attempts, try again later');
    }
    const given = typeof secret === 'string' ? secret.slice(0, 512) : '';
    const ok = timingSafeEqual(await sha256Hex(given), await sha256Hex(this.cfg.setupSecret));
    if (!ok) {
      this.addFailure('setup');
      this.audit('setup.fail');
      throw new VaultError(401, 'pairing failed');
    }
    return this.issueDevice(String(deviceName ?? ''));
  }

  // ---------- Pairing: more devices via six-digit code (6.3) ----------

  private codeHash(code: string) {
    return hmacHex(this.cfg.encryptionKey, `pair:${code}`);
  }

  async createAddDeviceCode(byDeviceId: string): Promise<AddDeviceCode> {
    // Only one live code at a time. A new code destroys the old one.
    this.sql.exec('DELETE FROM pair_codes');
    const code = randomSixDigits();
    const expiresAt = this.now() + POLICY.codeTtlMs;
    this.sql.exec(
      'INSERT INTO pair_codes (code_hash, created_by, expires_at, wrong) VALUES (?, ?, ?, 0)',
      await this.codeHash(code),
      byDeviceId,
      expiresAt,
    );
    this.audit('code.created', byDeviceId);
    return { code, expiresAt };
  }

  async pairWithCode(code: unknown, deviceName: unknown) {
    if (this.countFailures('code', POLICY.codeGlobalWindowMs) >= POLICY.codeGlobalMaxWrong) {
      throw new VaultError(429, 'too many attempts, try again later');
    }
    this.sql.exec('DELETE FROM pair_codes WHERE expires_at <= ?', this.now());
    const live = this.rows('SELECT id, code_hash, wrong FROM pair_codes LIMIT 1')[0];
    const given = typeof code === 'string' && /^\d{6}$/.test(code) ? code : '';
    // Hash even when there is no live code so timing does not reveal whether one exists.
    const givenHash = await this.codeHash(given || 'invalid');
    if (!live || !given || !timingSafeEqual(givenHash, String(live.code_hash))) {
      this.addFailure('code');
      if (live) {
        const wrong = Number(live.wrong) + 1;
        if (wrong >= POLICY.codeMaxWrong) {
          this.sql.exec('DELETE FROM pair_codes WHERE id = ?', live.id as number);
          this.audit('code.destroyed', 'too many wrong attempts');
        } else {
          this.sql.exec('UPDATE pair_codes SET wrong = ? WHERE id = ?', wrong, live.id as number);
        }
      }
      throw new VaultError(401, 'pairing failed');
    }
    // Single use: delete before issuing so a replay of the same code fails.
    this.sql.exec('DELETE FROM pair_codes WHERE id = ?', live.id as number);
    return this.issueDevice(String(deviceName ?? ''));
  }

  // ---------- Sessions and devices ----------

  /** Returns the device id for a valid token, or null. Updates last_seen at most every 5 minutes. */
  async authenticate(token: unknown): Promise<string | null> {
    if (typeof token !== 'string' || token.length < 32 || token.length > 128) return null;
    const hash = await sha256Hex(token);
    const row = this.rows('SELECT id, token_hash, last_seen FROM devices WHERE token_hash = ?', hash)[0];
    if (!row || !timingSafeEqual(String(row.token_hash), hash)) return null;
    const t = this.now();
    if (t - Number(row.last_seen) > POLICY.lastSeenThrottleMs) {
      this.sql.exec('UPDATE devices SET last_seen = ? WHERE id = ?', t, String(row.id));
    }
    return String(row.id);
  }

  listDevices(currentId?: string): DeviceInfo[] {
    return this.rows('SELECT id, name, created_at, last_seen FROM devices ORDER BY created_at').map((r) => ({
      id: String(r.id),
      name: String(r.name),
      createdAt: Number(r.created_at),
      lastSeen: Number(r.last_seen),
      current: r.id === currentId,
    }));
  }

  renameDevice(id: string, name: unknown) {
    this.sql.exec('UPDATE devices SET name = ? WHERE id = ?', cleanDeviceName(name), id);
  }

  /** Immediate: the token stops working on the next request. */
  revokeDevice(id: string, byDeviceId: string) {
    const exists = this.rows('SELECT id FROM devices WHERE id = ?', id).length > 0;
    if (!exists) throw new VaultError(404, 'not found');
    this.sql.exec('DELETE FROM devices WHERE id = ?', id);
    this.audit('device.revoked', `${id} by ${byDeviceId}`);
  }

  // ---------- Encrypted API keys (6.5) ----------

  async putKey(name: string, value: unknown) {
    if (!KEY_NAMES.has(name)) throw new VaultError(400, 'unknown key name');
    if (typeof value !== 'string') throw new VaultError(400, 'invalid value');
    const v = value.trim();
    if (v.length < 8 || v.length > 512 || /\s/.test(v)) throw new VaultError(400, 'invalid value');
    const { iv, ct } = await encrypt(this.cfg.encryptionKey, v, name);
    this.sql.exec(
      'INSERT INTO api_keys (name, iv, ct, last4, updated_at) VALUES (?, ?, ?, ?, ?) ' +
        'ON CONFLICT(name) DO UPDATE SET iv = excluded.iv, ct = excluded.ct, last4 = excluded.last4, updated_at = excluded.updated_at',
      name,
      iv,
      ct,
      v.slice(-4),
      this.now(),
    );
    this.audit('key.saved', name);
  }

  deleteKey(name: string) {
    if (!KEY_NAMES.has(name)) throw new VaultError(400, 'unknown key name');
    this.sql.exec('DELETE FROM api_keys WHERE name = ?', name);
    this.audit('key.deleted', name);
  }

  /** Plaintext for upstream calls only. Never returned to a client. */
  async getKey(name: string): Promise<string | null> {
    const r = this.rows('SELECT iv, ct FROM api_keys WHERE name = ?', name)[0];
    if (!r) return null;
    return decrypt(this.cfg.encryptionKey, String(r.iv), String(r.ct), name);
  }

  /** Write-only view: names, source and last 4 characters only. */
  listKeys(dashboardNames: ReadonlySet<string>): KeyMeta[] {
    const saved = new Map(this.rows('SELECT name, last4, updated_at FROM api_keys').map((r) => [String(r.name), r]));
    return [...KEY_NAMES].map((name): KeyMeta => {
      if (dashboardNames.has(name)) return { name, source: 'dashboard', last4: null, updatedAt: null };
      const r = saved.get(name);
      if (r) return { name, source: 'app', last4: String(r.last4), updatedAt: Number(r.updated_at) };
      return { name, source: 'none', last4: null, updatedAt: null };
    });
  }

  // ---------- Usage meter (16.9 skeleton) ----------

  recordUsage(feature: string, model: string, inputTokens: number, outputTokens: number, usd: number) {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    this.sql.exec(
      'INSERT INTO usage (day, feature, model, input_tokens, output_tokens, usd, calls) VALUES (?, ?, ?, ?, ?, ?, 1) ' +
        'ON CONFLICT(day, feature, model) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens, ' +
        'output_tokens = output_tokens + excluded.output_tokens, usd = usd + excluded.usd, calls = calls + 1',
      day,
      feature.slice(0, 40),
      model.slice(0, 40),
      Math.max(0, Math.round(inputTokens)),
      Math.max(0, Math.round(outputTokens)),
      Math.max(0, usd),
    );
  }

  usage(days = 30): UsageRow[] {
    const since = new Date(this.now() - days * 86_400_000).toISOString().slice(0, 10);
    return this.rows('SELECT * FROM usage WHERE day >= ? ORDER BY day DESC, usd DESC', since).map((r) => ({
      day: String(r.day),
      feature: String(r.feature),
      model: String(r.model),
      inputTokens: Number(r.input_tokens),
      outputTokens: Number(r.output_tokens),
      usd: Number(r.usd),
      calls: Number(r.calls),
    }));
  }

  // ---------- Audit ----------

  logBlocked(what: string, detail: string) {
    this.audit(`blocked.${what}`, detail);
  }

  recentAudit(limit = 50) {
    return this.rows('SELECT at, event, detail FROM audit ORDER BY at DESC LIMIT ?', Math.min(200, limit));
  }
}
