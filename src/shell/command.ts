// Command line parsing and fuzzy suggestions (9.4).
import { findFunction, FUNCTIONS } from './registry';
import type { FunctionDef } from './types';

export interface ParsedCommand {
  code: string | null;
  security: string | null;
  error?: string;
}

// Tickers, plus long FRED series ids for the SER function (e.g. A191RL1Q225SBEA SER).
const TICKER_RE = /^[A-Z][A-Z0-9.\-/]{0,19}$/;
// Market and asset-class words people type out of habit ("AAPL US Equity GP"). Ignored.
const NOISE = new Set(['US', 'EQUITY', 'EQ', 'GO', '<GO>', 'INDEX', 'CURNCY', 'COMDTY']);

export function parseCommand(input: string): ParsedCommand {
  const tokens = input.trim().toUpperCase().split(/\s+/).filter((t) => t && !NOISE.has(t));
  if (tokens.length === 0) return { code: null, security: null, error: 'empty' };
  const last = tokens[tokens.length - 1]!;
  const fn = findFunction(last);
  if (fn) {
    const sec = tokens.length > 1 ? tokens[0]! : null;
    if (sec && !TICKER_RE.test(sec)) return { code: fn.code, security: null, error: `bad ticker ${sec}` };
    return { code: fn.code, security: sec };
  }
  if (tokens.length === 1 && TICKER_RE.test(last)) {
    // A bare ticker loads the security; the default function for a security is the chart.
    return { code: 'GP', security: last };
  }
  return { code: null, security: null, error: `unknown function ${last}` };
}

function score(f: FunctionDef, q: string): number {
  if (!q) return 1;
  if (f.code === q) return 100;
  if (f.aliases.includes(q)) return 90;
  if (f.code.startsWith(q)) return 80 - f.code.length;
  if (f.aliases.some((a) => a.startsWith(q))) return 60;
  const title = f.title.toUpperCase();
  if (title.split(/\W+/).some((w) => w.startsWith(q))) return 50;
  if (title.includes(q)) return 40;
  if (f.description.toUpperCase().includes(q)) return 20;
  // Subsequence match on the code, e.g. "GIP" for "G..I..P".
  let i = 0;
  for (const ch of f.code + title) if (ch === q[i]) i++;
  return i === q.length ? 10 : 0;
}

export interface Suggestion {
  fn?: FunctionDef;
  ticker?: { ticker: string; name: string; exchange: string };
  /** The command that running this suggestion executes. */
  command: string;
}

// Ticker universe for autocomplete (SEC company_tickers_exchange.json), loaded lazily by the shell.
let tickerIndex: { ticker: string; name: string; exchange: string }[] = [];
export function setTickerIndex(list: { ticker: string; name: string; exchange: string }[]): void {
  tickerIndex = list;
}

export function suggestTickers(q: string, limit = 6): Suggestion[] {
  const u = q.toUpperCase();
  if (!u || !tickerIndex.length) return [];
  const exact: Suggestion[] = [];
  const prefix: Suggestion[] = [];
  const name: Suggestion[] = [];
  for (const t of tickerIndex) {
    if (t.ticker === u) exact.push({ ticker: t, command: t.ticker });
    else if (t.ticker.startsWith(u)) prefix.push({ ticker: t, command: t.ticker });
    else if (u.length >= 3 && t.name.toUpperCase().includes(u)) name.push({ ticker: t, command: t.ticker });
    if (exact.length + prefix.length >= limit * 2 && name.length >= limit) break;
  }
  prefix.sort((a, b) => a.command.length - b.command.length);
  return [...exact, ...prefix, ...name].slice(0, limit);
}

/** Combined list: tickers while typing the first word, functions after a ticker or for codes. */
export function suggestAll(input: string, limit = 8): Suggestion[] {
  const tokens = input.trim().split(/\s+/).filter(Boolean);
  const fns = suggest(input, limit);
  if (tokens.length !== 1 || input.endsWith(' ')) return fns;
  const exactFn = fns[0]?.fn?.code === tokens[0]!.toUpperCase();
  const tick = suggestTickers(tokens[0]!, exactFn ? 3 : 5);
  return exactFn ? [...fns.slice(0, 1), ...tick, ...fns.slice(1)].slice(0, limit) : [...tick, ...fns].slice(0, limit);
}

/** Suggestions for the function part of the input (the last token). */
export function suggest(input: string, limit = 8): Suggestion[] {
  const tokens = input.trim().toUpperCase().split(/\s+/).filter((t) => t && !NOISE.has(t));
  const q = tokens.length ? tokens[tokens.length - 1]! : '';
  const prefix = tokens.length > 1 ? tokens.slice(0, -1).join(' ') + ' ' : '';
  return FUNCTIONS.map((fn) => ({ fn, s: score(fn, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.fn.code.localeCompare(b.fn.code))
    .slice(0, limit)
    .map(({ fn }) => ({ fn, command: `${prefix}${fn.code}` }));
}
