import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runAi } from './ai';

const store = new Map<string, Response>();
const ctx = { waitUntil: (p: Promise<unknown>) => void p.catch(() => undefined), passThroughOnException: () => undefined } as { waitUntil(p: Promise<unknown>): void };
const reply = (text: string) => new Response(JSON.stringify({ content: [{ type: 'text', text }], usage: { input_tokens: 1000, output_tokens: 200 } }), { status: 200 });

beforeEach(() => {
  store.clear();
  vi.stubGlobal('caches', { default: { match: async (r: Request) => store.get(r.url)?.clone(), put: async (r: Request, res: Response) => void store.set(r.url, res) } });
});
afterEach(() => vi.unstubAllGlobals());

const good = JSON.stringify({ summary: 's', points: ['a'], watch: 'w' });

describe('runAi', () => {
  it('rejects unknown features and missing keys', async () => {
    const rec = vi.fn(async () => undefined);
    expect((await runAi({ feature: 'trade', input: 'x' }, async () => 'k', rec, ctx)).status).toBe(400);
    expect((await runAi({ feature: 'explain', input: 'x' }, async () => null, rec, ctx)).status).toBe(424);
  });

  it('validates, meters usage and caches', async () => {
    const f = vi.fn(async () => reply(good));
    vi.stubGlobal('fetch', f);
    const rec = vi.fn(async () => undefined);
    const a = await runAi({ feature: 'explain', input: 'panel text' }, async () => 'k', rec, ctx);
    expect(a.status).toBe(200);
    expect((a.body as { result: { summary: string } }).result.summary).toBe('s');
    expect(rec).toHaveBeenCalledWith('explain', 'claude-haiku-5-5', 1000, 200, expect.closeTo(0.0002, 6));
    await new Promise((r) => setTimeout(r, 0));
    const b = await runAi({ feature: 'explain', input: 'panel text' }, async () => 'k', rec, ctx);
    expect((b.body as { cached: boolean }).cached).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    // The key goes only in the x-api-key header.
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['x-api-key']).toBe('k');
    expect(String(init.body)).not.toContain('"k"');
  });

  it('retries once on a bad reply, then gives up with 422', async () => {
    const f = vi.fn().mockResolvedValueOnce(reply('not json')).mockResolvedValueOnce(reply(good));
    vi.stubGlobal('fetch', f);
    const ok = await runAi({ feature: 'explain', input: 'p2' }, async () => 'k', async () => undefined, ctx);
    expect(ok.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    vi.stubGlobal('fetch', vi.fn(async () => reply('{"summary": 3}')));
    const bad = await runAi({ feature: 'explain', input: 'p3' }, async () => 'k', async () => undefined, ctx);
    expect(bad.status).toBe(422);
  });

  it('maps a rejected key to a clear message without leaking the body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"secret detail"}', { status: 401 })));
    const r = await runAi({ feature: 'explain', input: 'p4' }, async () => 'k', async () => undefined, ctx);
    expect(r.status).toBe(424);
    expect(JSON.stringify(r.body)).not.toContain('secret detail');
  });
});
