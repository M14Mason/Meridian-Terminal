// Market breadth and relative volume from daily snapshots of every US stock (pure, tested).
export interface Bar { c: number; v: number; h: number; l: number }
export interface Day { date: string; bars: Map<string, Bar> }

export interface BreadthDay {
  date: string;
  adv: number;
  dec: number;
  net: number;
  adLine: number;
  /** McClellan oscillator: EMA19 minus EMA39 of net advances (null during warm-up). */
  mcclellan: number | null;
  above20: number | null;
  above50: number | null;
  newHigh: number | null;
  newLow: number | null;
}

const ema = (prev: number | null, x: number, n: number) => (prev == null ? x : prev + (2 / (n + 1)) * (x - prev));

/** Days must be oldest first. `universe` limits to common stocks (optional). */
export function breadth(days: Day[], universe?: Set<string>): BreadthDay[] {
  const out: BreadthDay[] = [];
  let ad = 0;
  let e19: number | null = null;
  let e39: number | null = null;
  const closes = new Map<string, number[]>();
  for (let i = 0; i < days.length; i++) {
    const d = days[i]!;
    let adv = 0;
    let dec = 0;
    let n20 = 0, a20 = 0, n50 = 0, a50 = 0, hi = 0, lo = 0;
    for (const [t, b] of d.bars) {
      if (universe && !universe.has(t)) continue;
      const hist = closes.get(t) ?? [];
      const prev = hist[hist.length - 1];
      if (prev != null && i > 0 && days[i - 1]!.bars.has(t)) {
        if (b.c > prev) adv++;
        else if (b.c < prev) dec++;
      }
      hist.push(b.c);
      if (hist.length > 50) hist.shift();
      closes.set(t, hist);
      if (hist.length >= 20) {
        const s = hist.slice(-20);
        n20++;
        if (b.c > s.reduce((x, y) => x + y, 0) / 20) a20++;
        if (b.c >= Math.max(...s)) hi++;
        if (b.c <= Math.min(...s)) lo++;
      }
      if (hist.length >= 50) {
        n50++;
        if (b.c > hist.reduce((x, y) => x + y, 0) / 50) a50++;
      }
    }
    if (i === 0) continue;
    const net = adv - dec;
    ad += net;
    e19 = ema(e19, net, 19);
    e39 = ema(e39, net, 39);
    out.push({
      date: d.date, adv, dec, net, adLine: ad,
      mcclellan: out.length >= 38 ? e19 - e39! : null,
      above20: n20 ? a20 / n20 : null,
      above50: n50 ? a50 / n50 : null,
      newHigh: n20 ? hi : null,
      newLow: n20 ? lo : null,
    });
  }
  return out;
}

export interface RvolRow { ticker: string; price: number; chg: number; vol: number; avg: number; rvol: number }

/** Latest day's volume vs the average of up to `lookback` prior days. Days oldest first. */
export function rvol(days: Day[], lookback = 20, minPrice = 2, minAvg = 100_000): RvolRow[] {
  if (days.length < 6) return [];
  const last = days[days.length - 1]!;
  const prior = days.slice(-1 - lookback, -1);
  const prev = days[days.length - 2]!;
  const rows: RvolRow[] = [];
  for (const [t, b] of last.bars) {
    let s = 0, n = 0;
    for (const d of prior) {
      const x = d.bars.get(t);
      if (x) { s += x.v; n++; }
    }
    if (n < Math.min(5, prior.length)) continue;
    const avg = s / n;
    const pc = prev.bars.get(t)?.c;
    if (b.c < minPrice || avg < minAvg || !pc) continue;
    rows.push({ ticker: t, price: b.c, chg: b.c / pc - 1, vol: b.v, avg, rvol: b.v / avg });
  }
  return rows.sort((a, b) => b.rvol - a.rvol);
}
