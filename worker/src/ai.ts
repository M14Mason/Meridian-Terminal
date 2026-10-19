// AI endpoint (BUILD_PROMPT 16): prompts live here (versioned), inputs are code-computed data from the app.
// Cached by input hash at the edge, identical concurrent requests share one call, usage metered per feature.
import { AI_LABEL, costUsd, extractJson, FEATURES, toJsonSchema, validate, type Feature, type Schema, type Usage } from '../../shared/ai';
import type { KeyResolver } from './upstream';

const BASE = `You are the analysis engine inside a private market research terminal used by one person for learning.
Hard rules:
- Use ONLY numbers, names and dates that appear in the INPUT. Never invent prices, figures, events or sources. If the input is not enough, say so plainly.
- Never tell the reader to buy, sell or hold anything and never tailor advice to their finances. Describe what the data shows and what could change it.
- Never state anything as certain. Plain English, short sentences, no hype. No em dashes.
- Reply with ONLY one JSON object that matches the SCHEMA. No text before or after it.
Everything you write is shown with the label "${AI_LABEL}"`;

const SPEC: Record<Feature, { task: string; schema: string }> = {
  explain: {
    task: 'Explain the terminal panel below to a student investor: what it shows, what stands out in the current numbers, and why it might matter. Mention data delays or limits the panel states.',
    schema: '{"summary": string (2-4 sentences), "points": string[] (3-6 notable observations citing the numbers), "watch": string (what to watch next)}',
  },
  ask: {
    task: `Convert the user's request into a structured query for the terminal. Screener fields (filter values: money in $ millions, percent fields in %): mcap (market cap), price, pe, ps, pb, fcfYield (%), netMargin (%), opMargin (%), roe (%), de (debt/equity ratio), revGrowth (%), epsGrowth (%), revenue, volume. Use kind "screen" with filters for stock-finding requests. Use kind "command" for opening a panel, with command = "TICKER CODE" or "CODE" using codes from FUNCTIONS. Otherwise kind "unknown" and explain in note. Never invent tickers that were not in the request.`,
    schema: '{"kind": "screen"|"command"|"unknown", "filters"?: [{"field": string, "op": ">"|"<", "value": number}], "sort"?: string, "desc"?: boolean, "command"?: string, "note": string (one sentence restating what will run)}',
  },
  valuation: {
    task: 'Give your own independent view of the fair value range per share for this company using only the code-computed inputs (DCF, peer multiples, fundamentals, price). Then say whether you agree with the code DCF and why. If the inputs are too thin, use verdict "unclear".',
    schema: '{"verdict": "undervalued"|"fairly valued"|"overvalued"|"unclear", "low": number (per share), "high": number (per share), "reasoning": string[] (3-6), "agreesWithCode": boolean, "disagreement": string, "risks": string[] (2-5)}',
  },
  predict: {
    task: 'The code computed a volatility-based price range and a naive base-rate probability that the price ends the horizon higher. Give your own probability that the price ends higher, considering the momentum, valuation, news and macro inputs provided. Stay close to the baseline unless the inputs clearly justify moving; explain the difference.',
    schema: '{"pUp": number between 0.02 and 0.98, "reasoning": string[] (3-6), "assumptions": string[] (2-5), "vsBaseline": string}',
  },
  brief: {
    task: 'Write a short morning brief from the market snapshot, macro readings, calendar and headlines in the input. Lead with the single most important thing.',
    schema: '{"headline": string, "bullets": string[] (4-8), "watch": string[] (2-5 events or levels today)}',
  },
  critic: {
    task: "Review this trade journal like a strict but kind trading coach. Use the computed stats and the trader's own notes. Find behavioral patterns (cutting winners, holding losers, oversizing, overtrading, ignoring their own rules).",
    schema: '{"strengths": string[], "mistakes": string[], "patterns": string[], "rules": string[] (concrete rules to try)}',
  },
  filing: {
    task: 'Summarize the filing excerpt for an investor. If a previous excerpt is included, focus on what changed. Judge whether the tone is more cautious, similar or more confident than before (or unclear if there is no previous text).',
    schema: '{"summary": string, "changes": string[], "risks": string[], "tone": "more cautious"|"similar"|"more confident"|"unclear"}',
  },
  supply: {
    task: 'Extract supply chain relationships from the annual report excerpts. Include ONLY counterparties the text names or clearly describes (for unnamed ones use a label like "Largest customer (unnamed)" and include it only if a share is disclosed). k is what the counterparty is TO this company: supplier, customer or partner. share = percent of this company revenue (customers) or purchases (suppliers) ONLY if stated. conf: 0.9 named with a share or explicit contract, 0.8 named, 0.6 unnamed. ev = an exact quote under 15 words from the text. Facilities from the PROPERTIES section only. gaps = what is not disclosed. Never add relationships from your own knowledge.',
    schema: '{"industry": string, "rels": [{"n": string, "k": "supplier"|"customer"|"partner", "what": string, "share"?: number, "geo"?: string, "conf": number 0-1, "ev": string}], "facilities": [{"type": string, "place": string, "country": string}], "gaps": string}',
  },
  cmp: {
    task: 'You manage a HYPOTHETICAL paper portfolio for research and education. From the CANDIDATES table only, pick 15 to 30 positions with weights in percent that sum to about 100 (max 15% each). Diversify across sectors. Each thesis must cite only numbers from the table. If CURRENT holdings are given, keep turnover reasonable and say why positions change.',
    schema: '{"positions": [{"t": string (ticker from CANDIDATES), "w": number (percent), "thesis": string}], "notes": string (strategy and changes)}',
  },
};

