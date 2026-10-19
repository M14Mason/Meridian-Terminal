// GDELT DOC 2.0 API: world news, updated every 15 minutes. Free, no key. Cite GDELT (12.1).
import type { NewsItem } from '../../../shared/market';
import { up, type Fetched } from '../client';
import { receivedAt } from './alpaca';

interface GArticle { url: string; title: string; seendate: string; domain: string; sourcecountry: string; language: string }

const parseSeen = (s: string) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));

export async function search(query: string, timespan = '6h', max = 50): Promise<Fetched<NewsItem[]>> {
  const r = await up<{ articles?: GArticle[] }>('gdelt', '/api/v2/doc/doc', { query: `${query} sourcelang:english`, mode: 'artlist', format: 'json', maxrecords: max, timespan, sort: 'datedesc' }, { priority: 2 });
  return {
    ...r,
    data: (r.data.articles ?? []).map((a) => ({
      id: `gdelt:${a.url}`,
      headline: a.title,
      source: a.domain,
      url: a.url,
      symbols: [],
      publishedAt: parseSeen(a.seendate),
      receivedAt: receivedAt(`gdelt:${a.url}`),
      provider: 'GDELT',
    })),
  };
}
