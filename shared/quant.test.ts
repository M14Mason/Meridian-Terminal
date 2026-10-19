import { describe, expect, it } from 'vitest';
import { dcf, engleGranger, frontier, garch, kelly, monteCarlo, multiOls, positionSize, riskOfRuin, varCvar, wacc } from './quant';

const lcg = (seed: number) => {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
};
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(r())) * Math.cos(2 * Math.PI * r());

describe('sizing', () => {
  it('Kelly and fixed fractional', () => {
    expect(kelly(0.6, 1)).toBeCloseTo(0.2, 10);
    expect(positionSize(10_000, 0.01, 50, 48)).toEqual({ shares: 50, value: 2500, risk: 100 });
  });
  it('risk of ruin rises with bet size', () => {
    expect(riskOfRuin(0.5, 1, 0.2, 200)).toBeGreaterThan(riskOfRuin(0.5, 1, 0.02, 200));
    expect(riskOfRuin(0.6, 2, 0.01, 200)).toBe(0);
  });
});

describe('risk', () => {
  it('VaR and CVaR on a known distribution', () => {
    const r = Array.from({ length: 100 }, (_, i) => (i - 50) / 1000); // -0.05 .. 0.049
    const v = varCvar(r, 0.95);
    expect(v.hVar).toBeCloseTo(0.045, 10);
    expect(v.hCvar).toBeCloseTo(0.0475, 10);
  });
  it('GARCH recovers persistent volatility clustering', () => {
    const rnd = lcg(5);
    const r: number[] = [];
    let h = 0.0001;
    let e = 0;
    for (let i = 0; i < 2500; i++) {
      h = 0.000002 + 0.1 * e * e + 0.88 * h;
      e = Math.sqrt(h) * gauss(rnd);
      r.push(e);
    }
    const g = garch(r);
    expect(g.persistence).toBeGreaterThan(0.85);
    expect(g.persistence).toBeLessThan(1);
    expect(g.alpha).toBeGreaterThan(0.03);
  });
});

describe('relative value', () => {
  it('finds cointegration in a mean-reverting pair and not in random walks', () => {
    const rnd = lcg(9);
    const b: number[] = [100];
    for (let i = 1; i < 800; i++) b.push(b[i - 1]! * Math.exp(0.01 * gauss(rnd)));
    let sp = 0;
    const a = b.map((x) => {
      sp = 0.8 * sp + 0.01 * gauss(rnd);
      return 1.5 * x * Math.exp(sp);
    });
    const eg = engleGranger(a, b);
    expect(eg.t).toBeLessThan(-3.9);
    expect(Math.abs(eg.hedge - 1)).toBeLessThan(0.15); // true hedge ratio is 1; estimate has sampling noise
    const c: number[] = [100];
    for (let i = 1; i < 800; i++) c.push(c[i - 1]! * Math.exp(0.01 * gauss(rnd)));
    expect(engleGranger(c, b).significance).toBe('not cointegrated');
  });
  it('multiple regression recovers betas', () => {
    const rnd = lcg(2);
    const x1 = Array.from({ length: 500 }, () => gauss(rnd));
    const x2 = Array.from({ length: 500 }, () => gauss(rnd));
    const y = x1.map((v, i) => 0.5 + 1.2 * v - 0.7 * x2[i]! + 0.01 * gauss(rnd));
    const m = multiOls(y, [x1, x2]);
    expect(m.coef[0]).toBeCloseTo(0.5, 2);
    expect(m.coef[1]).toBeCloseTo(1.2, 2);
    expect(m.coef[2]).toBeCloseTo(-0.7, 2);
    expect(m.r2).toBeGreaterThan(0.99);
  });
});

describe('valuation', () => {
  it('DCF with a hand-checked case', () => {
    // FCF 100 growing 0% for 1 year, terminal growth 0%, discount 10%: PV = 100/1.1 + (100/0.1)/1.1 = 1000
    const d = dcf({ fcf: 100, growth: 0, years: 1, terminalGrowth: 0, discount: 0.1, netCash: 50, shares: 10 });
    expect(d.ev).toBeCloseTo(1000, 8);
    expect(d.perShare).toBeCloseTo(105, 8);
  });
  it('WACC with CAPM', () => {
    const w = wacc({ rf: 0.04, beta: 1.2, erp: 0.05, costDebt: 0.06, tax: 0.21, equity: 800, debt: 200 });
    expect(w.costEquity).toBeCloseTo(0.1, 10);
    expect(w.wacc).toBeCloseTo(0.8 * 0.1 + 0.2 * 0.06 * 0.79, 10);
  });
});

describe('simulation', () => {
  it('Monte Carlo fan is ordered and starts at 1', () => {
    const rnd = lcg(4);
    const r = Array.from({ length: 500 }, () => 0.0004 + 0.01 * gauss(rnd));
    const m = monteCarlo(r, 60, 500);
    expect(m.p50[0]).toBe(1);
    expect(m.p5[60]!).toBeLessThan(m.p50[60]!);
    expect(m.p50[60]!).toBeLessThan(m.p95[60]!);
  });
  it('efficient frontier picks a higher Sharpe than equal weight', () => {
    const rnd = lcg(8);
    const a = Array.from({ length: 500 }, () => 0.0006 + 0.01 * gauss(rnd));
    const b = Array.from({ length: 500 }, () => 0.0001 + 0.02 * gauss(rnd));
    const f = frontier([a, b], 2000);
    expect(f.best.w[0]!).toBeGreaterThan(0.5);
    expect(f.minVol.vol).toBeLessThanOrEqual(f.best.vol + 1e-9);
  });
});
