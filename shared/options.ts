// Option math (catalog 27 to 34, SABR calculator). European Black-Scholes with continuous yield.

const SQRT2PI = Math.sqrt(2 * Math.PI);
export const pdf = (x: number) => Math.exp(-0.5 * x * x) / SQRT2PI;
/** Normal CDF (Abramowitz and Stegun 26.2.17 via erf, accurate to about 1e-7). */
export function cdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? (1 + y) / 2 : (1 - y) / 2;
}

export interface BsIn { S: number; K: number; T: number; r: number; q?: number; sigma: number; type: 'call' | 'put' }
export interface BsOut { price: number; delta: number; gamma: number; vega: number; theta: number; rho: number }

export function bs({ S, K, T, r, q = 0, sigma, type }: BsIn): BsOut {
  if (T <= 0 || sigma <= 0) {
    const intrinsic = Math.max(0, type === 'call' ? S - K : K - S);
    return { price: intrinsic, delta: type === 'call' ? (S > K ? 1 : 0) : S < K ? -1 : 0, gamma: 0, vega: 0, theta: 0, rho: 0 };
  }
  const sq = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sq);
  const d2 = d1 - sigma * sq;
  const dq = Math.exp(-q * T);
  const dr = Math.exp(-r * T);
  const gamma = (dq * pdf(d1)) / (S * sigma * sq);
  const vega = (S * dq * pdf(d1) * sq) / 100; // per 1 vol point
  if (type === 'call') {
    return {
      price: S * dq * cdf(d1) - K * dr * cdf(d2),
      delta: dq * cdf(d1),
      gamma,
      vega,
      theta: (-(S * dq * pdf(d1) * sigma) / (2 * sq) - r * K * dr * cdf(d2) + q * S * dq * cdf(d1)) / 365,
      rho: (K * T * dr * cdf(d2)) / 100,
    };
  }
  return {
    price: K * dr * cdf(-d2) - S * dq * cdf(-d1),
    delta: -dq * cdf(-d1),
    gamma,
    vega,
    theta: (-(S * dq * pdf(d1) * sigma) / (2 * sq) + r * K * dr * cdf(-d2) - q * S * dq * cdf(-d1)) / 365,
    rho: (-K * T * dr * cdf(-d2)) / 100,
  };
}

/** Implied volatility by bisection (robust; prices outside no-arbitrage bounds return NaN). */
export function impliedVol(price: number, inp: Omit<BsIn, 'sigma'>): number {
  let lo = 1e-4;
  let hi = 5;
  const f = (s: number) => bs({ ...inp, sigma: s }).price - price;
  if (f(lo) > 0 || f(hi) < 0) return NaN;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) hi = mid;
    else lo = mid;
  }
  return (lo + hi) / 2;
}

export interface Leg { type: 'call' | 'put' | 'stock'; strike: number; qty: number; premium: number }

/** Payoff at expiry (item 28), per share. Positive qty = long. */
export function payoff(legs: Leg[], S: number): number {
  return legs.reduce((sum, l) => {
    const intrinsic = l.type === 'stock' ? S - l.strike : l.type === 'call' ? Math.max(0, S - l.strike) : Math.max(0, l.strike - S);
    return sum + l.qty * (intrinsic - (l.type === 'stock' ? 0 : l.premium));
  }, 0);
}

/** Breakeven prices where payoff crosses zero, by scanning. */
export function breakevens(legs: Leg[], lo: number, hi: number, steps = 2000): number[] {
  const out: number[] = [];
  let prevS = lo;
  let prev = payoff(legs, lo);
  for (let i = 1; i <= steps; i++) {
    const S = lo + ((hi - lo) * i) / steps;
    const v = payoff(legs, S);
    if (v === 0) out.push(+S.toFixed(2));
    else if (prev !== 0 && Math.sign(v) !== Math.sign(prev)) out.push(+(prevS + ((S - prevS) * -prev) / (v - prev)).toFixed(2)); // linear interpolation
    prev = v;
    prevS = S;
  }
  return [...new Set(out)];
}

/** One-standard-deviation expected move to expiry from IV (item 29). */
export const expectedMove = (S: number, iv: number, days: number) => S * iv * Math.sqrt(days / 365);

/** Max pain: the strike where option holders' total intrinsic value at expiry is smallest (item 32). */
export function maxPain(chain: { strike: number; callOi: number; putOi: number }[]): number | null {
  if (!chain.length) return null;
  let best = chain[0]!.strike;
  let bestV = Infinity;
  for (const { strike: S } of chain) {
    const v = chain.reduce((s, c) => s + c.callOi * Math.max(0, S - c.strike) + c.putOi * Math.max(0, c.strike - S), 0);
    if (v < bestV) {
      bestV = v;
      best = S;
    }
  }
  return best;
}

/** IV rank and percentile over a history of IV readings (item 30). */
export function ivRank(current: number, history: number[]) {
  const h = history.filter(Number.isFinite);
  if (!h.length) return { rank: NaN, percentile: NaN };
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  return { rank: hi > lo ? (current - lo) / (hi - lo) : NaN, percentile: h.filter((x) => x < current).length / h.length };
}

/**
 * SABR implied lognormal volatility (Hagan et al. 2002). A model with user parameters; no real
 * market data is involved (section 19).
 */
export function sabrVol(F: number, K: number, T: number, alpha: number, beta: number, rho: number, nu: number): number {
  if (Math.abs(F - K) < 1e-12) {
    const f1b = Math.pow(F, 1 - beta);
    return (alpha / f1b) * (1 + (((1 - beta) ** 2 / 24) * alpha * alpha / (f1b * f1b) + (rho * beta * nu * alpha) / (4 * f1b) + ((2 - 3 * rho * rho) / 24) * nu * nu) * T);
  }
  const logFK = Math.log(F / K);
  const fkb = Math.pow(F * K, (1 - beta) / 2);
  const z = (nu / alpha) * fkb * logFK;
  const x = Math.log((Math.sqrt(1 - 2 * rho * z + z * z) + z - rho) / (1 - rho));
  // z / x tends to 1 as z tends to 0 (no vol of vol).
  const zx = Math.abs(z) < 1e-10 ? 1 : z / x;
  const denom = fkb * (1 + ((1 - beta) ** 2 / 24) * logFK ** 2 + ((1 - beta) ** 4 / 1920) * logFK ** 4);
  const corr = 1 + (((1 - beta) ** 2 / 24) * alpha * alpha / (fkb * fkb) + (rho * beta * nu * alpha) / (4 * fkb) + ((2 - 3 * rho * rho) / 24) * nu * nu) * T;
  return (alpha / denom) * zx * corr;
}
