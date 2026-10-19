import { useState } from 'react';
import { ALPACA_NOTE, bars, startFor, type Timeframe } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dateISO, dir, downloadCsv, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

// HP: historical price table with CSV export.
export default function HistoryPanel({ security }: PanelProps) {
  const sym = security!;
  const [tf, setTf] = useState<Timeframe>('1Day');
  const days = tf === '1Day' ? 400 : tf === '1Week' ? 2000 : 7000;
  const state = useData(`hp:${sym}:${tf}`, () => bars(sym, tf, startFor(days)), { everyMs: 600_000, source: 'Alpaca', note: ALPACA_NOTE });
  const rows = [...(state.data ?? [])].reverse();
  return (
    <div>
      <div className="toolbar">
        <strong className="accent">{sym}</strong>
        {(['1Day', '1Week', '1Month'] as Timeframe[]).map((t) => (
          <button key={t} aria-pressed={tf === t} onClick={() => setTf(t)}>{t.replace('1', '').toUpperCase()}</button>
        ))}
        <button
          disabled={!rows.length}
          onClick={() => downloadCsv(`${sym}-${tf}.csv`, [['date', 'open', 'high', 'low', 'close', 'volume_iex'], ...rows.map((b) => [dateISO(b.t), b.o, b.h, b.l, b.c, b.v])])}
        >
          CSV
        </button>
      </div>
      <DataStatus state={state} keyName="Alpaca" empty={rows.length === 0} />
      <table className="grid-table">
        <thead>
          <tr><th>Date</th><th className="num">Open</th><th className="num">High</th><th className="num">Low</th><th className="num">Close</th><th className="num">Chg%</th><th className="num">Vol (IEX)</th></tr>
        </thead>
        <tbody>
          {rows.slice(0, 500).map((b, i) => {
            const prev = rows[i + 1];
            const chg = prev ? (b.c / prev.c - 1) * 100 : null;
            return (
              <tr key={b.t}>
                <td>{dateISO(b.t)}</td>
                <td className="num">{fmt(b.o)}</td>
                <td className="num">{fmt(b.h)}</td>
                <td className="num">{fmt(b.l)}</td>
                <td className="num">{fmt(b.c)}</td>
                <td className={`num ${dir(chg)}`}>{fmtPct(chg)}</td>
                <td className="num">{fmtBig(b.v)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
