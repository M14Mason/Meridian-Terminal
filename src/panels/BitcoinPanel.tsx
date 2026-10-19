import { useEffect, useRef, useState } from 'react';
import { AreaSeries } from 'lightweight-charts';
import { dedupe } from '../../shared/news';
import { makeChart, themeColors, ts } from '../charts/lw';
import { news as alpacaNews } from '../data/adapters/alpaca';
import { btcHistory, btcPrice } from '../data/adapters/coingecko';
import { search as gdelt } from '../data/adapters/gdelt';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, fmtPct, timeNY } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// BTC: Bitcoin price, chart and news. Crypto scope is limited to this and CRYP (owner's choice).
export default function BitcoinPanel(_: PanelProps) {
  const [days, setDays] = useState(365);
  const price = useData('btc:price', btcPrice, { source: 'CoinGecko', everyMs: 30_000 });
  const hist = useData(`btc:hist:${days}`, () => btcHistory(days), { everyMs: 15 * 60_000 });
  const news = useData('btc:news', async () => {
    const res = await Promise.allSettled([alpacaNews(['BTCUSD'], 30), gdelt('bitcoin', '24h', 30)]);
    const ok = res.filter((r) => r.status === 'fulfilled').map((r) => (r as PromiseFulfilledResult<Awaited<ReturnType<typeof gdelt>>>).value);
    if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
    return { data: dedupe(ok.flatMap((o) => o.data)), fetchedAt: Date.now(), fromCache: false };
  }, { everyMs: 120_000 });
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!box.current || !hist.data?.length) return;
    const c = themeColors();
    const chart = makeChart(box.current);
    const s = chart.addSeries(AreaSeries, { lineColor: c.accent, topColor: c.accent + '55', bottomColor: c.accent + '05', lineWidth: 2 });
    const seen = new Set<number>();
    s.setData(hist.data.map((p) => ({ time: ts(p.t), value: p.price })).filter((p) => (seen.has(p.time) ? false : (seen.add(p.time), true))));
    chart.timeScale().fitContent();
    return () => chart.remove();
  }, [hist.data]);
  const b = price.data?.bitcoin;
  return (
    <div className="panel-fill">
      <div className="toolbar">
        <strong className="accent">BTC/USD</strong>
        {b && (
          <>
            <span style={{ fontSize: 16, color: 'var(--value)' }}>{fmt(b.usd, 0)}</span>
            <span className={dir(b.usd_24h_change)}>{fmtPct(b.usd_24h_change)} 24h</span>
            <span className="muted">Mkt cap {fmtBig(b.usd_market_cap)} · Vol {fmtBig(b.usd_24h_vol)}</span>
          </>
        )}
        {[30, 90, 365, 1825].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d >= 365 ? `${d / 365}Y` : `${d}D`}</button>)}
      </div>
      <DataStatus state={price} />
      <div ref={box} className="chart-box" style={{ minHeight: 220, height: 260 }} />
      <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 4px' }}>BITCOIN NEWS</h4>
      <table className="grid-table news">
        <tbody>
          {(news.data ?? []).slice(0, 25).map((n) => (
            <tr key={n.id}>
              <td className="muted">{timeNY(n.publishedAt).slice(0, 5)}</td>
              <td className="news__head"><a href={n.url} target="_blank" rel="noreferrer noopener">{n.headline}</a><div className="muted" style={{ fontSize: 10 }}>{n.source} via {n.provider}</div></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer">Price: CoinGecko aggregate across exchanges. News: Alpaca (Benzinga) and GDELT. Headlines and links only.</div>
    </div>
  );
}
