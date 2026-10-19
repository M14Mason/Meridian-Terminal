import { describe, expect, it } from 'vitest';
import { spokenToCommand } from './voice';

const names: Record<string, string> = { apple: 'AAPL', nvidia: 'NVDA' };
describe('spokenToCommand', () => {
  it('maps names and function words', () => {
    expect(spokenToCommand('show me the Apple chart', (n) => names[n] ?? null)).toBe('AAPL GP');
    expect(spokenToCommand('nvidia supply chain', (n) => names[n] ?? null)).toBe('NVDA SPLC');
    expect(spokenToCommand('open alerts', () => null)).toBe('ALRT');
    expect(spokenToCommand('tsla news', () => null)).toBe('TSLA CN');
  });
});
