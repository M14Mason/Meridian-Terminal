// CMP: Claude Model Portfolio (docs/ADDITIONS.md). Hypothetical, paper only, no orders. Claude picks from a
// code-computed candidate table; every rebalance shows its cost first and is logged with reasoning and prompt version.
import { useMemo, useState } from 'react';
import { AI_LABEL, estimateUsd } from '../../shared/ai';
import { chainWeighted, type WPeriod } from '../../shared/model';
import { Lines } from '../charts/Lines';
import { AiMeta } from '../ai/AiBlock';
import { askAi, table, type AiReply } from '../ai/client';
import { multiBars, quotes, startFor } from '../data/adapters/alpaca';
import { latest } from '../data/adapters/fred';
import { screenerUniverse } from '../data/adapters/universe';
import { useData } from '../data/useData';
import { dir, fmt, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

interface Pos { t: string; w: number; thesis: string }
interface CmpOut { positions: Pos[]; notes: string }
interface Rebalance extends WPeriod { notes: string; theses: Record<string, string>; model: string; version: string; usd: number; input: string }

const BENCH = { SPY: { SPY: 1 }, '60/40 (SPY/AGG)': { SPY: 0.6, AGG: 0.4 } };
const N = 120;

export default function CmpPanel({ run }: PanelProps) {
  const uni = useData('eqs:universe', screenerUniverse, { source: 'SEC XBRL frames, Massive EOD', everyMs: 6 * 3600_000 });
  const recs = useCollection<Rebalance>('strategies').filter((r) => r.id.startsWith('cmp:'));
  const periods = useMemo(() => recs.map((r) => r.value).sort((a, b) => a.month.localeCompare(b.month)), [recs]);
  const open = periods.at(-1);
  const syms = useMemo(() => (open ? [...open.holdings.map((h) => h.t), 'SPY', 'AGG'] : []), [open]);
  const live = useData(syms.length ? `cmp:q:${syms.join(',')}` : null, () => quotes(syms), { source: 'Alpaca quotes', everyMs: 60_000 });
  const pts = useMemo(() => chainWeighted(periods, Object.fromEntries(Object.entries(live.data ?? {}).map(([k, v]) => [k, v.price])), BENCH), [periods, live.data]);
  const [state, setState] = useState<{ busy?: string; err?: string; reply?: AiReply<CmpOut> }>({});

  const buildInput = async () => {
    const rows = (uni.data?.rows ?? []).filter((r) => r.mcap != null && r.mcap >= 10_000e6 && r.price != null).sort((a, b) => b.mcap! - a.mcap!).slice(0, N);
    const tick = rows.map((r) => r.ticker);
    const [mb, ...fred] = await Promise.all([multiBars(tick, '1Day', startFor(200), true), ...['DGS10', 'DGS2', 'UNRATE', 'VIXCLS'].map((id) => latest(id).catch(() => null))]);
    const mom = (t: string, k: number) => { const b = mb.data[t] ?? []; return b.length > k ? (b.at(-1)!.c / b.at(-1 - k)!.c - 1) * 100 : null; };
    const vol = (t: string) => { const b = (mb.data[t] ?? []).slice(-61); if (b.length < 30) return null; const r = b.slice(1).map((x, i) => Math.log(x.c / b[i]!.c)); const m = r.reduce((a, c) => a + c, 0) / r.length; return Math.sqrt(r.reduce((a, c) => a + (c - m) ** 2, 0) / (r.length - 1)) * Math.sqrt(252) * 100; };
    const pct = (v: number | null) => (v == null ? null : +(v * 100).toFixed(1));
    const cand = rows.map((r) => ({ t: r.ticker, capB: +(r.mcap! / 1e9).toFixed(0), pe: r.pe == null ? null : +r.pe.toFixed(1), fcfY: pct(r.fcfYield), roe: pct(r.roe), revG: pct(r.revGrowth), de: r.de == null ? null : +r.de.toFixed(2), m6: mom(r.ticker, 126) == null ? null : +mom(r.ticker, 126)!.toFixed(1), m1: mom(r.ticker, 21) == null ? null : +mom(r.ticker, 21)!.toFixed(1), vol: vol(r.ticker) == null ? null : +vol(r.ticker)!.toFixed(0) }));
    const names = ['10y Treasury %', '2y Treasury %', 'Unemployment %', 'VIX'];
    return [
      `DATE: ${new Date().toISOString().slice(0, 10)}. Prices ${uni.data?.priceDate}; fundamentals fiscal ${uni.data?.year} (SEC XBRL).`,
      `MACRO REGIME (FRED): ${fred.map((f, i) => `${names[i]} ${f?.data?.value ?? 'n/a'}`).join('; ')}`,
      open ? `CURRENT HOLDINGS (weight %): ${open.holdings.map((h) => `${h.t} ${h.w}`).join(', ')}` : 'CURRENT HOLDINGS: none (first portfolio)',
      `CANDIDATES (${cand.length} largest US stocks; capB=$B market cap, fcfY/roe/revG in %, de=debt/equity, m6/m1=6 and 1 month return %, vol=annualized 60-day volatility %):\n${table(cand)}`,
    ].join('\n\n').slice(0, 13900);
  };

  const rebalance = async () => {
    setState({ busy: 'Building the candidate table...' });
    try {
      const input = await buildInput();
      const est = estimateUsd('cmp', input.length);
      if (!window.confirm(`Rebalance the Claude model portfolio?\n\nModel: Sonnet 5.5\nEstimated cost: about $${est.toFixed(3)} (input ${Math.round(input.length / 4).toLocaleString()} tokens + up to 5,000 output)\n\nHypothetical paper portfolio. No orders are placed.`)) { setState({}); return; }
      setState({ busy: 'Claude is picking positions (20 to 60 seconds)...' });
      const reply = await askAi<CmpOut>('cmp', input, true);
      const allowed = new Set([...input.matchAll(/^([A-Z][A-Z0-9.-]{0,9})\|/gm)].map((m) => m[1]!));
      const pos = reply.result.positions.filter((p) => allowed.has(p.t.toUpperCase())).map((p) => ({ ...p, t: p.t.toUpperCase() }));
      if (pos.length < 10) throw new Error(`Only ${pos.length} valid tickers in Claude's answer; nothing saved.`);
      const tot = pos.reduce((a, p) => a + p.w, 0);
      const q = await quotes([...pos.map((p) => p.t), 'SPY', 'AGG']);
      const month = new Date().toISOString().slice(0, 7);
      if (open) {
        const px = (t: string) => q.data[t]?.price;
        void sync.put('strategies', `cmp:${open.month}`, { ...open, exit: Object.fromEntries(open.holdings.map((h) => [h.t, px(h.t) ?? h.px])), benchExit: { SPY: px('SPY') ?? open.bench.SPY!, AGG: px('AGG') ?? open.bench.AGG! } });
      }
      const holdings = pos.filter((p) => q.data[p.t]?.price).map((p) => ({ t: p.t, w: +((p.w / tot) * 100).toFixed(2), px: q.data[p.t]!.price }));
      const rec: Rebalance = { month: open?.month === month ? `${month}b${Date.now() % 1000}` : month, date: new Date().toISOString().slice(0, 10), holdings, bench: { SPY: q.data.SPY?.price ?? 0, AGG: q.data.AGG?.price ?? 0 }, notes: reply.result.notes, theses: Object.fromEntries(pos.map((p) => [p.t, p.thesis])), model: reply.model, version: reply.version, usd: reply.usd, input: '' };
      await sync.put('strategies', `cmp:${rec.month}`, rec);
      setState({ reply });
    } catch (e) {
      setState({ err: e instanceof Error ? e.message : 'failed' });
    }
  };

  const last = pts.at(-1);
  const series = useMemo(() => {
    const nowAt = live.fetchedAt ?? 0;
    const t = (d: string) => (d === 'now' ? Math.max(nowAt, Date.parse(periods.at(-1)?.date ?? '1970-01-01') + 86_400_000) : Date.parse(d));
    return [{ name: 'CMP', rows: pts.map((p) => ({ t: t(p.date), v: p.model })) }, ...Object.keys(BENCH).map((k) => ({ name: k, rows: pts.map((p) => ({ t: t(p.date), v: p.bench[k]! })) }))];
  }, [pts, live.fetchedAt, periods]);
  const thisMonth = open?.month.slice(0, 7) === new Date().toISOString().slice(0, 7);
  return (
    <div>
      <p><span className="badge">HYPOTHETICAL</span> <strong>Hypothetical model portfolio. {AI_LABEL}</strong> Claude Sonnet picks 15 to 30 of the {N} largest US stocks from a table of code-computed numbers. No orders, not tailored to you.</p>
      <div className="toolbar">
        <button disabled={Boolean(state.busy) || !uni.data} onClick={() => void rebalance()}>{open ? (thisMonth ? 'REBALANCE AGAIN' : 'MONTHLY REBALANCE (due)') : 'START PORTFOLIO'}</button>
        <button onClick={() => run('MODEL')}>COMPARE WITH MODEL INDEX</button>
        {state.busy && <span className="muted">{state.busy}</span>}
      </div>
      <DataStatus state={uni} keyName="Massive" />
      {state.err && <p className="down">{state.err}</p>}
      {state.reply && <AiMeta reply={state.reply} />}
      {last && open && (
        <p>Since {periods[0]!.date}: CMP <strong className={dir(last.model - 100)}>{fmtPct(last.model - 100)}</strong> · {Object.keys(BENCH).map((k) => <span key={k}>{k} <span className={dir(last.bench[k]! - 100)}>{fmtPct(last.bench[k]! - 100)}</span> · </span>)}{periods.length} rebalance{periods.length === 1 ? '' : 's'}.</p>
      )}
      {pts.length > 2 && <Lines series={series} height={200} />}
      {open && (
        <>
          <p className="muted">Strategy note ({open.version}, {open.model}, cost ${open.usd.toFixed(3)}): {open.notes}</p>
          <table className="grid-table">
            <thead><tr><th>Ticker</th><th className="num">Weight</th><th className="num">Entry</th><th className="num">Now</th><th className="num">Return</th><th>Thesis</th></tr></thead>
            <tbody>{[...open.holdings].sort((a, b) => b.w - a.w).map((h) => { const now = live.data?.[h.t]?.price; const r = now ? (now / h.px - 1) * 100 : null; return <tr key={h.t}><td><button className="link-btn" onClick={() => run(`${h.t} DES`)}>{h.t}</button></td><td className="num">{fmt(h.w, 1)}%</td><td className="num">{fmt(h.px)}</td><td className="num">{fmt(now)}</td><td className={`num ${dir(r)}`}>{fmtPct(r)}</td><td style={{ whiteSpace: 'normal', maxWidth: 380 }} className="muted">{open.theses[h.t]}</td></tr>; })}</tbody>
          </table>
        </>
      )}
      {periods.length > 1 && (
        <details><summary className="accent">Rebalance history (strategy versions)</summary>
          <table className="grid-table"><tbody>{[...periods].reverse().map((p) => <tr key={p.month}><td>{p.date}</td><td>{p.holdings.length} positions</td><td className="muted">{(p as Rebalance).version}</td><td style={{ whiteSpace: 'normal' }}>{(p as Rebalance).notes}</td></tr>)}</tbody></table>
        </details>
      )}
      <div className="disclaimer">Paper tracking from the first rebalance; no backfilled history. Entry prices are IEX quotes at rebalance time; no costs, taxes or dividends. Small samples (a few months) say almost nothing about skill. Compare with the rules-only MODEL index and the SCOR scoreboard.</div>
    </div>
  );
}
