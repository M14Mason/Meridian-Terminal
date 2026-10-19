// HEAT: macro heatmaps with three scopes behind a toggle (section 13). Every cell shows its own
// data date and source; stale values are flagged, never presented as fresh (13.3).
import { lazy, Suspense, useMemo, useState } from 'react';
import { goodness, heatColor, percentile } from '../../shared/heat';
import type { Fetched } from '../data/client';
import { series, type Obs } from '../data/adapters/fred';
import { latest as wbLatest, type WbValue } from '../data/adapters/worldbank';
import { G7, G7_METRICS, GLOBAL_COUNTRIES, GLOBAL_METRICS, US_METRICS, type UsMetric } from '../data/macro';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const CountryMap = lazy(() => import('../three/CountryMap').then((m) => ({ default: m.CountryMap })));

type Scope = 'US' | 'G7' | 'GLOBAL';
const STALE_DAYS: Record<UsMetric['freq'], number> = { D: 7, W: 14, M: 75, Q: 160 };
const daysOld = (d: string) => (Date.now() - Date.parse(d)) / 86_400_000;
const yearsAgo = (y: number) => new Date(Date.now() - y * 365.25 * 86_400_000).toISOString().slice(0, 10);

async function allSettled<T>(jobs: (() => Promise<Fetched<T>>)[]): Promise<Fetched<(T | null)[]>> {
  const res = await Promise.allSettled(jobs.map((j) => j()));
  const ok = res.filter((r): r is PromiseFulfilledResult<Fetched<T>> => r.status === 'fulfilled');
  if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
  return { data: res.map((r) => (r.status === 'fulfilled' ? r.value.data : null)), fetchedAt: Math.min(...ok.map((r) => r.value.fetchedAt)), fromCache: false };
}

function Legend({ neutral }: { neutral?: boolean }) {
  return (
    <div className="legend">
      <span className="sw" style={{ background: heatColor(-1) }} /> bad vs history
      <span className="sw" style={{ background: heatColor(0) }} /> typical
      <span className="sw" style={{ background: heatColor(1) }} /> good
      {neutral && (
        <>
          <span className="sw" style={{ background: heatColor(-1, true) }} /> low
          <span className="sw" style={{ background: heatColor(1, true) }} /> high (no good or bad)
        </>
      )}
    </div>
  );
}

