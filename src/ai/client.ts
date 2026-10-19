// App side of the AI layer. Every call goes through the proxy; the key never reaches the browser.
import { AI_LABEL, estimateUsd, type Feature } from '../../shared/ai';
import { api } from '../lib/api';

export interface AiReply<T> { result: T; model: string; version: string; usd: number; at: number; cached: boolean; label: string; input: string }

export async function askAi<T>(feature: Feature, input: string, fresh = false): Promise<AiReply<T>> {
  const r = await api<Omit<AiReply<T>, 'input'>>('/api/ai', { method: 'POST', body: { feature, input, fresh } });
  // Lets the spend banner re-check after paid calls.
  if (!r.cached) window.dispatchEvent(new Event('meridian:ai-used'));
  return { ...r, label: r.label ?? AI_LABEL, input };
}

export { AI_LABEL, estimateUsd };

/** Compact text table for prompts: fewer tokens than JSON. */
export function table(rows: Record<string, unknown>[], cols?: string[]): string {
  if (!rows.length) return '(none)';
  const c = cols ?? Object.keys(rows[0]!);
  const cell = (v: unknown) => (v == null ? '' : typeof v === 'number' ? (Number.isInteger(v) ? String(v) : v.toPrecision(4)) : String(v).replace(/[|\n]/g, ' '));
  return [c.join('|'), ...rows.map((r) => c.map((k) => cell(r[k])).join('|'))].join('\n');
}
