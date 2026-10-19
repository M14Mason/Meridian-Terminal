// Quant and risk panels (catalog 36 to 48 and owner hedge fund toolkit). Math lives in shared/quant.ts.
import { useMemo, useState } from 'react';
import { alignCloses } from '../../shared/align';
import { heatColor } from '../../shared/heat';
import { gapStats, returns, seasonality, sma } from '../../shared/indicators';
import type { Bar } from '../../shared/market';
import { engleGranger, frontier, garch, kelly, monteCarlo, multiOls, positionSize, riskOfRuin, varCvar } from '../../shared/quant';
import { ALPACA_NOTE, multiBars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { useWatchlists } from '../state/watchlists';

const MODEL = 'Model estimate. Not financial advice.';
const parse = (s: string) => [...new Set(s.toUpperCase().split(/[\s,]+/).filter((x) => /^[A-Z][A-Z0-9.-]{0,9}$/.test(x)))];

/** Aligned daily closes (and raw bars) for symbols over `years`, SIP history with IEX fallback. */
function usePrices(symbols: string[], years: number) {
  return useData(symbols.length ? `qp:${symbols.join(',')}:${years}` : null, async () => {
    const r = await multiBars(symbols, '1Day', startFor(years * 366 + 10), true);
    return { data: { bars: r.data, feed: r.feed }, fetchedAt: r.fetchedAt, fromCache: false };
  }, { source: 'Alpaca daily', note: 'history' });
}

function align(bars: Record<string, Bar[]> | undefined, syms: string[]) {
  if (!bars) return null;
  const ok = syms.filter((s) => bars[s]?.length);
  const al = alignCloses(ok.map((s) => bars[s]!));
  return al.dates.length > 30 ? { syms: ok, ...al, rets: al.closes.map((c) => returns(c)) } : null;
}

function TickerInput({ value, set, label = 'Tickers' }: { value: string; set: (v: string) => void; label?: string }) {
  return <input value={value} onChange={(e) => set(e.target.value)} aria-label={label} style={{ flex: 1, minWidth: 180 }} />;
}

// ---------- SIZE: Kelly, fixed fractional, risk of ruin ----------
function Size() {
  const [eq, setEq] = useState(10_000);
  const [risk, setRisk] = useState(1);
  const [entry, setEntry] = useState(50);
  const [stop, setStop] = useState(47.5);
  const [p, setP] = useState(55);
  const [b, setB] = useState(1.5);
  const ps = positionSize(eq, risk / 100, entry, stop);
  const k = kelly(p / 100, b);
  const ruin = useMemo(() => riskOfRuin(p / 100, b, risk / 100, 500, 0.5, 3000), [p, b, risk]);
  const num = (v: number, set: (n: number) => void, label: string, step = 1) => (
    <label className="toggle">{label}<input type="number" value={v} step={step} onChange={(e) => set(Number(e.target.value))} style={{ width: 90 }} /></label>
  );
  return (
    <div>
      <div className="toolbar">{num(eq, setEq, 'Account $', 100)}{num(risk, setRisk, 'Risk per trade %', 0.25)}{num(entry, setEntry, 'Entry', 0.01)}{num(stop, setStop, 'Stop', 0.01)}</div>
      <dl className="kv">
        <dt>Shares</dt><dd className="accent">{ps.shares}</dd>
        <dt>Position value</dt><dd>${fmt(ps.value)} ({fmt((ps.value / eq) * 100, 1)}% of account)</dd>
        <dt>Loss if stopped</dt><dd className="down">${fmt(ps.risk)}</dd>
      </dl>
      <div className="toolbar" style={{ marginTop: 8 }}>{num(p, setP, 'Win rate %', 1)}{num(b, setB, 'Avg win / avg loss', 0.1)}</div>
      <dl className="kv">
        <dt>Full Kelly</dt><dd className={k > 0 ? 'up' : 'down'}>{fmt(k * 100, 1)}% of equity per trade {k <= 0 ? '(no edge: do not size up)' : ''}</dd>
        <dt>Half Kelly (common practice)</dt><dd>{fmt(Math.max(0, k / 2) * 100, 1)}%</dd>
        <dt>Risk of a 50% drawdown in 500 trades</dt><dd className={ruin > 0.05 ? 'down' : 'up'}>{fmt(ruin * 100, 1)}% at {risk}% risk per trade</dd>
      </dl>
      <div className="disclaimer">Kelly assumes your win rate and payoff are known exactly; real estimates are noisy, so most traders use a fraction of Kelly. {MODEL}</div>
    </div>
  );
}

// ---------- MC: Monte Carlo ----------
function Mc({ security }: { security?: string }) {
  const [sym, setSym] = useState(security ?? 'SPY');
  const [days, setDays] = useState(252);
  const st = usePrices([sym.toUpperCase()], 10);
  const sim = useMemo(() => {
    const a = align(st.data?.bars, [sym.toUpperCase()]);
    return a ? monteCarlo(a.rets[0]!, days, 2000) : null;
  }, [st.data, sym, days]);
  const W = 520;
  const H = 220;
  const all = sim ? [...sim.p5, ...sim.p95] : [1];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const X = (i: number) => (i / days) * W;
  const Y = (v: number) => H - ((v - lo) / (hi - lo || 1)) * H;
  const path = (a: number[]) => a.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const band = (a: number[], b: number[]) => `${path(a)}${b.map((_, i) => `L${X(b.length - 1 - i).toFixed(1)},${Y(b[b.length - 1 - i]!).toFixed(1)}`).join('')}Z`;
  return (
    <div>
      <div className="toolbar"><input value={sym} onChange={(e) => setSym(e.target.value)} style={{ width: 80 }} aria-label="Ticker" />{[21, 63, 126, 252, 756].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d === 756 ? '3Y' : d === 252 ? '1Y' : `${Math.round(d / 21)}M`}</button>)}</div>
      <DataStatus state={st} keyName="Alpaca" />
      {sim && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720 }} role="img" aria-label="Monte Carlo fan chart">
            <path d={band(sim.p5, sim.p95)} fill="var(--text)" opacity={0.12} />
            <path d={band(sim.p25, sim.p75)} fill="var(--text)" opacity={0.25} />
            <path d={path(sim.p50)} fill="none" stroke="var(--text)" strokeWidth={2} />
            <line x1={0} x2={W} y1={Y(1)} y2={Y(1)} stroke="var(--hairline)" strokeDasharray="4 3" />
          </svg>
          <dl className="kv">
            <dt>Median outcome</dt><dd>{fmtPct((sim.p50.at(-1)! - 1) * 100, 1)}</dd>
            <dt>Middle 50%</dt><dd>{fmtPct((sim.p25.at(-1)! - 1) * 100, 1)} to {fmtPct((sim.p75.at(-1)! - 1) * 100, 1)}</dd>
            <dt>90% range</dt><dd>{fmtPct((sim.p5.at(-1)! - 1) * 100, 1)} to {fmtPct((sim.p95.at(-1)! - 1) * 100, 1)}</dd>
            <dt>Chance of a loss</dt><dd className="down">{fmt(sim.probLoss * 100, 1)}%</dd>
          </dl>
        </>
      )}
      <div className="disclaimer">2,000 paths built by resampling the last 10 years of daily returns. Assumes the future looks like that past and ignores regime changes. {MODEL}</div>
    </div>
  );
}

