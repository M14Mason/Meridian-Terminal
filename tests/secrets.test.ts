import { describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script without types
import { scanText } from '../scripts/scan-secrets.mjs';

// 21.5: a test that fails if secret patterns are not detected.
describe('secret scanner', () => {
  it('flags known secret shapes', () => {
    expect(scanText('key = sk-ant-api03-' + 'x'.repeat(40))).toContain('Anthropic key');
    expect(scanText('ghp_' + 'a'.repeat(36))).toContain('GitHub token');
    expect(scanText('-----BEGIN PRIVATE KEY-----')).toContain('Private key block');
    expect(scanText(`api_key: "${'Z'.repeat(30)}"`)).toContain('Generic secret assignment');
  });
  it('passes normal code', () => {
    expect(scanText('const token = await getDeviceToken();')).toEqual([]);
  });
});
