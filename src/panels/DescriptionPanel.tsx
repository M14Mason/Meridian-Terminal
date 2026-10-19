import { profile as secProfile } from '../data/adapters/sec';
import * as fh from '../data/adapters/finnhub';
import { useData } from '../data/useData';
import { fmt, fmtBig } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// DES: company description from SEC EDGAR (identity, filings) and Finnhub (profile, key stats).
export default function DescriptionPanel({ security, run }: PanelProps) {
  const sym = security!;
  const sec = useData(`des:sec:${sym}`, () => secProfile(sym), { source: 'SEC EDGAR' });
  const prof = useData(`des:fh:${sym}`, () => fh.profile(sym));
  const met = useData(`des:met:${sym}`, () => fh.metrics(sym));
  const p = sec.data;
  const f = prof.data;
  const m = met.data?.metric ?? {};
  const num = (k: string) => (typeof m[k] === 'number' ? (m[k] as number) : null);
  return (
    <div>
      <DataStatus state={sec} />
      {p && (
        <>
          <h3 className="accent" style={{ margin: '2px 0 6px', fontSize: 14 }}>
            {p.name} <span className="muted">({sym}, CIK {p.cik})</span>
          </h3>
          <dl className="kv">
            <dt>Industry (SIC)</dt><dd>{p.sicDescription} ({p.sic})</dd>
            {f?.finnhubIndustry && (<><dt>Sector (Finnhub)</dt><dd>{f.finnhubIndustry}</dd></>)}
            <dt>Exchange</dt><dd>{p.exchanges.join(', ') || '-'}</dd>
            <dt>Address</dt><dd>{p.address || '-'}</dd>
            <dt>Incorporated</dt><dd>{p.stateOfIncorporation || '-'}</dd>
            <dt>Fiscal year end</dt><dd>{p.fiscalYearEnd ? `${p.fiscalYearEnd.slice(0, 2)}/${p.fiscalYearEnd.slice(2)}` : '-'}</dd>
            {f?.ipo && (<><dt>IPO</dt><dd>{f.ipo}</dd></>)}
            {f?.weburl && (<><dt>Website</dt><dd><a href={f.weburl} target="_blank" rel="noreferrer noopener">{f.weburl}</a></dd></>)}
          </dl>
        </>
      )}
      <h4 className="accent" style={{ margin: '10px 0 4px', fontSize: 12 }}>KEY STATS (FINNHUB)</h4>
      {prof.missingKey || met.missingKey ? (
        <p className="muted">Add your Finnhub key in SET &gt; Keys for market cap and ratios.</p>
      ) : (
        <dl className="kv">
          <dt>Market cap</dt><dd>{f ? fmtBig(f.marketCapitalization * 1e6) : '-'}</dd>
          <dt>Shares out</dt><dd>{f ? fmtBig(f.shareOutstanding * 1e6) : '-'}</dd>
          <dt>P/E (TTM)</dt><dd>{fmt(num('peTTM'))}</dd>
          <dt>P/S (TTM)</dt><dd>{fmt(num('psTTM'))}</dd>
          <dt>P/B</dt><dd>{fmt(num('pbQuarterly'))}</dd>
          <dt>EPS (TTM)</dt><dd>{fmt(num('epsTTM'))}</dd>
          <dt>Dividend yield</dt><dd>{num('currentDividendYieldTTM') != null ? `${fmt(num('currentDividendYieldTTM'))}%` : '-'}</dd>
          <dt>52w high / low</dt><dd>{fmt(num('52WeekHigh'))} / {fmt(num('52WeekLow'))}</dd>
          <dt>Beta</dt><dd>{fmt(num('beta'))}</dd>
          <dt>ROE (TTM)</dt><dd>{num('roeTTM') != null ? `${fmt(num('roeTTM'))}%` : '-'}</dd>
          <dt>Net margin (TTM)</dt><dd>{num('netProfitMarginTTM') != null ? `${fmt(num('netProfitMarginTTM'))}%` : '-'}</dd>
        </dl>
      )}
      {p && (
        <>
          <h4 className="accent" style={{ margin: '10px 0 4px', fontSize: 12 }}>RECENT FILINGS</h4>
          <table className="grid-table">
            <tbody>
              {p.filings.filter((x) => ['10-K', '10-Q', '8-K', '20-F', '6-K', 'DEF 14A', 'S-1'].includes(x.form)).slice(0, 8).map((x) => (
                <tr key={x.accession}>
                  <td>{x.filed}</td>
                  <td className="accent">{x.form}</td>
                  <td><a href={x.url} target="_blank" rel="noreferrer noopener">{x.description || 'Open'}</a></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row" style={{ marginTop: 6 }}>
            {['GP', 'FA', 'CF', 'CN', 'NOTE'].map((c) => (
              <button key={c} onClick={() => run(`${sym} ${c}`)}>{c}</button>
            ))}
          </div>
        </>
      )}
      <div className="disclaimer">Sources: SEC EDGAR (public filings), Finnhub (free tier). Ratios are provider-computed and may lag.</div>
    </div>
  );
}