// ---------- EF: efficient frontier ----------
function Ef() {
  const [input, setInput] = useState('SPY TLT GLD EFA VNQ');
  const syms = useMemo(() => parse(input).slice(0, 10), [input]);
  const st = usePrices(syms, 10);
  const f = useMemo(() => {
    const a = align(st.data?.bars, syms);
    return a ? { ...frontier(a.rets, 3000), syms: a.syms } : null;
  }, [st.data, syms]);
  const W = 420;
  const H = 240;
  const vmax = f ? Math.max(...f.points.map((p) => p.vol)) * 1.05 : 1;
  const rmin = f ? Math.min(0, ...f.points.map((p) => p.ret)) : 0;
  const rmax = f ? Math.max(...f.points.map((p) => p.ret)) * 1.05 : 1;
  const X = (v: number) => (v / vmax) * W;
  const Y = (r: number) => H - ((r - rmin) / (rmax - rmin || 1)) * H;
  return (
    <div>
      <div className="toolbar"><TickerInput value={input} set={setInput} /></div>
      <DataStatus state={st} keyName="Alpaca" />
      {f && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} style={{ maxWidth: '100%', border: '1px solid var(--hairline)' }} role="img" aria-label="Efficient frontier">
            {f.points.map((p, i) => <circle key={i} cx={X(p.vol)} cy={Y(p.ret)} r={1.3} fill={heatColor(Math.max(-1, Math.min(1, p.sharpe - 0.5)))} />)}
            <circle cx={X(f.best.vol)} cy={Y(f.best.ret)} r={5} fill="none" stroke="var(--text)" strokeWidth={2} />
            <circle cx={X(f.minVol.vol)} cy={Y(f.minVol.ret)} r={5} fill="none" stroke="var(--link)" strokeWidth={2} />
          </svg>
          <table className="grid-table" style={{ width: 'auto' }}>
            <thead><tr><th>Asset</th><th className="num">Ret</th><th className="num">Vol</th><th className="num accent">Max Sharpe</th><th className="num">Min vol</th></tr></thead>
            <tbody>
              {f.syms.map((s, i) => <tr key={s}><td>{s}</td><td className="num">{fmtPct(f.mu[i]! * 100, 1)}</td><td className="num">{fmtPct(f.vols[i]! * 100, 1)}</td><td className="num">{fmt(f.best.w[i]! * 100, 0)}%</td><td className="num">{fmt(f.minVol.w[i]! * 100, 0)}%</td></tr>)}
              <tr className="accent"><td>Portfolio</td><td /><td /><td className="num">{fmtPct(f.best.ret * 100, 1)} / {fmtPct(f.best.vol * 100, 1)}</td><td className="num">{fmtPct(f.minVol.ret * 100, 1)} / {fmtPct(f.minVol.vol * 100, 1)}</td></tr>
            </tbody>
          </table>
        </div>
      )}
      <div className="disclaimer">3,000 random long-only mixes using 10 years of history. Orange ring = best return per unit of risk, blue = lowest volatility. Past averages are poor forecasts of future returns, so treat weights as illustrations. {MODEL}</div>
    </div>
  );
}

