import { describe, expect, it } from 'vitest';
import { decrypt, encrypt, randomSixDigits, randomToken, sha256Hex, timingSafeEqual } from './crypto';

const KEY = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));

describe('crypto', () => {
  it('makes 256-bit tokens', () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });
  it('makes six-digit codes', () => {
    for (let i = 0; i < 200; i++) expect(randomSixDigits()).toMatch(/^\d{6}$/);
  });
  it('round-trips AES-GCM and binds AAD', async () => {
    const { iv, ct } = await encrypt(KEY, 'secret-value', 'FRED_API_KEY');
    expect(await decrypt(KEY, iv, ct, 'FRED_API_KEY')).toBe('secret-value');
    await expect(decrypt(KEY, iv, ct, 'EIA_API_KEY')).rejects.toThrow();
  });
  it('compares in constant time', async () => {
    const a = await sha256Hex('x');
    expect(timingSafeEqual(a, await sha256Hex('x'))).toBe(true);
    expect(timingSafeEqual(a, await sha256Hex('y'))).toBe(false);
    expect(timingSafeEqual(a, a.slice(1))).toBe(false);
  });
});
