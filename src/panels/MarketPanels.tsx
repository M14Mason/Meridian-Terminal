// RVOL relative volume and BRDH market breadth, from daily snapshots of every US stock.
import { useMemo, useSyncExternalStore } from 'react';
import { breadth, rvol } from '../../shared/breadth';
import { Lines } from '../charts/Lines';
import { eodHistory, eodProgress, onEodProgress } from '../data/adapters/eod';
import { tickers } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { dir, downloadCsv, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

function Progress() {
  const p = useSyncExternalStore(onEodProgress, eodProgress);
  if (!p.want || p.done >= p.want) return null;
  return <p className="muted">Loading daily snapshots: {p.done} of {p.want} trading days (free tier allows 5 a minute; cached after the first load).</p>;
}

const load = async (n: number) => {
  const [days, list] = await Promise.all([eodHistory(n), tickers()]);
  const universe = new Set(list.filter((t) => /^(NYSE|Nasdaq)$/.test(t.exchange)).map((t) => t.ticker));
  return { data: { days, universe }, fetchedAt: Date.now(), fromCache: false };
};

function Rvol({ run }: { run: PanelProps['run'] }) {
  const st = useData('eod:21', () => load(21), { source: 'Massive grouped daily (end of day)', everyMs: 6 * 3600_000 });
  const rows = useMemo(() => (st.data ? rvol(st.data.days).filter((r) => st.data!.universe.has(r.ticker)).slice(0, 100) : []), [st.data]);
  const last = st.data?.days.at(-1)?.date;
  return (
    <>
      <div className="toolbar"><span className="muted">Session {last ?? '-'} volume vs prior 20-day average. Price over $2, average volume over 100k.</span><button disabled={!rows.length} onClick={() => downloadCsv('rvol.csv', [['ticker', 'price', 'chg', 'volume', 'avg', 'rvol'], ...rows.map((r) => [r.ticker, r.price, r.chg, r.vol, r.avg, r.rvol])])}>CSV</button></div>
      <Progress />
      <DataStatus state={st} keyName="Massive" />
      <table className="grid-table">
        <thead><tr><th>Ticker</th><th className="num">Price</th><th className="num">Chg</th><th className="num">Volume</th><th className="num">20d avg</th><th className="num">RVOL</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.ticker} className="clickable" onClick={() => run(`${r.ticker} GP`)}><td className="accent">{r.ticker}</td><td className="num">{fmt(r.price)}</td><td className={`num ${dir(r.chg)}`}>{fmtPct(r.chg * 100)}</td><td className="num">{fmtBig(r.vol)}</td><td className="num">{fmtBig(r.avg)}</td><td className="num">{fmt(r.rvol, 1)}x</td></tr>)}</tbody>
      </table>
      <div className="disclaimer">End-of-day data (previous session), not intraday. High relative volume flags news, earnings or unusual interest; it says nothing about direction.</div>
    </>
  );
}

function Brdh() {
  const st = useData('eod:60', () => load(60), { source: 'Massive grouped daily (end of day)', everyMs: 6 * 3600_000 });
  const b = useMemo(() => (st.data ? breadth(st.data.days, st.data.universe) : []), [st.data]);
  const t = (d: string) => Date.parse(d);
  const charts = useMemo(() => ({
    ad: [{ name: 'A/D line', rows: b.map((x) => ({ t: t(x.date), v: x.adLine })) }],
    mc: [{ name: 'McClellan', rows: b.filter((x) => x.mcclellan != null).map((x) => ({ t: t(x.date), v: x.mcclellan! })) }],
    pct: [
      { name: '% above 20d', rows: b.filter((x) => x.above20 != null).map((x) => ({ t: t(x.date), v: x.above20! * 100 })) },
      { name: '% above 50d', rows: b.filter((x) => x.above50 != null).map((x) => ({ t: t(x.date), v: x.above50! * 100 })) },
    ],
  }), [b]);
  const last = b.at(-1);
  return (
    <>
      <Progress />
      <DataStatus state={st} keyName="Massive" />
      {last && (
        <table className="grid-table">
          <tbody>
            <tr><td>Session</td><td className="num">{last.date}</td><td>Advancers / decliners</td><td className="num"><span className="up">{last.adv}</span> / <span className="down">{last.dec}</span></td></tr>
            <tr><td>McClellan oscillator</td><td className={`num ${dir(last.mcclellan)}`}>{fmt(last.mcclellan, 0)}</td><td>20-day highs / lows</td><td className="num"><span className="up">{last.newHigh ?? '-'}</span> / <span className="down">{last.newLow ?? '-'}</span></td></tr>
            <tr><td>% above 20-day avg</td><td className="num">{last.above20 == null ? '-' : fmt(last.above20 * 100, 1)}</td><td>% above 50-day avg</td><td className="num">{last.above50 == null ? 'needs 50 days' : fmt(last.above50 * 100, 1)}</td></tr>
          </tbody>
        </table>
      )}
      <h4 className="accent" style={{ fontSize: 12, margin: '6px 0 2px' }}>ADVANCE / DECLINE LINE</h4>
      <Lines series={charts.ad} height={160} />
      <h4 className="accent" style={{ fontSize: 12, margin: '6px 0 2px' }}>MCCLELLAN OSCILLATOR</h4>
      <Lines series={charts.mc} height={140} />
      <h4 className="accent" style={{ fontSize: 12, margin: '6px 0 2px' }}>PERCENT OF STOCKS ABOVE MOVING AVERAGE</h4>
      <Lines series={charts.pct} height={160} />
      <div className="disclaimer">NYSE and Nasdaq listings from the SEC ticker list (includes some ETFs and preferreds; not identical to the official exchange breadth). McClellan uses net advances with 19 and 39 day averages and needs about 40 sessions to warm up. Highs and lows are 20-session, not 52-week, because history is limited to what the free tier can load.</div>
    </>
  );
}

export default function MarketPanels({ code, run }: PanelProps) {
  return <div>{code === 'RVOL' ? <Rvol run={run} /> : <Brdh />}</div>;
}