const inflight = new Map<string, Promise<AiOut>>();
// Workers edge cache (typed loosely so unit tests can type-check under Node).
const edge = () => (caches as unknown as { default: Cache }).default;

export interface AiOut { status: number; body: unknown }

async function sha(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Msg = { role: 'user' | 'assistant'; content: unknown };
const TOOL = 'respond';

/**
 * Claude answers by calling one forced tool whose input schema is the feature's schema, so the reply is always
 * well-formed JSON (no stray quotes or prose). Range and length rules are still checked by validate().
 */
async function call(key: string, model: string, maxTokens: number, system: string, messages: Msg[], schema: Schema) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model, max_tokens: maxTokens, system, messages,
      tools: [{ name: TOOL, description: 'Return the answer. Use only numbers present in the INPUT.', input_schema: toJsonSchema(schema) }],
      tool_choice: { type: 'tool', name: TOOL },
    }),
  });
  if (!r.ok) {
    const status = r.status;
    // Do not forward the upstream body; it can echo request details.
    throw new AiError(status === 401 ? 424 : 502, status === 401 ? 'anthropic key rejected (Settings > Keys)' : status === 429 ? 'anthropic rate limit, try again shortly' : `anthropic returned ${status}`);
  }
  const j = (await r.json()) as { content: { type: string; text?: string; id?: string; input?: unknown }[]; usage: Usage; stop_reason?: string };
  const tool = j.content.find((c) => c.type === 'tool_use');
  return { tool: tool ? { id: tool.id!, input: tool.input } : null, text: j.content.filter((c) => c.type === 'text').map((c) => c.text).join(''), usage: j.usage, truncated: j.stop_reason === 'max_tokens', content: j.content };
}

class AiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function runAi(
  body: Record<string, unknown> | null,
  resolve: KeyResolver,
  record: (feature: string, model: string, inTok: number, outTok: number, usd: number) => Promise<unknown>,
  ctx: { waitUntil(p: Promise<unknown>): void },
): Promise<AiOut> {
  const feature = body?.feature as Feature;
  const spec = FEATURES[feature];
  const input = body?.input;
  const fresh = body?.fresh === true;
  if (!spec || typeof input !== 'string' || !input.trim()) return { status: 400, body: { error: 'bad request' } };
  if (input.length > spec.maxInput) return { status: 413, body: { error: `input too large for ${feature}` } };
  const hash = await sha(`${spec.version}\n${spec.model}\n${input}`);
  const cacheKey = new Request(`https://cache.meridian.internal/ai/${feature}/${hash}`);
  if (!fresh) {
    const hit = await edge().match(cacheKey);
    if (hit) return { status: 200, body: { ...((await hit.json()) as object), cached: true } };
  }
  const running = inflight.get(hash);
  if (running) return running;
  const p = (async (): Promise<AiOut> => {
    const key = await resolve('ANTHROPIC_API_KEY');
    if (!key) return { status: 424, body: { error: 'anthropic key not set (Settings > Keys)' } };
    const system = `${BASE}\n\nTASK: ${SPEC[feature].task}\nFIELDS: ${SPEC[feature].schema}\nAnswer by calling the ${TOOL} tool.`;
    const messages: Msg[] = [{ role: 'user', content: `INPUT:\n${input}` }];
    let usd = 0, inTok = 0, outTok = 0;
    let lastErr = '';
    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        const r = await call(key, spec.model, spec.maxTokens, system, messages, spec.schema);
        const c = costUsd(spec.model, r.usage);
        usd += c;
        inTok += r.usage.input_tokens + (r.usage.cache_read_input_tokens ?? 0) + (r.usage.cache_creation_input_tokens ?? 0);
        outTok += r.usage.output_tokens;
        try {
          if (r.truncated) throw new Error('reply was cut off for length');
          const parsed = r.tool ? r.tool.input : extractJson(r.text);
          const err = validate(parsed, spec.schema);
          if (!err) {
            const out = { result: parsed, model: spec.model, version: spec.version, usd, at: Date.now(), label: AI_LABEL };
            ctx.waitUntil(edge().put(cacheKey, new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': `public, max-age=${spec.cacheTtl}` } })));
            return { status: 200, body: { ...out, cached: false } };
          }
          lastErr = err;
        } catch (e) {
          lastErr = e instanceof Error ? e.message : 'bad JSON';
        }
        // One retry with the validation error (16.7). A tool_use turn must be answered with a tool_result.
        const fix = `That answer was invalid (${lastErr}). Call ${TOOL} again with corrected values${/cut off/.test(lastErr) ? ', and keep every text field shorter' : ''}.`;
        if (r.tool) messages.push({ role: 'assistant', content: r.content }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: r.tool.id, content: fix, is_error: true }] });
        else messages.push({ role: 'assistant', content: r.text.slice(0, 4000) || '(empty)' }, { role: 'user', content: fix });
      }
      return { status: 422, body: { error: `AI reply failed validation twice (${lastErr}); showing code-only results`, usd } };
    } catch (e) {
      if (e instanceof AiError) return { status: e.status, body: { error: e.message } };
      throw e;
    } finally {
      if (usd > 0) ctx.waitUntil(record(feature, spec.model, inTok, outTok, usd).then(() => undefined));
    }
  })().finally(() => inflight.delete(hash));
  inflight.set(hash, p);
  return p;
}
