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
  F('LP', 'Launchpad', 'Every function by section, favorites, recent and preset workspaces. Also the MENU button or F2.', {
    aliases: ['LAUNCH'], milestone: 'M7', category: 'System',
    load: () => import('./Launchpad'), size: { w: 30, h: 36 },
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
  F('HEAT', 'Macro heatmaps', 'US, G7 and global heatmaps with data age on every cell.', { milestone: 'M5', category: 'Macro', size: { w: 36, h: 40 }, load: () => import('../panels/HeatPanel') }),
  F('SECT', 'Sector heatmap (ETF proxies)', 'US sector performance from Select Sector SPDR funds.', { milestone: 'M5', category: 'Markets', size: { w: 30, h: 24 }, load: () => import('../panels/SectorPanel') }),
  F('YCRV', 'Yield curve', 'Treasury curve with animated history.', { aliases: ['GC'], milestone: 'M5', category: 'Macro', size: { w: 30, h: 34 }, load: () => import('../panels/YieldCurvePanel') }),
  F('FXC', 'Currency matrix', 'Indicative FX cross rates. Not executable.', { milestone: 'M5', category: 'FX', size: { w: 36, h: 26 }, load: () => import('../panels/FxPanel') }),
  F('BTC', 'Bitcoin', 'Bitcoin price, chart and news.', { milestone: 'M5', category: 'Crypto', size: { w: 30, h: 36 }, load: () => import('../panels/BitcoinPanel') }),
  F('CRYP', 'Crypto sectors', 'Crypto sector heatmap.', { milestone: 'M5', category: 'Crypto', size: { w: 30, h: 26 }, load: () => import('../panels/CryptoSectorsPanel') }),

  F('SER', 'Economic series', 'Chart any FRED series, for example UNRATE SER. Opened from HEAT rows.', {
    needsSecurity: true, milestone: 'M5', category: 'Macro', size: { w: 28, h: 24 }, load: () => import('../panels/SeriesPanel'),
  }),

  // ----- M6 Tanker map -----
  F('TNKR', 'Tanker map', 'AIS tanker positions, chokepoints and dark-ship alerts.', { aliases: ['SHIP', 'AIS'], milestone: 'M6', category: 'Maps', mobileTab: 'maps', size: { w: 48, h: 40 }, load: () => import('../panels/TankerPanel') }),

  // ----- M7 Analytics -----
  F('EQS', 'Screener', 'Screen every NYSE and Nasdaq stock on valuation, quality and growth.', { milestone: 'M7', category: 'Analytics', size: { w: 44, h: 40 }, load: () => import('../panels/ScreenerPanel') }),
  F('BT', 'Backtester', 'Hedge fund strategy library with costs, shuffle test, parameter heatmap and walk-forward.', { aliases: ['BACKTEST'], milestone: 'M7', category: 'Hedge Fund', size: { w: 34, h: 40 }, load: () => import('../panels/BacktestPanel') }),
  F('OMON', 'Options chain', 'Delayed options chain (LIMITED).', { needsSecurity: true, milestone: 'M7', category: 'Options', size: { w: 36, h: 34 }, load: () => import('../panels/OptionsPanels') }),
  F('OSA', 'Option calculator', 'Greeks, implied vol, multi-leg payoff builder (spreads, covered calls, condors).', { milestone: 'M7', category: 'Options', size: { w: 30, h: 30 }, load: () => import('../panels/OptionsPanels') }),
  F('MC', 'Monte Carlo', 'Price path simulation.', { milestone: 'M7', category: 'Quant', size: { w: 26, h: 26 }, load: () => import('../panels/QuantPanels') }),
  F('EF', 'Efficient frontier', 'Portfolio optimization.', { milestone: 'M7', category: 'Quant', size: { w: 30, h: 24 }, load: () => import('../panels/QuantPanels') }),
  F('BRDH', 'Breadth', 'Advance/decline line, McClellan oscillator, percent above 20 and 50 day averages.', { milestone: 'M7', category: 'Markets', size: { w: 30, h: 40 }, load: () => import('../panels/MarketPanels') }),
  F('SI', 'Short interest', 'FINRA consolidated short interest (twice monthly).', { needsSecurity: true, milestone: 'M7', category: 'Market structure', size: { w: 28, h: 20 }, load: () => import('../panels/SignalsPanels') }),
  F('ANR', 'Analyst ratings', 'Free-source ratings (LIMITED).', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 30, h: 22 }, load: () => import('../panels/EquityTools') }),
  F('EE', 'Estimates', 'Free-source estimates (LIMITED).', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 28, h: 16 }, load: () => import('../panels/EquityTools') }),
  F('JRNL', 'Trade journal', 'Journal with tags and stats, synced.', { milestone: 'M7', category: 'Tools', size: { w: 40, h: 32 }, load: () => import('../panels/ToolPanels') }),

  // ----- M7 additions: hedge fund toolkit, investors, quant, signals (docs/ADDITIONS.md) -----
  F('GURU', 'Superinvestors (13F)', 'Famous investors\' 13F portfolios: holdings, adds, trims, consensus, overlap.', { aliases: ['13F', 'GURUS'], milestone: 'M7', category: 'Investors', size: { w: 30, h: 36 }, load: () => import('../panels/GuruPanel') }),
  F('CLUS', 'Insider cluster buys', '3+ insiders buying on the open market within 10 days (Form 4).', { milestone: 'M7', category: 'Investors', size: { w: 30, h: 30 }, load: () => import('../panels/ClusterPanel') }),
  F('PEAD', 'Post-earnings drift', 'Average moves 1, 5 and 20 days after past earnings beats and misses.', { needsSecurity: true, milestone: 'M7', category: 'Hedge Fund', size: { w: 28, h: 26 }, load: () => import('../panels/EquityTools') }),
  F('SQZ', 'Short squeeze radar', 'Short interest, borrow fee and relative volume ranked together.', { milestone: 'M7', category: 'Hedge Fund', size: { w: 34, h: 36 }, load: () => import('../panels/StructurePanels') }),
  F('MARB', 'Merger arbitrage', 'Pending deals from 8-K and merger proxies with spread to your entered offer price.', { milestone: 'M7', category: 'Hedge Fund', size: { w: 34, h: 32 }, load: () => import('../panels/FilingsIntel') }),
  F('SPIN', 'Spin-offs', 'Form 10 spin-off registrations from EDGAR.', { milestone: 'M7', category: 'Hedge Fund', size: { w: 30, h: 24 }, load: () => import('../panels/FilingsIntel') }),
  F('STRT', 'Strategy library', 'Hedge fund style strategies with rule cards (opens the backtester).', { aliases: ['STRAT'], milestone: 'M7', category: 'Hedge Fund', size: { w: 34, h: 40 }, load: () => import('../panels/BacktestPanel') }),
  F('MODEL', 'Meridian rules index', 'Transparent rules-based factor index, the baseline for the Claude portfolio.', { milestone: 'M7', category: 'Hedge Fund', size: { w: 30, h: 36 }, load: () => import('../panels/ModelPanel') }),
  F('FDIF', '10-K risk factor diff', 'What changed in the risk factors year over year, with tone counts and an AI summary.', { aliases: ['RISKF', 'TONE'], needsSecurity: true, milestone: 'M8', category: 'Filings', size: { w: 34, h: 36 }, load: () => import('../panels/FilingAiPanels') }),
  F('ECS', 'Earnings release summary', 'AI summary of the latest earnings press release (8-K), compared with the previous one.', { aliases: ['CALL'], needsSecurity: true, milestone: 'M8', category: 'Filings', size: { w: 32, h: 30 }, load: () => import('../panels/FilingAiPanels') }),
  F('CMP', 'Claude model portfolio', 'Hypothetical portfolio picked and managed by Claude, tracked vs SPY.', { milestone: 'M8', category: 'AI', size: { w: 40, h: 40 }, load: () => import('../panels/CmpPanel') }),
  F('RISK', 'Risk and stress', 'VaR, CVaR, stress replays (2008, 2020, 2022), liquidity and drawdowns for any list.', { milestone: 'M7', category: 'Risk', size: { w: 30, h: 36 }, load: () => import('../panels/QuantPanels') }),
  F('FACT', 'Factor exposure', 'Market, size, value, momentum and quality betas using factor ETF proxies.', { needsSecurity: true, milestone: 'M7', category: 'Risk', size: { w: 24, h: 18 }, load: () => import('../panels/QuantPanels') }),
  F('SIZE', 'Position sizing', 'Kelly, fixed fractional sizing and risk of ruin calculators.', { aliases: ['KELLY'], milestone: 'M7', category: 'Quant', size: { w: 24, h: 22 }, load: () => import('../panels/QuantPanels') }),
  F('CORM', 'Correlation matrix', 'Correlation heatmap and clusters for any list of tickers.', { milestone: 'M7', category: 'Quant', size: { w: 32, h: 22 }, load: () => import('../panels/QuantPanels') }),
  F('PAIR', 'Pairs scanner', 'Cointegration scan and spread z-scores for pairs.', { milestone: 'M7', category: 'Quant', size: { w: 28, h: 26 }, load: () => import('../panels/QuantPanels') }),
  F('VOLF', 'Volatility forecast', 'GARCH(1,1) volatility forecast and regime detector.', { needsSecurity: true, milestone: 'M7', category: 'Quant', size: { w: 24, h: 18 }, load: () => import('../panels/QuantPanels') }),
  F('RRG', 'Relative rotation', 'Relative rotation graph and sector rotation clock.', { milestone: 'M7', category: 'Quant', size: { w: 30, h: 24 }, load: () => import('../panels/QuantPanels') }),
  F('SEAS', 'Seasonality', 'Average monthly returns and hit rates.', { needsSecurity: true, milestone: 'M7', category: 'Charts', size: { w: 22, h: 20 }, load: () => import('../panels/QuantPanels') }),
  F('GAPS', 'Gap statistics', 'Opening gaps and how often they fill.', { needsSecurity: true, milestone: 'M7', category: 'Charts', size: { w: 22, h: 16 }, load: () => import('../panels/QuantPanels') }),
  F('ORB', 'Opening range', 'Opening range breakout tracker and intraday volume curve.', { needsSecurity: true, milestone: 'M7', category: 'Charts', size: { w: 26, h: 30 }, load: () => import('../panels/ToolPanels') }),
  F('LDR', 'Strategy leaderboard', 'Saved backtests ranked (backtests only, no trading).', { milestone: 'M7', category: 'Quant', size: { w: 34, h: 24 }, load: () => import('../panels/LeaderboardPanel') }),
  F('DCF', 'DCF and WACC', 'Discounted cash flow and cost of capital calculators from SEC data.', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 28, h: 34 }, load: () => import('../panels/EquityTools') }),
  F('RV', 'Relative value', 'Valuation ratios vs peers.', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 34, h: 22 }, load: () => import('../panels/EquityTools') }),
  F('ESH', 'Earnings surprises', 'Earnings surprise history.', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 28, h: 20 }, load: () => import('../panels/EquityTools') }),
  F('OWN', 'Ownership', 'Insiders, 5% owners and superinvestor holders for one company.', { needsSecurity: true, milestone: 'M7', category: 'Investors', size: { w: 30, h: 34 }, load: () => import('../panels/EquityTools') }),
  F('MGMT', 'Management and board', 'Officers and directors from SEC filings.', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 26, h: 28 }, load: () => import('../panels/EquityTools') }),
  F('EVTS', 'Events timeline', 'Filings, earnings, dividends and insider trades on one timeline.', { needsSecurity: true, milestone: 'M7', category: 'Equity', size: { w: 30, h: 34 }, load: () => import('../panels/EquityTools') }),
  F('CIDX', 'Custom index', 'Build and chart your own weighted index.', { milestone: 'M7', category: 'Quant', size: { w: 30, h: 32 }, load: () => import('../panels/ToolPanels') }),
  F('OEXP', 'Expected move', 'Options-implied expected move, IV rank, put/call and max pain (delayed).', { needsSecurity: true, milestone: 'M7', category: 'Options', size: { w: 28, h: 30 }, load: () => import('../panels/OptionsPanels') }),
  F('UOA', 'Unusual options (delayed)', 'Contracts with volume far above open interest. Delayed, not real-time flow.', { milestone: 'M7', category: 'Options', size: { w: 32, h: 26 }, load: () => import('../panels/OptionsPanels') }),
  F('VIXT', 'VIX term structure', 'VIX across maturities and contango or backwardation.', { milestone: 'M7', category: 'Options', size: { w: 26, h: 26 }, load: () => import('../panels/OptionsPanels') }),
  F('SABR', 'SABR calculator', 'Rates volatility model with user parameters. A model, no real data.', { milestone: 'M7', category: 'Options', size: { w: 30, h: 24 }, load: () => import('../panels/OptionsPanels') }),
  F('RVOL', 'Relative volume', 'Stocks trading far above their usual volume.', { milestone: 'M7', category: 'Market structure', size: { w: 28, h: 32 }, load: () => import('../panels/MarketPanels') }),
  F('FTD', 'Fails to deliver', 'SEC fails-to-deliver data.', { needsSecurity: true, milestone: 'M7', category: 'Market structure', size: { w: 28, h: 34 }, load: () => import('../panels/StructurePanels') }),
  F('DPOOL', 'Dark pool and OTC volume', 'FINRA weekly ATS and OTC volume (delayed).', { needsSecurity: true, milestone: 'M7', category: 'Market structure', size: { w: 30, h: 22 }, load: () => import('../panels/SignalsPanels') }),
  F('BORR', 'Borrow rates', 'IBKR short borrow fees and availability (indicative).', { needsSecurity: true, milestone: 'M7', category: 'Market structure', size: { w: 26, h: 32 }, load: () => import('../panels/StructurePanels') }),
  F('ETFH', 'ETF holdings', 'Fund holdings from SEC N-PORT filings, asset and country mix, overlap between two funds.', { needsSecurity: true, milestone: 'M7', category: 'Market structure', size: { w: 32, h: 40 }, load: () => import('../panels/EtfPanels') }),
  F('TMAP', 'Fund holdings treemap', 'Treemap of a fund\'s holdings by weight, colored by today\'s move (for example IVV).', { milestone: 'M7', category: 'Market structure', size: { w: 32, h: 30 }, load: () => import('../panels/EtfPanels') }),
  F('CACT', 'Corporate actions', 'Splits and dividends calendar.', { milestone: 'M7', category: 'Calendars', size: { w: 24, h: 26 }, load: () => import('../panels/SignalsPanels') }),
  F('MEVT', 'Market events', 'Options expiration, quad witching, rebalances, Fed blackout windows.', { milestone: 'M7', category: 'Calendars', size: { w: 30, h: 24 }, load: () => import('../panels/SignalsPanels') }),
  F('CONG', 'Congress trades', 'US House periodic transaction reports, parsed from the Clerk\'s public filings.', { milestone: 'M7', category: 'Investors', size: { w: 40, h: 36 }, load: () => import('../panels/StructurePanels') }),
  F('REAL', 'Real yields', 'TIPS real yields, breakevens, 5y5y forward, dollar and VIX.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 22 }, load: () => import('../panels/FredDashPanel') }),
  F('LIQ', 'Fed liquidity', 'Fed balance sheet, reverse repo, Treasury cash account, net liquidity.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 24 }, load: () => import('../panels/FredDashPanel') }),
  F('CPIB', 'CPI breakdown', 'CPI components year over year.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 24 }, load: () => import('../panels/FredDashPanel') }),
  F('JOBS', 'Jobs drilldown', 'Payrolls by sector, unemployment, wages, claims.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 36 }, load: () => import('../panels/FredDashPanel') }),
  F('CRED', 'Credit spreads', 'Investment grade and high yield spreads by rating.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 22 }, load: () => import('../panels/FredDashPanel') }),
  F('RECS', 'Recession dashboard', 'Curve inversion, Sahm rule, claims, LEI-style signals.', { milestone: 'M7', category: 'Macro', size: { w: 28, h: 28 }, load: () => import('../panels/FredDashPanel') }),
  F('MMKT', 'Money markets', 'SOFR, EFFR, T-bills, repo.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 22 }, load: () => import('../panels/FredDashPanel') }),
  F('AUCT', 'Treasury auctions', 'Recent auction results: yields, bid-to-cover, indirect share.', { milestone: 'M7', category: 'Macro', size: { w: 34, h: 30 }, load: () => import('../panels/SignalsPanels') }),
  F('INV', 'Oil inventories', 'EIA weekly crude, gasoline and distillate stocks.', { milestone: 'M7', category: 'Macro', size: { w: 28, h: 26 }, load: () => import('../panels/EnergyPanel') }),
  F('NGS', 'Natural gas storage', 'EIA weekly storage vs 5-year range, with weather link.', { aliases: ['NGW'], milestone: 'M7', category: 'Macro', size: { w: 28, h: 30 }, load: () => import('../panels/EnergyPanel') }),
  F('GRID', 'Power grid', 'EIA electricity demand and generation mix.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 30 }, load: () => import('../panels/EnergyPanel') }),
  F('CROP', 'Crop reports', 'USDA crop progress and condition.', { milestone: 'M7', category: 'Macro', size: { w: 22, h: 14 }, load: () => import('../panels/SignalsPanels') }),
  F('GOVC', 'Government contracts', 'Federal contract awards by company (USAspending).', { needsSecurity: true, milestone: 'M7', category: 'Signals', size: { w: 32, h: 26 }, load: () => import('../panels/SignalsPanels') }),
  F('FOMC', 'FOMC statement diff', 'Word-by-word changes between Fed statements.', { milestone: 'M7', category: 'Macro', size: { w: 34, h: 36 }, load: () => import('../panels/SignalsPanels') }),
  F('HURR', 'Hurricanes', 'Active storms near refineries and crops (NOAA).', { milestone: 'M7', category: 'Signals', size: { w: 30, h: 20 }, load: () => import('../panels/SignalsPanels') }),
  F('FIRE', 'Wildfires and drought', 'NASA FIRMS fires and the US Drought Monitor.', { milestone: 'M7', category: 'Signals', size: { w: 26, h: 30 }, load: () => import('../panels/SignalsPanels') }),
  F('QUAK', 'Earthquakes', 'USGS earthquakes near major industrial regions.', { milestone: 'M7', category: 'Signals', size: { w: 32, h: 30 }, load: () => import('../panels/SignalsPanels') }),
  F('SAT', 'Satellite view', 'Sentinel-2 images of ports and storage (10 m, about every 5 days).', { milestone: 'M7', category: 'Signals', size: { w: 36, h: 34 }, load: () => import('../panels/SatPanel') }),
  F('WIKI', 'Attention spikes', 'Wikipedia pageview spikes by company.', { needsSecurity: true, milestone: 'M7', category: 'Signals', size: { w: 28, h: 18 }, load: () => import('../panels/SignalsPanels') }),
  F('PAT', 'Patents', 'PARTIAL: pre-filled patent searches for a company (Google Patents, USPTO).', { needsSecurity: true, milestone: 'M7', category: 'Signals', size: { w: 26, h: 20 }, load: () => import('../panels/LinkPanels') }),
  F('TRIAL', 'Clinical trials', 'Trials by sponsor (ClinicalTrials.gov).', { needsSecurity: true, milestone: 'M7', category: 'Signals', size: { w: 32, h: 30 }, load: () => import('../panels/SignalsPanels') }),
  F('LOBB', 'Lobbying', 'Lobbying spend by company (Senate LDA).', { needsSecurity: true, milestone: 'M7', category: 'Signals', size: { w: 26, h: 16 }, load: () => import('../panels/SignalsPanels') }),
  F('PMKT', 'Prediction markets', 'Prediction market odds on macro and political events.', { milestone: 'M7', category: 'Signals', size: { w: 32, h: 36 }, load: () => import('../panels/SignalsPanels') }),
  F('SOCL', 'Social pulse', 'Bluesky mentions of tickers (no stability promise).', { milestone: 'M7', category: 'Signals', size: { w: 30, h: 32 }, load: () => import('../panels/SocialPanel') }),
  F('CORR', 'SEC comment letters', 'SEC staff letters questioning a company\'s filings.', { needsSecurity: true, milestone: 'M7', category: 'Filings', size: { w: 26, h: 22 }, load: () => import('../panels/FilingsIntel') }),
  F('FORMD', 'Private raises', 'Form D private placements (filed within 15 days).', { milestone: 'M7', category: 'Filings', size: { w: 30, h: 30 }, load: () => import('../panels/FilingsIntel') }),
  F('FLAG', 'Filing red flags', 'Late filings, auditor changes, restatements, going-concern language.', { milestone: 'M7', category: 'Filings', size: { w: 30, h: 30 }, load: () => import('../panels/FilingsIntel') }),
  F('DIL', 'Buybacks and dilution', 'Share count trend, buybacks and stock comp from XBRL.', { needsSecurity: true, milestone: 'M7', category: 'Filings', size: { w: 32, h: 18 }, load: () => import('../panels/EquityTools') }),
  F('CDS', 'Credit stress', 'Financial stress indices, corporate spreads and bank lending (single-name CDS is not free).', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 24 }, load: () => import('../panels/FredDashPanel') }),
  F('RE', 'Real estate', 'House prices, commercial real estate, mortgages, prepayment S-curve.', { milestone: 'M7', category: 'Macro', size: { w: 28, h: 34 }, load: () => import('../panels/FredDashPanel') }),
  F('FRT', 'Freight', 'Cass, truck tonnage, rail carloads and freight prices.', { milestone: 'M7', category: 'Macro', size: { w: 26, h: 24 }, load: () => import('../panels/FredDashPanel') }),
  F('ESG', 'ESG records', 'PARTIAL: pre-filled EPA, OSHA, FEC and SEC record searches for a company.', { needsSecurity: true, milestone: 'M7', category: 'Signals', size: { w: 26, h: 20 }, load: () => import('../panels/LinkPanels') }),
  F('TICK', 'Tick data lab', 'PARTIAL: links to IEX HIST free tick files and their specification.', { milestone: 'M7', category: 'Quant', size: { w: 26, h: 20 }, load: () => import('../panels/LinkPanels') }),
  F('TV', 'Live TV link', 'Opens a public business TV stream in a new tab (no embedding).', { milestone: 'M7', category: 'News', size: { w: 20, h: 10 }, load: () => import('../panels/SignalsPanels') }),
  F('GLOS', 'Glossary', 'Plain-English definitions; also shown when you hover table headers.', { aliases: ['GLOSSARY', 'DEF'], milestone: 'M12', category: 'Tools', size: { w: 30, h: 34 }, load: () => import('../panels/MiscPanels') }),
  F('QCMP', 'Quote comparison (LIMITED)', 'The same stock\'s price from each free source, side by side.', { needsSecurity: true, milestone: 'M12', category: 'Equity', size: { w: 30, h: 14 }, load: () => import('../panels/MiscPanels') }),
  F('CONC', 'Customer concentration', 'Companies whose filings name a customer at 10% or more of revenue.', { milestone: 'M12', category: 'Filings', size: { w: 34, h: 30 }, load: () => import('../panels/MiscPanels') }),
  F('RPT', 'PDF report', 'Export the current panels as a PDF report.', { milestone: 'M12', category: 'Tools', size: { w: 24, h: 14 }, load: () => import('../panels/MiscPanels') }),

  // ----- M8 AI -----
  F('ASK', 'Ask (AI search)', 'Plain-English search and screener. Shows the parsed query first.', { milestone: 'M8', category: 'AI', size: { w: 30, h: 22 }, load: () => import('../panels/AskPanel') }),
  F('PRED', 'Predictions', 'Model ranges and probabilities with inputs and track record.', { needsSecurity: true, milestone: 'M8', category: 'AI', size: { w: 30, h: 34 }, load: () => import('../panels/AiPanels') }),
  F('VAL', 'Valuation', 'Code DCF and multiples next to the AI opinion.', { needsSecurity: true, milestone: 'M8', category: 'AI', size: { w: 40, h: 34 }, load: () => import('../panels/AiPanels') }),
  F('SCOR', 'Scoreboard', 'Prediction hit rate, Brier score and calibration.', { milestone: 'M8', category: 'AI', size: { w: 34, h: 28 }, load: () => import('../panels/AiPanels') }),
  F('BRIF', 'Morning brief', 'Daily AI brief.', { aliases: ['BRIEF'], milestone: 'M8', category: 'AI', size: { w: 30, h: 30 }, load: () => import('../panels/AiPanels') }),

  // ----- M9 to M11 -----
  F('SPLC', 'Supply chain', '3D supplier and customer graph from SEC filings.', { needsSecurity: true, milestone: 'M9', category: 'Maps', size: { w: 40, h: 44 }, load: () => import('../panels/SupplyPanel') }),
  F('PORT', 'Portfolio', 'Robinhood portfolio, read only.', { milestone: 'M10', category: 'Portfolio', mobileTab: 'portfolio', size: { w: 40, h: 44 }, load: () => import('../panels/PortfolioPanel') }),
  F('ALRT', 'Alerts', 'Price, news, filing and system alerts.', { milestone: 'M11', category: 'Tools', size: { w: 40, h: 36 }, load: () => import('../panels/AlertsPanel') }),
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
