// PRED and SCOR math (16.4, 16.5). Code computes ranges, baselines and scores; Claude only adds a probability.

export const HORIZONS = [
  { key: '1d', label: 'Next day', days: 1 },
  { key: '1w', label: 'Next week', days: 5 },
  { key: '1m', label: 'Next month', days: 21 },
  { key: '1q', label: 'Next quarter', days: 63 },
] as const;
export type HorizonKey = (typeof HORIZONS)[number]['key'];

/** 80% range from recent daily volatility, and the naive base rate of up moves over the same horizon. */
export function priceSetup(closes: number[], days: number) {
  const n = closes.length;
  const last = closes[n - 1]!;
  const rets: number[] = [];
  for (let i = Math.max(1, n - 60); i < n; i++) rets.push(Math.log(closes[i]! / closes[i - 1]!));
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, rets.length - 1));
  const s = sd * Math.sqrt(days);
  const z = 1.2816; // 80% two-sided
  let up = 0, tot = 0;
  for (let i = 0; i + days < n; i++) {
    tot++;
    if (closes[i + days]! > closes[i]!) up++;
  }
  return { last, dailyVol: sd, low: last * Math.exp(-z * s), high: last * Math.exp(z * s), pBase: tot >= 20 ? up / tot : 0.5, baseN: tot };
}

export interface Pred {
  kind: 'price' | 'earnings';
  sym: string;
  horizon: string;
  days: number;
  made: string; // ISO date the prediction was made
  at: number;
  start: number; // price at prediction (price) or estimate (earnings)
  low?: number;
  high?: number;
  pBase: number;
  pAi: number | null;
  model?: string;
  version?: string;
  dueDate?: string; // earnings date for earnings predictions
  // Resolution
  resolved?: { at: string; end: number; up: boolean; inRange?: boolean };
}

export const brier = (p: number, outcome: boolean) => (p - (outcome ? 1 : 0)) ** 2;

export interface Score { n: number; brierAi: number | null; brierBase: number | null; hitAi: number | null; hitBase: number | null; coverage: number | null; nAi: number }

export function score(preds: Pred[]): Score {
  const r = preds.filter((p) => p.resolved);
  const ai = r.filter((p) => p.pAi != null);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const ranged = r.filter((p) => p.resolved!.inRange != null);
  return {
    n: r.length,
    nAi: ai.length,
    brierAi: mean(ai.map((p) => brier(p.pAi!, p.resolved!.up))),
    brierBase: mean(r.map((p) => brier(p.pBase, p.resolved!.up))),
    hitAi: mean(ai.map((p) => ((p.pAi! > 0.5) === p.resolved!.up ? 1 : 0))),
    hitBase: mean(r.map((p) => ((p.pBase > 0.5) === p.resolved!.up ? 1 : 0))),
    coverage: mean(ranged.map((p) => (p.resolved!.inRange ? 1 : 0))),
  };
}

/** Calibration: predicted probability buckets vs observed frequency. */
export function calibration(preds: Pred[], bins = 5) {
  const out = Array.from({ length: bins }, (_, i) => ({ lo: i / bins, hi: (i + 1) / bins, n: 0, sumP: 0, ups: 0 }));
  for (const p of preds) {
    if (!p.resolved || p.pAi == null) continue;
    const b = out[Math.min(bins - 1, Math.floor(p.pAi * bins))]!;
    b.n++;
    b.sumP += p.pAi;
    if (p.resolved.up) b.ups++;
  }
  return out.map((b) => ({ lo: b.lo, hi: b.hi, n: b.n, predicted: b.n ? b.sumP / b.n : null, observed: b.n ? b.ups / b.n : null }));
}

/** Resolve a price prediction from daily bars (t in ms, c close) once `days` sessions have passed. */
export function resolvePrice(p: Pred, bars: { t: number; c: number }[]): Pred['resolved'] | null {
  // Sessions strictly after the day the prediction was made.
  const after = bars.filter((b) => new Date(b.t).toISOString().slice(0, 10) > p.made);
  const end = after[p.days - 1];
  if (!end) return null;
  return { at: new Date(end.t).toISOString().slice(0, 10), end: end.c, up: end.c > p.start, inRange: p.low != null && p.high != null ? end.c >= p.low && end.c <= p.high : undefined };
}
