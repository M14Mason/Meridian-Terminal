// Function code registry (9.4). Every panel registers here. Codes are short and terminal-like.
import type { FunctionDef } from './types';

const F = (
  code: string,
  title: string,
  description: string,
  o: Partial<FunctionDef> & { milestone: string; category: string },
): FunctionDef => ({ code, title, description, aliases: [], needsSecurity: false, ...o });

export const FUNCTIONS: FunctionDef[] = [
  // ----- Built (M2) -----
  F('HELP', 'Function list', 'Search every function code. Also opens with ? or F1.', {
    aliases: ['FUNC', 'MENU'], milestone: 'M2', category: 'System',
    load: () => import('./panels/HelpPanel'), size: { w: 20, h: 26 },
  }),
  F('SET', 'Settings', 'Theme, devices, keys, sync, usage, export and import.', {
    aliases: ['SETTINGS', 'PREF'], milestone: 'M2', category: 'System',
    load: () => import('./panels/SettingsPanel'), size: { w: 22, h: 32 },
  }),
  F('HLTH', 'Data health', 'Status, latency and freshness of every data source.', {
    aliases: ['HEALTH', 'STATUS'], milestone: 'M2', category: 'System',
    load: () => import('./panels/HealthPanel'), size: { w: 20, h: 18 },
  }),
  F('NOTE', 'Sticky notes', 'Notes per ticker, synced across devices.', {
    aliases: ['NOTES'], milestone: 'M2', category: 'Tools', needsSecurity: false,
    load: () => import('./panels/NotesPanel'), size: { w: 16, h: 16 },
  }),
  F('ABOU', 'About and notices', 'Disclaimer, data sources and third-party licenses.', {
    aliases: ['ABOUT', 'LEGAL'], milestone: 'M2', category: 'System',
    load: () => import('./panels/AboutPanel'), size: { w: 18, h: 18 },
  }),

  // ----- M3 Data and charts -----
  F('GP', 'Chart', 'Price chart with indicators, drawings and multi-timeframe.', { needsSecurity: true, milestone: 'M3', category: 'Charts', mobileTab: 'charts', size: { w: 30, h: 28 }, load: () => import('../panels/ChartPanel') }),
  F('GIP', 'Intraday chart', 'Today, 5-minute bars with session VWAP.', { needsSecurity: true, milestone: 'M3', category: 'Charts', size: { w: 30, h: 28 }, load: () => import('../panels/ChartPanel') }),
  F('HP', 'Price history', 'Historical prices table with CSV export.', { needsSecurity: true, milestone: 'M3', category: 'Equity', size: { w: 22, h: 26 }, load: () => import('../panels/HistoryPanel') }),
  F('DES', 'Description', 'Company profile, key stats and identifiers.', { needsSecurity: true, milestone: 'M3', category: 'Equity', size: { w: 22, h: 32 }, load: () => import('../panels/DescriptionPanel') }),
  F('COMP', 'Compare', 'Performance vs a benchmark.', { needsSecurity: true, milestone: 'M3', category: 'Equity', size: { w: 28, h: 26 }, load: () => import('../panels/ComparePanel') }),
  F('BETA', 'Beta', 'Regression beta vs a benchmark.', { needsSecurity: true, milestone: 'M3', category: 'Equity', size: { w: 26, h: 22 }, load: () => import('../panels/BetaPanel') }),
  F('TRA', 'Total return', 'Price plus dividends.', { needsSecurity: true, milestone: 'M3', category: 'Equity', size: { w: 26, h: 24 }, load: () => import('../panels/TotalReturnPanel') }),
  F('BQ', 'Watchlist', 'Live quotes for your watchlists.', { aliases: ['W', 'WATCH'], milestone: 'M3', category: 'Markets', mobileTab: 'markets', size: { w: 22, h: 22 }, load: () => import('../panels/WatchlistPanel') }),
  F('WEI', 'World indices (ETF proxies)', 'Index dashboard built on ETF proxies, labeled as proxies.', { milestone: 'M3', category: 'Markets', size: { w: 24, h: 34 }, load: () => import('../panels/WeiPanel') }),
  F('MOST', 'Most active', 'Most active, gainers and losers.', { aliases: ['MOV'], milestone: 'M3', category: 'Markets', size: { w: 18, h: 26 }, load: () => import('../panels/MostPanel') }),
  F('MCHT', 'Multi-chart', 'Chart grid with synced crosshair.', { milestone: 'M3', category: 'Charts', size: { w: 36, h: 30 }, load: () => import('../panels/MultiChartPanel') }),

  // ----- M4 News and filings -----
  F('N', 'Top news', 'Market-wide headlines with latency badges.', { aliases: ['NEWS', 'TOP'], milestone: 'M4', category: 'News', mobileTab: 'news', size: { w: 30, h: 34 }, load: () => import('../panels/NewsPanel') }),
  F('CN', 'Company news', 'Headlines for one security with sentiment.', { needsSecurity: true, milestone: 'M4', category: 'News', size: { w: 30, h: 30 }, load: () => import('../panels/NewsPanel') }),
  F('CF', 'Filings', 'SEC filings: 10-K, 10-Q, 8-K, Form 4, 13F and more.', { needsSecurity: true, milestone: 'M4', category: 'Filings', size: { w: 28, h: 28 }, load: () => import('../panels/FilingsPanel') }),
  F('FA', 'Financials', 'Statements from SEC XBRL company facts.', { needsSecurity: true, milestone: 'M4', category: 'Filings', size: { w: 34, h: 26 }, load: () => import('../panels/FinancialsPanel') }),
  F('INS', 'Insider trades', 'Form 4 transactions.', { needsSecurity: true, milestone: 'M4', category: 'Filings', size: { w: 30, h: 28 }, load: () => import('../panels/InsiderPanel') }),
  F('HDS', 'Holders (LIMITED)', '5%+ owners from Schedule 13D and 13G filings.', { needsSecurity: true, milestone: 'M4', category: 'Filings', size: { w: 26, h: 22 }, load: () => import('../panels/HoldersPanel') }),
  F('ECO', 'Economic calendar', 'Upcoming US data releases (FRED release dates).', { aliases: ['WECO'], milestone: 'M4', category: 'Macro', size: { w: 26, h: 28 }, load: () => import('../panels/CalendarPanel') }),
  F('ERN', 'Earnings calendar', 'Upcoming earnings.', { milestone: 'M4', category: 'Calendars', size: { w: 30, h: 30 }, load: () => import('../panels/CalendarPanel') }),
  F('BDVD', 'Dividends', 'Upcoming ex-dividend dates, or one ticker\'s history (AAPL BDVD).', { milestone: 'M4', category: 'Calendars', size: { w: 26, h: 28 }, load: () => import('../panels/CalendarPanel') }),
  F('IPO', 'IPO calendar', 'Upcoming and recent IPOs.', { milestone: 'M4', category: 'Calendars', size: { w: 32, h: 24 }, load: () => import('../panels/CalendarPanel') }),

  // ----- M5 Macro and heatmaps -----
  F('HEAT', 'Macro heatmaps', 'US, G7 and global heatmaps with data age on every cell.', { milestone: 'M5', category: 'Macro', mobileTab: 'maps', size: { w: 36, h: 40 }, load: () => import('../panels/HeatPanel') }),
  F('SECT', 'Sector heatmap (ETF proxies)', 'US sector performance from Select Sector SPDR funds.', { milestone: 'M5', category: 'Markets', size: { w: 30, h: 24 }, load: () => import('../panels/SectorPanel') }),
  F('YCRV', 'Yield curve', 'Treasury curve with animated history.', { aliases: ['GC'], milestone: 'M5', category: 'Macro', size: { w: 30, h: 34 }, load: () => import('../panels/YieldCurvePanel') }),
  F('FXC', 'Currency matrix', 'Indicative FX cross rates. Not executable.', { milestone: 'M5', category: 'FX', size: { w: 36, h: 26 }, load: () => import('../panels/FxPanel') }),
  F('BTC', 'Bitcoin', 'Bitcoin price, chart and news.', { milestone: 'M5', category: 'Crypto', size: { w: 30, h: 36 }, load: () => import('../panels/BitcoinPanel') }),
  F('CRYP', 'Crypto sectors', 'Crypto sector heatmap.', { milestone: 'M5', category: 'Crypto', size: { w: 30, h: 26 }, load: () => import('../panels/CryptoSectorsPanel') }),

  F('SER', 'Economic series', 'Chart any FRED series, for example UNRATE SER. Opened from HEAT rows.', {
    needsSecurity: true, milestone: 'M5', category: 'Macro', size: { w: 28, h: 24 }, load: () => import('../panels/SeriesPanel'),
  }),

  // ----- M6 Tanker map -----
  F('TNKR', 'Tanker map', 'AIS tanker positions, chokepoints and dark-ship alerts.', { aliases: ['SHIP', 'AIS'], milestone: 'M6', category: 'Maps' }),

  // ----- M7 Analytics -----
  F('EQS', 'Screener', 'Equity screener and pattern scanner.', { milestone: 'M7', category: 'Analytics' }),
  F('BT', 'Backtester', 'Strategy backtests with drawdown and Sharpe.', { milestone: 'M7', category: 'Analytics' }),
  F('OMON', 'Options chain', 'Delayed options chain (LIMITED).', { needsSecurity: true, milestone: 'M7', category: 'Options' }),
  F('OSA', 'Option calculator', 'Greeks, payoff diagrams and spreads.', { milestone: 'M7', category: 'Options' }),
  F('MC', 'Monte Carlo', 'Price path simulation.', { milestone: 'M7', category: 'Quant' }),
  F('EF', 'Efficient frontier', 'Portfolio optimization.', { milestone: 'M7', category: 'Quant' }),
  F('BRDH', 'Breadth', 'Advance/decline, percent above 200-day, McClellan.', { milestone: 'M7', category: 'Markets' }),
  F('SI', 'Short interest', 'FINRA short interest and fails-to-deliver.', { needsSecurity: true, milestone: 'M7', category: 'Market structure' }),
  F('ANR', 'Analyst ratings', 'Free-source ratings (LIMITED).', { needsSecurity: true, milestone: 'M7', category: 'Equity' }),
  F('EE', 'Estimates', 'Free-source estimates (LIMITED).', { needsSecurity: true, milestone: 'M7', category: 'Equity' }),
  F('JRNL', 'Trade journal', 'Journal with tags and stats, synced.', { milestone: 'M7', category: 'Tools' }),

  // ----- M8 AI -----
  F('ASK', 'Ask (AI search)', 'Plain-English search and screener. Shows the parsed query first.', { milestone: 'M8', category: 'AI' }),
  F('PRED', 'Predictions', 'Model ranges and probabilities with inputs and track record.', { needsSecurity: true, milestone: 'M8', category: 'AI' }),
  F('VAL', 'Valuation', 'Code DCF and multiples next to the AI opinion.', { needsSecurity: true, milestone: 'M8', category: 'AI' }),
  F('SCOR', 'Scoreboard', 'Prediction hit rate, Brier score and calibration.', { milestone: 'M8', category: 'AI' }),
  F('BRIF', 'Morning brief', 'Daily AI brief.', { aliases: ['BRIEF'], milestone: 'M8', category: 'AI' }),

  // ----- M9 to M11 -----
  F('SPLC', 'Supply chain', '3D supplier and customer graph from SEC filings.', { needsSecurity: true, milestone: 'M9', category: 'Maps' }),
  F('PORT', 'Portfolio', 'Robinhood portfolio, read only.', { milestone: 'M10', category: 'Portfolio', mobileTab: 'portfolio' }),
  F('ALRT', 'Alerts', 'Price, news, filing and system alerts.', { milestone: 'M11', category: 'Tools' }),
];

const byCode = new Map<string, FunctionDef>();
for (const f of FUNCTIONS) {
  byCode.set(f.code, f);
  for (const a of f.aliases) byCode.set(a, f);
}

export function findFunction(codeOrAlias: string): FunctionDef | undefined {
  return byCode.get(codeOrAlias.toUpperCase());
}

export function isBuilt(f: FunctionDef): boolean {
  return Boolean(f.load);
}
