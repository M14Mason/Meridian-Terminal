// Data health tracker (21.3, feature 132). Adapters report every call here (M3 onward).
import { useSyncExternalStore } from 'react';

export type SourceStatus = 'ok' | 'degraded' | 'down' | 'idle' | 'planned';

export interface SourceHealth {
  id: string;
  label: string;
  status: SourceStatus;
  lastSuccess: number | null;
  lastError: string | null;
  latencyMs: number | null;
  calls: number;
  errors: number;
  /** Requests left in the current rate-limit window, if known. */
  headroom: number | null;
  milestone?: string;
}

// Sources start "idle" and turn ok/degraded/down on their first call.
const PLANNED: [string, string, string][] = [
  ['alpaca', 'Alpaca (IEX, single venue)', 'M3'],
  ['finnhub', 'Finnhub', 'M3'],
  ['massive', 'Massive (Polygon) EOD', 'M3'],
  ['sec', 'SEC EDGAR data', 'M3'],
  ['secwww', 'SEC EDGAR files', 'M3'],
  ['fred', 'FRED', 'M3'],
  ['eia', 'EIA', 'M3'],
  ['coingecko', 'CoinGecko', 'M5'],
  ['frankfurter', 'ECB rates (Frankfurter)', 'M5'],
  ['worldbank', 'World Bank', 'M5'],
  ['gdelt', 'GDELT', 'M4'],
  ['aisstream', 'AISStream', 'M6'],
  ['anthropic', 'Claude API', 'M8'],
  ['robinhood', 'Robinhood MCP', 'M10'],
];

const sources = new Map<string, SourceHealth>();
for (const [id, label, milestone] of [['proxy', 'Proxy (Cloudflare Worker)', 'M1'], ['sync', 'Sync', 'M2'], ...PLANNED] as const) {
  sources.set(id, {
    id, label, milestone, status: 'idle',
    lastSuccess: null, lastError: null, latencyMs: null, calls: 0, errors: 0, headroom: null,
  });
}

let snapshot: SourceHealth[] = [...sources.values()];
const listeners = new Set<() => void>();

export function report(id: string, r: { ok: boolean; latencyMs?: number; error?: string; headroom?: number }): void {
  let s = sources.get(id);
  if (!s) {
    s = { id, label: id, status: 'idle', lastSuccess: null, lastError: null, latencyMs: null, calls: 0, errors: 0, headroom: null };
    sources.set(id, s);
  }
  const next: SourceHealth = {
    ...s,
    calls: s.calls + 1,
    errors: s.errors + (r.ok ? 0 : 1),
    latencyMs: r.latencyMs ?? s.latencyMs,
    headroom: r.headroom ?? s.headroom,
    lastSuccess: r.ok ? Date.now() : s.lastSuccess,
    lastError: r.ok ? s.lastError : (r.error ?? 'error'),
    status: r.ok ? 'ok' : s.lastSuccess && Date.now() - s.lastSuccess < 5 * 60_000 ? 'degraded' : 'down',
  };
  sources.set(id, next);
  snapshot = [...sources.values()];
  for (const fn of listeners) fn();
}

export function useHealth(): SourceHealth[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => snapshot,
  );
}
