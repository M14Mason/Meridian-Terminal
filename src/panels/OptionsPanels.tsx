// Options panels (catalog 26 to 35, SABR). LIMITED: Alpaca indicative feed, delayed, no open interest.
import { useMemo, useState } from 'react';
import { bs, breakevens, expectedMove, impliedVol, payoff, sabrVol, type Leg } from '../../shared/options';
import { quotes } from '../data/adapters/alpaca';
import { series } from '../data/adapters/fred';
import { atmTerm, chain, type OptionRow } from '../data/adapters/options';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const NOTE = 'Alpaca indicative options feed: delayed and derived, not the official OPRA feed. No open interest. Personal use only. Model estimate. Not financial advice.';

function useChain(sym: string) {
  return useData(`opt:${sym}`, async (): Promise<Fetched<{ rows: OptionRow[]; spot: number }>> => {
    const [c, q] = await Promise.all([chain(sym, { maxPages: 12 }), quotes([sym])]);
    return { data: { rows: c.data, spot: q.data[sym]?.price ?? NaN }, fetchedAt: c.fetchedAt, fromCache: false };
  }, { source: 'Alpaca options', note: 'indicative, delayed', everyMs: 5 * 60_000 });
}

// ---------- OMON: chain ----------
function Omon({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useChain(sym);
  const expiries = useMemo(() => [...new Set((st.data?.rows ?? []).map((r) => r.expiry))].sort(), [st.data]);
  const [exp, setExp] = useState<string | null>(null);
  const e = exp ?? expiries.find((x) => Date.parse(x) - (st.fetchedAt ?? 0) > 5 * 86_400_000) ?? expiries[0];
  const spot = st.data?.spot ?? NaN;
  const strikes = useMemo(() => {
    const rows = (st.data?.rows ?? []).filter((r) => r.expiry === e);
    const m = new Map<number, { call?: OptionRow; put?: OptionRow }>();
    for (const r of rows) (m.get(r.strike) ?? m.set(r.strike, {}).get(r.strike)!)[r.type] = r;
    const all = [...m.entries()].sort((a, b) => a[0] - b[0]);
    const atm = all.findIndex(([k]) => k >= spot);
    return all.slice(Math.max(0, atm - 15), atm + 15);
  }, [st.data, e, spot]);
  const cell = (o?: OptionRow) => (
    <>
      <td className="num">{fmt(o?.bid)}</td><td className="num">{fmt(o?.ask)}</td><td className="num">{o?.volume ? fmtBig(o.volume) : '-'}</td><td className="num">{o?.iv ? fmtPct(o.iv * 100, 1) : '-'}</td><td className="num">{fmt(o?.delta, 2)}</td>
    </>
  );
  return (
    <>
      <div className="toolbar">
        <strong className="accent">{sym}</strong><span>spot {fmt(spot)}</span>
        <select value={e ?? ''} onChange={(ev) => setExp(ev.target.value)} aria-label="Expiry">{expiries.map((x) => <option key={x} value={x}>{x}</option>)}</select>
        <button onClick={() => run(`${sym} OEXP`)}>EXPECTED MOVE</button>
      </div>
      <DataStatus state={st} keyName="Alpaca" empty={st.data?.rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th colSpan={5} className="up">CALLS</th><th>Strike</th><th colSpan={5} className="down">PUTS</th></tr><tr><th className="num">Bid</th><th className="num">Ask</th><th className="num">Vol</th><th className="num">IV</th><th className="num">Delta</th><th /><th className="num">Bid</th><th className="num">Ask</th><th className="num">Vol</th><th className="num">IV</th><th className="num">Delta</th></tr></thead>
        <tbody>
          {strikes.map(([k, v]) => (
            <tr key={k} style={{ background: Math.abs(k - spot) < (strikes[1]?.[0] ?? 0) - (strikes[0]?.[0] ?? 0) ? 'var(--th-bg)' : undefined }}>
              {cell(v.call)}<td className="accent num">{fmt(k)}</td>{cell(v.put)}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ---------- OEXP: expected move, put/call, smile ----------
function Oexp({ sym }: { sym: string }) {
  const st = useChain(sym);
  const r = useMemo(() => {
    if (!st.data) return null;
    const { rows, spot } = st.data;
    const term = atmTerm(rows, spot);
    const callV = rows.filter((x) => x.type === 'call').reduce((s, x) => s + x.volume, 0);
    const putV = rows.filter((x) => x.type === 'put').reduce((s, x) => s + x.volume, 0);
    const near = term.find((t) => t.days > 5);
    const smile = near ? rows.filter((x) => x.expiry === near.expiry && x.iv && Math.abs(x.strike / spot - 1) < 0.25 && ((x.type === 'put' && x.strike <= spot) || (x.type === 'call' && x.strike >= spot))).sort((a, b) => a.strike - b.strike) : [];
    return { spot, term, pcr: callV ? putV / callV : NaN, callV, putV, near, smile };
  }, [st.data]);
  const W = 420;
  const H = 160;
  const sm = r?.smile ?? [];
  const ivs = sm.map((x) => x.iv!);
  const X = (k: number) => sm.length ? ((k - sm[0]!.strike) / ((sm.at(-1)!.strike - sm[0]!.strike) || 1)) * W : 0;
  const Y = (v: number) => H - ((v - Math.min(...ivs)) / ((Math.max(...ivs) - Math.min(...ivs)) || 1)) * (H - 10) - 5;
  return (
    <>
      <DataStatus state={st} keyName="Alpaca" />
      {r && (
        <>
          <table className="grid-table">
            <thead><tr><th>Expiry</th><th className="num">Days</th><th className="num">ATM IV</th><th className="num">Expected move (1 sd)</th><th className="num">Range</th></tr></thead>
            <tbody>
              {r.term.slice(0, 10).map((t) => {
                const mv = expectedMove(r.spot, t.iv!, Math.max(1, t.days));
                return <tr key={t.expiry}><td>{t.expiry}</td><td className="num">{fmt(t.days, 0)}</td><td className="num">{fmtPct(t.iv! * 100, 1)}</td><td className="num accent">±{fmt(mv)} ({fmtPct((mv / r.spot) * 100, 1)})</td><td className="num muted">{fmt(r.spot - mv)} to {fmt(r.spot + mv)}</td></tr>;
              })}
            </tbody>
          </table>
          <p>Put/call volume ratio: <span className="accent">{fmt(r.pcr)}</span> ({fmtBig(r.putV)} puts vs {fmtBig(r.callV)} calls today). Above 1 = more put trading than calls.</p>
          {sm.length > 3 && (
            <>
              <h4 className="accent" style={{ fontSize: 12, margin: '6px 0 2px' }}>VOLATILITY SMILE, {r.near!.expiry} (out-of-the-money puts and calls)</h4>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560 }} role="img" aria-label="Implied volatility by strike">
                <line x1={X(r.spot)} x2={X(r.spot)} y1={0} y2={H} stroke="var(--hairline)" strokeDasharray="3 3" />
                <path d={sm.map((x, i) => `${i ? 'L' : 'M'}${X(x.strike).toFixed(1)},${Y(x.iv!).toFixed(1)}`).join('')} fill="none" stroke="var(--text)" strokeWidth={2} />
              </svg>
            </>
          )}
          <p className="muted">Max pain needs open interest, which the free feed does not include, so it is not shown (docs/OMITTED.md). IV rank needs an IV history; snapshots are not stored yet.</p>
        </>
      )}
    </>
  );
}

// ---------- UOA: unusual activity (delayed, volume-based) ----------
function Uoa() {
  const [input, setInput] = useState('SPY QQQ AAPL NVDA TSLA AMZN META MSFT AMD');
  const syms = useMemo(() => [...new Set(input.toUpperCase().split(/[\s,]+/).filter(Boolean))].slice(0, 12), [input]);
  const st = useData(`uoa:${syms.join(',')}`, async (): Promise<Fetched<(OptionRow & { und: string; premium: number; share: number })[]>> => {
    const res = await Promise.allSettled(syms.map((s) => chain(s, { maxPages: 6 })));
    const out: (OptionRow & { und: string; premium: number; share: number })[] = [];
    res.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const total = r.value.data.reduce((s, x) => s + x.volume, 0) || 1;
      for (const x of r.value.data) {
        const px = x.last ?? ((x.bid ?? 0) + (x.ask ?? 0)) / 2;
        out.push({ ...x, und: syms[i]!, premium: x.volume * px * 100, share: x.volume / total });
      }
    });
    return { data: out.filter((x) => x.volume >= 500 && x.share > 0.03).sort((a, b) => b.premium - a.premium).slice(0, 60), fetchedAt: Date.now(), fromCache: false };
  }, { source: 'Alpaca options', note: 'delayed', everyMs: 10 * 60_000 });
  return (
    <>
      <div className="toolbar"><input value={input} onChange={(e) => setInput(e.target.value)} style={{ flex: 1 }} aria-label="Underlyings" /></div>
      <p className="label-proxy">DELAYED, NOT REAL-TIME FLOW. Flags single contracts with heavy volume today (500+ contracts and over 3% of the underlying&apos;s option volume), ranked by premium traded. Open interest is not free, so volume vs open interest cannot be shown.</p>
      <DataStatus state={st} keyName="Alpaca" />
      <table className="grid-table">
        <thead><tr><th>Underlying</th><th>Contract</th><th className="num">Volume</th><th className="num">Share of und.</th><th className="num">Premium</th><th className="num">IV</th></tr></thead>
        <tbody>{(st.data ?? []).map((x) => <tr key={x.symbol}><td className="accent">{x.und}</td><td className={x.type === 'call' ? 'up' : 'down'}>{x.expiry} {fmt(x.strike)} {x.type.toUpperCase()}</td><td className="num">{fmtBig(x.volume)}</td><td className="num">{fmt(x.share * 100, 1)}%</td><td className="num">${fmtBig(x.premium)}</td><td className="num">{x.iv ? fmtPct(x.iv * 100, 1) : '-'}</td></tr>)}</tbody>
      </table>
    </>
  );
}

// ---------- VIXT ----------
function Vixt() {
  const vol = useData('vixt:fred', async (): Promise<Fetched<Record<string, { date: string; value: number }[]>>> => {
    const ids = ['VIXCLS', 'VXVCLS', 'VXNCLS', 'OVXCLS', 'GVZCLS'];
    const start = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);
    const res = await Promise.all(ids.map((id) => series(id, start)));
    return { data: Object.fromEntries(ids.map((id, i) => [id, res[i]!.data])), fetchedAt: res[0]!.fetchedAt, fromCache: false };
  }, { source: 'FRED (Cboe indices)', everyMs: 3600_000 });
  const spy = useChain('SPY');
  const term = useMemo(() => (spy.data ? atmTerm(spy.data.rows, spy.data.spot).slice(0, 12) : []), [spy.data]);
  const last = (id: string) => vol.data?.[id]?.at(-1);
  const vix = last('VIXCLS');
  const vix3 = last('VXVCLS');
  const ratio = vix && vix3 ? vix.value / vix3.value : null;
  const W = 420;
  const H = 150;
  const maxD = Math.max(...term.map((t) => t.days), 1);
  const ivs = term.map((t) => t.iv!);
  const X = (d: number) => (d / maxD) * W;
  const Y = (v: number) => H - ((v - Math.min(...ivs)) / ((Math.max(...ivs) - Math.min(...ivs)) || 1)) * (H - 10) - 5;
  return (
    <>
      <DataStatus state={vol} keyName="FRED" />
      <dl className="kv">
        <dt>VIX (30 day)</dt><dd>{fmt(vix?.value)} <span className="muted">{vix?.date}</span></dd>
        <dt>VIX3M (3 month)</dt><dd>{fmt(vix3?.value)}</dd>
        <dt>VIX / VIX3M</dt><dd className={ratio != null && ratio > 1 ? 'down' : 'up'}>{fmt(ratio, 3)} {ratio == null ? '' : ratio > 1 ? '(backwardation: near-term fear)' : '(contango: normal)'}</dd>
        <dt>Nasdaq-100 VIX</dt><dd>{fmt(last('VXNCLS')?.value)}</dd>
        <dt>Oil VIX / Gold VIX</dt><dd>{fmt(last('OVXCLS')?.value)} / {fmt(last('GVZCLS')?.value)}</dd>
      </dl>
      {term.length > 2 && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '6px 0 2px' }}>SPY AT-THE-MONEY IMPLIED VOL BY EXPIRY</h4>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560 }} role="img" aria-label="SPY implied volatility term structure">
            <path d={term.map((t, i) => `${i ? 'L' : 'M'}${X(t.days).toFixed(1)},${Y(t.iv!).toFixed(1)}`).join('')} fill="none" stroke="var(--text)" strokeWidth={2} />
            {term.map((t) => <circle key={t.expiry} cx={X(t.days)} cy={Y(t.iv!)} r={3} fill="var(--text)"><title>{`${t.expiry}: ${(t.iv! * 100).toFixed(1)}%`}</title></circle>)}
          </svg>
        </>
      )}
      <p className="muted">VIX futures curves are not free; this uses the Cboe indices on FRED plus SPY option IVs from Alpaca&apos;s indicative feed.</p>
    </>
  );
}

