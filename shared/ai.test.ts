import { describe, expect, it } from 'vitest';
import { costUsd, estimateUsd, extractJson, FEATURES, validate } from './ai';

describe('ai helpers', () => {
  it('prices usage per million tokens', () => {
    expect(costUsd('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3);
    expect(costUsd('claude-haiku-5-5', { input_tokens: 2000, output_tokens: 500 })).toBeCloseTo(0.00045);
  });
  it('extracts JSON from fenced replies', () => {
    expect(extractJson('Here:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(() => extractJson('nothing')).toThrow();
  });
  it('validates feature schemas', () => {
    const ok = { kind: 'screen', filters: [{ field: 'pe', op: '<', value: 15 }], note: 'cheap stocks' };
    expect(validate(ok, FEATURES.ask.schema)).toBeNull();
    expect(validate({ ...ok, kind: 'buy' }, FEATURES.ask.schema)).toMatch(/kind/);
    expect(validate({ pUp: 1.5, reasoning: [], assumptions: [], vsBaseline: '' }, FEATURES.predict.schema)).toMatch(/above/);
  });
  it('estimates cost before a run', () => {
    expect(estimateUsd('cmp', 12000)).toBeGreaterThan(0.03);
    expect(estimateUsd('cmp', 12000)).toBeLessThan(0.1);
  });
});
