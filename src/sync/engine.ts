// Client sync engine (section 7.3). Local-first: every edit lands in IndexedDB at once and
// in an outbox; the outbox flushes to the proxy when online. Last write wins per item.

import { isNewer, recordKey, type Collection, type SyncRecord, type SyncRequest, type SyncResponse } from '../../shared/sync';
import type { KV } from './idb';

export type Transport = (req: SyncRequest) => Promise<SyncResponse>;

export interface SyncStatus {
  pending: number;
  lastSync: number | null;
  syncing: boolean;
  error: string | null;
}

export class SyncEngine {
  private records = new Map<string, SyncRecord>();
  private listeners = new Set<() => void>();
  private seq = 0;
  private ready: Promise<void>;
  private flushing: Promise<void> | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  status: SyncStatus = { pending: 0, lastSync: null, syncing: false, error: null };

  constructor(
    private kv: KV,
    private transport: Transport | null,
    private deviceId: () => string,
    private now: () => number = Date.now,
  ) {
    this.ready = this.load();
  }

  private async load() {
    for (const [k, r] of await this.kv.entries<SyncRecord>('records')) this.records.set(k, r);
    this.seq = (await this.kv.get<number>('meta', 'seq')) ?? 0;
    this.status.lastSync = (await this.kv.get<number>('meta', 'lastSync')) ?? null;
    this.status.pending = (await this.kv.entries('outbox')).length;
    this.emit();
  }

  whenReady() {
    return this.ready;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit() {
    // New object identity so useSyncExternalStore consumers re-render.
    this.status = { ...this.status };
    for (const fn of this.listeners) fn();
  }

  get<T>(c: Collection, id: string): T | undefined {
    const r = this.records.get(recordKey(c, id));
    return r && !r.x ? (r.v as T) : undefined;
  }

  list<T>(c: Collection): { id: string; value: T; updatedAt: number }[] {
    const out: { id: string; value: T; updatedAt: number }[] = [];
    for (const r of this.records.values()) if (r.c === c && !r.x) out.push({ id: r.id, value: r.v as T, updatedAt: r.u });
    return out.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private async write(rec: SyncRecord) {
    const k = recordKey(rec.c, rec.id);
    const prev = this.records.get(k);
    // Never let a local edit lose to a record we already hold because of clock skew.
    if (prev && rec.u <= prev.u) rec.u = prev.u + 1;
    this.records.set(k, rec);
    this.emit();
    await this.kv.set('records', k, rec);
    await this.kv.set('outbox', k, rec);
    this.status.pending = (await this.kv.entries('outbox')).length;
    this.emit();
    this.schedule(1000);
  }

  put(c: Collection, id: string, value: unknown) {
    return this.write({ c, id, u: this.now(), d: this.deviceId(), v: value });
  }

  remove(c: Collection, id: string) {
    return this.write({ c, id, u: this.now(), d: this.deviceId(), x: 1 });
  }

  schedule(ms: number) {
    if (!this.transport) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.flush(), ms);
  }

  /** Push the outbox and pull remote changes. Safe to call often; concurrent calls share one run. */
  flush(): Promise<void> {
    if (!this.transport) return Promise.resolve();
    this.flushing ??= this.doFlush().finally(() => {
      this.flushing = null;
    });
    return this.flushing;
  }

  private async doFlush() {
    await this.ready;
    const transport = this.transport!;
    this.status.syncing = true;
    this.emit();
    try {
      let more = true;
      while (more) {
        const outbox = await this.kv.entries<SyncRecord>('outbox');
        const sent = outbox.slice(0, 200);
        const res = await transport({ since: this.seq, changes: sent.map(([, r]) => r) });
        // Clear only entries that did not change while the request was in flight.
        for (const [k, r] of sent) {
          const cur = await this.kv.get<SyncRecord>('outbox', k);
          if (cur && cur.u === r.u) await this.kv.del('outbox', k);
        }
        for (const r of res.records) {
          const k = recordKey(r.c, r.id);
          // The server already applied LWW across devices, so it wins, unless a newer local
          // edit is still waiting in the outbox (it goes up on the next round).
          const pending = await this.kv.get<SyncRecord>('outbox', k);
          if (pending && isNewer(pending, r)) continue;
          this.records.set(k, r);
          await this.kv.set('records', k, r);
        }
        this.seq = res.seq;
        await this.kv.set('meta', 'seq', this.seq);
        more = res.more || outbox.length > sent.length;
      }
      this.status.lastSync = this.now();
      await this.kv.set('meta', 'lastSync', this.status.lastSync);
      this.status.error = null;
    } catch (e) {
      this.status.error = e instanceof Error ? e.message : 'sync failed';
    } finally {
      this.status.pending = (await this.kv.entries('outbox')).length;
      this.status.syncing = false;
      this.emit();
    }
  }

  // ---------- Export / import (7.6) ----------

  exportJson(): string {
    const data = [...this.records.values()].filter((r) => !r.x).map(({ c, id, u, v }) => ({ c, id, u, v }));
    return JSON.stringify({ app: 'meridian-terminal', version: 1, exportedAt: this.now(), records: data }, null, 2);
  }

  /** Validates the whole file before writing anything. Returns the number of imported records. */
  async importJson(text: string, validate: (r: unknown) => SyncRecord | null): Promise<number> {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new Error('not valid JSON');
    }
    const p = parsed as { app?: unknown; records?: unknown };
    if (p?.app !== 'meridian-terminal' || !Array.isArray(p.records)) throw new Error('not a Meridian export');
    const clean: SyncRecord[] = [];
    for (const raw of p.records) {
      const r = validate({ ...(raw as object), d: this.deviceId(), u: this.now() });
      if (!r) throw new Error('export contains an invalid record, nothing imported');
      clean.push(r);
    }
    for (const r of clean) await this.write(r);
    return clean.length;
  }
}