function UsScope({ run }: { run: PanelProps['run'] }) {
  const flat = US_METRICS.flatMap((g) => g.rows);
  const state = useData('heat:us', () => allSettled(flat.map((m) => () => series(m.id, yearsAgo(10), { units: m.units }))), { source: 'FRED', everyMs: 30 * 60_000 });
  const rows = useMemo(() => {
    const map = new Map<string, Obs[] | null>();
    flat.forEach((m, i) => map.set(m.id, state.data?.[i] ?? null));
    return map;
  }, [state.data, flat]);
  return (
    <>
      <DataStatus state={state} keyName="FRED" />
      <Legend neutral />
      {(() => {
        const now = rows.get('GDPNOW')?.at(-1);
        const gdp = rows.get('A191RL1Q225SBEA')?.at(-1);
        if (!now || !gdp) return null;
        const d = now.value - gdp.value;
        return (
          <p className="muted">
            Nowcast vs actual: GDPNow {fmt(now.value, 1)}% for the quarter starting {now.date} vs last GDP print {fmt(gdp.value, 1)}% ({gdp.date}).{' '}
            <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : ''}{fmt(d, 1)} pp</span>. Model estimate. Not financial advice.
          </p>
        );
      })()}
      <table className="grid-table heat">
        <thead>
          <tr><th>Metric</th><th className="num">Latest</th><th className="num">Prior</th><th className="num">1y ago</th><th className="num" title="Where the latest value sits in its own 10-year history">10y pctl</th><th>As of</th></tr>
        </thead>
        <tbody>
          {US_METRICS.map((g) => [
            <tr key={g.group} className="group"><td colSpan={6}>{g.group.toUpperCase()}</td></tr>,
            ...g.rows.map((m) => {
              const obs = rows.get(m.id);
              const last = obs?.at(-1);
              const prev = obs?.at(-2);
              const yearAgo = last ? [...(obs ?? [])].reverse().find((o) => daysOld(o.date) >= daysOld(last.date) + 360) : undefined;
              const p = last ? percentile(last.value, obs!.map((o) => o.value)) : NaN;
              const score = goodness(p, m.good);
              const stale = last ? daysOld(last.date) > STALE_DAYS[m.freq] : false;
              return (
                <tr key={m.id} className="clickable" onClick={() => run(`${m.id} SER`)} title={m.note ?? `FRED ${m.id}. Click for the chart.`}>
                  <td>{m.label}</td>
                  <td className={`cell ${last ? '' : 'na'}`} style={{ background: heatColor(score, m.good === 'neutral') }}>{last ? fmt(last.value, m.unit === 'k' || m.unit === '' ? 0 : 2) : 'n/a'}</td>
                  <td className="num">{prev ? fmt(prev.value, m.unit === 'k' || m.unit === '' ? 0 : 2) : '-'}</td>
                  <td className="num">{yearAgo ? fmt(yearAgo.value, m.unit === 'k' || m.unit === '' ? 0 : 2) : '-'}</td>
                  <td className="num">{Number.isFinite(p) ? `${Math.round(p * 100)}` : '-'}</td>
                  <td className={stale ? 'down' : 'muted'}>{last ? `${last.date}${stale ? ' STALE' : ''}` : '-'}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      <div className="disclaimer">
        Source: FRED (BEA, BLS, Fed, ICE BofA, Freddie Mac, UMich, Atlanta Fed GDPNow, S&amp;P CoreLogic Case-Shiller). Color = position in the series' own 10-year range, flipped where lower is better.
        GDPNow is a model nowcast, not an official number. Consensus forecasts are not free, so surprises are shown as nowcast vs latest actual: GDPNow minus last GDP print.
      </div>
    </>
  );
}

function G7Scope({ view }: { view: 'table' | 'flat' | 'globe' }) {
  const jobs = G7_METRICS.flatMap((m) => G7.map((c) => () => series(m.series(c.cc, c.policy), yearsAgo(2))));
  const state = useData('heat:g7', async () => {
    const [fred, gdp] = await Promise.all([allSettled(jobs), wbLatest('NY.GDP.MKTP.KD.ZG', G7.map((c) => c.iso3)).catch(() => null)]);
    return { ...fred, data: { fred: fred.data, gdp: gdp?.data ?? {} } };
  }, { source: 'FRED (OECD MEI), World Bank', everyMs: 60 * 60_000 });
  const [metric, setMetric] = useState(G7_METRICS[0]!.key);

  const cells = useMemo(() => {
    const out: Record<string, Record<string, Obs | null>> = {};
    G7_METRICS.forEach((m, mi) => {
      out[m.key] = {};
      G7.forEach((c, ci) => {
        out[m.key]![c.cc] = state.data?.fred[mi * G7.length + ci]?.at(-1) ?? null;
      });
    });
    return out;
  }, [state.data]);

  const scoreFor = (key: string, cc: string) => {
    const m = G7_METRICS.find((x) => x.key === key)!;
    const vals = G7.map((c) => cells[key]?.[c.cc]?.value).filter((v): v is number => v != null);
    const v = cells[key]?.[cc]?.value;
    return v == null ? NaN : goodness(percentile(v, vals), m.good);
  };
  const numToCc: Record<string, string> = { '840': 'US', '124': 'CA', '826': 'GB', '276': 'DE', '250': 'FR', '380': 'IT', '392': 'JP' };
  const sel = G7_METRICS.find((m) => m.key === metric)!;

  return (
    <>
      <DataStatus state={state} keyName="FRED" />
      {view === 'table' ? (
        <>
          <Legend neutral />
          <table className="grid-table heat">
            <thead><tr><th>Metric</th>{G7.map((c) => <th key={c.cc} className="num">{c.cc}</th>)}</tr></thead>
            <tbody>
              <tr>
                <td>GDP growth (annual)</td>
                {G7.map((c) => {
                  const v = state.data?.gdp[c.iso3];
                  const vals = Object.values(state.data?.gdp ?? {}).map((x) => x.value);
                  return <td key={c.cc} className="cell" title={v ? `World Bank, year ${v.year}` : 'no data'} style={{ background: heatColor(v ? goodness(percentile(v.value, vals), 'high') : NaN) }}>{v ? `${fmt(v.value, 1)} (${v.year.slice(2)})` : 'n/a'}</td>;
                })}
              </tr>
              {G7_METRICS.map((m) => (
                <tr key={m.key}>
                  <td>{m.label}</td>
                  {G7.map((c) => {
                    const o = cells[m.key]?.[c.cc];
                    const stale = o ? daysOld(o.date) > 120 : false;
                    return (
                      <td key={c.cc} className={`cell ${o ? '' : 'na'}`} title={o ? `${o.date}${stale ? ' (stale)' : ''}` : 'no data'} style={{ background: heatColor(scoreFor(m.key, c.cc), m.good === 'neutral') }}>
                        {o ? fmt(o.value, 2) : 'n/a'}
                        {stale ? '*' : ''}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="disclaimer">Color = rank across the seven countries. Hover a cell for its date; * = older than 4 months. Euro area countries share the ECB deposit rate. GDP growth from the World Bank is annual and can be a year old.</div>
        </>
      ) : (
        <>
          <div className="toolbar">
            {G7_METRICS.map((m) => <button key={m.key} aria-pressed={metric === m.key} onClick={() => setMetric(m.key)}>{m.label}</button>)}
          </div>
          <Suspense fallback={<div className="skeleton" />}>
            <CountryMap
              mode={view}
              version={`${metric}:${state.fetchedAt}`}
              colorOf={(id) => (numToCc[id] && cells[metric]?.[numToCc[id]!] ? heatColor(scoreFor(metric, numToCc[id]!), sel.good === 'neutral') : null)}
              labelOf={(c) => {
                const cc = numToCc[c.id];
                const o = cc ? cells[metric]?.[cc] : null;
                return o ? `${c.name}: ${fmt(o.value, 2)}${sel.unit} (${o.date})` : `${c.name}: not in G7 set`;
              }}
            />
          </Suspense>
        </>
      )}
    </>
  );
}

function GlobalScope({ view }: { view: 'table' | 'flat' | 'globe' }) {
  const iso = GLOBAL_COUNTRIES.map((c) => c[0]);
  const state = useData('heat:global', () => allSettled(GLOBAL_METRICS.map((m) => () => wbLatest(m.id, iso))), { source: 'World Bank', note: 'annual', everyMs: 24 * 3600_000 });
  const [metric, setMetric] = useState(0);
  const m = GLOBAL_METRICS[metric]!;
  const vals: Record<string, WbValue> = state.data?.[metric] ?? {};
  const all = Object.values(vals).map((v) => v.value);
  const score = (iso3: string) => (vals[iso3] ? goodness(percentile(vals[iso3]!.value, all), m.good) : NaN);
  const byNum = Object.fromEntries(GLOBAL_COUNTRIES.map(([i, n]) => [n, i]));
  const rows = [...GLOBAL_COUNTRIES].sort((a, b) => (vals[b[0]]?.value ?? -Infinity) - (vals[a[0]]?.value ?? -Infinity));
  return (
    <>
      <DataStatus state={state} />
      <div className="toolbar">
        {GLOBAL_METRICS.map((g, i) => <button key={g.id} aria-pressed={metric === i} onClick={() => setMetric(i)}>{g.label}</button>)}
      </div>
      <Legend neutral={m.good === 'neutral'} />
      {view === 'table' ? (
        <table className="grid-table heat">
          <thead><tr><th>Country</th><th className="num">{m.label} ({m.unit})</th><th>Year</th></tr></thead>
          <tbody>
            {rows.map(([i, , name]) => (
              <tr key={i}>
                <td>{name}</td>
                <td className={`cell ${vals[i] ? '' : 'na'}`} style={{ background: heatColor(score(i), m.good === 'neutral') }}>{vals[i] ? fmt(vals[i]!.value, 1) : 'n/a'}</td>
                <td className={vals[i] && Number(vals[i]!.year) < new Date().getFullYear() - 2 ? 'down' : 'muted'}>{vals[i]?.year ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Suspense fallback={<div className="skeleton" />}>
          <CountryMap
            mode={view}
            version={`${metric}:${state.fetchedAt}`}
            colorOf={(id) => (byNum[id] && vals[byNum[id]!] ? heatColor(score(byNum[id]!), m.good === 'neutral') : null)}
            labelOf={(c) => {
              const v = byNum[c.id] ? vals[byNum[c.id]!] : null;
              return v ? `${c.name}: ${fmt(v.value, 1)} ${m.unit} (${v.year})` : `${c.name}: no data`;
            }}
          />
        </Suspense>
      )}
      <div className="disclaimer">Source: World Bank World Development Indicators. Annual data, most recent non-empty year per country; often one to two years old. Color = rank across the countries shown. Grey = no data.</div>
    </>
  );
}

export default function HeatPanel({ run }: PanelProps) {
  const [scope, setScope] = useState<Scope>('US');
  const [view, setView] = useState<'table' | 'flat' | 'globe'>('table');
  return (
    <div>
      <div className="toolbar">
        {(['US', 'G7', 'GLOBAL'] as Scope[]).map((s) => <button key={s} aria-pressed={scope === s} onClick={() => setScope(s)}>{s}</button>)}
        {scope !== 'US' && (
          <>
            <span className="muted">view</span>
            {(['table', 'flat', 'globe'] as const).map((v) => <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v.toUpperCase()}</button>)}
          </>
        )}
      </div>
      {scope === 'US' && <UsScope run={run} />}
      {scope === 'G7' && <G7Scope view={view} />}
      {scope === 'GLOBAL' && <GlobalScope view={view} />}
    </div>
  );
}
