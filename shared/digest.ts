// Turns whatever a panel loaded into a compact text digest for ANALYZE (16.3: code computes, Claude explains).
// Price bars get code-computed technicals (RSI, MACD, moving averages, ATR, Bollinger, 52-week range) so the
// model never has to do arithmetic on raw candles.
import { atr, bollinger, macd, rsi, sma, stochastic, type Bar } from './indicators';

const r2 = (v: number) => Math.round(v * 100) / 100;
const last = (x: number[]) => { for (let i = x.length - 1; i >= 0; i--) if (Number.isFinite(x[i])) return x[i]!; return null; };

export function isBars(v: unknown): v is Bar[] {
  if (!Array.isArray(v) || v.length < 30) return false;
  const a = v[0] as Record<string, unknown>, b = v.at(-1) as Record<string, unknown>;
  return [a, b].every((x) => x && typeof x === 'object' && ['t', 'o', 'h', 'l', 'c'].every((k) => typeof x[k] === 'number'));
}

/** Technical snapshot from daily (or any) bars. Lines of "name: value (reading)". */
export function techDigest(bars: Bar[], label = 'PRICE BARS'): string {
  const c = bars.map((b) => b.c);
  const px = c.at(-1)!;
  const ret = (k: number) => (c.length > k ? `${r2((px / c.at(-1 - k)! - 1) * 100)}%` : 'n/a');
  const rs = last(rsi(c, 14));
  const m = macd(c);
  const mLine = last(m.macd), mSig = last(m.signal), mHist = last(m.hist), mHistPrev = m.hist.at(-2);
  const s20 = last(sma(c, 20)), s50 = last(sma(c, 50)), s200 = last(sma(c, 200));
  const bb = bollinger(c, 20, 2);
  const up = last(bb.upper), lo = last(bb.lower);
  const pctB = up != null && lo != null && up > lo ? (px - lo) / (up - lo) : null;
  const a = last(atr(bars, 14));
  const st = stochastic(bars);
  const k = last(st.k);
  const yr = bars.slice(-252);
  const hi = Math.max(...yr.map((b) => b.h)), lw = Math.min(...yr.map((b) => b.l));
  const vols = bars.slice(-21).map((b) => b.v ?? 0);
  const vAvg = vols.slice(0, -1).reduce((x, y) => x + y, 0) / Math.max(1, vols.length - 1);
  const rel = (s: number | null) => (s == null ? 'n/a' : `${r2(s)} (price ${px >= s ? 'above' : 'below'} by ${r2(Math.abs(px / s - 1) * 100)}%)`);
  const lines = [
    `${label} (code computed, ${bars.length} bars to ${new Date(bars.at(-1)!.t).toISOString().slice(0, 10)}):`,
    `Last close: ${r2(px)}. Returns 1 bar ${ret(1)}, 5 ${ret(5)}, 21 ${ret(21)}, 63 ${ret(63)}, 126 ${ret(126)}, 252 ${ret(252)}.`,
    `RSI(14): ${rs == null ? 'n/a' : `${r2(rs)} (${rs >= 70 ? 'overbought zone' : rs <= 30 ? 'oversold zone' : 'neutral zone'})`}.`,
    `MACD(12,26,9): line ${mLine == null ? 'n/a' : r2(mLine)}, signal ${mSig == null ? 'n/a' : r2(mSig)}, histogram ${mHist == null ? 'n/a' : r2(mHist)}${mHist != null && mHistPrev != null && Number.isFinite(mHistPrev) ? ` (${mHist > mHistPrev ? 'rising' : 'falling'}; ${Math.sign(mHist) !== Math.sign(mHistPrev) ? 'just crossed' : mHist > 0 ? 'line above signal' : 'line below signal'})` : ''}.`,
    `SMA20 ${rel(s20)}; SMA50 ${rel(s50)}; SMA200 ${rel(s200)}${s50 != null && s200 != null ? `; 50 vs 200: ${s50 > s200 ? 'golden (50 above 200)' : 'death (50 below 200)'} alignment` : ''}.`,
    `Bollinger(20,2): upper ${up == null ? 'n/a' : r2(up)}, lower ${lo == null ? 'n/a' : r2(lo)}, %B ${pctB == null ? 'n/a' : r2(pctB)}. Stochastic %K ${k == null ? 'n/a' : r2(k)}.`,
    `ATR(14): ${a == null ? 'n/a' : `${r2(a)} (${r2((a / px) * 100)}% of price)`}. 52-week range ${r2(lw)} to ${r2(hi)}; ${r2((px / hi - 1) * 100)}% from high, ${r2((px / lw - 1) * 100)}% above low.`,
    `Volume last bar vs 20-bar average: ${vAvg ? `${r2((vols.at(-1)! / vAvg))}x` : 'n/a'}.`,
  ];
  return lines.join('\n');
}

/** Shrinks any JSON value: long arrays keep head and tail, wide objects keep the first keys, strings are cut. */
export function compact(v: unknown, depth = 0): unknown {
  if (v == null || typeof v === 'number' || typeof v === 'boolean') return typeof v === 'number' ? (Number.isInteger(v) ? v : Math.round(v * 10000) / 10000) : v;
  if (typeof v === 'string') return v.length > 240 ? `${v.slice(0, 240)}…` : v;
  if (depth > 4) return Array.isArray(v) ? `[${v.length} items]` : '{…}';
  if (Array.isArray(v)) {
    if (isBars(v)) return `[${v.length} price bars, see technicals]`;
    const keep = v.length > 40 ? [...v.slice(0, 30), `…${v.length - 40} more…`, ...v.slice(-10)] : v;
    return keep.map((x) => (typeof x === 'string' && x.startsWith('…') ? x : compact(x, depth + 1)));
  }
  if (typeof v === 'object') {
    const e = Object.entries(v as Record<string, unknown>).filter(([k, x]) => x != null && x !== '' && !/^(icon|logo|image|url|weburl|href|id|uuid)$/i.test(k));
    const out: Record<string, unknown> = {};
    for (const [k, x] of e.slice(0, 40)) out[k] = compact(x, depth + 1);
    if (e.length > 40) out['…'] = `${e.length - 40} more fields`;
    return out;
  }
  return null;
}

/** Finds bar arrays anywhere in a value (bars are often nested, like { bars, news }). */
export function findBars(v: unknown, depth = 0): Bar[][] {
  if (isBars(v)) return [v];
  if (depth > 3 || !v || typeof v !== 'object') return [];
  return Object.values(v as Record<string, unknown>).flatMap((x) => findBars(x, depth + 1));
}

/** Digest of every dataset a panel loaded, capped per dataset and in total. */
export function dataDigest(sets: { source: string; data: unknown }[], budget = 16000): string {
  const per = Math.max(1500, Math.floor(budget / Math.max(1, sets.length)));
  const parts: string[] = [];
  for (const s of sets) {
    const tech = findBars(s.data).slice(0, 3).map((b, i) => techDigest(b, `PRICE BARS ${i + 1} from ${s.source}`));
    let json = JSON.stringify(compact(s.data)) ?? '';
    if (json.length > per) json = `${json.slice(0, per)}… (truncated)`;
    parts.push([`DATASET from ${s.source}:`, ...tech, json].join('\n'));
  }
  return parts.join('\n\n').slice(0, budget + 2000);
}
