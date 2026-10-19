// VAL code side (16.4): deterministic valuation the AI opinion is shown next to. Pure, tested.
import { dcf, wacc } from './quant';

export interface ValInput {
  price: number; shares: number; fcf: number | null; revenue: number | null; revenuePrev: number | null;
  netIncome: number | null; netCash: number; debt: number; beta: number | null; rf: number | null;
  peerPE: number | null; peerPS: number | null;
}
export interface ValMethod { name: string; perShare: number; note: string }
export interface ValOut { methods: ValMethod[]; low: number | null; high: number | null; verdict: 'undervalued' | 'fairly valued' | 'overvalued' | 'unclear'; assumptions: string[] }

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function codeValuation(i: ValInput): ValOut {
  const methods: ValMethod[] = [];
  const assumptions: string[] = [];
  const growth = i.revenue && i.revenuePrev && i.revenuePrev > 0 ? clamp(i.revenue / i.revenuePrev - 1, 0, 0.15) : 0.05;
  const rf = (i.rf ?? 4.2) / 100;
  const beta = clamp(i.beta ?? 1, 0.5, 2.5);
  const mcap = i.price * i.shares;
  const w = wacc({ rf, beta, erp: 0.05, costDebt: rf + 0.015, tax: 0.21, equity: mcap, debt: Math.max(0, i.debt) });
  const disc = clamp(w.wacc, 0.06, 0.14);
  if (i.fcf != null && i.fcf > 0) {
    const run = (d: number) => dcf({ fcf: i.fcf!, growth, years: 5, terminalGrowth: 0.025, discount: d, netCash: i.netCash, shares: i.shares }).perShare;
    methods.push({ name: 'DCF (base)', perShare: run(disc), note: `growth ${(growth * 100).toFixed(1)}%/yr for 5 years, terminal 2.5%, discount ${(disc * 100).toFixed(1)}%` });
    methods.push({ name: 'DCF (discount +1pt)', perShare: run(disc + 0.01), note: 'same, discount rate 1 point higher' });
    methods.push({ name: 'DCF (discount -1pt)', perShare: run(disc - 0.01), note: 'same, discount rate 1 point lower' });
    assumptions.push(`Growth = last year's revenue growth capped at 0 to 15% (${(growth * 100).toFixed(1)}%).`, `Discount = WACC from 10y Treasury ${(rf * 100).toFixed(2)}%, beta ${beta.toFixed(2)}, 5% equity risk premium, clamped to 6 to 14% (${(disc * 100).toFixed(1)}%).`);
  } else assumptions.push('DCF skipped: free cash flow is missing or negative.');
  if (i.peerPE && i.netIncome && i.netIncome > 0) methods.push({ name: 'Peer median P/E', perShare: (i.peerPE * i.netIncome) / i.shares, note: `${i.peerPE.toFixed(1)}x earnings` });
  if (i.peerPS && i.revenue && i.revenue > 0) methods.push({ name: 'Peer median P/S', perShare: (i.peerPS * i.revenue) / i.shares, note: `${i.peerPS.toFixed(2)}x sales` });
  const vals = methods.map((m) => m.perShare).filter((v) => Number.isFinite(v) && v > 0).sort((a, b) => a - b);
  if (vals.length < 2) return { methods, low: vals[0] ?? null, high: vals[0] ?? null, verdict: 'unclear', assumptions: [...assumptions, 'Fewer than two usable methods.'] };
  // Inner range: drop the single most extreme value on each side when there are 4 or more.
  const inner = vals.length >= 4 ? vals.slice(1, -1) : vals;
  const low = inner[0]!;
  const high = inner[inner.length - 1]!;
  const verdict = i.price < low ? 'undervalued' : i.price > high ? 'overvalued' : 'fairly valued';
  return { methods, low, high, verdict, assumptions };
}
