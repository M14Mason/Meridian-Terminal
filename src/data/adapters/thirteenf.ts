// 13F filings from SEC EDGAR (GURU). Free, delayed up to 45 days after each quarter.
import { parseInfoTable, type Holding } from '../../../shared/thirteenf';
import { up, type Fetched } from '../client';
import { cik10 } from './sec';

export interface F13 { accession: string; reportDate: string; filed: string }

export async function filings13f(cik: number): Promise<Fetched<{ name: string; list: F13[] }>> {
  const r = await up<{ name: string; filings: { recent: { form: string[]; accessionNumber: string[]; reportDate: string[]; filingDate: string[] } } }>('sec', `/submissions/CIK${cik10(cik)}.json`, undefined, { maxAgeMs: 6 * 3600_000, priority: 2 });
  const rec = r.data.filings.recent;
  const list: F13[] = [];
  rec.form.forEach((f, i) => {
    // Original filings only; amendments (13F-HR/A) can be partial restatements.
    if (f === '13F-HR') list.push({ accession: rec.accessionNumber[i]!, reportDate: rec.reportDate[i]!, filed: rec.filingDate[i]! });
  });
  return { ...r, data: { name: r.data.name, list } };
}

export async function holdings(cik: number, accession: string): Promise<Holding[]> {
  const dir = accession.replace(/-/g, '');
  const idx = await up<{ directory: { item: { name: string }[] } }>('secwww', `/Archives/edgar/data/${cik}/${dir}/index.json`, undefined, { maxAgeMs: 30 * 86_400_000, priority: 2 });
  const file = idx.data.directory.item.map((i) => i.name).find((n) => n.toLowerCase().endsWith('.xml') && n !== 'primary_doc.xml');
  if (!file) return [];
  const xml = await up<string>('secwww', `/Archives/edgar/data/${cik}/${dir}/${file}`, undefined, { text: true, maxAgeMs: 30 * 86_400_000, priority: 2 });
  // Values switched from thousands to whole dollars for filings from 2023 onward.
  return parseInfoTable(xml.data, accession.slice(11, 13) < '23');
}

/** Latest and previous quarter for one fund. */
export async function fundQuarters(cik: number) {
  const f = await filings13f(cik);
  const [cur, prev] = f.data.list;
  if (!cur) return { name: f.data.name, cur: null, prev: null, curH: [], prevH: null, fetchedAt: f.fetchedAt };
  const [curH, prevH] = await Promise.all([holdings(cik, cur.accession), prev ? holdings(cik, prev.accession) : Promise.resolve(null)]);
  return { name: f.data.name, cur, prev: prev ?? null, curH, prevH, fetchedAt: f.fetchedAt };
}
