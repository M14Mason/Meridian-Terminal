import { beforeEach, describe, expect, it } from 'vitest';
import { POLICY, VaultCore, VaultError, cleanDeviceName } from './vault-core';
import { memorySql } from './test-sql';

const ENC = btoa(String.fromCharCode(...new Uint8Array(32).fill(3)));
const SETUP = 'a'.repeat(64);

let t = 1_700_000_000_000;
let v: VaultCore;
beforeEach(() => {
  t = 1_700_000_000_000;
  v = new VaultCore(memorySql(), { setupSecret: SETUP, encryptionKey: ENC, now: () => t });
});

async function status(p: Promise<unknown>): Promise<number> {
  try {
    await p;
    return 200;
  } catch (e) {
    if (e instanceof VaultError) return e.status;
    throw e;
  }
}

describe('setup pairing', () => {
  it('issues a working token for the right secret', async () => {
    const { token, deviceId } = await v.pairWithSetupSecret(SETUP, 'MacBook');
    expect(await v.authenticate(token)).toBe(deviceId);
    expect(v.listDevices()[0]?.name).toBe('MacBook');
  });
  it('rejects wrong secrets and locks out after the limit', async () => {
    for (let i = 0; i < POLICY.setupMaxFailures; i++) expect(await status(v.pairWithSetupSecret('nope', 'x'))).toBe(401);
    // Even the right secret is refused while locked.
    expect(await status(v.pairWithSetupSecret(SETUP, 'x'))).toBe(429);
    t += POLICY.setupWindowMs + 1;
    expect(await status(v.pairWithSetupSecret(SETUP, 'x'))).toBe(200);
  });
  it('is disabled with no setup secret', async () => {
    const off = new VaultCore(memorySql(), { setupSecret: '', encryptionKey: ENC });
    expect(await status(off.pairWithSetupSecret('', 'x'))).toBe(503);
  });
});

describe('six-digit codes', () => {
  async function paired() {
    return v.pairWithSetupSecret(SETUP, 'first');
  }
  it('pairs once and cannot be replayed', async () => {
    const first = await paired();
    const { code } = await v.createAddDeviceCode(first.deviceId);
    const second = await v.pairWithCode(code, 'iPhone');
    expect(await v.authenticate(second.token)).toBe(second.deviceId);
    expect(await status(v.pairWithCode(code, 'again'))).toBe(401);
  });
  it('expires after 3 minutes', async () => {
    const first = await paired();
    const { code } = await v.createAddDeviceCode(first.deviceId);
    t += POLICY.codeTtlMs;
    expect(await status(v.pairWithCode(code, 'late'))).toBe(401);
  });
  it('is destroyed after 5 wrong attempts', async () => {
    const first = await paired();
    const { code } = await v.createAddDeviceCode(first.deviceId);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < POLICY.codeMaxWrong; i++) expect(await status(v.pairWithCode(wrong, 'x'))).toBe(401);
    expect(await status(v.pairWithCode(code, 'x'))).toBe(401);
  });
  it('a new code replaces the old one', async () => {
    const first = await paired();
    const a = await v.createAddDeviceCode(first.deviceId);
    const b = await v.createAddDeviceCode(first.deviceId);
    if (a.code !== b.code) expect(await status(v.pairWithCode(a.code, 'x'))).toBe(401);
    expect(await status(v.pairWithCode(b.code, 'x'))).toBe(200);
  });
  it('has a global attempt limit', async () => {
    const first = await paired();
    for (let i = 0; i < POLICY.codeGlobalMaxWrong; i++) {
      if (i % 4 === 0) await v.createAddDeviceCode(first.deviceId);
      await status(v.pairWithCode('abc', 'x'));
    }
    const { code } = await v.createAddDeviceCode(first.deviceId);
    expect(await status(v.pairWithCode(code, 'x'))).toBe(429);
  });
  it('rejects malformed codes', async () => {
    expect(await status(v.pairWithCode('12345', 'x'))).toBe(401);
    expect(await status(v.pairWithCode(123456, 'x'))).toBe(401);
  });
});

