// PAT, ESG, TICK: PARTIAL panels. Their free sources are bulk files or sites without a usable free API,
// so these open the official search pages pre-filled for the company instead of showing data in-app.
import { profile } from '../data/adapters/sec';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

/** "APPLE INC." -> "Apple" style search term: legal suffixes dropped. */
const term = (n: string) => n.replace(/[,.]/g, ' ').replace(/\b(INC|CORP|CORPORATION|CO|LTD|PLC|HOLDINGS?|GROUP|COMPANY|LLC|LP|SA|NV|AG)\b/gi, '').replace(/\s+/g, ' ').trim();

function Links({ items }: { items: { label: string; href: string; note: string }[] }) {
  return (
    <table className="grid-table">
      <tbody>{items.map((l) => <tr key={l.href}><td><a href={l.href} target="_blank" rel="noreferrer noopener">{l.label}</a></td><td className="muted" style={{ whiteSpace: 'normal' }}>{l.note}</td></tr>)}</tbody>
    </table>
  );
}

export default function LinkPanels({ code, security }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  const st = useData(code === 'TICK' ? null : `prof:${sym}`, () => profile(sym), { source: 'SEC EDGAR' });
  const name = st.data ? term(st.data.name) : sym;
  const q = encodeURIComponent(name);
  return (
    <div>
      <p><span className="badge">PARTIAL</span> {code === 'TICK' ? 'Opens the official source; no in-app data.' : <>Search pages pre-filled for <strong className="accent">{name}</strong> ({sym}). No in-app data yet.</>}</p>
      {code !== 'TICK' && <DataStatus state={st} />}
      {code === 'PAT' && (
        <>
          <Links items={[
            { label: 'Google Patents: granted patents by assignee', href: `https://patents.google.com/?assignee=${q}&status=GRANT&sort=new`, note: 'Newest grants first. Subsidiaries can file under other names.' },
            { label: 'USPTO Patent Public Search', href: 'https://ppubs.uspto.gov/pubwebapp/', note: 'Official full-text search (type the assignee name).' },
            { label: 'PatentsView bulk data', href: 'https://patentsview.org/download/data-download-tables', note: 'Free bulk tables (several GB). Too large for a free nightly job here.' },
          ]} />
          <div className="disclaimer">Why partial: PatentsView&apos;s API asks for a key with a mailing address (skipped at the owner&apos;s request) and the keyless bulk tables are several gigabytes. Patent counts measure R&amp;D activity, not value.</div>
        </>
      )}
      {code === 'ESG' && (
        <>
          <Links items={[
            { label: 'EPA ECHO: environmental violations and penalties', href: `https://echo.epa.gov/facilities/facility-search/results?p_fn=${q}`, note: 'Facility inspections, violations and enforcement by facility name.' },
            { label: 'OSHA: workplace safety inspections', href: `https://www.osha.gov/ords/imis/establishment.search?establishment=${q}&state=all&officetype=all&office=all&startmonth=01&startday=01&startyear=2020&endmonth=12&endday=31&endyear=2030&p_case=all&p_violations_exist=all`, note: 'Inspections and citations since 2020.' },
            { label: 'FEC: company PAC political giving', href: `https://www.fec.gov/data/committees/?q=${q}`, note: 'Corporate PAC committees and their contributions.' },
            { label: 'SEC full-text: climate and human capital disclosures', href: `https://efts.sec.gov/LATEST/search-index?q=%22${q}%22%20climate&forms=10-K`, note: 'What the company says in its annual report.' },
          ]} />
          <div className="disclaimer">Why partial: a composite score needs matching thousands of facility and committee names to each company, which is error-prone without a paid entity map. These are the raw public records. No ESG rating is implied.</div>
        </>
      )}
      {code === 'TICK' && (
        <>
          <Links items={[
            { label: 'IEX HIST: free historical tick data (T+1)', href: 'https://iextrading.com/trading/market-data/', note: 'Daily pcap files of every IEX quote and trade, nanosecond timestamps, trailing 12 months. Several GB per day.' },
            { label: 'IEX DEEP/TOPS specification', href: 'https://iextrading.com/trading/market-data/#specifications', note: 'Message format needed to decode the files.' },
          ]} />
          <div className="disclaimer">Why partial: one day of IEX data is several gigabytes of binary packet capture, far beyond what a browser or a free job can process. A desktop Python notebook is the right tool. IEX is about 2 to 3% of US volume.</div>
        </>
      )}
    </div>
  );
}
