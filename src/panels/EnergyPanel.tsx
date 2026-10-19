// INV, NGS and GRID: EIA energy panels (catalog 77, 78, 80; idea 8 natural gas link).
import { useMemo } from 'react';
import { Lines } from '../charts/Lines';
import { bySeries, eia, type EiaRow } from '../data/adapters/eia';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, dateTimeLocal, tzLabel } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const yearsAgo = (y: number) => new Date(Date.now() - y * 365.25 * 86_400_000).toISOString().slice(0, 10);

/** Same-week average, minimum and maximum over the previous five years. */
function fiveYear(rows: EiaRow[], period: string) {
  const d = new Date(period);
  const vals: number[] = [];
  for (let y = 1; y <= 5; y++) {
    const target = new Date(d);
    target.setUTCFullYear(d.getUTCFullYear() - y);
    const best = rows.reduce<EiaRow | null>((b, r) => (Math.abs(Date.parse(r.period) - +target) < (b ? Math.abs(Date.parse(b.period) - +target) : Infinity) ? r : b), null);
    if (best && Math.abs(Date.parse(best.period) - +target) < 8 * 86_400_000) vals.push(best.value);
  }
  if (!vals.length) return null;
  return { avg: vals.reduce((a, b) => a + b, 0) / vals.length, min: Math.min(...vals), max: Math.max(...vals) };
}


const PET = [['WCESTUS1', 'Crude (ex SPR)'], ['WGTSTUS1', 'Gasoline'], ['WDISTUS1', 'Distillate'], ['WCSSTUS1', 'Strategic reserve (SPR)']] as const;

