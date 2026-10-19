// Synced watchlists (7.1).
import { sync, useCollection } from './sync';

export interface Watchlist {
  name: string;
  symbols: string[];
}

export const DEFAULT_LIST: Watchlist = { name: 'Core', symbols: ['SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA'] };

export function useWatchlists(): { id: string; value: Watchlist }[] {
  const lists = useCollection<Watchlist>('watchlists');
  return lists.length ? [...lists].sort((a, b) => a.value.name.localeCompare(b.value.name)) : [{ id: 'core', value: DEFAULT_LIST }];
}

export function saveWatchlist(id: string, w: Watchlist): void {
  void sync.put('watchlists', id, { name: w.name.slice(0, 40), symbols: [...new Set(w.symbols.map((s) => s.toUpperCase()))].slice(0, 200) });
}

export function deleteWatchlist(id: string): void {
  void sync.remove('watchlists', id);
}
