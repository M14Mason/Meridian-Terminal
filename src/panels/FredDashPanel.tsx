// Generic FRED dashboard (LIQ, CPIB, JOBS, CRED, RECS, MMKT, RE, REAL). Click a row for its chart.
import { useMemo } from 'react';
import { series, type Obs } from '../data/adapters/fred';
import type { Fetched } from '../data/client';
import { DASHBOARDS, type DashRow } from '../data/dashboards';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const since = () => new Date(Date.now() - 5 * 365.25 * 86_400_000).toISOString().slice(0, 10);

function Spark({ obs }: { obs: Obs[] }) {
  const pts = obs.slice(-60);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((o) => o.value));
  const hi = Math.max(...pts.map((o) => o.value));
  const d = pts.map((o, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * 80).toFixed(1)},${(16 - ((o.value - lo) / (hi - lo || 1)) * 14 - 1).toFixed(1)}`).join('');
  const up = pts.at(-1)!.value >= pts[0]!.value;
  return <svg width={80} height={16} aria-hidden><path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={1.2} /></svg>;
}

export default function FredDashPanel({ code, run }: PanelProps) {
  const dash = DASHBOARDS[code]!;
  const rows = dash.groups.flatMap((g) => g.rows);
  const key = (r: DashRow) => `${r.id}:${r.units ?? ''}`;
  const uniq = [...new Map(rows.map((r) => [key(r), r])).values()];
  const extra = [...new Set((dash.computed ?? []).flatMap((c) => c.ids))].filter((id) => !uniq.some((r) => r.id === id && !r.units));
  const state = useData(`dash:${code}`, async (): Promise<Fetched<Record<string, Obs[] | null>>> => {
    const jobs = [...uniq.map((r) => ({ k: key(r), id: r.id, units: r.units })), ...extra.map((id) => ({ k: `${id}:`, id, units: undefined }))];
    const res = await Promise.allSettled(jobs.map((j) => series(j.id, since(), { units: j.units })));
    const ok = res.filter((r): r is PromiseFulfilledResult<Fetched<Obs[]>> => r.status === 'fulfilled');
    if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
    return { data: Object.fromEntries(jobs.map((j, i) => [j.k, res[i]!.status === 'fulfilled' ? (res[i] as PromiseFulfilledResult<Fetched<Obs[]>>).value.data : null])), fetchedAt: Math.min(...ok.map((r) => r.value.fetchedAt)), fromCache: false };
  }, { source: 'FRED', everyMs: 30 * 60_000 });

  const computed = useMemo(() => {
    if (!state.data || !dash.computed) return [];
    return dash.computed.map((c) => {
      const latest = c.ids.map((id) => state.data![`${id}:`]?.at(-1));
      if (latest.some((o) => !o)) return { ...c, value: null, date: '' };
      return { ...c, value: c.f(latest.map((o) => o!.value)), date: latest.map((o) => o!.date).sort()[0]! };
    });
  }, [state.data, dash.computed]);

  const show = (r: DashRow, v: number | undefined) => (v == null ? '-' : fmt(v * (r.scale ?? 1), r.dp ?? 2));
  return (
    <div>
      <h3 className="accent" style={{ fontSize: 13, margin: '0 0 4px' }}>{dash.title.toUpperCase()}</h3>
      <DataStatus state={state} keyName="FRED" />
      {computed.map((c) => (
        <p key={c.label}>
          <span className="accent">{c.label}:</span> <strong style={{ color: 'var(--value)' }}>{c.value == null ? '-' : `${fmt(c.value, 3)} ${c.unit}`}</strong> <span className="muted">(as of {c.date}; {c.note})</span>
        </p>
      ))}
      <table className="grid-table">
        <thead><tr><th>Series</th><th className="num">Latest</th><th className="num">Prior</th><th className="num">1y ago</th><th>Trend (5y)</th><th>As of</th></tr></thead>
        <tbody>
          {dash.groups.map((g) => [
            <tr key={g.name} className="group"><td colSpan={6} className="accent">{g.name.toUpperCase()}</td></tr>,
            ...g.rows.map((r) => {
              const obs = state.data?.[key(r)] ?? null;
              const last = obs?.at(-1);
              const prev = obs?.at(-2);
              const ya = last ? [...(obs ?? [])].reverse().find((o) => Date.parse(last.date) - Date.parse(o.date) >= 360 * 86_400_000) : undefined;
              // Late = older than two of the series' own periods plus a publication-lag margin (FRED dates the period start).
              const gap = last && prev ? (Date.parse(last.date) - Date.parse(prev.date)) / 86_400_000 : 30;
              const stale = last ? (Date.now() - Date.parse(last.date)) / 86_400_000 > gap * 2 + (gap >= 28 ? 45 : 7) : false;
              return (
                <tr key={key(r)} className="clickable" onClick={() => run(`${r.id} SER`)} title={`FRED ${r.id}${r.units ? ` (${r.units === 'pc1' ? 'YoY %' : 'change'})` : ''}`}>
                  <td>{r.label} <span className="muted">{r.unit}</span></td>
                  <td className="num">{show(r, last?.value)}</td>
                  <td className="num">{show(r, prev?.value)}</td>
                  <td className="num">{show(r, ya?.value)}</td>
                  <td>{obs && <Spark obs={obs} />}</td>
                  <td className={stale ? 'down' : 'muted'}>{last?.date ?? (state.data ? 'n/a' : '')}{stale ? ' LATE' : ''}</td>
                </tr>
              );
            }),
          ])}
        </tbody>
      </table>
      <div className="disclaimer">Source: FRED, Federal Reserve Bank of St. Louis (original publishers noted on each FRED page). {dash.notes ?? ''}</div>
    </div>
  );
}
