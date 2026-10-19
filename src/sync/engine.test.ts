import { describe, expect, it } from 'vitest';
import { validateRecord, type SyncRecord, type SyncRequest, type SyncResponse } from '../../shared/sync';
import { memoryKV } from './idb';
import { SyncEngine } from './engine';

/** Fake server with the same LWW rules as the proxy. */
function fakeServer() {
  const rows = new Map<string, SyncRecord & { seq: number }>();
  let seq = 0;
  let online = true;
  const transport = async (dev: string, req: SyncRequest): Promise<SyncResponse> => {
    if (!online) throw new Error('offline');
    for (const r of req.changes) {
      const k = `${r.c}:${r.id}`;
      const cur = rows.get(k);
      const rec = { ...r, d: dev };
      if (!cur || rec.u > cur.u || (rec.u === cur.u && rec.d > cur.d)) rows.set(k, { ...rec, seq: ++seq });
    }
    const out = [...rows.values()].filter((r) => r.seq > req.since).sort((a, b) => a.seq - b.seq);
    return { records: out.map(({ seq: _s, ...r }) => r), seq: out.at(-1)?.seq ?? Math.max(req.since, seq), more: false };
  };
  return { transport, setOnline: (v: boolean) => (online = v) };
}

function device(server: ReturnType<typeof fakeServer>, id: string, clock: () => number) {
  return new SyncEngine(memoryKV(), (req) => server.transport(id, req), () => id, clock);
}

describe('SyncEngine', () => {
  it('syncs edits between devices', async () => {
    let t = 1000;
    const s = fakeServer();
    const a = device(s, 'A', () => t);
    const b = device(s, 'B', () => t);
    await a.put('notes', 'AAPL', { text: 'buy the dip?' });
    await a.flush();
    await b.flush();
    expect(b.get('notes', 'AAPL')).toEqual({ text: 'buy the dip?' });
    t += 10;
    await b.remove('notes', 'AAPL');
    await b.flush();
    await a.flush();
    expect(a.get('notes', 'AAPL')).toBeUndefined();
  });

  it('queues offline edits and flushes later', async () => {
    const s = fakeServer();
    const a = device(s, 'A', () => 5000);
    s.setOnline(false);
    await a.put('watchlists', 'core', ['AAPL', 'MSFT']);
    await a.flush();
    expect(a.status.pending).toBe(1);
    expect(a.status.error).toBe('offline');
    s.setOnline(true);
    await a.flush();
    expect(a.status.pending).toBe(0);
  });

  it('last write wins across devices', async () => {
    let t = 1000;
    const s = fakeServer();
    const a = device(s, 'A', () => t);
    const b = device(s, 'B', () => t);
    await a.put('settings', 'main', { theme: 'dark' });
    t = 2000;
    await b.put('settings', 'main', { theme: 'light' });
    await b.flush();
    await a.flush();
    expect(a.get('settings', 'main')).toEqual({ theme: 'light' });
    await b.flush();
    expect(b.get('settings', 'main')).toEqual({ theme: 'light' });
  });

  it('exports and validates imports', async () => {
    const a = new SyncEngine(memoryKV(), null, () => 'A', () => 1);
    await a.put('notes', 'X', { text: 'hello' });
    const json = a.exportJson();
    const b = new SyncEngine(memoryKV(), null, () => 'B', () => 2);
    expect(await b.importJson(json, validateRecord)).toBe(1);
    expect(b.get('notes', 'X')).toEqual({ text: 'hello' });
    await expect(b.importJson('{"app":"other"}', validateRecord)).rejects.toThrow('not a Meridian export');
    await expect(b.importJson(JSON.stringify({ app: 'meridian-terminal', records: [{ c: 'evil', id: 'x', v: 1 }] }), validateRecord)).rejects.toThrow();
  });
});
