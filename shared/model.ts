// MODEL: transparent rules-based factor index (baseline for the Claude Model Portfolio). Pure, tested.
import type { Row } from './screener';

export const MODEL_RULES = [
  'Universe: NYSE and Nasdaq stocks with market cap over $10B and positive net income.',
  'Score: average percentile rank of free cash flow yield (high), return on equity (high), revenue growth (high) and debt to equity (low).',
  'Holdings: top 20 scores, equal weight.',
  'Rebalance: first time the panel is opened each calendar month, at that day\'s end-of-day prices.',
] as const;

const pct = (vals: (number | null)[], v: number | null, highGood: boolean) => {
  if (v == null) return 0.5;
  const xs = vals.filter((x): x is number => x != null);
  if (!xs.length) return 0.5;
  const below = xs.filter((x) => x < v).length;
  const r = below / xs.length;
  return highGood ? r : 1 - r;
};

export interface Pick { ticker: string; name: string; score: number; price: number }

export function modelPicks(rows: Row[], n = 20): Pick[] {
  const u = rows.filter((r) => r.mcap != null && r.mcap >= 10_000e6 && r.pe != null && r.price != null);
  const f = { fcf: u.map((r) => r.fcfYield), roe: u.map((r) => r.roe), g: u.map((r) => r.revGrowth), de: u.map((r) => r.de) };
  return u
    .map((r) => ({ ticker: r.ticker, name: r.name, price: r.price!, score: (pct(f.fcf, r.fcfYield, true) + pct(f.roe, r.roe, true) + pct(f.g, r.revGrowth, true) + pct(f.de, r.de, false)) / 4 }))
    .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker))
    .slice(0, n);
}

export interface Period { month: string; date: string; spy: number; holdings: { t: string; px: number }[]; exit?: Record<string, number>; spyExit?: number }

/** Chain monthly periods into an index (starts at 100). `live` prices close the open period. */
export function chain(periods: Period[], live: Record<string, number>, liveSpy: number | null) {
  const sorted = [...periods].sort((a, b) => a.month.localeCompare(b.month));
  let m = 100, s = 100;
  const pts: { date: string; model: number; spy: number }[] = [];
  sorted.forEach((p, i) => {
    pts.push({ date: p.date, model: m, spy: s });
    const last = i === sorted.length - 1;
    const exit = last ? live : p.exit ?? {};
    const rs = p.holdings.map((h) => (exit[h.t] ?? h.px) / h.px);
    m *= rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 1;
    const se = last ? liveSpy : p.spyExit ?? null;
    s *= se ? se / p.spy : 1;
    if (last) pts.push({ date: 'now', model: m, spy: s });
  });
  return pts;
}

/** Weighted variant for CMP: each period holds weights (percent) and entry prices; benchmarks tracked alongside. */
export interface WPeriod { month: string; date: string; holdings: { t: string; w: number; px: number }[]; bench: Record<string, number>; exit?: Record<string, number>; benchExit?: Record<string, number> }

export function chainWeighted(periods: WPeriod[], live: Record<string, number>, benchW: Record<string, Record<string, number>>) {
  const sorted = [...periods].sort((a, b) => a.month.localeCompare(b.month));
  let m = 100;
  const b: Record<string, number> = Object.fromEntries(Object.keys(benchW).map((k) => [k, 100]));
  const pts: { date: string; model: number; bench: Record<string, number> }[] = [];
  sorted.forEach((p, i) => {
    pts.push({ date: p.date, model: m, bench: { ...b } });
    const last = i === sorted.length - 1;
    const exit = last ? live : p.exit ?? {};
    const bexit = last ? live : p.benchExit ?? {};
    const tw = p.holdings.reduce((a, h) => a + h.w, 0) || 1;
    m *= p.holdings.reduce((a, h) => a + (h.w / tw) * ((exit[h.t] ?? h.px) / h.px), 0);
    for (const [name, ws] of Object.entries(benchW)) {
      let r = 0, wsum = 0;
      for (const [t, w] of Object.entries(ws)) { const e = bexit[t], s0 = p.bench[t]; if (e && s0) { r += w * (e / s0); wsum += w; } }
      b[name] = b[name]! * (wsum ? r / wsum : 1);
    }
    if (last) pts.push({ date: 'now', model: m, bench: { ...b } });
  });
  return pts;
}
