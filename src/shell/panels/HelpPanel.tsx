import { useMemo, useState } from 'react';
import { suggest } from '../command';
import { FUNCTIONS, isBuilt } from '../registry';
import type { PanelProps } from '../types';

export default function HelpPanel({ run }: PanelProps) {
  const [q, setQ] = useState('');
  const list = useMemo(() => (q.trim() ? suggest(q, 60).map((s) => s.fn) : FUNCTIONS), [q]);
  return (
    <div className="help">
      <input className="help__search" placeholder="Search functions" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search functions" />
      <table className="grid-table">
        <tbody>
          {list.map((f) => (
            <tr key={f.code}>
              <td>
                <button className="link-btn" onClick={() => run(f.code)}>
                  {f.code}
                </button>
              </td>
              <td>
                {f.title}
                {f.needsSecurity && <span className="muted"> (ticker)</span>}
              </td>
              <td className={isBuilt(f) ? 'up' : 'muted'}>{isBuilt(f) ? 'READY' : f.milestone}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">Type a ticker and a code, like AAPL GP, then Enter. Alt+Enter opens a new panel. Ctrl+/ shows shortcuts.</p>
    </div>
  );
}
