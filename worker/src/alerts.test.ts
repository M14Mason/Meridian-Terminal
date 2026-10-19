import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAlerts, type AlertDeps } from './alerts';

const store = new Map<string, string>();
const deps = (rules: AlertDeps['rules']): AlertDeps => ({
  rules,
  key: async (n) => (n === 'RESEND_API_KEY' ? 're_test' : 'k'),
  get: async (n) => store.get(n) ?? null,
  put: async (n, v) => void store.set(n, v),
  usage: async () => [],
  portfolio: async () => null,
  email: 'owner@example.com',
  ctx: { waitUntil: (p) => void p.catch(() => undefined) },
});

beforeEach(() => {
  store.clear();
  vi.stubGlobal('caches', { default: { match: async () => undefined, put: async () => undefined } });
});
afterEach(() => vi.unstubAllGlobals());

describe('runAlerts', () => {
  it('fires a price rule once, emails it, and respects the cooldown', async () => {
    const sent: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (String(url).includes('resend.com')) { sent.push(String(init?.body)); return new Response('{}', { status: 200 }); }
      return new Response(JSON.stringify({ AAPL: { latestTrade: { p: 120, t: '' }, prevDailyBar: { c: 100 } } }), { status: 200, headers: { 'content-type': 'application/json' } });
    }));
    const rules = [{ id: 'r1', v: { type: 'price_above', sym: 'AAPL', value: 110, enabled: true, email: true } }];
    const a = await runAlerts(deps(rules), 'market', Date.parse('2026-10-20T15:00:00Z'));
    expect(a.map((f) => f.title)).toEqual(['AAPL at 120.00, above 110']);
    expect(a[0]!.emailed).toBe(true);
    expect(sent[0]).toContain('owner@example.com');
    const b = await runAlerts(deps(rules), 'market', Date.parse('2026-10-20T15:10:00Z'));
    expect(b).toEqual([]);
    expect(JSON.parse(store.get('alert_history')!)).toHaveLength(1);
  });
  it('ignores invalid and disabled rules', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })));
    const a = await runAlerts(deps([{ id: 'x', v: { type: 'place_order', enabled: true } }, { id: 'y', v: { type: 'price_above', sym: 'AAPL', value: 1, enabled: false, email: true } }]), 'market');
    expect(a).toEqual([]);
  });
});
