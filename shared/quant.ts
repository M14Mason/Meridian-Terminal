// Quant and risk math (catalog 36 to 48, owner hedge fund toolkit).

/** Kelly fraction for a bet with win probability p and payoff ratio b (win b per 1 risked). */
export const kelly = (p: number, b: number) => p - (1 - p) / b;

/** Shares for fixed-fractional sizing: risk `riskPct` of equity between entry and stop. */
export function positionSize(equity: number, riskPct: number, entry: number, stop: number) {
  const perShare = Math.abs(entry - stop);
  if (!perShare) return { shares: 0, value: 0, risk: 0 };
  const shares = Math.floor((equity * riskPct) / perShare);
  return { shares, value: shares * entry, risk: shares * perShare };
}

/**
 * Risk of ruin by simulation: probability equity falls below `ruinAt` (fraction of start)
 * within `trades`, risking `riskPct` per trade with win rate p and payoff ratio b.
 */
export function riskOfRuin(p: number, b: number, riskPct: number, trades = 500, ruinAt = 0.5, sims = 4000, seed = 7): number {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  let ruined = 0;
  for (let k = 0; k < sims; k++) {
    let eq = 1;
    for (let t = 0; t < trades; t++) {
      eq *= rnd() < p ? 1 + riskPct * b : 1 - riskPct;
      if (eq <= ruinAt) {
        ruined++;
        break;
      }
    }
  }
  return ruined / sims;
}

/** Historical and parametric (normal) VaR and CVaR, as positive loss fractions. */
export function varCvar(returns: number[], level = 0.95) {
  const r = [...returns].filter(Number.isFinite).sort((a, b) => a - b);
  const n = r.length;
  if (n < 20) return { hVar: NaN, hCvar: NaN, pVar: NaN };
  const idx = Math.floor((1 - level) * n);
  const hVar = -r[idx]!;
  const tail = r.slice(0, idx + 1);
  const hCvar = -tail.reduce((a, b) => a + b, 0) / tail.length;
  const m = r.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  const z = level === 0.99 ? 2.326348 : level === 0.975 ? 1.959964 : 1.644854;
  return { hVar, hCvar, pVar: -(m - z * sd) };
}

/**
 * GARCH(1,1) fitted by maximum likelihood with a coarse grid then local refinement.
 * Returns parameters, current and forecast annualized volatility.
 */
export function garch(returns: number[], horizon = 21) {
  const r = returns.filter(Number.isFinite);
  const n = r.length;
  const mean = r.reduce((a, b) => a + b, 0) / n;
  const e = r.map((x) => x - mean);
  const v0 = e.reduce((a, b) => a + b * b, 0) / n;
  const ll = (omega: number, alpha: number, beta: number) => {
    if (omega <= 0 || alpha < 0 || beta < 0 || alpha + beta >= 0.9999) return -Infinity;
    let h = v0;
    let sum = 0;
    for (let i = 1; i < n; i++) {
      h = omega + alpha * e[i - 1]! ** 2 + beta * h;
      sum += -0.5 * (Math.log(h) + (e[i]! ** 2) / h);
    }
    return sum;
  };
  let best = { omega: v0 * 0.05, alpha: 0.08, beta: 0.9, ll: -Infinity };
  for (const a of [0.02, 0.05, 0.08, 0.12, 0.18]) {
    for (const b of [0.7, 0.8, 0.85, 0.9, 0.94]) {
      if (a + b >= 0.999) continue;
      const om = v0 * (1 - a - b);
      const l = ll(om, a, b);
      if (l > best.ll) best = { omega: om, alpha: a, beta: b, ll: l };
    }
  }
  // Local refinement by coordinate search.
  let step = 0.02;
  for (let it = 0; it < 60; it++) {
    let improved = false;
    for (const [da, db, dw] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, 0.2], [0, 0, -0.2]] as const) {
      const c = { omega: best.omega * (1 + dw), alpha: best.alpha + da, beta: best.beta + db };
      const l = ll(c.omega, c.alpha, c.beta);
      if (l > best.ll) {
        best = { ...c, ll: l };
        improved = true;
      }
    }
    if (!improved) step /= 2;
    if (step < 1e-4) break;
  }
  let h = v0;
  for (let i = 1; i < n; i++) h = best.omega + best.alpha * e[i - 1]! ** 2 + best.beta * h;
  const next = best.omega + best.alpha * e[n - 1]! ** 2 + best.beta * h;
  const persistence = best.alpha + best.beta;
  const longRun = best.omega / (1 - persistence);
  let total = 0;
  for (let k = 0; k < horizon; k++) total += longRun + Math.pow(persistence, k) * (next - longRun);
  return {
    ...best,
    persistence,
    currentVol: Math.sqrt(next * 252),
    forecastVol: Math.sqrt((total / horizon) * 252),
    longRunVol: Math.sqrt(longRun * 252),
  };
}

