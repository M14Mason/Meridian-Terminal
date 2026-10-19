// One-click preset workspaces (owner additions). Each builds a full desktop layout.
import { newId, type Layout } from './layout';

type Slot = [code: string, x: number, y: number, w: number, h: number, security?: string];

export interface Preset {
  id: string;
  name: string;
  description: string;
  slots: Slot[];
  /** Panels that follow the same ticker share this link color. */
  linked?: boolean;
}

export const PRESETS: Preset[] = [
  { id: 'markets', name: 'Markets Overview', description: 'World ETF proxies, watchlist, movers, sectors and top news.', slots: [['WEI', 0, 0, 16, 34], ['BQ', 16, 0, 16, 18], ['SECT', 16, 18, 16, 16], ['MOST', 32, 0, 16, 18], ['N', 32, 18, 16, 16]] },
  { id: 'equity', name: 'Equity Research', description: 'Chart, description, financials, news and filings, all linked to one ticker.', linked: true, slots: [['GP', 0, 0, 28, 26, 'AAPL'], ['DES', 28, 0, 20, 26, 'AAPL'], ['FA', 0, 26, 28, 20, 'AAPL'], ['CN', 28, 26, 20, 20, 'AAPL']] },
  { id: 'macro', name: 'Macro Morning', description: 'US macro heatmap, yield curve, calendar and currencies.', slots: [['HEAT', 0, 0, 22, 44], ['YCRV', 22, 0, 26, 24], ['ECO', 22, 24, 13, 20], ['FXC', 35, 24, 13, 20]] },
  { id: 'hedge', name: 'Hedge Fund Desk', description: 'Superinvestors, insider clusters, screener, strategy backtests and risk.', slots: [['GURU', 0, 0, 24, 24], ['CLUS', 24, 0, 24, 24], ['EQS', 0, 24, 24, 22], ['BT', 24, 24, 24, 22]] },
  { id: 'investors', name: 'Investor Tracker', description: 'Famous investors\' 13F portfolios, insider buying and 5% owners.', linked: true, slots: [['GURU', 0, 0, 28, 30], ['CLUS', 28, 0, 20, 30], ['INS', 0, 30, 24, 18, 'AAPL'], ['HDS', 24, 30, 24, 18, 'AAPL']] },
  { id: 'quant', name: 'Quant Lab', description: 'Backtester, Monte Carlo, efficient frontier and risk.', slots: [['BT', 0, 0, 28, 28], ['MC', 28, 0, 20, 28], ['EF', 0, 28, 24, 20], ['RISK', 24, 28, 24, 20]] },
  { id: 'shipping', name: 'Shipping and Commodities', description: 'Tanker map, oil prices and macro context.', slots: [['TNKR', 0, 0, 34, 40], ['SER', 34, 0, 14, 20, 'DCOILWTICO'], ['SER', 34, 20, 14, 20, 'DCOILBRENTEU']] },
];

export function buildPreset(p: Preset): Layout {
  const panels: Layout['panels'] = {};
  const frames: Layout['frames'] = [];
  p.slots.forEach(([code, x, y, w, h, security], i) => {
    const id = newId('p');
    panels[id] = { id, code, security, link: p.linked && security ? 'amber' : null };
    frames.push({ id: newId('f'), x, y, w, h, tabs: [id], active: id, minimized: false, maximized: false, locked: false, z: i + 1 });
  });
  return { panels, frames, focused: frames[0]?.id ?? null };
}
