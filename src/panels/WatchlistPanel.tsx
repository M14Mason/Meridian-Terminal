import { useState } from 'react';
import { ALPACA_NOTE, quotes } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { deleteWatchlist, saveWatchlist, useWatchlists } from '../state/watchlists';
import { QuoteTable } from './QuoteTable';

// BQ: watchlists with live IEX quotes, synced across devices.
export default function WatchlistPanel({ run }: PanelProps) {
  const lists = useWatchlists();
  const [activeId, setActiveId] = useState(lists[0]!.id);
  const active = lists.find((l) => l.id === activeId) ?? lists[0]!;
  const [add, setAdd] = useState('');
  const symbols = active.value.symbols;
  const state = useData(symbols.length ? `bq:${symbols.join(',')}` : null, () => quotes(symbols), { everyMs: 15_000, source: 'Alpaca', note: ALPACA_NOTE });

  function addSymbol() {
    const s = add.trim().toUpperCase();
    if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(s)) return;
    saveWatchlist(active.id, { ...active.value, symbols: [...symbols, s] });
    setAdd('');
  }

  return (
    <div>
      <div className="toolbar">
        {lists.map((l) => (
          <button key={l.id} aria-pressed={l.id === active.id} onClick={() => setActiveId(l.id)}>
            {l.value.name}
          </button>
        ))}
        <button
          onClick={() => {
            const name = window.prompt('New watchlist name:');
            if (name?.trim()) {
              const id = `w${Date.now().toString(36)}`;
              saveWatchlist(id, { name: name.trim(), symbols: [] });
              setActiveId(id);
            }
          }}
        >
          + LIST
        </button>
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            addSymbol();
          }}
        >
          <input value={add} onChange={(e) => setAdd(e.target.value)} placeholder="Add ticker" aria-label="Add ticker" style={{ width: 90 }} />
          <button type="submit">ADD</button>
        </form>
        {lists.length > 1 && (
          <button className="settings__danger" onClick={() => window.confirm(`Delete watchlist ${active.value.name}?`) && deleteWatchlist(active.id)}>
            DELETE LIST
          </button>
        )}
      </div>
      <DataStatus state={state} keyName="Alpaca" />
      <QuoteTable
        symbols={symbols}
        quotes={state.data}
        onPick={(s) => run(`${s} GP`)}
        onRemove={(s) => saveWatchlist(active.id, { ...active.value, symbols: symbols.filter((x) => x !== s) })}
      />
      <div className="disclaimer">Prices are real time from the IEX exchange only (free Alpaca plan). Volume shows IEX volume, not total market volume.</div>
    </div>
  );
}
