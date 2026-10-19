import { quotes } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dir, fmt, fmtPct } from '../lib/format';
import { useWatchlists } from '../state/watchlists';

// Feature 116. Scrolls the first watchlist. Static (no animation) under reduced motion or Low power.
export function TickerTape({ onPick }: { onPick: (s: string) => void }) {
  const lists = useWatchlists();
  const syms = lists[0]!.value.symbols.slice(0, 30);
  const state = useData(syms.length ? `tape:${syms.join(',')}` : null, () => quotes(syms), { everyMs: 30_000 });
  if (!state.data) return null;
  const items = syms.filter((s) => state.data![s]);
  if (!items.length) return null;
  const row = items.map((s) => {
    const q = state.data![s]!;
    return (
      <button key={s} className="tape__item" onClick={() => onPick(s)}>
        <span className="accent">{s}</span> {fmt(q.price)} <span className={dir(q.changePct)}>{fmtPct(q.changePct)}</span>
      </button>
    );
  });
  return (
    <div className="tape" aria-label="Ticker tape, IEX prices">
      <div className="tape__track">
        {row}
        <span aria-hidden className="tape__dup">{row}</span>
      </div>
    </div>
  );
}
