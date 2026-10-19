// App-wide sync engine instance, wired to the proxy.
import { useSyncExternalStore } from 'react';
import type { Collection, SyncRequest, SyncResponse } from '../../shared/sync';
import { api, getToken } from '../lib/api';
import { idb, memoryKV } from '../sync/idb';
import { SyncEngine } from '../sync/engine';

const DEVICE_KEY = 'meridian.deviceId';

function deviceId(): string {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? 'local';
  } catch {
    return 'local';
  }
}

export async function refreshDeviceId(): Promise<void> {
  if (!getToken()) return;
  const s = await api<{ deviceId: string }>('/api/session');
  try {
    localStorage.setItem(DEVICE_KEY, s.deviceId);
  } catch {
    // ignore
  }
}

const transport = (req: SyncRequest) => api<SyncResponse>('/api/sync', { method: 'POST', body: req });
const kv = typeof indexedDB === 'undefined' ? memoryKV() : idb;

export const sync = new SyncEngine(kv, transport, deviceId);

let started = false;
/** Starts background flushing: on edit (debounced), when back online, when visible, every 60 s. */
export function startSync(): void {
  if (started) return;
  started = true;
  const tick = () => {
    if (getToken() && navigator.onLine && document.visibilityState === 'visible') void sync.flush();
  };
  window.addEventListener('online', tick);
  document.addEventListener('visibilitychange', tick);
  setInterval(tick, 60_000);
  void refreshDeviceId().catch(() => undefined).finally(tick);
}

export function useSyncStatus() {
  return useSyncExternalStore(
    (fn) => sync.subscribe(fn),
    () => sync.status,
  );
}

/** Re-renders when any record changes. Collections are small, so a full list is fine. */
export function useCollection<T>(c: Collection) {
  useSyncExternalStore(
    (fn) => sync.subscribe(fn),
    () => sync.status,
  );
  return sync.list<T>(c);
}

export function useRecord<T>(c: Collection, id: string): T | undefined {
  useSyncExternalStore(
    (fn) => sync.subscribe(fn),
    () => sync.status,
  );
  return sync.get<T>(c, id);
}