// ---------- OSA: calculator, payoff builder, SABR ----------
function Osa() {
  const [tab, setTab] = useState<'calc' | 'payoff' | 'sabr'>('calc');
  const [S, setS] = useState(100);
  const [K, setK] = useState(105);
  const [days, setDays] = useState(30);
  const [vol, setVol] = useState(25);
  const [r, setR] = useState(4);
  const [mkt, setMkt] = useState(0);
  const [legs, setLegs] = useState<Leg[]>([{ type: 'call', strike: 100, qty: 1, premium: 4 }, { type: 'call', strike: 110, qty: -1, premium: 1.5 }]);
  const [sab, setSab] = useState({ F: 0.04, T: 1, alpha: 0.03, beta: 0.5, rho: -0.3, nu: 0.4 });
  const T = days / 365;
  const c = bs({ S, K, T, r: r / 100, sigma: vol / 100, type: 'call' });
  const p = bs({ S, K, T, r: r / 100, sigma: vol / 100, type: 'put' });
  const iv = mkt > 0 ? impliedVol(mkt, { S, K, T, r: r / 100, type: 'call' }) : NaN;
  const num = (v: number, set: (n: number) => void, label: string, step = 1) => <label className="toggle">{label}<input type="number" value={v} step={step} onChange={(e) => set(Number(e.target.value))} style={{ width: 80 }} /></label>;
  const lo = Math.min(...legs.map((l) => l.strike)) * 0.7;
  const hi = Math.max(...legs.map((l) => l.strike)) * 1.3;
  const pts = Array.from({ length: 101 }, (_, i) => lo + ((hi - lo) * i) / 100);
  const pv = pts.map((x) => payoff(legs, x) * 100);
  const W = 420;
  const H = 180;
  const mn = Math.min(...pv, 0);
  const mx = Math.max(...pv, 0);
  const Y = (v: number) => H - ((v - mn) / (mx - mn || 1)) * (H - 10) - 5;
  const be = breakevens(legs, lo, hi);
  const sabrStrikes = Array.from({ length: 13 }, (_, i) => sab.F * (0.5 + i / 12));
  return (
    <>
      <div className="toolbar">{(['calc', 'payoff', 'sabr'] as const).map((t) => <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>{t === 'calc' ? 'GREEKS' : t === 'payoff' ? 'PAYOFF BUILDER' : 'SABR'}</button>)}</div>
      {tab === 'calc' && (
        <>
          <div className="toolbar">{num(S, setS, 'Spot', 0.5)}{num(K, setK, 'Strike', 0.5)}{num(days, setDays, 'Days', 1)}{num(vol, setVol, 'Vol %', 0.5)}{num(r, setR, 'Rate %', 0.25)}</div>
          <table className="grid-table">
            <thead><tr><th /><th className="num">Price</th><th className="num">Delta</th><th className="num">Gamma</th><th className="num">Vega</th><th className="num">Theta/day</th><th className="num">Rho</th></tr></thead>
            <tbody>
              {[['Call', c], ['Put', p]].map(([n, g]) => { const o = g as typeof c; return <tr key={n as string}><td className="accent">{n as string}</td><td className="num">{fmt(o.price, 3)}</td><td className="num">{fmt(o.delta, 3)}</td><td className="num">{fmt(o.gamma, 4)}</td><td className="num">{fmt(o.vega, 3)}</td><td className="num">{fmt(o.theta, 3)}</td><td className="num">{fmt(o.rho, 3)}</td></tr>; })}
            </tbody>
          </table>
          <div className="toolbar">{num(mkt, setMkt, 'Market call price → implied vol', 0.05)}<span className="accent">{Number.isFinite(iv) ? fmtPct(iv * 100, 2) : '-'}</span></div>
        </>
      )}
      {tab === 'payoff' && (
        <>
          <table className="grid-table">
            <thead><tr><th>Type</th><th>Strike</th><th>Qty (+long, -short)</th><th>Premium</th><th /></tr></thead>
            <tbody>
              {legs.map((l, i) => (
                <tr key={i}>
                  <td><select value={l.type} onChange={(e) => setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, type: e.target.value as Leg['type'] } : x)))}><option value="call">Call</option><option value="put">Put</option><option value="stock">Stock (strike = cost)</option></select></td>
                  {(['strike', 'qty', 'premium'] as const).map((k) => <td key={k}><input type="number" value={l[k]} step={k === 'qty' ? 1 : 0.5} onChange={(e) => setLegs((ls) => ls.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))} style={{ width: 80 }} /></td>)}
                  <td><button className="link-btn down" onClick={() => setLegs((ls) => ls.filter((_, j) => j !== i))}>×</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="toolbar">
            <button onClick={() => setLegs((ls) => [...ls, { type: 'put', strike: 95, qty: 1, premium: 2 }])}>+ LEG</button>
            <button onClick={() => setLegs([{ type: 'stock', strike: 100, qty: 1, premium: 0 }, { type: 'call', strike: 110, qty: -1, premium: 2 }])}>COVERED CALL</button>
            <button onClick={() => setLegs([{ type: 'call', strike: 100, qty: 1, premium: 4 }, { type: 'call', strike: 110, qty: -1, premium: 1.5 }])}>BULL CALL SPREAD</button>
            <button onClick={() => setLegs([{ type: 'put', strike: 90, qty: 1, premium: 1 }, { type: 'put', strike: 95, qty: -1, premium: 2.2 }, { type: 'call', strike: 105, qty: -1, premium: 2.1 }, { type: 'call', strike: 110, qty: 1, premium: 0.9 }])}>IRON CONDOR</button>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 560 }} role="img" aria-label="Payoff at expiry">
            <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--hairline)" />
            <path d={pv.map((v, i) => `${i ? 'L' : 'M'}${((i / 100) * W).toFixed(1)},${Y(v).toFixed(1)}`).join('')} fill="none" stroke="var(--text)" strokeWidth={2} />
          </svg>
          <p>Max profit ${fmt(Math.max(...pv))} · Max loss ${fmt(Math.min(...pv))} (per contract, within the chart range) · Breakeven {be.length ? be.join(', ') : '-'}</p>
        </>
      )}
      {tab === 'sabr' && (
        <>
          <p className="label-proxy">A MODEL WITH YOUR PARAMETERS. No real swaption or rates-volatility data is used (not free).</p>
          <div className="toolbar">
            {(Object.keys(sab) as (keyof typeof sab)[]).map((k) => <label key={k} className="toggle">{k}<input type="number" value={sab[k]} step={0.01} onChange={(e) => setSab((s) => ({ ...s, [k]: Number(e.target.value) }))} style={{ width: 70 }} /></label>)}
          </div>
          <table className="grid-table">
            <thead><tr><th>Strike</th>{sabrStrikes.map((k) => <th key={k} className="num">{fmtPct(k * 100, 2)}</th>)}</tr></thead>
            <tbody><tr><td>Implied vol</td>{sabrStrikes.map((k) => <td key={k} className="num">{fmtPct(sabrVol(sab.F, k, sab.T, sab.alpha, sab.beta, sab.rho, sab.nu) * 100, 1)}</td>)}</tr></tbody>
          </table>
          <p className="muted">F = forward rate, alpha = vol level, beta = backbone (0 normal, 1 lognormal), rho = skew, nu = vol of vol (smile curvature). Hagan et al. (2002) approximation.</p>
        </>
      )}
      <div className="disclaimer">Black-Scholes assumes constant volatility and European exercise; US equity options are American, so early exercise is ignored. {NOTE}</div>
    </>
  );
}

export default function OptionsPanels({ code, security, run }: PanelProps) {
  const sym = (security ?? 'SPY').toUpperCase();
  return (
    <div>
      {code === 'OMON' && <Omon sym={sym} run={run} />}
      {code === 'OEXP' && <Oexp sym={sym} />}
      {code === 'UOA' && <Uoa />}
      {code === 'VIXT' && <Vixt />}
      {(code === 'OSA' || code === 'SABR') && <Osa />}
      {code !== 'OSA' && code !== 'SABR' && <div className="disclaimer">{NOTE}</div>}
    </div>
  );
}
