import { describe, expect, it } from 'vitest';
import { lookupTerm } from './glossary';

describe('glossary', () => {
  it('matches headers and their first word', () => {
    expect(lookupTerm('P/E')).toMatch(/^P\/E: Price to earnings/);
    expect(lookupTerm('RSI(14)')).toMatch(/^RSI/);
    expect(lookupTerm('Beta ▼')).toMatch(/^Beta/);
    expect(lookupTerm('Ticker')).toBeNull();
  });
});