function Inventories() {
  const state = useData('inv', () => eia('petroleum/stoc/wstk', { frequency: 'weekly', facets: { series: PET.map((p) => p[0]) }, start: yearsAgo(6) }), { source: 'EIA weekly', everyMs: 3600_000 });
  const rows = useMemo(() => state.data ?? [], [state.data]);
  const chart = useMemo(() => PET.slice(0, 3).map(([id, name]) => ({ name, rows: bySeries(rows, id).filter((r) => r.period >= yearsAgo(2)).map((r) => ({ t: Date.parse(r.period), v: r.value / 1000 })) })), [rows]);
  return (
    <>
      <DataStatus state={state} keyName="EIA" />
      <table className="grid-table">
        <thead><tr><th>Stocks (million barrels)</th><th className="num">Latest</th><th className="num">Week change</th><th className="num">vs 5y avg</th><th>Week of</th></tr></thead>
        <tbody>
          {PET.map(([id, name]) => {
            const s = bySeries(rows, id);
            const last = s.at(-1);
            const prev = s.at(-2);
            const fy = last ? fiveYear(s, last.period) : null;
            const wk = last && prev ? (last.value - prev.value) / 1000 : null;
            const vs = last && fy ? (last.value / fy.avg - 1) * 100 : null;
            return (
              <tr key={id}>
                <td>{name}</td>
                <td className="num">{last ? fmt(last.value / 1000, 1) : '-'}</td>
                <td className={`num ${dir(wk)}`}>{wk != null ? `${wk > 0 ? '+' : ''}${fmt(wk, 1)}` : '-'}</td>
                <td className={`num ${dir(vs)}`}>{vs != null ? `${vs > 0 ? '+' : ''}${fmt(vs, 1)}%` : '-'}</td>
                <td className="muted">{last?.period ?? '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <Lines series={chart} />
      <div className="disclaimer">Source: EIA Weekly Petroleum Status Report (Wednesdays 10:30 New York). A draw (negative change) usually means tighter supply.</div>
    </>
  );
}

function GasStorage() {
  const stor = useData('ngs', () => eia('natural-gas/stor/wkly', { frequency: 'weekly', facets: { series: ['NW2_EPG0_SWO_R48_BCF'] }, start: yearsAgo(6) }), { source: 'EIA weekly', everyMs: 3600_000 });
  const hh = useData('ngs:hh', () => eia('natural-gas/pri/fut', { frequency: 'daily', facets: { series: ['RNGWHHD'] }, start: yearsAgo(1) }), { everyMs: 3600_000 });
  const s = useMemo(() => (stor.data ?? []).slice().sort((a, b) => a.period.localeCompare(b.period)), [stor.data]);
  const last = s.at(-1);
  const prev = s.at(-2);
  const fy = last ? fiveYear(s, last.period) : null;
  const price = (hh.data ?? [])[0];
  const chart = useMemo(() => {
    const cur = s.filter((r) => r.period >= yearsAgo(1));
    return [
      { name: 'Storage', rows: cur.map((r) => ({ t: Date.parse(r.period), v: r.value })) },
      { name: '5y avg', rows: cur.map((r) => ({ t: Date.parse(r.period), v: fiveYear(s, r.period)?.avg ?? NaN })) },
      { name: '5y min', rows: cur.map((r) => ({ t: Date.parse(r.period), v: fiveYear(s, r.period)?.min ?? NaN })) },
      { name: '5y max', rows: cur.map((r) => ({ t: Date.parse(r.period), v: fiveYear(s, r.period)?.max ?? NaN })) },
    ];
  }, [s]);
  const vs = last && fy ? last.value - fy.avg : null;
  return (
    <>
      <DataStatus state={stor} keyName="EIA" />
      {last && (
        <dl className="kv">
          <dt>Working gas, Lower 48</dt><dd>{fmtBig(last.value)} Bcf (week of {last.period})</dd>
          <dt>Weekly change</dt><dd className={dir(prev ? last.value - prev.value : null)}>{prev ? `${last.value - prev.value > 0 ? '+' : ''}${fmt(last.value - prev.value, 0)} Bcf` : '-'}</dd>
          <dt>vs 5-year average</dt><dd className={dir(vs)}>{vs != null ? `${vs > 0 ? '+' : ''}${fmt(vs, 0)} Bcf (${fmt(((last.value / fy!.avg) - 1) * 100, 1)}%)` : '-'}</dd>
          <dt>5-year range this week</dt><dd>{fy ? `${fmt(fy.min, 0)} to ${fmt(fy.max, 0)} Bcf` : '-'}</dd>
          <dt>Henry Hub spot</dt><dd>{price ? `$${fmt(price.value)} per MMBtu (${price.period})` : '-'}</dd>
        </dl>
      )}
      <Lines series={chart} />
      <div className="disclaimer">Source: EIA Weekly Natural Gas Storage Report (Thursdays 10:30 New York) and EIA spot prices. Weather drives demand: a colder or hotter than normal week usually means a bigger withdrawal or smaller injection. NOAA degree-day overlay is planned.</div>
    </>
  );
}

const FUEL: Record<string, string> = { COL: 'Coal', NG: 'Natural gas', NUC: 'Nuclear', SUN: 'Solar', WND: 'Wind', WAT: 'Hydro', OIL: 'Oil', OTH: 'Other' };

function Grid() {
  const since = () => new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 13);
  const demand = useData('grid:d', () => eia('electricity/rto/region-data', { frequency: 'hourly', facets: { respondent: ['US48'], type: ['D'] }, start: since(), length: 400 }), { source: 'EIA hourly', everyMs: 30 * 60_000 });
  const mix = useData('grid:m', () => eia('electricity/rto/fuel-type-data', { frequency: 'hourly', facets: { respondent: ['US48'] }, start: since(), length: 2000 }), { everyMs: 30 * 60_000 });
  const latestHour = (mix.data ?? [])[0]?.period;
  const shares = useMemo(() => {
    const rows = (mix.data ?? []).filter((r) => r.period === latestHour);
    const total = rows.reduce((s, r) => s + Math.max(0, r.value), 0) || 1;
    return rows.map((r) => ({ f: FUEL[r.fueltype ?? ''] ?? r.fueltype ?? '?', share: Math.max(0, r.value) / total, mw: r.value })).sort((a, b) => b.share - a.share);
  }, [mix.data, latestHour]);
  const chart = useMemo(() => [{ name: 'US48 demand (GW)', rows: (demand.data ?? []).slice().reverse().map((r) => ({ t: Date.parse(`${r.period}:00Z`), v: r.value / 1000 })) }], [demand.data]);
  return (
    <>
      <DataStatus state={demand} keyName="EIA" />
      <Lines series={chart} height={200} />
      {latestHour && (
        <table className="grid-table">
          <thead><tr><th>Generation mix, hour of {dateTimeLocal(Date.parse(`${latestHour}:00Z`))} {tzLabel()}</th><th className="num">Share</th><th className="num">GW</th></tr></thead>
          <tbody>{shares.map((s) => <tr key={s.f}><td>{s.f}</td><td className="num">{fmt(s.share * 100, 1)}%</td><td className="num">{fmt(s.mw / 1000, 1)}</td></tr>)}</tbody>
        </table>
      )}
      <div className="disclaimer">Source: EIA Hourly Electric Grid Monitor (Lower 48). Recent hours are preliminary and revised. Wholesale prices are set by regional markets and are not in this free feed.</div>
    </>
  );
}

export default function EnergyPanel({ code }: PanelProps) {
  if (code === 'NGS') return <GasStorage />;
  if (code === 'GRID') return <Grid />;
  return <Inventories />;
}