// ---------- RISK: VaR, CVaR, stress replays, liquidity ----------
const STRESS: [string, string, string][] = [['2008 financial crisis', '2008-09-02', '2009-03-09'], ['2020 COVID crash', '2020-02-19', '2020-03-23'], ['2022 rate shock', '2022-01-03', '2022-10-12'], ['2018 Q4 selloff', '2018-09-20', '2018-12-24']];

function Risk() {
  const lists = useWatchlists();
  const [input, setInput] = useState(() => lists[0]!.value.symbols.slice(0, 8).join(' '));
  const [amount, setAmount] = useState(10_000);
  const syms = useMemo(() => parse(input).slice(0, 25), [input]);
  const all = useMemo(() => [...new Set([...syms, 'SPY'])], [syms]);
  const st = usePrices(all, 18);
  const res = useMemo(() => {
    const bars = st.data?.bars;
    if (!bars) return null;
    const recent = align(bars, all);
    if (!recent) return null;
    const idx = recent.syms.map((s) => s);
    const w = syms.filter((s) => idx.includes(s));
    const T = recent.rets[0]!.length;
    const port = Array.from({ length: T }, (_, t) => w.reduce((s, sym) => s + recent.rets[idx.indexOf(sym)]![t]! / w.length, 0));
    const last2y = port.slice(-504);
    const v95 = varCvar(last2y, 0.95);
    const v99 = varCvar(last2y, 0.99);
    const spy = recent.rets[idx.indexOf('SPY')]!.slice(-504);
    const cov = last2y.reduce((s, r, i) => s + r * spy[i]!, 0) / last2y.length - (last2y.reduce((a, b) => a + b, 0) / last2y.length) * (spy.reduce((a, b) => a + b, 0) / spy.length);
    const varS = spy.reduce((s, r) => s + r * r, 0) / spy.length - (spy.reduce((a, b) => a + b, 0) / spy.length) ** 2;
    let peak = 1;
    let eq = 1;
    let mdd = 0;
    for (const r of last2y) {
      eq *= 1 + r;
      peak = Math.max(peak, eq);
      mdd = Math.min(mdd, eq / peak - 1);
    }
    const stress = STRESS.map(([name, from, to]) => {
      const moves = w.map((s) => {
        const b = bars[s] ?? [];
        const a = b.find((x) => new Date(x.t).toISOString().slice(0, 10) >= from);
        const z = [...b].reverse().find((x) => new Date(x.t).toISOString().slice(0, 10) <= to);
        return a && z && new Date(a.t).toISOString().slice(0, 10) <= from.slice(0, 8) + '28' ? z.c / a.c - 1 : null;
      });
      const have = moves.filter((m): m is number => m != null);
      return { name, from, to, ret: have.length ? have.reduce((a, b) => a + b, 0) / have.length : null, coverage: `${have.length}/${w.length}` };
    });
    const liq = w.map((s) => {
      const b = (bars[s] ?? []).slice(-20);
      const adv = b.reduce((x, y) => x + y.v * y.c, 0) / (b.length || 1);
      return { s, adv, share: adv ? amount / w.length / adv : NaN };
    });
    return { w, v95, v99, vol: Math.sqrt(last2y.reduce((s, r) => s + r * r, 0) / last2y.length) * Math.sqrt(252), beta: cov / varS, mdd, stress, liq };
  }, [st.data, syms, all, amount]);
  return (
    <div>
      <div className="toolbar"><TickerInput value={input} set={setInput} label="Holdings (equal weight)" /><label className="toggle">Amount $<input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} style={{ width: 100 }} /></label></div>
      <DataStatus state={st} keyName="Alpaca" />
      {res && (
        <>
          <dl className="kv">
            <dt>Holdings</dt><dd>{res.w.join(', ')} (equal weight)</dd>
            <dt>1-day VaR 95% (historical)</dt><dd className="down">{fmtPct(res.v95.hVar * 100, 2)} = ${fmt(res.v95.hVar * amount, 0)}</dd>
            <dt>1-day CVaR 95% (average of worst 5%)</dt><dd className="down">{fmtPct(res.v95.hCvar * 100, 2)} = ${fmt(res.v95.hCvar * amount, 0)}</dd>
            <dt>1-day VaR 99%</dt><dd className="down">{fmtPct(res.v99.hVar * 100, 2)} (normal model: {fmtPct(res.v99.pVar * 100, 2)})</dd>
            <dt>Annual volatility</dt><dd>{fmtPct(res.vol * 100, 1)}</dd>
            <dt>Beta to SPY</dt><dd>{fmt(res.beta)}</dd>
            <dt>Max drawdown (2y)</dt><dd className="down">{fmtPct(res.mdd * 100, 1)}</dd>
          </dl>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>STRESS REPLAYS (what these holdings did then)</h4>
          <table className="grid-table">
            <thead><tr><th>Scenario</th><th>Window</th><th className="num">Return</th><th className="num">On ${fmtBig(amount)}</th><th className="num">Coverage</th></tr></thead>
            <tbody>{res.stress.map((x) => <tr key={x.name}><td>{x.name}</td><td className="muted">{x.from} to {x.to}</td><td className={`num ${dir(x.ret)}`}>{x.ret == null ? 'n/a' : fmtPct(x.ret * 100, 1)}</td><td className={`num ${dir(x.ret)}`}>{x.ret == null ? '-' : `$${fmt(x.ret * amount, 0)}`}</td><td className="num muted">{x.coverage}</td></tr>)}</tbody>
          </table>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>LIQUIDITY</h4>
          <table className="grid-table">
            <thead><tr><th>Ticker</th><th className="num">Avg daily $ volume (20d)</th><th className="num">Your position as % of a day</th></tr></thead>
            <tbody>{res.liq.map((l) => <tr key={l.s}><td>{l.s}</td><td className="num">${fmtBig(l.adv)}</td><td className={`num ${l.share > 0.01 ? 'down' : ''}`}>{fmt(l.share * 100, 4)}%</td></tr>)}</tbody>
          </table>
        </>
      )}
      <div className="disclaimer">Equal-weight portfolio of the listed tickers. VaR from the last 2 years of daily returns; real losses can exceed it. Stress replays show the average move of holdings that traded then (coverage column); newer listings are left out. {MODEL}</div>
    </div>
  );
}

