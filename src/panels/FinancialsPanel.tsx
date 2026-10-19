import { useMemo, useState } from 'react';
import { buildStatement, type Facts, type Mode } from '../../shared/xbrl';
import { companyFacts } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { downloadCsv, fmtBig } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

type Which = 'income' | 'balance' | 'cashflow';

// FA: statements from SEC XBRL company facts (free, official). Calendar-aligned periods.
export default function FinancialsPanel({ security }: PanelProps) {
  const sym = security!;
  const [which, setWhich] = useState<Which>('income');
  const [mode, setMode] = useState<Mode>('annual');
  const state = useData(`fa:${sym}`, () => companyFacts(sym), { source: 'SEC XBRL' });
  const st = useMemo(() => (state.data ? buildStatement(state.data.facts as Facts, which, mode, mode === 'annual' ? 8 : 12) : null), [state.data, which, mode]);
  const fmtCell = (label: string, v: number | null) => (v == null ? '-' : label.startsWith('EPS') ? v.toFixed(2) : fmtBig(v));
  return (
    <div>
      <div className="toolbar">
        <strong className="accent">{sym}</strong>
        {(['income', 'balance', 'cashflow'] as Which[]).map((w) => (
          <button key={w} aria-pressed={which === w} onClick={() => setWhich(w)}>{w === 'cashflow' ? 'CASH FLOW' : w.toUpperCase()}</button>
        ))}
        <button aria-pressed={mode === 'annual'} onClick={() => setMode('annual')}>ANNUAL</button>
        <button aria-pressed={mode === 'quarterly'} onClick={() => setMode('quarterly')}>QUARTERLY</button>
        {st && (
          <button onClick={() => downloadCsv(`${sym}-${which}-${mode}.csv`, [['line', ...st.periods], ...st.rows.map((r) => [r.label, ...r.values])])}>CSV</button>
        )}
      </div>
      <DataStatus state={state} empty={st?.periods.length === 0} />
      {st && st.periods.length > 0 && (
        <table className="grid-table stmt">
          <thead><tr><th>{state.data?.entityName}</th>{st.periods.map((p) => <th key={p} className="num">{p}</th>)}</tr></thead>
          <tbody>
            {st.rows.map((r) => (
              <tr key={r.label} title={r.tag ? `XBRL: ${r.tag}` : 'Not reported in XBRL'}>
                <td>{r.label}</td>
                {r.values.map((v, i) => <td key={i} className={`num ${v != null && v < 0 ? 'down' : ''}`}>{fmtCell(r.label, v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="disclaimer">
        Source: SEC XBRL company facts. Periods are calendar-aligned SEC frames, so fiscal years that end mid-year shift. Quarterly flows often skip Q4 because companies report it only inside the annual total. A dash means the company did not tag that line. Small filers may have gaps.
      </div>
    </div>
  );
}
