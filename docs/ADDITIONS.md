# Owner additions (2026-10-19)

Requested by the owner after M5. Same rules as docs/BUILD_PROMPT.md: free data only, view only, no order or paper-trading code, "Model estimate. Not financial advice." on every signal and model output. Build these inside M7 (analytics), M8 (AI) and M11 (alerts) unless noted.

## Navigation (M7, first)

* **Launchpad (LP, also the `Menu` key on the top bar):** categorized function browser: Markets, Equity, Filings, Macro, Hedge Fund, Investors, Quant and Risk, Options, Maps, AI, System. Search box, keyboard navigation, favorites (star), recently used.
* **Preset workspaces:** one click loads a layout: Markets Overview, Equity Research, Macro Morning, Hedge Fund Desk, Investor Tracker, Quant Lab, Shipping and Commodities. Per device, saved like other layouts.
* **Favorites bar:** starred functions as chips under the command line (synced in settings).
* Everything still reachable by command line and HELP.

## Ideas list (all approved)

1. Insider cluster-buy alert: 3 or more insiders with open-market buys (Form 4 code P) within 10 days. Panel `CLUS` plus alert type.
2. Superinvestor tracker: 13F holdings by fund, quarter over quarter changes. Panel `GURU` (see list below).
3. Alert when price crosses a drawn chart line (GP drawings plus M11 engine).
4. Post-earnings drift stats per ticker (`PEAD`): average 1, 5, 20 day moves after beats and misses.
5. FOMC statement diff (`FOMC`): word diff between consecutive statements, optional AI tone note.
6. SEC comment letters (`CORR`): CORRESP and UPLOAD filings per company.
7. Short squeeze radar (`SQZ`): FINRA short interest, IBKR borrow fee, relative volume.
8. Natural gas weather link (`NGW`): NOAA heating and cooling degree days with EIA storage and Henry Hub.
9. Market event calendar (`MEVT`): monthly options expiration, quad witching, index rebalance dates, Fed blackout windows (computed).

## Hedge fund toolkit (M7)

Strategies, each as a backtest in the backtester (BT) with a clear rule card, plus a live signal screen:

* Cross-sectional momentum (12-1 month), short-term reversal, time-series trend following (CTA style on ETFs: equity, bond, gold, oil, dollar), dual momentum.
* Mean reversion (RSI and Bollinger), pairs and statistical arbitrage (cointegration scanner, z-score), sector rotation.
* Value (earnings yield and book from SEC XBRL), quality (ROE, margins, accruals), low volatility, small-cap tilt; simple multi-factor composite.
* Post-earnings announcement drift, insider following, 13F cloning (with 45-day filing lag stated), short squeeze screen.
* Event driven: merger arbitrage tracker (deals from 8-K item 1.01 and DEFM14A / S-4; spread from the owner-entered offer price, labeled), spin-offs (Form 10-12B), index add and delete dates.
* Risk parity and volatility targeting allocation, all-weather style ETF mix (labeled as an approximation, not any firm's product).

Risk and portfolio tools:

* Factor exposure (market, size, value, momentum, quality using ETF factor proxies, labeled), beta hedge calculator, correlation clustering.
* VaR and CVaR (historical and parametric), stress tests replaying 2008, 2020 COVID crash, 2022 rate shock on any list of holdings.
* Liquidity check (position vs average daily volume, IEX caveat), drawdown analytics, return attribution, crowding score (how many tracked superinvestors hold it).
* Position sizing, Kelly, risk of ruin, efficient frontier, Monte Carlo (catalog items 36 to 49).

## Superinvestor portfolios (GURU)

13F holdings from SEC EDGAR (free). Shown with the filing quarter and the 45-day lag. CUSIP to ticker via OpenFIGI (free, POST lookup allowlisted in the proxy). Initial list, CIKs verified against EDGAR at build time: Berkshire Hathaway (Buffett), Pershing Square (Ackman), Scion (Burry), Bridgewater (Dalio), Renaissance Technologies, Duquesne Family Office (Druckenmiller), Appaloosa (Tepper), Baupost (Klarman), Third Point (Loeb), Greenlight (Einhorn), Tiger Global, Coatue, Elliott, Icahn, Soros Fund, Citadel, Two Sigma, ARK Invest (Wood), Himalaya (Li Lu), Lone Pine, Viking, Gates Foundation Trust, Markel, Akre, Fundsmith. Owner can add any CIK.

Views: holdings with weights, new and exited positions, biggest adds and trims, sector mix, overlap between funds, "most held by tracked funds" consensus list, cloning backtest.

Limits stated in the UI: 13F covers long US equity and some options only; no shorts, no cash, no non-US; data is up to 45 days after quarter end.

## Claude Model Portfolio (CMP), owner clarified 2026-10-19

The owner wants a portfolio that Claude itself picks and manages, like an AI fund manager. Build in M8:

* Claude (claude-sonnet-5-5 via the proxy, Opus only if the owner asks) selects 15 to 30 US stocks or ETFs and weights from a code-computed candidate table (valuation from XBRL, momentum, quality, volatility, macro regime). Claude must cite only numbers present in the input table (16.3); schema-validated output.
* Every position has a short written thesis and the inputs it used. Monthly rebalance (scheduled job), each change logged with reasoning and a prompt version. Strategy version history (item 131).
* Hypothetical tracking from its start date vs SPY and a 60/40 ETF mix, shown on the AI scoreboard (16.5) with drawdown, hit rate and sample-size warnings.
* Labeled "Hypothetical model portfolio. Model estimate. Not financial advice." No orders, not tailored to the owner's finances, never says the owner should buy or sell. Cost per rebalance shown before running (2.10).

## Rules-based Meridian index (MODEL)

Also keep a transparent rules-only factor index (no AI) as a baseline for CMP, so Claude's picks can be compared with a simple systematic strategy.
