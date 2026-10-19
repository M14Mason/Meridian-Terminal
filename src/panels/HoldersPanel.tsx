import { profile } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// HDS (LIMITED): 13D/13G filings by 5%+ owners about this company. Full 13F holder lists are not free (docs/OMITTED.md).
export default function HoldersPanel({ security }: PanelProps) {
  const sym = security!;
  const state = useData(`hds:${sym}`, () => profile(sym), { source: 'SEC EDGAR', everyMs: 3600_000 });
  const rows = (state.data?.filings ?? []).filter((f) => /13D|13G/.test(f.form));
  return (
    <div>
      <p className="label-proxy">LIMITED: shows 5%+ ownership filings (Schedule 13D activist, 13G passive). A full institutional holder list needs paid data.</p>
      <DataStatus state={state} empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Filed</th><th>Form</th><th>Type</th><th>Filing</th></tr></thead>
        <tbody>
          {rows.slice(0, 100).map((f) => (
            <tr key={f.accession}>
              <td>{f.filed}</td>
              <td className="accent">{f.form}</td>
              <td className={/13D/.test(f.form) ? 'flag' : 'muted'}>{/13D/.test(f.form) ? 'Activist or control intent' : 'Passive 5%+'}</td>
              <td><a href={f.url} target="_blank" rel="noreferrer noopener">Open (filer named inside)</a></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