// ---------- FACT: factor exposure ----------
const FACTORS: [string, string, string, string][] = [['Market', 'SPY', '', 'SPY'], ['Size (small minus large)', 'IWM', 'SPY', 'IWM - SPY'], ['Value (value minus growth)', 'IWD', 'IWF', 'IWD - IWF'], ['Momentum', 'MTUM', 'SPY', 'MTUM - SPY'], ['Quality', 'QUAL', 'SPY', 'QUAL - SPY'], ['Low volatility', 'USMV', 'SPY', 'USMV - SPY']];

function Fact({ security }: { security?: string }) {
  const sym = (security ?? 'AAPL').toUpperCase();
  const all = useMemo(() => [...new Set([sym, ...FACTORS.flatMap((f) => [f[1], f[2]]).filter(Boolean)])], [sym]);
  const st = usePrices(all, 3);
  const res = useMemo(() => {
    const a = align(st.data?.bars, all);
    if (!a) return null;
    const r = (s: string) => a.rets[a.syms.indexOf(s)];
    const y = r(sym);
    if (!y) return null;
    const X = FACTORS.map(([, l, s]) => {
      const L = r(l)!;
      const S = s ? r(s)! : null;
      return S ? L.map((v, i) => v - S[i]!) : L;
    });
    return multiOls(y, X);
  }, [st.data, sym, all]);
  return (
    <div>
      <DataStatus state={st} keyName="Alpaca" />
      {res && (
        <table className="grid-table">
          <thead><tr><th>Factor (ETF proxy)</th><th>Built from</th><th className="num">Beta</th></tr></thead>
          <tbody>
            {FACTORS.map(([name, , , built], i) => <tr key={name}><td>{name}</td><td className="muted">{built}</td><td className={`num ${dir(res.coef[i + 1])}`}>{fmt(res.coef[i + 1], 2)}</td></tr>)}
            <tr><td>Alpha (annualized)</td><td /><td className={`num ${dir(res.coef[0])}`}>{fmtPct(res.coef[0]! * 252 * 100, 1)}</td></tr>
            <tr><td>R squared</td><td /><td className="num">{fmt(res.r2, 2)}</td></tr>
          </tbody>
        </table>
      )}
      <div className="disclaimer">{sym}: 3 years of daily returns regressed on ETF long-short proxies for each factor. ETF proxies, not academic factor data. Positive value beta = behaves like value stocks. {MODEL}</div>
    </div>
  );
}

