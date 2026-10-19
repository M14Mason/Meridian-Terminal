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

import { spendSpike } from './ai';
describe('spendSpike', () => {
  it('warns on a spike but not on normal days', () => {
    const rows = Array.from({ length: 14 }, (_, i) => ({ day: new Date(Date.parse('2026-10-19') - (i + 1) * 86_400_000).toISOString().slice(0, 10), usd: 0.2 }));
    expect(spendSpike([...rows, { day: '2026-10-19', usd: 0.3 }], '2026-10-19').warn).toBe(false);
    expect(spendSpike([...rows, { day: '2026-10-19', usd: 0.9 }], '2026-10-19').warn).toBe(true);
    expect(spendSpike([{ day: '2026-10-19', usd: 6 }], '2026-10-19').warn).toBe(true);
  });
});

import { toJsonSchema } from './ai';
describe('toJsonSchema', () => {
  it('maps required and optional fields, enums and ranges', () => {
    const j = toJsonSchema(FEATURES.ask.schema) as { required: string[]; properties: Record<string, { enum?: string[] }> };
    expect(j.required).toEqual(['kind', 'note']);
    expect(j.properties.kind!.enum).toEqual(['screen', 'command', 'unknown']);
    const pUp = (toJsonSchema(FEATURES.predict.schema) as { properties: { pUp: Record<string, unknown> } }).properties.pUp;
    expect(pUp.minimum).toBeUndefined();
    expect(pUp.description).toBe('A number at least 0.02 and at most 0.98.');
    expect(JSON.stringify(toJsonSchema(FEATURES.cmp.schema))).not.toMatch(/maxLength|maxItems|minimum|maximum/);
  });
});
