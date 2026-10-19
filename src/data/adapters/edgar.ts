// EDGAR live filings feed (8-K handling, M4) and full-text search (going concern, auditor changes).
import { parseCurrentFeed, type CurrentFiling } from '../../../shared/edgar8k';
import { up, type Fetched } from '../client';

export async function currentFilings(form = '8-K', count = 100): Promise<Fetched<CurrentFiling[]>> {
  const r = await up<string>('secwww', '/cgi-bin/browse-edgar', { action: 'getcurrent', type: form, company: '', dateb: '', owner: 'include', start: 0, count, output: 'atom' }, { text: true });
  return { ...r, data: parseCurrentFeed(r.data) };
}

export interface FtsHit { id: string; form: string; company: string; filed: string; url: string }

/** EDGAR full-text search, for example "going concern" in 10-Ks over the last 30 days. */
export async function fullText(q: string, forms: string, days = 30): Promise<Fetched<FtsHit[]>> {
  const start = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
  const end = new Date().toISOString().slice(0, 10);
  const r = await up<{ hits: { hits: { _id: string; _source: { form: string; display_names: string[]; file_date: string; ciks: string[]; adsh: string } }[] } }>('efts', '/LATEST/search-index', { q: `"${q}"`, forms, dateRange: 'custom', startdt: start, enddt: end });
  return {
    ...r,
    data: r.data.hits.hits.map((h) => {
      const [adsh, file] = h._id.split(':');
      const cik = Number(h._source.ciks[0]);
      return {
        id: h._id,
        form: h._source.form,
        company: (h._source.display_names[0] ?? '').replace(/\s*\(CIK \d+\)/, '').trim(),
        filed: h._source.file_date,
        url: `https://www.sec.gov/Archives/edgar/data/${cik}/${(adsh ?? '').replace(/-/g, '')}/${file ?? ''}`,
      };
    }),
  };
}
