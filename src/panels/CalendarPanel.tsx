import { useMemo } from 'react';
import { earningsCalendar, ipoCalendar } from '../data/adapters/finnhub';
import { releaseCalendar } from '../data/adapters/fred';
import { tickerDividends, upcomingDividends } from '../data/adapters/massive';
import { useData } from '../data/useData';
import { fmt, fmtBig } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// ECO, ERN, BDVD, IPO calendars.

// Releases that move markets. Matched against FRED release names.
const KEY_RELEASES: [RegExp, string][] = [
  [/^Employment Situation/, 'Jobs report'],
  [/^Consumer Price Index/, 'CPI'],
  [/^Producer Price Index/, 'PPI'],
  [/^Gross Domestic Product/, 'GDP'],
  [/^Personal Income and Outlays/, 'PCE inflation'],
  [/Advance Monthly Sales for Retail|^Retail Sales/, 'Retail sales'],
  [/^FOMC/, 'Fed decision'],
  [/^Job Openings and Labor Turnover/, 'JOLTS'],
  [/^Industrial Production/, 'Industrial production'],
  [/^New Residential Construction/, 'Housing starts'],
  [/^Unemployment Insurance Weekly Claims/, 'Jobless claims'],
  [/^Surveys of Consumers/, 'Consumer sentiment'],
  [/^ADP National Employment/, 'ADP jobs'],
];

function Eco() {
  const state = useData('eco', () => releaseCalendar(21), { source: 'FRED', everyMs: 3600_000 });
  const rows = useMemo(
    () =>
      (state.data ?? [])
        .map((r) => ({ ...r, key: KEY_RELEASES.find(([re]) => re.test(r.release_name))?.[1] }))
        .filter((r) => r.key),
    [state.data],
  );
  return (
    <>
      <DataStatus state={state} keyName="FRED" empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Date</th><th>Release</th><th>Source name</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.release_id}-${r.date}`}><td>{r.date}</td><td className="accent">{r.key}</td><td className="muted">{r.release_name}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer">Release dates from FRED (St. Louis Fed); FOMC dates from the Fed&apos;s own calendar. Times are not included unless shown; most US releases are 8:30 AM New York time (5:30 AM Pacific). Consensus forecasts are not free; nowcast comparisons arrive with the macro panels (M5).</div>
    </>
  );
}

function Earnings({ run }: { run: PanelProps['run'] }) {
  const state = useData('ern', () => earningsCalendar(14), { source: 'Finnhub', everyMs: 3600_000 });
  const rows = (state.data?.earningsCalendar ?? []).filter((r) => r.symbol && !r.symbol.includes('.')).sort((a, b) => a.date.localeCompare(b.date) || (b.revenueEstimate ?? 0) - (a.revenueEstimate ?? 0));
  return (
    <>
      <DataStatus state={state} keyName="Finnhub" empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Date</th><th>Time</th><th>Ticker</th><th className="num">EPS est</th><th className="num">EPS act</th><th className="num">Rev est</th></tr></thead>
        <tbody>
          {rows.slice(0, 400).map((r) => (
            <tr key={`${r.symbol}-${r.date}`}>
              <td>{r.date}</td>
              <td className="muted">{r.hour === 'bmo' ? 'Before open' : r.hour === 'amc' ? 'After close' : '-'}</td>
              <td><button className="link-btn" onClick={() => run(`${r.symbol} DES`)}>{r.symbol}</button></td>
              <td className="num">{fmt(r.epsEstimate)}</td>
              <td className="num">{fmt(r.epsActual)}</td>
              <td className="num">{fmtBig(r.revenueEstimate)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Dividends({ security, run }: { security?: string; run: PanelProps['run'] }) {
  const state = useData(`bdvd:${security ?? 'all'}`, () => (security ? tickerDividends(security) : upcomingDividends()), { source: 'Massive', everyMs: 6 * 3600_000 });
  const rows = state.data ?? [];
  return (
    <>
      <DataStatus state={state} keyName="Massive" empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Ticker</th><th>Ex-date</th><th>Pay date</th><th className="num">Amount</th><th className="num">Per year</th></tr></thead>
        <tbody>
          {rows.slice(0, 500).map((d, i) => (
            <tr key={`${d.ticker}-${d.ex_dividend_date}-${i}`}>
              <td><button className="link-btn" onClick={() => run(`${d.ticker} DES`)}>{d.ticker}</button></td>
              <td>{d.ex_dividend_date}</td>
              <td className="muted">{d.pay_date}</td>
              <td className="num">{fmt(d.cash_amount, 4)}</td>
              <td className="num muted">{d.frequency || '-'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Ipos() {
  const state = useData('ipo', () => ipoCalendar(30), { source: 'Finnhub', everyMs: 3600_000 });
  const rows = (state.data?.ipoCalendar ?? []).sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <DataStatus state={state} keyName="Finnhub" empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Date</th><th>Ticker</th><th>Name</th><th>Exchange</th><th>Price</th><th className="num">Value</th><th>Status</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.symbol}-${r.date}-${r.name}`}>
              <td>{r.date}</td><td className="accent">{r.symbol || '-'}</td><td>{r.name}</td><td className="muted">{r.exchange}</td>
              <td>{r.price ?? '-'}</td><td className="num">{fmtBig(r.totalSharesValue)}</td><td className="muted">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

export default function CalendarPanel({ code, security, run }: PanelProps) {
  if (code === 'ECO') return <Eco />;
  if (code === 'ERN') return <Earnings run={run} />;
  if (code === 'BDVD') return <Dividends security={security} run={run} />;
  return <Ipos />;
}