/** OLS of y on x: slope, intercept, residuals. */
export function ols(y: number[], x: number[]) {
  const n = Math.min(y.length, x.length);
  let mx = 0;
  let my = 0;
  for (let i = 0; i < n; i++) {
    mx += x[i]!;
    my += y[i]!;
  }
  mx /= n;
  my /= n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (x[i]! - mx) * (y[i]! - my);
    sxx += (x[i]! - mx) ** 2;
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  return { slope: b, intercept: a, resid: y.slice(0, n).map((v, i) => v - a - b * x[i]!) };
}

/**
 * Engle-Granger cointegration (item 45): regress log A on log B, then a Dickey-Fuller test on the
 * residuals. Critical values for two variables (MacKinnon): -3.90 (1%), -3.34 (5%), -3.04 (10%).
 */
export function engleGranger(a: number[], b: number[]) {
  const la = a.map(Math.log);
  const lb = b.map(Math.log);
  const { slope, resid } = ols(la, lb);
  const dy = resid.slice(1).map((v, i) => v - resid[i]!);
  const ylag = resid.slice(0, -1);
  const { slope: g, resid: e } = ols(dy, ylag);
  const n = dy.length;
  const s2 = e.reduce((s, v) => s + v * v, 0) / (n - 2);
  const my = ylag.reduce((s, v) => s + v, 0) / n;
  const se = Math.sqrt(s2 / ylag.reduce((s, v) => s + (v - my) ** 2, 0));
  const t = g / se;
  const halfLife = g < 0 ? -Math.log(2) / Math.log(1 + g) : Infinity;
  return { hedge: slope, t, halfLife, significance: t < -3.9 ? '1%' : t < -3.34 ? '5%' : t < -3.04 ? '10%' : 'not cointegrated' };
}

/** Multiple regression by normal equations (factor exposure, item 46). Returns [intercept, ...betas] and R squared. */
export function multiOls(y: number[], X: number[][]) {
  const n = y.length;
  const k = X.length + 1;
  const row = (i: number) => [1, ...X.map((x) => x[i]!)];
  const A = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const v = new Array<number>(k).fill(0);
  for (let i = 0; i < n; i++) {
    const r = row(i);
    for (let p = 0; p < k; p++) {
      v[p]! += r[p]! * y[i]!;
      for (let q = 0; q < k; q++) A[p]![q]! += r[p]! * r[q]!;
    }
  }
  // Gaussian elimination.
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r2 = c + 1; r2 < k; r2++) if (Math.abs(A[r2]![c]!) > Math.abs(A[piv]![c]!)) piv = r2;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    [v[c], v[piv]] = [v[piv]!, v[c]!];
    for (let r2 = c + 1; r2 < k; r2++) {
      const f = A[r2]![c]! / A[c]![c]!;
      for (let q = c; q < k; q++) A[r2]![q]! -= f * A[c]![q]!;
      v[r2]! -= f * v[c]!;
    }
  }
  const beta = new Array<number>(k).fill(0);
  for (let c = k - 1; c >= 0; c--) {
    let s = v[c]!;
    for (let q = c + 1; q < k; q++) s -= A[c]![q]! * beta[q]!;
    beta[c] = s / A[c]![c]!;
  }
  const my = y.reduce((a, b) => a + b, 0) / n;
  let ssr = 0;
  let sst = 0;
  for (let i = 0; i < n; i++) {
    const fit = row(i).reduce((s, x, j) => s + x * beta[j]!, 0);
    ssr += (y[i]! - fit) ** 2;
    sst += (y[i]! - my) ** 2;
  }
  return { coef: beta, r2: 1 - ssr / sst };
}

