// AI layer definitions shared by the proxy and the app (BUILD_PROMPT 16). Code computes, Claude explains.

export const MODELS = { haiku: 'claude-haiku-5-5', sonnet: 'claude-sonnet-5-5', opus: 'claude-opus-5-5' } as const;
export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** USD per million tokens, checked on platform.claude.com/docs/en/about-claude/pricing on 2026-10-19. */
export const PRICES: Record<ModelId, { in: number; out: number; cacheRead: number; cacheWrite: number }> = {
  'claude-haiku-5-5': { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  'claude-sonnet-5-5': { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  'claude-opus-5-5': { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
};
/** Haiku prompts over 100k tokens cost 5x; the proxy rejects inputs that large anyway. */

export interface Usage { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
export function costUsd(model: ModelId, u: Usage): number {
  const p = PRICES[model];
  return ((u.input_tokens ?? 0) * p.in + (u.output_tokens ?? 0) * p.out + (u.cache_read_input_tokens ?? 0) * p.cacheRead + (u.cache_creation_input_tokens ?? 0) * p.cacheWrite) / 1e6;
}

// ---------- Tiny JSON schema (enough for our outputs) ----------
export type Schema =
  | { t: 'string'; max?: number; enum?: readonly string[] }
  | { t: 'number'; min?: number; max?: number }
  | { t: 'boolean' }
  | { t: 'array'; of: Schema; max?: number }
  | { t: 'object'; props: Record<string, Schema>; optional?: readonly string[] };

/** Returns null when valid, else the first problem as a short path message. */
export function validate(v: unknown, s: Schema, path = '$'): string | null {
  switch (s.t) {
    case 'string':
      if (typeof v !== 'string') return `${path} not a string`;
      if (s.enum && !s.enum.includes(v)) return `${path} not one of ${s.enum.join('|')}`;
      if (s.max && v.length > s.max) return `${path} too long`;
      return null;
    case 'number':
      if (typeof v !== 'number' || !Number.isFinite(v)) return `${path} not a number`;
      if (s.min != null && v < s.min) return `${path} below ${s.min}`;
      if (s.max != null && v > s.max) return `${path} above ${s.max}`;
      return null;
    case 'boolean':
      return typeof v === 'boolean' ? null : `${path} not a boolean`;
    case 'array':
      if (!Array.isArray(v)) return `${path} not an array`;
      if (s.max && v.length > s.max) return `${path} too many items`;
      for (let i = 0; i < v.length; i++) {
        const e = validate(v[i], s.of, `${path}[${i}]`);
        if (e) return e;
      }
      return null;
    case 'object': {
      if (!v || typeof v !== 'object' || Array.isArray(v)) return `${path} not an object`;
      const o = v as Record<string, unknown>;
      for (const [k, sub] of Object.entries(s.props)) {
        if (!(k in o) || o[k] == null) {
          if (s.optional?.includes(k)) continue;
          return `${path}.${k} missing`;
        }
        const e = validate(o[k], sub, `${path}.${k}`);
        if (e) return e;
      }
      return null;
    }
  }
}

/** Pulls the first JSON object out of a model reply (tolerates code fences and stray text). */
export function extractJson(text: string): unknown {
  const t = text.replace(/```(?:json)?/g, '');
  const a = t.indexOf('{');
  const b = t.lastIndexOf('}');
  if (a < 0 || b <= a) throw new Error('no JSON object in reply');
  return JSON.parse(t.slice(a, b + 1));
}

const str = (max = 600): Schema => ({ t: 'string', max });
const strs = (max = 8, len = 400): Schema => ({ t: 'array', of: str(len), max });

export type Feature = 'explain' | 'ask' | 'valuation' | 'predict' | 'brief' | 'critic' | 'filing' | 'cmp' | 'supply';

export interface FeatureSpec { model: ModelId; maxTokens: number; version: string; cacheTtl: number; schema: Schema; maxInput: number }

export const FEATURES: Record<Feature, FeatureSpec> = {
  explain: { model: MODELS.haiku, maxTokens: 700, version: 'explain-2', cacheTtl: 6 * 3600, maxInput: 9000, schema: { t: 'object', props: { summary: str(700), points: strs(6), watch: str(400) } } },
  ask: {
    model: MODELS.haiku, maxTokens: 500, version: 'ask-2', cacheTtl: 24 * 3600, maxInput: 8000,
    schema: { t: 'object', optional: ['filters', 'sort', 'desc', 'command'], props: {
      kind: { t: 'string', enum: ['screen', 'command', 'unknown'] },
      filters: { t: 'array', max: 10, of: { t: 'object', props: { field: str(20), op: { t: 'string', enum: ['>', '<'] }, value: { t: 'number' } } } },
      sort: str(20), desc: { t: 'boolean' }, command: str(60), note: str(300),
    } },
  },
  valuation: {
    model: MODELS.sonnet, maxTokens: 1200, version: 'val-2', cacheTtl: 24 * 3600, maxInput: 9000,
    schema: { t: 'object', props: { verdict: { t: 'string', enum: ['undervalued', 'fairly valued', 'overvalued', 'unclear'] }, low: { t: 'number', min: 0 }, high: { t: 'number', min: 0 }, reasoning: strs(6), agreesWithCode: { t: 'boolean' }, disagreement: str(500), risks: strs(5) } },
  },
  predict: {
    model: MODELS.sonnet, maxTokens: 900, version: 'pred-2', cacheTtl: 6 * 3600, maxInput: 9000,
    schema: { t: 'object', props: { pUp: { t: 'number', min: 0.02, max: 0.98 }, reasoning: strs(6), assumptions: strs(5), vsBaseline: str(400) } },
  },
  brief: { model: MODELS.haiku, maxTokens: 900, version: 'brief-2', cacheTtl: 12 * 3600, maxInput: 12000, schema: { t: 'object', props: { headline: str(200), bullets: strs(8), watch: strs(5) } } },
  critic: { model: MODELS.sonnet, maxTokens: 1200, version: 'critic-2', cacheTtl: 24 * 3600, maxInput: 12000, schema: { t: 'object', props: { strengths: strs(5), mistakes: strs(6), patterns: strs(5), rules: strs(5) } } },
  filing: { model: MODELS.haiku, maxTokens: 900, version: 'filing-2', cacheTtl: 30 * 86400, maxInput: 30000, schema: { t: 'object', props: { summary: str(800), changes: strs(8), risks: strs(6), tone: { t: 'string', enum: ['more cautious', 'similar', 'more confident', 'unclear'] } } } },
  supply: {
    model: MODELS.sonnet, maxTokens: 2500, version: 'supply-2', cacheTtl: 90 * 86400, maxInput: 30000,
    schema: { t: 'object', props: {
      industry: str(120),
      rels: { t: 'array', max: 60, of: { t: 'object', optional: ['share', 'geo'], props: { n: str(120), k: { t: 'string', enum: ['supplier', 'customer', 'partner'] }, what: str(160), share: { t: 'number', min: 0, max: 100 }, geo: str(80), conf: { t: 'number', min: 0, max: 1 }, ev: str(140) } } },
      facilities: { t: 'array', max: 30, of: { t: 'object', props: { type: str(40), place: str(120), country: str(60) } } },
      gaps: str(400),
    } },
  },
  cmp: {
    model: MODELS.sonnet, maxTokens: 5000, version: 'cmp-2', cacheTtl: 3600, maxInput: 14000,
    schema: { t: 'object', props: { positions: { t: 'array', max: 30, of: { t: 'object', props: { t: str(10), w: { t: 'number', min: 0.5, max: 15 }, thesis: str(300) } } }, notes: str(800) } },
  },
};

export const AI_LABEL = 'Model estimate. Not financial advice.';

/** Rough pre-run estimate (about 4 characters per token). */
export function estimateUsd(feature: Feature, inputChars: number): number {
  const s = FEATURES[feature];
  return costUsd(s.model, { input_tokens: Math.ceil(inputChars / 4) + 600, output_tokens: s.maxTokens });
}

/**
 * Spend spike check (16.9, warning only, no cap): today's spend vs the average of the previous 14 days.
 * Warns when today is over 3x the average and over $0.50, or over $5 in any case.
 */
export function spendSpike(rows: { day: string; usd: number }[], today: string) {
  const byDay = new Map<string, number>();
  for (const r of rows) byDay.set(r.day, (byDay.get(r.day) ?? 0) + r.usd);
  const t = byDay.get(today) ?? 0;
  const prev: number[] = [];
  for (let i = 1; i <= 14; i++) prev.push(byDay.get(new Date(Date.parse(today) - i * 86_400_000).toISOString().slice(0, 10)) ?? 0);
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  return { today: t, avg, warn: (t > 3 * avg && t > 0.5) || t > 5 };
}

/** Converts our small schema to JSON Schema for Anthropic tool use, which guarantees well-formed JSON replies. */
export function toJsonSchema(s: Schema): Record<string, unknown> {
  switch (s.t) {
    case 'string': return { type: 'string', ...(s.enum ? { enum: [...s.enum] } : {}), ...(s.max ? { maxLength: s.max } : {}) };
    case 'number': return { type: 'number', ...(s.min != null ? { minimum: s.min } : {}), ...(s.max != null ? { maximum: s.max } : {}) };
    case 'boolean': return { type: 'boolean' };
    case 'array': return { type: 'array', items: toJsonSchema(s.of), ...(s.max ? { maxItems: s.max } : {}) };
    case 'object': return {
      type: 'object',
      properties: Object.fromEntries(Object.entries(s.props).map(([k, v]) => [k, toJsonSchema(v)])),
      required: Object.keys(s.props).filter((k) => !s.optional?.includes(k)),
      additionalProperties: false,
    };
  }
}
