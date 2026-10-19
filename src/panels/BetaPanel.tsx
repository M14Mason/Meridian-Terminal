import { useMemo, useState } from 'react';
import { alignCloses } from '../../shared/align';
import { beta, returns } from '../../shared/indicators';
import { ALPACA_NOTE, multiBars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// BETA: OLS regression of the security's returns on a benchmark's returns, with a scatter plot.
export default function BetaPanel({ security }: PanelProps) {
  const sym = security!;
  const [bench, setBench] = useState('SPY');
  const [years, setYears] = useState(2);
  const [weekly, setWeekly] = useState(true);
  const state = useData(`beta:${sym}:${bench}:${years}:${weekly}`, () => multiBars([sym, bench], weekly ? '1Week' : '1Day', startFor(years * 366)), { source: 'Alpaca', note: ALPACA_NOTE });
  const res = useMemo(() => {
    if (!state.data) return null;
    const al = alignCloses([state.data[sym] ?? [], state.data[bench] ?? []]);
    if (al.dates.length < 10) return null;
    const a = returns(al.closes[0]!);
    const b = returns(al.closes[1]!);
    return { a, b, ...beta(a, b), n: a.length };
  }, [state.data, sym, bench]);

  const W = 320;
  const H = 240;
  const lim = res ? Math.max(...res.a.map(Math.abs), ...res.b.map(Math.abs)) * 1.05 : 1;
  const X = (v: number) => W / 2 + (v / lim) * (W / 2);
  const Y = (v: number) => H / 2 - (v / lim) * (H / 2);
  const periodsPerYear = weekly ? 52 : 252;
  return (
    <div>
      <div className="toolbar">
        <strong className="accent">{sym}</strong> vs
        <input value={bench} onChange={(e) => setBench(e.target.value.toUpperCase())} aria-label="Benchmark" style={{ width: 70 }} />
        {[1, 2, 5].map((y) => <button key={y} aria-pressed={years === y} onClick={() => setYears(y)}>{y}Y</button>)}
        <button aria-pressed={weekly} onClick={() => setWeekly(true)}>WEEKLY</button>
        <button aria-pressed={!weekly} onClick={() => setWeekly(false)}>DAILY</button>
      </div>
      <DataStatus state={state} keyName="Alpaca" />
      {res && (
        <div className="row" style={{ alignItems: 'flex-start' }}>
          <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`Scatter of ${sym} returns against ${bench}`} style={{ maxWidth: '100%', border: '1px solid var(--hairline)' }}>
            <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="var(--hairline)" />
            <line x1={W / 2} y1={0} x2={W / 2} y2={H} stroke="var(--hairline)" />
            {res.a.map((v, i) => <circle key={i} cx={X(res.b[i]!)} cy={Y(v)} r={2} fill="var(--text)" opacity={0.7} />)}
            <line x1={X(-lim)} y1={Y(res.alpha + res.beta * -lim)} x2={X(lim)} y2={Y(res.alpha + res.beta * lim)} stroke="var(--accent)" strokeWidth={2} />
          </svg>
          <dl className="kv">
            <dt>Beta</dt><dd className="accent">{fmt(res.beta, 3)}</dd>
            <dt>R squared</dt><dd>{fmt(res.r2, 3)}</dd>
            <dt>Alpha (annualized)</dt><dd>{fmt(res.alpha * periodsPerYear * 100)}%</dd>
            <dt>Observations</dt><dd>{res.n} {weekly ? 'weeks' : 'days'}</dd>
          </dl>
        </div>
      )}
      <div className="disclaimer">Ordinary least squares on simple {weekly ? 'weekly' : 'daily'} returns. Model estimate. Not financial advice.</div>
    </div>
  );
}
