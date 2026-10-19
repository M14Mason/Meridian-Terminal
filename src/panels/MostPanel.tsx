import { useState } from 'react';
import { mostActives, movers } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, fmtChg, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// MOST: gainers, losers and most active from Alpaca's screener.
export default function MostPanel({ run }: PanelProps) {
  const [tab, setTab] = useState<'gainers' | 'losers' | 'active'>('gainers');
  const mv = useData('most:movers', () => movers(25), { everyMs: 60_000, source: 'Alpaca screener' });
  const ac = useData(tab === 'active' ? 'most:active' : null, () => mostActives(25), { everyMs: 60_000, source: 'Alpaca screener' });
  const list = tab === 'active' ? null : tab === 'gainers' ? mv.data?.gainers : mv.data?.losers;
  return (
    <div>
      <div className="toolbar">
        {(['gainers', 'losers', 'active'] as const).map((t) => (
          <button key={t} aria-pressed={tab === t} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>
      {tab !== 'active' ? (
        <>
          <DataStatus state={mv} keyName="Alpaca" />
          <table className="grid-table">
            <thead>
              <tr><th>Ticker</th><th className="num">Price</th><th className="num">Chg</th><th className="num">Chg%</th></tr>
            </thead>
            <tbody>
              {list?.map((m) => (
                <tr key={m.symbol}>
                  <td><button className="link-btn" onClick={() => run(`${m.symbol} GP`)}>{m.symbol}</button></td>
                  <td className="num">{fmt(m.price)}</td>
                  <td className={`num ${dir(m.change)}`}>{fmtChg(m.change)}</td>
                  <td className={`num ${dir(m.percentChange)}`}>{fmtPct(m.percentChange)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <>
          <DataStatus state={ac} keyName="Alpaca" />
          <table className="grid-table">
            <thead>
              <tr><th>Ticker</th><th className="num">Volume</th><th className="num">Trades</th></tr>
            </thead>
            <tbody>
              {ac.data?.most_actives.map((m) => (
                <tr key={m.symbol}>
                  <td><button className="link-btn" onClick={() => run(`${m.symbol} GP`)}>{m.symbol}</button></td>
                  <td className="num">{fmtBig(m.volume)}</td>
                  <td className="num">{fmtBig(m.trade_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="disclaimer">Screener lists from Alpaca. Movers include all US listings, including penny stocks.</div>
    </div>
  );
}