// ---------- CORM: correlation matrix ----------
function Corm() {
  const [input, setInput] = useState('SPY QQQ IWM TLT GLD USO UUP EFA EEM HYG');
  const [years, setYears] = useState(1);
  const syms = useMemo(() => parse(input).slice(0, 20), [input]);
  const st = usePrices(syms, years);
  const m = useMemo(() => {
    const a = align(st.data?.bars, syms);
    if (!a) return null;
    const c = a.rets.map((x) => a.rets.map((y) => {
      const n = Math.min(x.length, y.length);
      const mx = x.reduce((s, v) => s + v, 0) / n;
      const my = y.reduce((s, v) => s + v, 0) / n;
      let sxy = 0;
      let sxx = 0;
      let syy = 0;
      for (let i = 0; i < n; i++) {
        sxy += (x[i]! - mx) * (y[i]! - my);
        sxx += (x[i]! - mx) ** 2;
        syy += (y[i]! - my) ** 2;
      }
      return sxy / Math.sqrt(sxx * syy);
    }));
    // Order by average correlation so clusters sit together.
    const order = a.syms.map((_, i) => i).sort((i, j) => c[j]!.reduce((s, v) => s + v, 0) - c[i]!.reduce((s, v) => s + v, 0));
    return { syms: order.map((i) => a.syms[i]!), c: order.map((i) => order.map((j) => c[i]![j]!)) };
  }, [st.data, syms]);
  return (
    <div>
      <div className="toolbar"><TickerInput value={input} set={setInput} />{[1, 3, 5].map((y) => <button key={y} aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}</div>
      <DataStatus state={st} keyName="Alpaca" />
      {m && (
        <table className="grid-table heat">
          <thead><tr><th />{m.syms.map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
          <tbody>{m.syms.map((s, i) => <tr key={s}><td className="accent">{s}</td>{m.c[i]!.map((v, j) => <td key={j} className="cell" style={{ background: heatColor(v, true) }}>{fmt(v, 2)}</td>)}</tr>)}</tbody>
        </table>
      )}
      <div className="disclaimer">Daily return correlations. Orange = move together, blue = move opposite. Correlations jump toward 1 in crashes, so diversification is weakest when you need it.</div>
    </div>
  );
}

// ---------- VOLF: GARCH and regime ----------
function Volf({ security }: { security?: string }) {
  const sym = (security ?? 'SPY').toUpperCase();
  const st = usePrices([sym], 6);
  const res = useMemo(() => {
    const bars = st.data?.bars[sym];
    if (!bars || bars.length < 300) return null;
    const c = bars.map((b) => b.c);
    const r = returns(c);
    const g = garch(r.slice(-1260));
    const realized = (n: number) => Math.sqrt(r.slice(-n).reduce((s, x) => s + x * x, 0) / n) * Math.sqrt(252);
    const vols: number[] = [];
    for (let i = 21; i < r.length; i++) vols.push(Math.sqrt(r.slice(i - 21, i).reduce((s, x) => s + x * x, 0) / 21) * Math.sqrt(252));
    const pctl = vols.filter((v) => v < realized(21)).length / vols.length;
    const ma = sma(c, 200).at(-1)!;
    const up = c.at(-1)! > ma;
    const regime = `${pctl > 0.7 ? 'Volatile' : pctl < 0.3 ? 'Calm' : 'Normal'} ${up ? 'uptrend' : 'downtrend'}`;
    return { g, r21: realized(21), r63: realized(63), pctl, regime, up };
  }, [st.data, sym]);
  return (
    <div>
      <DataStatus state={st} keyName="Alpaca" />
      {res && (
        <dl className="kv">
          <dt>Regime</dt><dd className={res.up ? 'up' : 'down'}>{res.regime}</dd>
          <dt>Realized vol 1m / 3m</dt><dd>{fmtPct(res.r21 * 100, 1)} / {fmtPct(res.r63 * 100, 1)} (1m is at the {Math.round(res.pctl * 100)}th percentile of 5 years)</dd>
          <dt>GARCH next-day vol</dt><dd>{fmtPct(res.g.currentVol * 100, 1)} annualized</dd>
          <dt>GARCH 1-month forecast</dt><dd className="accent">{fmtPct(res.g.forecastVol * 100, 1)}</dd>
          <dt>Long-run vol</dt><dd>{fmtPct(res.g.longRunVol * 100, 1)}</dd>
          <dt>Persistence (alpha + beta)</dt><dd>{fmt(res.g.persistence, 3)} (alpha {fmt(res.g.alpha, 3)}, beta {fmt(res.g.beta, 3)})</dd>
        </dl>
      )}
      <div className="disclaimer">{sym}: GARCH(1,1) fit on 5 years of daily returns by maximum likelihood. Regime = volatility percentile plus price vs 200-day average. {MODEL}</div>
    </div>
  );
}

// ---------- PAIR: cointegration scanner ----------
function Pair() {
  const [input, setInput] = useState('KO PEP XOM CVX JPM BAC V MA HD LOW');
  const syms = useMemo(() => parse(input).slice(0, 14), [input]);
  const st = usePrices(syms, 3);
  const pairs = useMemo(() => {
    const a = align(st.data?.bars, syms);
    if (!a) return [];
    const out: { a: string; b: string; t: number; sig: string; half: number; z: number }[] = [];
    for (let i = 0; i < a.syms.length; i++) {
      for (let j = i + 1; j < a.syms.length; j++) {
        const eg = engleGranger(a.closes[i]!, a.closes[j]!);
        const spread = a.closes[i]!.map((v, k) => Math.log(v) - eg.hedge * Math.log(a.closes[j]![k]!));
        const w = spread.slice(-60);
        const m = w.reduce((s, v) => s + v, 0) / w.length;
        const sd = Math.sqrt(w.reduce((s, v) => s + (v - m) ** 2, 0) / w.length);
        out.push({ a: a.syms[i]!, b: a.syms[j]!, t: eg.t, sig: eg.significance, half: eg.halfLife, z: (spread.at(-1)! - m) / sd });
      }
    }
    return out.sort((x, y) => x.t - y.t);
  }, [st.data, syms]);
  return (
    <div>
      <div className="toolbar"><TickerInput value={input} set={setInput} /></div>
      <DataStatus state={st} keyName="Alpaca" />
      <table className="grid-table">
        <thead><tr><th>Pair</th><th className="num">ADF t</th><th>Cointegrated at</th><th className="num">Half-life (days)</th><th className="num">Spread z (60d)</th></tr></thead>
        <tbody>
          {pairs.slice(0, 30).map((p) => (
            <tr key={p.a + p.b}>
              <td className="accent">{p.a} / {p.b}</td>
              <td className="num">{fmt(p.t)}</td>
              <td className={p.sig === 'not cointegrated' ? 'muted' : 'up'}>{p.sig}</td>
              <td className="num">{Number.isFinite(p.half) ? fmt(p.half, 0) : '-'}</td>
              <td className={`num ${Math.abs(p.z) > 2 ? 'accent' : ''}`}>{fmt(p.z)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer">Engle-Granger test on 3 years of log prices (MacKinnon critical values). Testing many pairs finds some by chance; check stability over time before trusting one. Backtest a pair in BT. {MODEL}</div>
    </div>
  );
}

// ---------- RRG: relative rotation ----------
const RRG_SYMS = ['XLK', 'XLC', 'XLY', 'XLP', 'XLE', 'XLF', 'XLV', 'XLI', 'XLB', 'XLRE', 'XLU'];
function Rrg() {
  const st = usePrices([...RRG_SYMS, 'SPY'], 2);
  const pts = useMemo(() => {
    const a = align(st.data?.bars, [...RRG_SYMS, 'SPY']);
    if (!a) return [];
    const spy = a.closes[a.syms.indexOf('SPY')]!;
    return RRG_SYMS.filter((s) => a.syms.includes(s)).map((s) => {
      const c = a.closes[a.syms.indexOf(s)]!;
      const ratio = c.map((v, i) => v / spy[i]!);
      const m = sma(ratio, 50);
      const rs = ratio.map((v, i) => (100 * v) / m[i]!);
      const tail = [25, 20, 15, 10, 5, 0].map((back) => {
        const i = rs.length - 1 - back;
        return { x: rs[i]!, y: (100 * rs[i]!) / rs[i - 10]! };
      });
      return { s, tail };
    });
  }, [st.data]);
  const W = 360;
  const toX = (v: number) => W / 2 + (v - 100) * 18;
  const toY = (v: number) => W / 2 - (v - 100) * 30;
  const quad = (x: number, y: number) => (x >= 100 ? (y >= 100 ? 'Leading' : 'Weakening') : y >= 100 ? 'Improving' : 'Lagging');
  return (
    <div>
      <DataStatus state={st} keyName="Alpaca" />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <svg viewBox={`0 0 ${W} ${W}`} width={W} height={W} style={{ maxWidth: '100%', border: '1px solid var(--hairline)' }} role="img" aria-label="Relative rotation graph of sectors vs SPY">
          <line x1={W / 2} x2={W / 2} y1={0} y2={W} stroke="var(--hairline)" />
          <line y1={W / 2} y2={W / 2} x1={0} x2={W} stroke="var(--hairline)" />
          <text x={W - 60} y={14} fill="var(--up)" fontSize={11}>Leading</text>
          <text x={6} y={14} fill="var(--link)" fontSize={11}>Improving</text>
          <text x={6} y={W - 6} fill="var(--down)" fontSize={11}>Lagging</text>
          <text x={W - 72} y={W - 6} fill="var(--text)" fontSize={11}>Weakening</text>
          {pts.map((p) => (
            <g key={p.s}>
              <polyline points={p.tail.map((t) => `${toX(t.x)},${toY(t.y)}`).join(' ')} fill="none" stroke="var(--text-dim)" strokeWidth={1} />
              <circle cx={toX(p.tail.at(-1)!.x)} cy={toY(p.tail.at(-1)!.y)} r={4} fill="var(--text)" />
              <text x={toX(p.tail.at(-1)!.x) + 6} y={toY(p.tail.at(-1)!.y) + 4} fill="var(--value)" fontSize={10}>{p.s}</text>
            </g>
          ))}
        </svg>
        <table className="grid-table" style={{ width: 'auto' }}>
          <tbody>{pts.map((p) => <tr key={p.s}><td className="accent">{p.s}</td><td>{quad(p.tail.at(-1)!.x, p.tail.at(-1)!.y)}</td></tr>)}</tbody>
        </table>
      </div>
      <div className="disclaimer">Sector ETFs vs SPY. X = relative strength vs its 50-day average, Y = 10-day momentum of that strength; tails show the last 5 weeks. An approximation of the relative rotation graph method, not the licensed JdK indicator. Sectors usually rotate clockwise.</div>
    </div>
  );
}

// ---------- SEAS and GAPS ----------
function Seas({ security }: { security?: string }) {
  const sym = (security ?? 'SPY').toUpperCase();
  const st = usePrices([sym], 20);
  const s = useMemo(() => (st.data?.bars[sym] ? seasonality(st.data.bars[sym]!) : null), [st.data, sym]);
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return (
    <div>
      <DataStatus state={st} keyName="Alpaca" />
      {s && (
        <table className="grid-table heat">
          <thead><tr><th>Month</th><th className="num">Avg return</th><th className="num">Up years</th><th className="num">Years</th></tr></thead>
          <tbody>{s.map((m) => <tr key={m.month}><td>{M[m.month]}</td><td className="cell" style={{ background: heatColor(Math.max(-1, Math.min(1, m.avg * 25))) }}>{fmtPct(m.avg * 100, 2)}</td><td className="num">{fmt(m.hitRate * 100, 0)}%</td><td className="num">{m.years}</td></tr>)}</tbody>
        </table>
      )}
      <div className="disclaimer">{sym}, up to 20 years of daily data grouped by calendar month. Small samples: a month with 20 observations can look strong by chance.</div>
    </div>
  );
}

function Gaps({ security }: { security?: string }) {
  const sym = (security ?? 'SPY').toUpperCase();
  const [minPct, setMin] = useState(1);
  const st = usePrices([sym], 3);
  const g = useMemo(() => (st.data?.bars[sym] ? gapStats(st.data.bars[sym]!, minPct / 100) : null), [st.data, sym, minPct]);
  const ups = g?.gaps.filter((x) => x.pct > 0) ?? [];
  const downs = g?.gaps.filter((x) => x.pct < 0) ?? [];
  const rate = (a: typeof ups) => (a.length ? a.filter((x) => x.filled).length / a.length : NaN);
  return (
    <div>
      <div className="toolbar">{[0.5, 1, 2, 3].map((p) => <button key={p} aria-pressed={minPct === p} onClick={() => setMin(p)}>{p}%+ GAPS</button>)}</div>
      <DataStatus state={st} keyName="Alpaca" />
      {g && (
        <dl className="kv">
          <dt>Gaps found (3 years)</dt><dd>{g.count}</dd>
          <dt>Gap ups filled same day</dt><dd>{fmt(rate(ups) * 100, 0)}% of {ups.length}</dd>
          <dt>Gap downs filled same day</dt><dd>{fmt(rate(downs) * 100, 0)}% of {downs.length}</dd>
          <dt>Most recent</dt><dd>{g.gaps.slice(-5).reverse().map((x) => `${fmtPct(x.pct * 100, 1)}${x.filled ? ' filled' : ''}`).join(' · ') || '-'}</dd>
        </dl>
      )}
      <div className="disclaimer">{sym}: a gap is today&apos;s open vs yesterday&apos;s close; filled means price touched yesterday&apos;s close during the day. Daily bars only.</div>
    </div>
  );
}

export default function QuantPanels({ code, security }: PanelProps) {
  switch (code) {
    case 'SIZE': return <Size />;
    case 'MC': return <Mc security={security} />;
    case 'EF': return <Ef />;
    case 'RISK': return <Risk />;
    case 'FACT': return <Fact security={security} />;
    case 'CORM': return <Corm />;
    case 'VOLF': return <Volf security={security} />;
    case 'PAIR': return <Pair />;
    case 'RRG': return <Rrg />;
    case 'SEAS': return <Seas security={security} />;
    case 'GAPS': return <Gaps security={security} />;
    default: return null;
  }
}

export { ALPACA_NOTE };
