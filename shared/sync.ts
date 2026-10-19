// Sync model (BUILD_PROMPT 7). Per-item records, last write wins, tombstones for deletes.

export const COLLECTIONS = ['watchlists', 'screens', 'alerts', 'notes', 'journal', 'drawings', 'settings', 'strategies', 'predictions'] as const;
export type Collection = (typeof COLLECTIONS)[number];

export const MAX_RECORD_BYTES = 32 * 1024;
export const MAX_BATCH = 200;
export const TOMBSTONE_TTL_MS = 90 * 86_400_000;

export interface SyncRecord {
  c: Collection;
  id: string;
  /** updatedAt, ms epoch (writer's clock). */
  u: number;
  /** Writer device id. Server overwrites it with the authenticated device. */
  d: string;
  /** Tombstone flag. */
  x?: 1;
  /** Payload. Absent on tombstones. */
  v?: unknown;
}

export interface SyncRequest {
  since: number;
  changes: SyncRecord[];
}

export interface SyncResponse {
  records: SyncRecord[];
  seq: number;
  more: boolean;
}

/** True if `a` should replace `b`. Ties break on device id so every replica agrees. */
export function isNewer(a: Pick<SyncRecord, 'u' | 'd'>, b: Pick<SyncRecord, 'u' | 'd'> | undefined | null): boolean {
  if (!b) return true;
  if (a.u !== b.u) return a.u > b.u;
  return a.d > b.d;
}

const ID_RE = /^[A-Za-z0-9_.:-]{1,80}$/;

/** Validates shape and size. Returns a clean record or null. */
export function validateRecord(raw: unknown): SyncRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!COLLECTIONS.includes(r.c as Collection)) return null;
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
  if (typeof r.u !== 'number' || !Number.isFinite(r.u) || r.u <= 0) return null;
  if (typeof r.d !== 'string' || r.d.length > 40) return null;
  const out: SyncRecord = { c: r.c as Collection, id: r.id, u: Math.floor(r.u), d: r.d };
  if (r.x === 1) {
    out.x = 1;
    return out;
  }
  if (r.v === undefined) return null;
  const size = new TextEncoder().encode(JSON.stringify(r.v)).length;
  if (size > MAX_RECORD_BYTES) return null;
  out.v = r.v;
  return out;
}

export function recordKey(c: Collection, id: string): string {
  return `${c}:${id}`;
}
