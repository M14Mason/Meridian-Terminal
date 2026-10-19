// Direct browser calls for KEYLESS public government APIs that refuse TLS from Cloudflare's
// network (HTTP 525 from the proxy, tested 2026-10-19) but allow CORS. No secrets are involved,
// so this is safe; the CSP allows only these two hosts (vite.config.ts).
import { idb } from '../../sync/idb';
import type { Fetched } from '../client';
import { report } from '../health';

const HOSTS = { usaspending: 'https://api.usaspending.gov', treasury: 'https://api.fiscaldata.treasury.gov' } as const;

export async function direct<T>(host: keyof typeof HOSTS, path: string, init: { body?: unknown; maxAgeMs?: number } = {}): Promise<Fetched<T>> {
  const url = HOSTS[host] + path;
  const key = `direct:${url}:${init.body ? JSON.stringify(init.body) : ''}`;
  if (init.maxAgeMs) {
    const c = await idb.get<{ data: T; fetchedAt: number }>('cache', key).catch(() => undefined);
    if (c && Date.now() - c.fetchedAt < init.maxAgeMs) return { ...c, fromCache: true };
  }
  const t0 = performance.now();
  try {
    const r = await fetch(url, init.body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) } : {});
    if (!r.ok) throw new Error(`${host} returned ${r.status}`);
    const data = (await r.json()) as T;
    const out = { data, fetchedAt: Date.now(), fromCache: false };
    void idb.set('cache', key, { data, fetchedAt: out.fetchedAt }).catch(() => undefined);
    report(host, { ok: true, latencyMs: Math.round(performance.now() - t0) });
    return out;
  } catch (e) {
    report(host, { ok: false, error: e instanceof Error ? e.message : 'failed' });
    throw e;
  }
}
