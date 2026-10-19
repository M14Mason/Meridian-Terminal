// ETF and fund holdings from SEC Form N-PORT (ETFH, TMAP). Quarter-end holdings, public about 60 days later.
import { makeTickerMatcher } from '../../../shared/thirteenf';
import { parseNport, type Nport } from '../../../shared/nport';
import { up, type Fetched } from '../client';
import { tickers } from './sec';

const DAY = 86_400_000;
let mf: Promise<Map<string, { cik: number; series: string }>> | null = null;

/** Fund ticker -> registrant CIK and series ID (SEC company_tickers_mf.json). */
function fundIndex() {
  mf ??= up<{ data: [number, string, string, string][] }>('secwww', '/files/company_tickers_mf.json', undefined, { maxAgeMs: DAY, priority: 2 })
    .then((r) => new Map(r.data.data.map(([cik, series, , sym]) => [sym.toUpperCase(), { cik, series }])))
    .catch((e: unknown) => { mf = null; throw e; });
  return mf;
}

export interface FundFiling { accession: string; filed: string; cik: number }

async function nportList(series: string): Promise<FundFiling[]> {
  const r = await up<string>('secwww', '/cgi-bin/browse-edgar', { action: 'getcompany', CIK: series, type: 'NPORT-P', dateb: '', owner: 'include', count: 10, output: 'atom' }, { text: true, maxAgeMs: DAY, priority: 1 });
  const out: FundFiling[] = [];
  const re = /<entry>[\s\S]*?<\/entry>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(r.data))) {
    const e = m[0];
    const acc = /<accession-number>([^<]+)/.exec(e)?.[1];
    const filed = /<filing-date>([^<]+)/.exec(e)?.[1];
    const cik = /\/data\/(\d+)\//.exec(e)?.[1];
    if (acc && filed && cik) out.push({ accession: acc, filed, cik: Number(cik) });
  }
  return out;
}

export interface EtfHoldings extends Nport { symbol: string; filed: string; url: string; tickers: (string | null)[]; prev: { period: string; netAssets: number } | null }

async function loadDoc(f: FundFiling) {
  const dir = f.accession.replace(/-/g, '');
  const x = await up<string>('secwww', `/Archives/edgar/data/${f.cik}/${dir}/primary_doc.xml`, undefined, { text: true, maxAgeMs: 30 * DAY, priority: 1 });
  return { doc: parseNport(x.data), url: `https://www.sec.gov/Archives/edgar/data/${f.cik}/${dir}/` };
}

export async function etfHoldings(symbol: string): Promise<Fetched<EtfHoldings>> {
  const sym = symbol.toUpperCase();
  const f = (await fundIndex()).get(sym);
  if (!f) throw new Error(`${sym} is not in the SEC fund list. Unit investment trusts (for example SPY, DIA) do not file N-PORT; try IVV or VOO instead.`);
  const list = await nportList(f.series);
  if (!list.length) throw new Error(`No N-PORT filings found for ${sym}.`);
  const [cur, prev, all] = await Promise.all([loadDoc(list[0]!), list[1] ? loadDoc(list[1]).catch(() => null) : Promise.resolve(null), tickers()]);
  const match = makeTickerMatcher(all);
  return {
    data: { ...cur.doc, symbol: sym, filed: list[0]!.filed, url: cur.url, tickers: cur.doc.holdings.map((h) => (h.cat === 'EC' ? match(h.name, h.title) : null)), prev: prev ? { period: prev.doc.period, netAssets: prev.doc.netAssets } : null },
    fetchedAt: Date.now(),
    fromCache: false,
  };
}
