// Minimal IndexedDB key-value wrapper (no dependency). One database, named stores.

const DB_NAME = 'meridian';
const DB_VERSION = 1;
export const STORES = ['records', 'outbox', 'meta', 'cache'] as const;
export type StoreName = (typeof STORES)[number];

let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      for (const s of STORES) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('indexedDB open failed'));
  });
  return dbp;
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        t.oncomplete = () => resolve(req.result);
        t.onerror = () => reject(t.error ?? new Error('indexedDB tx failed'));
      }),
  );
}

export interface KV {
  get<T>(store: StoreName, key: string): Promise<T | undefined>;
  set(store: StoreName, key: string, value: unknown): Promise<void>;
  del(store: StoreName, key: string): Promise<void>;
  entries<T>(store: StoreName): Promise<[string, T][]>;
  clear(store: StoreName): Promise<void>;
}

export const idb: KV = {
  get: <T,>(store: StoreName, key: string) => tx<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>),
  set: (store, key, value) => tx(store, 'readwrite', (s) => s.put(value, key)).then(() => undefined),
  del: (store, key) => tx(store, 'readwrite', (s) => s.delete(key)).then(() => undefined),
  clear: (store) => tx(store, 'readwrite', (s) => s.clear()).then(() => undefined),
  async entries<T>(store: StoreName) {
    const [keys, vals] = await Promise.all([
      tx<IDBValidKey[]>(store, 'readonly', (s) => s.getAllKeys()),
      tx<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>),
    ]);
    return keys.map((k, i) => [String(k), vals[i] as T]);
  },
};

/** In-memory KV for tests and for browsers with IndexedDB disabled. */
export function memoryKV(): KV {
  const m = new Map<string, Map<string, unknown>>();
  const s = (n: string) => m.get(n) ?? m.set(n, new Map()).get(n)!;
  return {
    get: async <T,>(store: StoreName, key: string) => s(store).get(key) as T | undefined,
    set: async (store, key, value) => void s(store).set(key, structuredClone(value)),
    del: async (store, key) => void s(store).delete(key),
    clear: async (store) => void s(store).clear(),
    entries: async <T,>(store: StoreName) => [...s(store).entries()] as [string, T][],
  };
}
