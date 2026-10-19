import { describe, expect, it } from 'vitest';
import { isNewer, MAX_RECORD_BYTES, validateRecord } from './sync';

describe('isNewer (last write wins)', () => {
  it('prefers later timestamps', () => {
    expect(isNewer({ u: 2, d: 'a' }, { u: 1, d: 'z' })).toBe(true);
    expect(isNewer({ u: 1, d: 'z' }, { u: 2, d: 'a' })).toBe(false);
  });
  it('breaks ties deterministically by device id', () => {
    expect(isNewer({ u: 5, d: 'b' }, { u: 5, d: 'a' })).toBe(true);
    expect(isNewer({ u: 5, d: 'a' }, { u: 5, d: 'b' })).toBe(false);
    expect(isNewer({ u: 5, d: 'a' }, { u: 5, d: 'a' })).toBe(false);
  });
  it('anything beats nothing', () => {
    expect(isNewer({ u: 1, d: 'a' }, undefined)).toBe(true);
  });
});

describe('validateRecord', () => {
  it('accepts records and tombstones', () => {
    expect(validateRecord({ c: 'notes', id: 'AAPL', u: 1, d: 'dev', v: { text: 'hi' } })).toBeTruthy();
    expect(validateRecord({ c: 'notes', id: 'AAPL', u: 1, d: 'dev', x: 1, v: 'dropped' })).toEqual({ c: 'notes', id: 'AAPL', u: 1, d: 'dev', x: 1 });
  });
  it('rejects bad input', () => {
    expect(validateRecord({ c: 'portfolio', id: 'x', u: 1, d: 'd', v: 1 })).toBeNull();
    expect(validateRecord({ c: 'notes', id: 'bad id/', u: 1, d: 'd', v: 1 })).toBeNull();
    expect(validateRecord({ c: 'notes', id: 'x', u: -1, d: 'd', v: 1 })).toBeNull();
    expect(validateRecord({ c: 'notes', id: 'x', u: 1, d: 'd' })).toBeNull();
    expect(validateRecord({ c: 'notes', id: 'x', u: 1, d: 'd', v: 'a'.repeat(MAX_RECORD_BYTES) })).toBeNull();
    expect(validateRecord(null)).toBeNull();
  });
});
