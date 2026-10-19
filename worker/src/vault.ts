// Durable Object wrapper around VaultCore. One global instance ("main") holds all owner state.
// Also keeps in-memory rate-limit counters (no storage writes, see BUILD_STATUS decisions).

import { DurableObject } from 'cloudflare:workers';
import { KEY_NAMES } from '../../shared/keys';
import type { Env } from './env';
import { VaultCore, VaultError } from './vault-core';

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const DEVICE_LIMIT_PER_MIN = 300;
const ANON_LIMIT_PER_MIN = 20;

export class Vault extends DurableObject<Env> {
  private core: VaultCore;
  private buckets = new Map<string, { start: number; n: number }>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.core = new VaultCore(ctx.storage.sql, {
      setupSecret: typeof env.SETUP_SECRET === 'string' ? env.SETUP_SECRET : '',
      encryptionKey: typeof env.KEY_ENCRYPTION_KEY === 'string' ? env.KEY_ENCRYPTION_KEY : '',
    });
  }

  private hit(key: string, limit: number): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || now - b.start >= 60_000) {
      this.buckets.set(key, { start: now, n: 1 });
      if (this.buckets.size > 5000) this.buckets.clear();
      return true;
    }
    b.n++;
    return b.n <= limit;
  }

  private async wrap<T>(fn: () => T | Promise<T>): Promise<Result<T>> {
    try {
      return { ok: true, data: await fn() };
    } catch (e) {
      if (e instanceof VaultError) return { ok: false, status: e.status, error: e.publicMessage };
      console.error('vault error', e instanceof Error ? e.name : 'unknown');
      return { ok: false, status: 500, error: 'internal error' };
    }
  }

  private dashboardKeys(): Set<string> {
    return new Set([...KEY_NAMES].filter((n) => typeof this.env[n] === 'string' && (this.env[n] as string).length > 0));
  }

  // Anonymous pairing endpoints, limited per client IP hash.
  pairSetup(ipKey: string, secret: unknown, name: unknown) {
    return this.wrap(() => {
      if (!this.hit(`ip:${ipKey}`, ANON_LIMIT_PER_MIN)) throw new VaultError(429, 'slow down');
      return this.core.pairWithSetupSecret(secret, name);
    });
  }

  pairCode(ipKey: string, code: unknown, name: unknown) {
    return this.wrap(() => {
      if (!this.hit(`ip:${ipKey}`, ANON_LIMIT_PER_MIN)) throw new VaultError(429, 'slow down');
      return this.core.pairWithCode(code, name);
    });
  }

  /** Every authenticated route starts here: token check plus per-device rate limit. */
  authorize(token: unknown) {
    return this.wrap(async () => {
      const id = await this.core.authenticate(token);
      if (!id) throw new VaultError(401, 'unauthorized');
      if (!this.hit(`dev:${id}`, DEVICE_LIMIT_PER_MIN)) throw new VaultError(429, 'slow down');
      return id;
    });
  }

  deviceExists(id: string) {
    return this.wrap(() => this.core.deviceExists(id));
  }
  createCode(deviceId: string) {
    return this.wrap(() => this.core.createAddDeviceCode(deviceId));
  }
  listDevices(deviceId: string) {
    return this.wrap(() => this.core.listDevices(deviceId));
  }
  renameDevice(id: string, name: unknown) {
    return this.wrap(() => this.core.renameDevice(id, name));
  }
  revokeDevice(id: string, byDeviceId: string) {
    return this.wrap(() => this.core.revokeDevice(id, byDeviceId));
  }
  listKeys() {
    return this.wrap(() => this.core.listKeys(this.dashboardKeys()));
  }
  putKey(name: string, value: unknown) {
    return this.wrap(() => this.core.putKey(name, value));
  }
  deleteKey(name: string) {
    return this.wrap(() => this.core.deleteKey(name));
  }
  /** Dashboard secret first (6.5), then the app-saved encrypted key. */
  resolveKey(name: string) {
    return this.wrap(async () => {
      const dash = this.env[name];
      if (typeof dash === 'string' && dash) return dash;
      return this.core.getKey(name);
    });
  }
  recordUsage(feature: string, model: string, inTok: number, outTok: number, usd: number) {
    return this.wrap(() => this.core.recordUsage(feature, model, inTok, outTok, usd));
  }
  usage(days: number) {
    return this.wrap(() => this.core.usage(days));
  }
  sync(deviceId: string, since: unknown, changes: unknown) {
    return this.wrap(() => this.core.sync(deviceId, since, changes));
  }
  logBlocked(what: string, detail: string) {
    return this.wrap(() => this.core.logBlocked(what, detail));
  }
  audit(limit: number) {
    return this.wrap(() => this.core.recentAudit(limit));
  }
}