/** Two-stage DCF (FCF growth then terminal), per share. All inputs are owner assumptions. */
export function dcf(i: { fcf: number; growth: number; years: number; terminalGrowth: number; discount: number; netCash: number; shares: number }) {
  let pv = 0;
  let f = i.fcf;
  const flows: number[] = [];
  for (let y = 1; y <= i.years; y++) {
    f *= 1 + i.growth;
    flows.push(f);
    pv += f / Math.pow(1 + i.discount, y);
  }
  const tv = (f * (1 + i.terminalGrowth)) / (i.discount - i.terminalGrowth);
  const pvTv = tv / Math.pow(1 + i.discount, i.years);
  const ev = pv + pvTv;
  const equity = ev + i.netCash;
  return { flows, pvFlows: pv, terminal: tv, pvTerminal: pvTv, ev, equity, perShare: equity / i.shares, terminalShare: pvTv / ev };
}

/** WACC with CAPM cost of equity. */
export function wacc(i: { rf: number; beta: number; erp: number; costDebt: number; tax: number; equity: number; debt: number }) {
  const ke = i.rf + i.beta * i.erp;
  const v = i.equity + i.debt;
  return { costEquity: ke, wacc: (i.equity / v) * ke + (i.debt / v) * i.costDebt * (1 - i.tax) };
}

/** Monte Carlo of price paths by bootstrapping historical daily returns (item 36). Percentile fan. */
export function monteCarlo(returns: number[], days: number, sims = 2000, seed = 11) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const r = returns.filter(Number.isFinite);
  const paths: number[][] = [];
  for (let k = 0; k < sims; k++) {
    let v = 1;
    const p = [1];
    for (let d = 0; d < days; d++) {
      v *= 1 + r[Math.floor(rnd() * r.length)]!;
      p.push(v);
    }
    paths.push(p);
  }
  const pct = (q: number) => Array.from({ length: days + 1 }, (_, d) => {
    const col = paths.map((p) => p[d]!).sort((a, b) => a - b);
    return col[Math.floor(q * (col.length - 1))]!;
  });
  const finals = paths.map((p) => p[days]!);
  return { p5: pct(0.05), p25: pct(0.25), p50: pct(0.5), p75: pct(0.75), p95: pct(0.95), probLoss: finals.filter((f) => f < 1).length / sims };
}

/** Efficient frontier by random long-only portfolios (item 37). */
export function frontier(returns: number[][], n = 4000, seed = 3) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const k = returns.length;
  const T = Math.min(...returns.map((r) => r.length));
  const mu = returns.map((r) => (r.slice(0, T).reduce((a, b) => a + b, 0) / T) * 252);
  const cov = returns.map((a) => returns.map((b) => {
    const ma = a.slice(0, T).reduce((x, y) => x + y, 0) / T;
    const mb = b.slice(0, T).reduce((x, y) => x + y, 0) / T;
    let c = 0;
    for (let t = 0; t < T; t++) c += (a[t]! - ma) * (b[t]! - mb);
    return (c / (T - 1)) * 252;
  }));
  const pts: { w: number[]; ret: number; vol: number; sharpe: number }[] = [];
  for (let i = 0; i < n; i++) {
    const raw = Array.from({ length: k }, () => -Math.log(rnd()));
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = raw.map((x) => x / sum);
    const ret = w.reduce((a, x, j) => a + x * mu[j]!, 0);
    let v = 0;
    for (let a = 0; a < k; a++) for (let b = 0; b < k; b++) v += w[a]! * w[b]! * cov[a]![b]!;
    const vol = Math.sqrt(v);
    pts.push({ w, ret, vol, sharpe: vol ? ret / vol : 0 });
  }
  const best = pts.reduce((a, b) => (b.sharpe > a.sharpe ? b : a));
  const minVol = pts.reduce((a, b) => (b.vol < a.vol ? b : a));
  return { points: pts, best, minVol, mu, vols: cov.map((r, i) => Math.sqrt(r[i]!)) };
}
