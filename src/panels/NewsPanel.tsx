import { useMemo, useState } from 'react';
import type { NewsItem } from '../../shared/market';
import { dedupe, keywordSentiment, latencySeconds } from '../../shared/news';
import { news as alpacaNews } from '../data/adapters/alpaca';
import { currentFilings } from '../data/adapters/edgar';
import { companyNews, generalNews } from '../data/adapters/finnhub';
import { search as gdelt } from '../data/adapters/gdelt';
import { profile as secProfile } from '../data/adapters/sec';
import { ITEMS_8K, RED_FLAG_ITEMS } from '../../shared/edgar8k';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { timeLocal } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// N (market-wide) and CN (one company). Headline, source, time and link only, never article text (12.3).

async function settle(loaders: (() => Promise<Fetched<NewsItem[]>>)[]): Promise<Fetched<{ items: NewsItem[]; failed: number }>> {
  const res = await Promise.allSettled(loaders.map((l) => l()));
  const ok = res.filter((r): r is PromiseFulfilledResult<Fetched<NewsItem[]>> => r.status === 'fulfilled');
  if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
  return {
    data: { items: ok.flatMap((r) => r.value.data), failed: res.length - ok.length },
    fetchedAt: Math.max(...ok.map((r) => r.value.fetchedAt)),
    fromCache: false,
  };
}

function latencyClass(s: number) {
  return s < 60 ? 'up' : s < 900 ? 'accent' : 'down';
}

export default function NewsPanel({ code, security, run }: PanelProps) {
  const company = code === 'CN' ? security! : null;
  const [filter, setFilter] = useState('');
  const [world, setWorld] = useState(false);
  const state = useData(`news:${company ?? 'top'}:${world}`, () =>
    settle(
      company
        ? [
            () => alpacaNews([company], 50),
            () => companyNews(company),
            async () => {
              const p = await secProfile(company);
              return {
                ...p,
                data: p.data.filings
                  .filter((f) => f.form === '8-K')
                  .slice(0, 15)
                  .map((f) => ({ id: `sec:${f.accession}`, headline: `8-K: ${f.description || 'Current report'}`, source: 'SEC EDGAR', url: f.url, symbols: [company], publishedAt: Date.parse(f.filed), receivedAt: Date.parse(f.filed), provider: 'SEC' })),
              };
            },
          ]
        : [
            () => alpacaNews(undefined, 50),
            () => generalNews(),
            async () => {
              const r = await currentFilings('8-K', 60);
              return {
                ...r,
                data: r.data
                  .filter((f) => f.items.some((i) => i === '2.02' || RED_FLAG_ITEMS.has(i)))
                  .map((f) => ({ id: `sec:${f.url}`, headline: `8-K ${f.company}: ${f.items.map((i) => ITEMS_8K[i]).join(', ')}`, source: 'SEC EDGAR', url: f.url, symbols: [], publishedAt: f.updated, receivedAt: f.updated, provider: 'SEC' })),
              };
            },
            ...(world ? [() => gdelt('(economy OR markets OR oil OR "central bank")', '3h', 50)] : []),
          ],
    ), { everyMs: 60_000, source: company ? 'Alpaca, Finnhub, SEC' : 'Alpaca, Finnhub, SEC, GDELT' });

  const items = useMemo(() => {
    const all = dedupe(state.data?.items ?? []);
    const f = filter.trim().toLowerCase();
    return f ? all.filter((n) => n.headline.toLowerCase().includes(f) || n.symbols.some((s) => s.toLowerCase() === f)) : all;
  }, [state.data, filter]);

  return (
    <div>
      <div className="banner banner--info" role="note">Free feeds arrive later than paid terminals. The badge shows how long after publishing each headline reached you.</div>
      <div className="toolbar">
        {company && <strong className="accent">{company}</strong>}
        <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter keyword or ticker" aria-label="Filter headlines" style={{ width: 180 }} />
        {!company && (
          <button aria-pressed={world} onClick={() => setWorld((w) => !w)} title="Adds GDELT world news">WORLD</button>
        )}
        <span className="muted">{items.length} headlines</span>
      </div>
      <DataStatus state={state} keyName="Alpaca or Finnhub" empty={items.length === 0} />
      {state.data && state.data.failed > 0 && <div className="muted">Some feeds failed or have no key; showing the rest.</div>}
      <table className="grid-table news">
        <tbody>
          {items.slice(0, 200).map((n) => {
            const lat = latencySeconds(n);
            // Filing rows hold company names and item titles, not prose, so they are not scored.
            const s = n.provider === 'SEC' ? 0 : keywordSentiment(n.headline);
            return (
              <tr key={n.id}>
                <td className="muted">{timeLocal(n.publishedAt).slice(0, 5)}</td>
                <td className="news__head">
                  <a href={n.url} target="_blank" rel="noreferrer noopener">{n.headline}</a>
                  <div className="muted" style={{ fontSize: 10 }}>
                    {n.source} via {n.provider}
                    {n.alsoFrom.length ? ` +${n.alsoFrom.join(', ')}` : ''}
                    {n.symbols.slice(0, 5).map((sym) => (
                      <button key={sym} className="link-btn" style={{ marginLeft: 6, fontSize: 10 }} onClick={() => run(`${sym} GP`)}>{sym}</button>
                    ))}
                  </div>
                </td>
                <td className={s > 0 ? 'up' : s < 0 ? 'down' : 'muted'} title="Keyword score, not AI">{s > 0 ? '+' : s < 0 ? '-' : '·'}</td>
                <td className={`num ${n.provider === 'SEC' ? 'muted' : latencyClass(lat)}`} title="Received after publish">{n.provider === 'SEC' ? 'filed' : lat < 3600 ? `${lat}s` : `${Math.round(lat / 3600)}h`}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="disclaimer">Headlines and links only. Sources: Alpaca (Benzinga), Finnhub, SEC EDGAR 8-K filings{world ? ', GDELT Project' : ''}. +/- is a simple keyword score, not a prediction.</div>
    </div>
  );
}
