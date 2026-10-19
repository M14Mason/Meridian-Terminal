import { insiders } from '../data/adapters/finnhub';
import { profile } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const CODES: Record<string, string> = { P: 'Buy', S: 'Sell', A: 'Award', M: 'Option exercise', F: 'Tax withholding', G: 'Gift', D: 'Disposition', C: 'Conversion', X: 'Option exercise' };

// INS: Form 4 insider transactions (Finnhub parsed) plus the raw Form 3/4/5 filings from SEC.
export default function InsiderPanel({ security }: PanelProps) {
  const sym = security!;
  const fh = useData(`ins:fh:${sym}`, () => insiders(sym), { source: 'Finnhub, SEC', everyMs: 3600_000 });
  const sec = useData(`ins:sec:${sym}`, () => profile(sym));
  const rows = (fh.data?.data ?? []).slice(0, 150);
  const buys = rows.filter((r) => r.transactionCode === 'P').reduce((s, r) => s + r.change * r.transactionPrice, 0);
  const sells = rows.filter((r) => r.transactionCode === 'S').reduce((s, r) => s + -r.change * r.transactionPrice, 0);
  return (
    <div>
      <div className="toolbar"><strong className="accent">{sym}</strong><span className="muted">Open-market buys ${fmtBig(buys)} · sells ${fmtBig(sells)} (rows shown)</span></div>
      <DataStatus state={fh} keyName="Finnhub" />
      {rows.length > 0 && (
        <table className="grid-table">
          <thead><tr><th>Date</th><th>Insider</th><th>Type</th><th className="num">Shares</th><th className="num">Price</th><th className="num">Held after</th></tr></thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>{r.transactionDate}</td>
                <td>{r.name}</td>
                <td className={r.transactionCode === 'P' ? 'up' : r.transactionCode === 'S' ? 'down' : 'muted'}>{CODES[r.transactionCode] ?? r.transactionCode}</td>
                <td className={`num ${dir(r.change)}`}>{fmtBig(r.change)}</td>
                <td className="num">{r.transactionPrice ? fmt(r.transactionPrice) : '-'}</td>
                <td className="num">{fmtBig(r.share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <h4 className="accent" style={{ fontSize: 12, margin: '10px 0 4px' }}>FORM 3/4/5 FILINGS (SEC)</h4>
      <table className="grid-table">
        <tbody>
          {(sec.data?.filings ?? []).filter((f) => /^[345](\/A)?$/.test(f.form)).slice(0, 25).map((f) => (
            <tr key={f.accession}><td>{f.filed}</td><td className="accent">{f.form}</td><td><a href={f.url} target="_blank" rel="noreferrer noopener">Open filing</a></td></tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer">Award, exercise and tax rows are not market trades. Only P (buy) and S (sell) are open-market.</div>
    </div>
  );
}
