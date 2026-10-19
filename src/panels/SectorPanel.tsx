import { useMemo } from 'react';
import { heatColor } from '../../shared/heat';
import { ALPACA_NOTE, multiBars, quotes, startFor } from '../data/adapters/alpaca';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import type { Bar, Quote } from '../../shared/market';

// SECT: US sector performance using Select Sector SPDR ETFs as labeled proxies.
const SECTORS: [string, string][] = [
  ['XLK', 'Technology'], ['XLC', 'Communication'], ['XLY', 'Consumer discretionary'], ['XLP', 'Consumer staples'], ['XLE', 'Energy'], ['XLF', 'Financials'],
  ['XLV', 'Health care'], ['XLI', 'Industrials'], ['XLB', 'Materials'], ['XLRE', 'Real estate'], ['XLU', 'Utilities'], ['SPY', 'Broad market (SPY)'],
];
const PERIODS: [string, number][] = [['1W', 5], ['1M', 21], ['3M', 63], ['6M', 126], ['1Y', 252]];

export default function SectorPanel({ run }: PanelProps) {
  const syms = SECTORS.map((s) => s[0]);
  const state = useData('sect', async (): Promise<Fetched<{ bars: Record<string, Bar[]>; q: Record<string, Quote> }>> => {
    const [b, q] = await Promise.all([multiBars(syms, '1Day', startFor(400)), quotes(syms)]);
    return { data: { bars: b.data, q: q.data }, fetchedAt: q.fetchedAt, fromCache: false };
  }, { source: 'Alpaca', note: `ETF proxies, ${ALPACA_NOTE}`, everyMs: 60_000 });
  const table = useMemo(() => {
    if (!state.data) return null;
    return SECTORS.map(([s, name]) => {
      const b = state.data!.bars[s] ?? [];
      const last = state.data!.q[s]?.price ?? b.at(-1)?.c;
      const ytdBase = b.filter((x) => new Date(x.t).getUTCFullYear() < new Date().getUTCFullYear()).at(-1)?.c;
      return {
        s,
        name,
        d1: state.data!.q[s]?.changePct ?? null,
        periods: PERIODS.map(([, n]) => (b.length > n && last ? (last / b[b.length - 1 - n]!.c - 1) * 100 : null)),
        ytd: ytdBase && last ? (last / ytdBase - 1) * 100 : null,
      };
    });
  }, [state.data]);
  const cell = (v: number | null, scale: number, key?: number) => (
    <td key={key} className="cell" style={{ background: heatColor(v == null ? NaN : Math.max(-1, Math.min(1, v / scale))) }}>{fmtPct(v, 1)}</td>
  );
  return (
    <div>
      <p className="label-proxy">ETF PROXIES: Select Sector SPDR funds. Fund prices, not official sector indices.</p>
      <DataStatus state={state} keyName="Alpaca" />
      {table && (
        <table className="grid-table heat">
          <thead><tr><th>Sector</th><th className="num">1D</th>{PERIODS.map(([p]) => <th key={p} className="num">{p}</th>)}<th className="num">YTD</th></tr></thead>
          <tbody>
            {table.map((r) => (
              <tr key={r.s} className="clickable" onClick={() => run(`${r.s} GP`)}>
                <td><span className="accent">{r.s}</span> {r.name}</td>
                {cell(r.d1, 2)}
                {r.periods.map((v, i) => cell(v, [3, 6, 10, 15, 25][i]!, i))}
                {cell(r.ytd, 25)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="disclaimer">Color saturates at a period-specific move (2% for 1D up to 25% for 1Y). Dividend-adjusted closes.</div>
    </div>
  );
}
