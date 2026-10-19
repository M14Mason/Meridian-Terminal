import { useEffect, useRef } from 'react';
import type { Quote } from '../../shared/market';
import { dir, fmt, fmtBig, fmtChg, fmtPct, timeLocal } from '../lib/format';

/** Dense quote rows with flash-on-change (10.2). */
export function QuoteTable({ symbols, quotes, onPick, onRemove, labels }: {
  symbols: string[];
  quotes: Record<string, Quote> | undefined;
  onPick: (s: string) => void;
  onRemove?: (s: string) => void;
  labels?: Record<string, string>;
}) {
  const prev = useRef<Record<string, number>>({});
  const rows = useRef<Record<string, HTMLTableRowElement | null>>({});
  useEffect(() => {
    if (!quotes) return;
    for (const s of symbols) {
      const q = quotes[s];
      const p = prev.current[s];
      const el = rows.current[s];
      if (q && p !== undefined && el && q.price !== p) {
        el.classList.remove('flash-up', 'flash-down');
        void el.offsetWidth;
        el.classList.add(q.price > p ? 'flash-up' : 'flash-down');
      }
      if (q) prev.current[s] = q.price;
    }
  }, [quotes, symbols]);

  return (
    <table className="grid-table">
      <thead>
        <tr>
          <th>Ticker</th>
          {labels && <th>Proxy for</th>}
          <th className="num">Last</th>
          <th className="num">Chg</th>
          <th className="num">Chg%</th>
          <th className="num" title="IEX volume only, a small share of total market volume">Vol (IEX)</th>
          <th className="num">Time PT</th>
          {onRemove && <th aria-label="remove" />}
        </tr>
      </thead>
      <tbody>
        {symbols.map((s) => {
          const q = quotes?.[s];
          return (
            <tr key={s} ref={(el) => void (rows.current[s] = el)}>
              <td>
                <button className="link-btn" onClick={() => onPick(s)}>
                  {s}
                </button>
              </td>
              {labels && <td className="muted">{labels[s]}</td>}
              <td className="num">{fmt(q?.price)}</td>
              <td className={`num ${dir(q?.change)}`}>{fmtChg(q?.change)}</td>
              <td className={`num ${dir(q?.changePct)}`}>{fmtPct(q?.changePct)}</td>
              <td className="num">{fmtBig(q?.volume)}</td>
              <td className="num muted">{timeLocal(q?.time ?? null)}</td>
              {onRemove && (
                <td>
                  <button className="link-btn down" aria-label={`Remove ${s}`} onClick={() => onRemove(s)}>
                    ×
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
