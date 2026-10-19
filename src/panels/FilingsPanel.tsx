import { useMemo, useState } from 'react';
import { profile } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// CF: every SEC filing for a company, with form filters. Links go to sec.gov.
const GROUPS: Record<string, (f: string) => boolean> = {
  All: () => true,
  Reports: (f) => /^(10-K|10-Q|20-F|40-F|6-K)(\/A)?$/.test(f),
  '8-K': (f) => /^8-K/.test(f),
  Insiders: (f) => /^[345](\/A)?$/.test(f) || f === '144',
  Ownership: (f) => /^SC 13[DG]|^SCHEDULE 13[DG]|^13F/.test(f),
  Proxy: (f) => /^DEF|^DEFA|^PRE 14/.test(f),
  Offerings: (f) => /^S-[13]|^424B|^F-[13]|^D$/.test(f),
  Delisting: (f) => /^25|^15-/.test(f),
};

export default function FilingsPanel({ security, run }: PanelProps) {
  const sym = security!;
  const [group, setGroup] = useState('Reports');
  const state = useData(`cf:${sym}`, () => profile(sym), { everyMs: 600_000, source: 'SEC EDGAR' });
  const rows = useMemo(() => (state.data?.filings ?? []).filter((f) => GROUPS[group]!(f.form)), [state.data, group]);
  return (
    <div>
      <div className="toolbar">
        <strong className="accent">{sym}</strong>
        {Object.keys(GROUPS).map((g) => (
          <button key={g} aria-pressed={group === g} onClick={() => setGroup(g)}>{g.toUpperCase()}</button>
        ))}
      </div>
      <DataStatus state={state} empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Filed</th><th>Form</th><th>Period</th><th>Document</th></tr></thead>
        <tbody>
          {rows.slice(0, 300).map((f) => (
            <tr key={f.accession}>
              <td>{f.filed}</td>
              <td className="accent">{f.form}</td>
              <td className="muted">{f.reportDate || '-'}</td>
              <td><a href={f.url} target="_blank" rel="noreferrer noopener">{f.description || f.form}</a></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 6 }}>
        <button onClick={() => run(`${sym} FA`)}>FA</button>
        <button onClick={() => run(`${sym} INS`)}>INS</button>
        <button onClick={() => run(`${sym} HDS`)}>HDS</button>
      </div>
      <div className="disclaimer">Source: SEC EDGAR submissions (most recent 1,000 filings).</div>
    </div>
  );
}
