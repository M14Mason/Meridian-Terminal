import { recent } from '../data/adapters/fx';
import { useData } from '../data/useData';
import { dir, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// FXC: currency matrix from ECB reference rates. Indicative, daily, not executable (19).
const CCY = ['USD', 'EUR', 'JPY', 'GBP', 'CHF', 'CAD', 'AUD', 'CNY', 'MXN', 'INR'];

export default function FxPanel(_: PanelProps) {
  const state = useData('fxc', () => recent(CCY), { source: 'ECB via Frankfurter', note: 'daily reference', everyMs: 3600_000 });
  const d = state.data;
  const last = d?.dates.at(-1);
  const prev = d?.dates.at(-2);
  const r = (date: string | undefined, c: string) => (c === 'USD' ? 1 : (date ? d?.rates[date]?.[c] : undefined));
  // cross(base, quote) = units of quote per 1 base
  const cross = (date: string | undefined, b: string, q: string) => {
    const rb = r(date, b);
    const rq = r(date, q);
    return rb && rq ? rq / rb : null;
  };
  const dp = (v: number) => (v >= 100 ? 2 : v >= 1 ? 4 : 5);
  return (
    <div>
      <p className="label-proxy">INDICATIVE. ECB reference rates published once a day around 16:00 CET. Not tradable quotes.</p>
      <DataStatus state={state} />
      {d && last && (
        <table className="grid-table">
          <thead><tr><th>1 unit of</th>{CCY.map((c) => <th key={c} className="num">{c}</th>)}</tr></thead>
          <tbody>
            {CCY.map((b) => (
              <tr key={b}>
                <td className="accent">{b}</td>
                {CCY.map((q) => {
                  if (b === q) return <td key={q} className="num muted">-</td>;
                  const v = cross(last, b, q)!;
                  const p = cross(prev, b, q);
                  const ch = p ? (v / p - 1) * 100 : null;
                  return (
                    <td key={q} className="num" title={`${b}/${q} ${fmtPct(ch)} vs ${prev}`}>
                      {v.toFixed(dp(v))}
                      <div className={dir(ch)} style={{ fontSize: 10 }}>{fmtPct(ch)}</div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="disclaimer">Rows: base currency. Columns: units of the other currency per 1 base. Change vs previous ECB fixing ({prev ?? '-'}). As of {last ?? '-'}.</div>
    </div>
  );
}
