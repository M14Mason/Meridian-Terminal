import { describe, expect, it } from 'vitest';
import { parseCommand, setTickerIndex, suggest, suggestAll } from './command';
import { FUNCTIONS } from './registry';

describe('parseCommand', () => {
  it('parses ticker plus function', () => {
    expect(parseCommand('aapl gp')).toEqual({ code: 'GP', security: 'AAPL' });
    expect(parseCommand('AAPL US Equity GP')).toEqual({ code: 'GP', security: 'AAPL' });
    expect(parseCommand('BRK.B DES')).toEqual({ code: 'DES', security: 'BRK.B' });
  });
  it('parses a bare function and aliases', () => {
    expect(parseCommand('eco')).toEqual({ code: 'ECO', security: null });
    expect(parseCommand('weco')).toEqual({ code: 'ECO', security: null });
    expect(parseCommand('?')).toMatchObject({ code: null });
  });
  it('treats a bare ticker as its chart', () => {
    expect(parseCommand('msft')).toEqual({ code: 'GP', security: 'MSFT' });
  });
  it('reports bad input', () => {
    expect(parseCommand('').error).toBe('empty');
    expect(parseCommand('AAPL XYZZY').error).toContain('unknown function');
    expect(parseCommand('12AB GP').error).toContain('bad ticker');
  });
});

describe('suggest', () => {
  it('ranks exact and prefix matches first', () => {
    expect(suggest('GP')[0]?.fn?.code).toBe('GP');
    expect(suggest('AAPL G')[0]?.command.startsWith('AAPL G')).toBe(true);
    expect(suggest('news').map((s) => s.fn?.code)).toContain('N');
  });
  it('suggests tickers for the first word', () => {
    setTickerIndex([
      { ticker: 'AAPL', name: 'Apple Inc.', exchange: 'Nasdaq' },
      { ticker: 'AAP', name: 'Advance Auto Parts', exchange: 'NYSE' },
      { ticker: 'NVDA', name: 'NVIDIA CORP', exchange: 'Nasdaq' },
    ]);
    const s = suggestAll('aap');
    expect(s[0]?.ticker?.ticker).toBe('AAP');
    expect(s.some((x) => x.ticker?.ticker === 'AAPL')).toBe(true);
    expect(suggestAll('nvidia')[0]?.ticker?.ticker).toBe('NVDA');
    expect(suggestAll('AAPL ').every((x) => x.fn)).toBe(true);
  });
  it('has unique codes and aliases', () => {
    const seen = new Set<string>();
    for (const f of FUNCTIONS) for (const k of [f.code, ...f.aliases]) {
      expect(seen.has(k), k).toBe(false);
      seen.add(k);
    }
  });
});