describe('devices', () => {
  it('revocation is immediate', async () => {
    const a = await v.pairWithSetupSecret(SETUP, 'a');
    const { code } = await v.createAddDeviceCode(a.deviceId);
    const b = await v.pairWithCode(code, 'b');
    v.revokeDevice(b.deviceId, a.deviceId);
    expect(await v.authenticate(b.token)).toBeNull();
    expect(await v.authenticate(a.token)).toBe(a.deviceId);
  });
  it('rejects junk tokens', async () => {
    expect(await v.authenticate(undefined)).toBeNull();
    expect(await v.authenticate('short')).toBeNull();
    expect(await v.authenticate('x'.repeat(43))).toBeNull();
  });
  it('caps device count', async () => {
    for (let i = 0; i < POLICY.maxDevices; i++) await v.pairWithSetupSecret(SETUP, `d${i}`);
    expect(await status(v.pairWithSetupSecret(SETUP, 'one too many'))).toBe(409);
  });
  it('cleans names', () => {
    expect(cleanDeviceName('<script>alert(1)</script>')).toBe('scriptalert(1)script');
    expect(cleanDeviceName('')).toBe('Unnamed device');
  });
});

describe('api keys', () => {
  it('stores encrypted, lists last 4 only, dashboard wins', async () => {
    await v.putKey('FRED_API_KEY', 'abcdef123456');
    expect(await v.getKey('FRED_API_KEY')).toBe('abcdef123456');
    const list = v.listKeys(new Set(['EIA_API_KEY']));
    expect(list.find((k) => k.name === 'FRED_API_KEY')).toMatchObject({ source: 'app', last4: '3456' });
    expect(list.find((k) => k.name === 'EIA_API_KEY')).toMatchObject({ source: 'dashboard', last4: null });
    expect(JSON.stringify(list)).not.toContain('abcdef');
  });
  it('rejects unknown names and bad values', async () => {
    expect(await status(v.putKey('EVIL', 'abcdefgh'))).toBe(400);
    expect(await status(v.putKey('FRED_API_KEY', 'short'))).toBe(400);
    expect(await status(v.putKey('FRED_API_KEY', 'has space inside'))).toBe(400);
  });
  it('deletes', async () => {
    await v.putKey('FRED_API_KEY', 'abcdef123456');
    v.deleteKey('FRED_API_KEY');
    expect(await v.getKey('FRED_API_KEY')).toBeNull();
  });
});

describe('usage meter', () => {
  it('aggregates per day, feature and model', () => {
    v.recordUsage('ask', 'claude-haiku-5-5', 1000, 200, 0.0002);
    v.recordUsage('ask', 'claude-haiku-5-5', 500, 100, 0.0001);
    const [row] = v.usage();
    expect(row).toMatchObject({ feature: 'ask', inputTokens: 1500, outputTokens: 300, calls: 2 });
    expect(row?.usd).toBeCloseTo(0.0003);
  });
});

describe('sync', () => {
  const rec = (id: string, u: number, v: unknown) => ({ c: 'notes', id, u, d: 'spoofed', v });
  it('round-trips and forces the writer id', () => {
    const r = v.sync('devA', 0, [rec('AAPL', t, { text: 'hi' })]);
    expect(r.records).toHaveLength(1);
    expect(r.records[0]).toMatchObject({ id: 'AAPL', d: 'devA', v: { text: 'hi' } });
    expect(v.sync('devB', r.seq, []).records).toHaveLength(0);
  });
  it('last write wins and stale writes are ignored', () => {
    v.sync('devA', 0, [rec('n1', t + 10, 'new')]);
    v.sync('devB', 0, [rec('n1', t + 5, 'old')]);
    expect(v.sync('devC', 0, []).records[0]?.v).toBe('new');
  });
  it('propagates tombstones and prunes them after 90 days', () => {
    v.sync('devA', 0, [rec('n1', t, 'x')]);
    v.sync('devA', 0, [{ c: 'notes', id: 'n1', u: t + 1, d: 'devA', x: 1 }]);
    expect(v.sync('devB', 0, []).records[0]).toMatchObject({ id: 'n1', x: 1 });
    t += 91 * 86_400_000;
    expect(v.sync('devB', 0, []).records).toHaveLength(0);
  });
  it('clamps future clocks', () => {
    v.sync('devA', 0, [rec('n1', t + 10 * 365 * 86_400_000, 'future')]);
    t += 10 * 60_000;
    v.sync('devB', 0, [rec('n1', t, 'now')]);
    expect(v.sync('devC', 0, []).records[0]?.v).toBe('now');
  });
  it('drops invalid records and pages results', () => {
    const many = Array.from({ length: 250 }, (_, i) => rec(`n${i}`, t, i));
    v.sync('devA', 0, [...many.slice(0, 200), { c: 'evil', id: 'x', u: 1, d: 'd', v: 1 }]);
    v.sync('devA', 0, many.slice(200));
    const p1 = v.sync('devB', 0, []);
    expect(p1.records).toHaveLength(200);
    expect(p1.more).toBe(true);
    const p2 = v.sync('devB', p1.seq, []);
    expect(p2.records).toHaveLength(50);
    expect(p2.more).toBe(false);
  });
});
