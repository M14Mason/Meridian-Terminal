# MERIDIAN TERMINAL: BUILD PROMPT FOR CLAUDE CODE (v1)

This file is the single source of truth. Read ALL of it before writing any code. Nothing in it is optional unless it says so. If something here conflicts with your own preference, this file wins. If something is unclear or unverified, follow section 24 (Verify List) instead of guessing.

> Repo note (added at build start, 2026-10-18): the owner created the GitHub repo as `M14Mason/Meridian-Terminal` (public). Wherever this file says `meridian-terminal`, the real repo name is `Meridian-Terminal`, read from `src/config.ts`.

## 0. HOW TO USE THIS FILE

0.1 The owner starts or resumes work by typing the single word: build. When you receive "build", read this file, read BUILD_STATUS.md, and continue from the last unfinished milestone. Build until the whole app is done or you are blocked by something only the owner can do.

0.2 First session only:

* Create `CLAUDE.md` in the repo root. Copy sections 1, 2, 3, 5, 6 and 22 of this file into it so every future session loads the rules automatically.
* Copy this whole file into the repo as `docs/BUILD_PROMPT.md`.
* Create `BUILD_STATUS.md` (format in section 23).

0.3 Usage limits can interrupt you at any time. Therefore:

* Work in milestones (section 23). After EVERY milestone: run lint, type-check, tests and build, fix failures, commit with a clear message, push, and update BUILD_STATUS.md.
* Never leave the main branch in a broken state. Use short-lived branches only if useful, but merge before stopping.
* Keep BUILD_STATUS.md accurate at all times so a brand new session can resume with no memory of this one.

0.4 Ask the owner a question ONLY when blocked by a missing account, key, approval, or a decision this file does not cover. Batch questions. Never ask for secrets in chat (section 2).

## 1. PRODUCT SUMMARY

Name: Meridian Terminal (working title; repo name `meridian-terminal`). The owner may rename it later, so keep the name in ONE config constant.

What it is: A personal, Bloomberg-style market terminal web app. It is hosted on GitHub Pages, works fully on desktop and phone from day one, and is fully AI-assisted. It combines live and delayed market data, charts, technical analysis, macro heatmaps, news, SEC filings, a live tanker map, a supply chain map covering every NYSE and Nasdaq company, an AI layer (search, explain, predictions, valuation), a prediction scoreboard, and the owner's Robinhood portfolio (read only).

Who uses it: ONE person (the owner), on a MacBook, a Windows PC and an iPhone. Personal use only. Never public, never commercial.

Money rules: Budget for data, hosting and tools is $0. The ONLY thing the owner pays for is Claude API credits. No paid data plans, no paid hosting, no paid SMS. Free tiers only.

View only: The app never places trades. Not real, not paper. Order tools are hard-blocked (section 6 and 17).

Look: Default theme looks like the classic Bloomberg Terminal default: amber characters on a black background, dense, keyboard-first. The owner wants it "exactly like" that default as far as free assets allow. Also a modern dark theme and a light theme, switchable.

## 2. HARD RULES (NEVER VIOLATE)

2.1 No secrets in the repo, ever. The repo is PUBLIC (free GitHub Pages). No API keys, tokens, passwords, emails of third parties, portfolio data, or personal data in code, config, commits, issues, logs or build output. Add a pre-commit secret scan (for example gitleaks) and a CI check that fails on secrets.

2.2 No secrets in the browser. No API key may ship in frontend code or be stored on a device. All keys live only server side (section 5 and 6).

2.3 Never print, log, echo or commit a secret, including in CI logs. Mask them.

2.4 View only. No order placement code paths anywhere. The Robinhood proxy allowlist blocks every non-read tool. The Alpaca proxy exposes market data and news endpoints only, never account or order endpoints.

2.5 Never create accounts or enter the owner's credentials for them. If an account, key or login is needed, stop and give the owner exact click-by-click steps (section 4).

2.6 No Bloomberg branding. Never use the words "Bloomberg" or "Bloomberg Terminal" in the UI, page title, repo, or marketing text, and never use Bloomberg logos, the chiclet mark, or copied artwork. Look and feel inspiration (amber on black, dense panels, command line) is fine for private use. Code comments and docs may mention it for reference only.

2.7 Respect every provider's terms. Never scrape a site whose terms forbid automated access. Always send a descriptive User-Agent where required. Respect rate limits. Cache aggressively. See section 22.

2.8 No financial advice. Every AI prediction, valuation and signal carries a visible label: "Model estimate. Not financial advice." Predictions show reasoning, inputs and a track record (section 16).

2.9 Deleting files needs two confirmations from the owner. Never delete the owner's files without asking twice. (Normal refactors inside the repo are fine.)

2.10 Spend safety. No cap on Claude credits was chosen, but: before ANY paid bulk job (supply chain extraction, batch jobs), print a token and dollar estimate and wait for the owner's typed approval. Show a visible warning banner on usage spikes (section 16.9). Automated news-triggered AI jobs have a daily limit (section 15.8).

2.11 Do not guess. If a fact is unverified, check the primary source or follow section 24.

## 3. OWNER PROFILE AND HOW TO COMMUNICATE

3.1 The owner is a student and a self-directed developer interested in stock trading and technical analysis. They want a fully AI-built app. They will study the code later, so keep short comments on complex parts, but do not slow the build for teaching.

3.2 Communication rules (follow in every message to the owner):

* Begin every response with a one or two sentence executive summary.
* Be direct and concise. Short, punchy paragraphs. No robotic tone.
* Call out directly when you think the owner is wrong. Challenge assumptions and strategies with trade-offs, lead with a recommendation, never default to agreement.
* Use bullet points for any list of three or more items.
* Bold technical terms on first mention.
* NO em dashes anywhere (messages, comments, docs, UI text).
* Alert the owner the second something has risks or could cause a loss (data, money, privacy, account).
* Do not hedge risks. State them plainly.
* Prefer specific data over vague claims. Double check facts.
* Simple questions get short answers. Do not waste tokens or credits.
* Never delete the owner's files without two confirmations.

3.3 Product rule: tell the owner clearly when a feature is delayed, partial, estimated or unavailable. Never present a proxy as the real thing (for example ETF-based index proxies must be labeled as proxies).

## 4. ACCOUNTS AND OWNER TASKS (YOU CANNOT DO THESE)

The owner already has: an Anthropic API key and an Alpaca account with a data key.

The owner must create or do (give them numbered, click-by-click steps, tell them what to paste where, and never ask them to paste secrets into chat):

1. GitHub repo named `meridian-terminal`, public, empty (owner may choose another name; read it from config). Enable GitHub Pages with source = GitHub Actions. Authorize you to push.
2. Cloudflare account (free). Run `wrangler login` locally. Create a Worker, a KV namespace, and (if needed) Durable Objects. Verify the owner's own email as an Email Routing destination address (for alert emails). Store Worker secrets with `wrangler secret put` (the owner types them locally; never in chat).
3. Free API keys to request: FRED, EIA, Finnhub, AISStream, USDA NASS (if used), PatentsView (if used), Copernicus Data Space (if used), FINRA API (if used), Reddit app for non-commercial use (if used). Alpaca: strongly recommend using the paper trading account's keys for market data. Market data works the same and a leaked paper key cannot move real money.
4. Anthropic API key: stored only as a Worker secret and as a GitHub Actions encrypted secret (batch jobs only).
5. Setup secret for first device pairing: a long random string the owner sets as a Worker secret (`SETUP_SECRET`). Generate one for them with instructions, never display it again.
6. SEC User-Agent contact: SEC requires a descriptive User-Agent with contact info. Ask the owner which name and email to use. Store as a Worker variable, not in the repo.
7. Robinhood: owner signs in on Robinhood's own page during OAuth. Remind them to turn ON trade approval for agent actions in Robinhood and to check that the account owner is fine with the connection (the owner is a student and the account may be custodial or co-managed).
8. Anthropic Console: recommend (not require) a monthly spend limit as a backstop.

## 5. ARCHITECTURE

5.1 Frontend: static site on GitHub Pages. React + Vite + TypeScript. Built and deployed by GitHub Actions. Base path configurable. Client-side routing must work on Pages (hash routing or 404 fallback).

5.2 Proxy backend: Cloudflare Worker on the free plan, called "the proxy". Responsibilities: hold all keys, add auth headers to upstream calls, enforce per-provider allowlists, cache, rate limit, CORS, pairing and sessions, sync storage, alert email sending, usage metering, Robinhood MCP client, Claude API calls. Storage: Cloudflare KV (and Durable Objects only if needed and available on the free plan).

5.3 Batch and scheduled jobs: GitHub Actions workflows for heavy or slow work: AIS snapshot fallback, monthly supply chain refresh, large data caches, scoreboard scoring. Workflows may use repository secrets (encrypted) but must never echo them. Output goes into the repo as static JSON ONLY if the data is public-safe (public filings, public market data). Never commit portfolio, notes, journal, or sync data.

5.4 Provider adapter layer: one TypeScript module per data provider, all returning a normalized shape. The app never calls a provider directly from UI components. Swapping a provider changes one file. Each adapter declares: base URL, auth method, rate limit, natural update cadence, cache TTL, license/terms note, free-tier limits, and how it fails.

5.5 Rate limit scheduler: a central token-bucket scheduler per provider. Each data source refreshes at its OWN natural speed (owner's rule: if a source only changes 6 times a minute, poll every 10 seconds; match each source individually and keep it balanced). When limits conflict, prioritize what is on screen, then alerts, then background caches. Back off exponentially on errors. Show data age on every panel.

5.6 Caching: edge cache in the proxy (Cache API/KV with TTLs), plus IndexedDB in the browser. Use stale-while-revalidate and always label staleness.

5.7 Never call upstream from many clients at once: the proxy coalesces identical requests.

5.8 Offline mode: the app opens with cached data when offline and shows an "offline, cached at HH:MM" banner (feature 133).

## 6. SECURITY, PAIRING, KEYS

6.1 Single owner, many devices. No accounts. Devices pair to the proxy.

6.2 First device: owner opens the site, enters the `SETUP_SECRET` once. The proxy verifies it and issues a long-lived device token (random 256-bit, stored hashed in KV). Rate limit setup attempts and lock out after repeated failures.

6.3 Adding another device (the owner's choice: six-digit code typed on the new device):

* On a paired device: Settings > Devices > "Add device" creates a six-digit code.
* Code rules: expires in 3 minutes, single use, stored hashed, max 5 wrong attempts per code then the code is destroyed, global rate limit on code attempts, constant-time comparison, no code reuse.
* New device types the code, receives its own device token.
* Settings > Devices lists devices (name, last seen) with revoke buttons. Revoking invalidates the token at once.
* Show a visible warning that six digits are short, so codes expire fast.

6.4 No lock screen otherwise. The owner declined a password lock, but the proxy MUST reject every request without a valid device token. The public site shows only a pairing screen when unpaired. This is what stops strangers from reading notes or burning credits.

6.5 API keys in the app (owner's choice): the owner enters a key once in Settings > Keys and presses Save. Rules:

* The key is sent over HTTPS to the proxy and stored encrypted in KV (AES-GCM with a key from a Worker secret). Never stored on the device. Never displayed again (write-only; show only "saved, last 4 characters").
* Keys sync across devices automatically because the proxy holds them.
* Provide "replace" and "delete" for each key. Deleting needs two confirmations.
* If the owner prefers dashboard-set secrets, support both: dashboard secrets take priority.

6.5.1 Alpaca keys can place orders. The proxy ONLY forwards to Alpaca market data and news hosts and paths on an allowlist. Block everything else.

6.6 Proxy hardening: strict CORS to the Pages origin, CSP headers on the site (no inline scripts if avoidable), input validation, per-device rate limits, request size limits, no open relay (allowlist upstream hosts and paths), generic error messages, structured logs without secrets, replay protection on pairing.

6.7 Robinhood allowlist: the proxy only forwards MCP tool calls whose names are on an explicit READ allowlist (for example portfolio, accounts, positions, balances, quotes, order history, tax lots, watchlists). Anything that creates, cancels, places, exercises, updates, adds, removes, follows or declines is blocked and logged. Block by default. Never rely on a name prefix alone.

6.8 Supply chain of the code itself: pin dependency versions, enable Dependabot, run `npm audit` in CI, no postinstall scripts from unknown packages.

## 7. SYNC AND STORAGE

7.1 Synced across devices (owner's choice): watchlists, saved screens, alerts, notes, trade journal, chart drawings, settings (including theme and keys metadata).

7.2 NOT synced: panel layouts and workspaces (per device). Still save layouts locally per device with names.

7.3 Model: per-item records with `updatedAt` and a device id. Last write wins per item. Keep a small tombstone for deletes. Offline edits queue in IndexedDB and flush when online.

7.4 Size limits: keep each KV value small (shard large lists). Watch free-tier KV limits (verify, section 24).

7.5 Privacy: sync data and portfolio snapshots exist ONLY in the proxy storage and device caches. Never in the repo.

7.6 Export/import: JSON export of all synced data from Settings (owner backup). Import validates schema.

## 8. DATA LAYER AND SOURCE CATALOG

All free. Verify each provider's CURRENT terms and limits at build time (section 24). Record findings in `docs/DATA_SOURCES.md` (limits, cadence, terms, date checked).

8.1 Prices and quotes: Alpaca market data (free plan is real time from the IEX exchange only; paid all-exchange feed is out of scope), Finnhub (free tier 60 calls per minute, free WebSocket limited), Massive (formerly Polygon, free Stocks Basic: 5 calls per minute, end of day, about 2 years history). Label IEX data as single-venue so volume-based indicators are flagged as approximate.

8.2 Fundamentals and filings: SEC EDGAR (free, no key, 10 requests per second maximum, declared User-Agent required, IP blocks if abused). Use XBRL "company facts" for financial statements; submissions API for filings; Form 4, 13F, 8-K, 10-K, 10-Q, Form D, Form 25.

8.3 Macro: FRED (free key), EIA open data (free key), BLS, BEA, Treasury, NY Fed, Chicago Fed (CARTS), Atlanta Fed GDPNow, Philadelphia Fed Survey of Professional Forecasters, OECD SDMX API (no key, 38 members), IMF DataMapper (no key, updated twice a year), World Bank (no key), ECB data portal, Eurostat, Frankfurter/ECB reference FX rates.

8.4 News: see section 12.

8.5 Ships: AISStream (section 14).

8.6 Crypto (limited scope): Bitcoin price and history, crypto sector heatmap, Bitcoin news. Use CoinGecko free (verify limits, roughly 50 requests per minute) and an ETF/crypto-sector proxy only if needed. Nothing else crypto.

8.7 Commodities and energy: EIA (WTI, Brent, Henry Hub, weekly stocks, gasoline, diesel, natural gas storage, grid data), World Bank Pink Sheet (monthly), Drewry World Container Index (free weekly page), OilPriceAPI free tier (about 200 requests per month, personal use) for freight indexes where Drewry's page is not machine friendly.

8.8 Other free sources used by panels: IBKR public short-stock FTP file (borrow fees and availability), IEX HIST (free T+1 historical tick files, nanosecond timestamps, trailing 12 months), DTCC and ISDA SwapsInfo (CDS and swap aggregates), FINRA (short interest, OTC/ATS weekly volume), SEC FTD files, Fannie Mae Data Dynamics and Freddie Mac loan-level data (non-commercial), FHFA house price index, Sentinel-2 via Copernicus Data Space, NOAA, USGS, NASA FIRMS, US Drought Monitor, USAspending, TreasuryDirect, USPTO PatentsView, ClinicalTrials.gov, Senate LDA lobbying, Wikimedia pageviews, Bluesky Jetstream, Reddit (non-commercial app), GDELT, Open data for ESG inputs (EPA ECHO, OSHA, FEC, SEC).

8.9 Do not use: NewsAPI.org (dev only), X/Twitter API (paid), paid vendors, scraping sites that forbid it (for example EMMA, Stock Titan), unofficial Robinhood APIs, Bloomberg data in any form, any source requiring a paid license.

## 9. UI SHELL

9.1 Themes (switchable in Settings, synced):

* Classic (default): black `#000000` background, amber primary text, brighter orange accents, green up and red down, bright blue for links and secondary highlights, thin hairline panel borders. Starting palette (third-party approximations, NOT official; tune by eye): background `#000000`, panel `#0a0a0a`, amber `#ffb800`, orange `#fa7900`, up green `#00c805`-style, down red `#ff3b30`-style, blue `#4aa3ff`, hairline `#262626`. Dense, compact, monospaced numbers.
* Modern dark: near-black `#0b0b0b` canvas, lifted panels, one accent, rounded corners, calmer.
* Light: high-contrast light theme.
* Theme switching changes tokens only, never layout or information density. Define all colors as CSS variables. Support a color-blind-safe alternative for up/down (blue/orange) in Settings.
* Do NOT build a "green terminal" theme (owner removed item 128).

9.2 Font: one self-hosted free monospace (JetBrains Mono or IBM Plex Mono, whichever looks closest to the real terminal, and decide by comparing screenshots), Latin subset only, WOFF2, `font-display: swap`, preloaded, with a system monospace fallback stack. Tabular figures for all numbers. Keep total font payload as small as possible (owner asked for least loading).

9.3 Desktop layout: free resizable grid. Any number of panels. Add, remove, drag, resize, snap to grid, minimize, maximize, tab-stack, duplicate, and lock. Each panel has a header with: title, command code, link-color chip (feature 115, linked panels follow the same ticker), data-age badge, an "Explain" button (AI), and a menu. Save named layouts per device. Pop-out a panel into its own browser window (feature 117) with state shared through BroadcastChannel.

9.4 Command line (always visible at top): type a ticker plus a function code, like `AAPL GP`, or just a function code, like `ECO`. Autocomplete for tickers and functions, fuzzy match, arrow key selection, history (up/down), Enter runs it (shown as GO). `?` or F1 opens help and a searchable function list. Function codes are a registry: every panel registers `code`, `aliases`, `description`, `args`, `needsSecurity`. Use short Bloomberg-like codes where natural (for example GP chart, HP history table, DES description, FA financials, CN company news, N news, CF filings, EQS screener, ALRT alerts, PORT portfolio, WEI indices, ECO calendar, MOST movers, FXC currencies, COMP compare, BETA, TRA total return, ANR analyst ratings, EE estimates, SPLC supply chain, TNKR tanker map, HEAT heatmaps, ASK AI search). Keyboard shortcuts everywhere. Cheat sheet overlay (feature 129).

9.5 Phone layout (owner's choice): bottom tab bar, one panel at a time. Tabs: Markets, Charts, News, Maps, Portfolio, plus a More tab for everything else and a command bar sheet. Large touch targets, swipe between tabs, pull to refresh, safe-area insets for iPhone, no horizontal scroll, 16px side gutters, works at 360px width and up. Panels adapt: heatmaps, charts and maps are touch-first (pinch, drag). Install as a PWA (manifest, icons, service worker) so it can be added to the iPhone home screen. Fully functional on phone from the first deploy.

9.6 Accessibility and polish: keyboard navigation, focus rings, ARIA roles for the grid and command line, `prefers-reduced-motion` respected, color-blind option, minimum contrast on all themes.

9.7 Ticker tape (feature 116) across the top, toggleable.

## 10. MOTION AND 3D: GSAP, THREE.JS, WEBGL EVERYWHERE

The owner wants the app highly interactive, especially the supply chain. ("WebGL" is what the owner meant; use Three.js for WebGL. Do not require WebGPU.)

10.1 Libraries: GSAP (animation), Three.js (3D and WebGL), plus helpers as needed (three-forcegraph or d3-force-3d for the 3D graph, three-globe or custom for globes, deck.gl or custom shaders for large point and heatmap layers, MapLibre GL for maps). Verify GSAP's current license terms before use (section 24). Lazy-load every heavy library by route or panel.

10.2 Where to use GSAP: panel open, close, drag, snap and maximize transitions; theme crossfade; command line suggestions; number tickers and flash-on-change for prices; tab transitions on phone; toasts and alert banners; list reorders; scoreboard counters; chart overlay entrances; loading skeletons; hover and press micro-interactions; staggered reveals; timelines for the animated yield curve history and the chart replay mode; camera moves in 3D scenes.

10.3 Where to use Three.js/WebGL:

* Supply chain: a 3D force-directed network (company nodes, supplier and customer edges, node size by market cap, edge thickness by relationship size, color by sector and by relationship type). Click a node to fly the camera to it, expand its neighbors, open a detail drawer. Animated particles flowing along edges showing direction of goods or money. Toggle to a 3D globe view that places facilities, ports and headquarters on the globe with arcs between supplier and customer locations. Hover shows what is made or bought and where. Click shows source filing links. Filters: sector, relationship type, confidence, tier depth (1 to 3 hops), country. Time slider to replay when relationships were reported. Shock propagation animation: pick a company, simulate a disruption and animate the impact upstream and downstream.
* Tanker map: WebGL points or instanced meshes for ships on MapLibre/deck.gl or a globe, heading arrows, trails, chokepoint glow with counters, dark-ship alert pulses, tilt and rotate.
* Macro and sector heatmaps: WebGL shader heatmaps and treemaps with animated morphs between periods and metrics, hover tooltips, country polygons on a globe and a flat map.
* 3D analytics: Treasury yield curve surface over time, implied volatility surface, correlation matrix as 3D bars, efficient frontier and Monte Carlo fan with GPU particles, sector rotation clock as an animated orbit.
* Background: optional subtle animated depth background (off in Low power mode).

10.4 Guardrails (mandatory):

* Browsers limit WebGL contexts (and phones allow fewer). Use ONE shared renderer where possible (scissor viewports) or cap concurrent contexts; dispose geometries, materials and textures on unmount; handle context loss and restore.
* 60 fps target on desktop, 30 fps floor on phone. Add an FPS governor that lowers pixel ratio, particle counts and effects automatically.
* Low power mode (auto on battery saver or weak GPU, and a manual toggle) and `prefers-reduced-motion`: disable particles and heavy animation, use static fallbacks.
* Feature-detect WebGL 2. If unavailable, show a 2D fallback (SVG or Canvas) for every 3D view.
* Keep initial bundle small. Code-split all 3D and map code. Show skeletons while loading.
* Large data (thousands of nodes) uses instancing, level of detail, and server-side or worker-side layout (Web Workers/OffscreenCanvas where supported). Never block the main thread.
* Interactions must also work by touch.

## 11. PANEL AND FEATURE CATALOG (BUILD ALL)

Numbers match the owner's list. Items marked LIMITED depend on free-tier coverage: build them with what is free, label limits in the panel.

Core terminal (from earlier lists): command line with autocomplete; free resizable grid; saved layouts (per device); index dashboard (WEI) built on ETF proxies and labeled as proxies; most active, gainers and losers (MOST); watchlist with live quotes (BQ); currency matrix (FXC, indicative); crypto limited scope; economic calendar (ECO, WECO); earnings, dividend (BDVD) and IPO calendars; description page (DES); price history table (HP); charts (GP) with indicators, drawing tools and multi-timeframe; compare vs benchmark (COMP); beta (BETA); total return (TRA); financial statements from SEC XBRL (FA); DCF and WACC calculators; filings (CF) including Form 4 insider trades and 13F holdings; company news (CN) with sentiment; analyst ratings (ANR) and estimates (EE) limited to free data; screener (EQS) and pattern scanner; backtester with drawdown and Sharpe ratio; alerts (ALRT); portfolio lite (PORT) with P&L, allocation, correlation matrix and basic VaR; CSV export; JS helper functions that act like data-point and history formulas for exports.

Charts and technical analysis: 1 Heikin Ashi; 2 Renko; 3 Point and figure; 4 Volume profile; 5 Anchored VWAP; 6 Ichimoku cloud; 7 Keltner and Donchian channels; 8 Supertrend; 9 Auto Fibonacci; 10 Auto support and resistance zones; 11 Candlestick pattern recognizer; 12 RSI divergence detector; 13 Pivot points; 14 Seasonality; 15 Chart replay mode; 16 Multi-chart grid with synced crosshair; 17 Relative rotation graph; 18 Opening range breakout tracker; 19 Gap fill statistics; 20 Intraday volume curve vs average; 21 Saved chart annotations (synced); 22 Log and percent scale toggles; 23 Correlation heatmap; 24 Pairs spread chart with z-score; 25 Market profile (TPO).

Options (LIMITED, free delayed data only): 26 Options chain viewer; 27 Option calculator with Greeks; 28 Payoff diagram builder; 29 Expected move; 30 IV rank and percentile; 31 Put/call ratio; 32 Max pain estimator; 33 Spread and covered call builder; 34 Volatility smile; 35 VIX term structure. Real-time options flow and sweeps are NOT available free: build a delayed "unusual activity" scanner that flags contracts with high volume relative to open interest from a free permitted delayed chain source, and label it delayed. Do not show OPRA data in any way that needs a redistributor license beyond personal use; read terms first.

Quant and risk: 36 Monte Carlo simulator; 37 Efficient frontier; 38 Kelly calculator; 39 Position size calculator; 40 Risk of ruin; 41 Walk-forward testing; 42 Parameter optimizer heatmap; 43 Shuffle test for overfitting; 44 Slippage and fee modeler; 45 Pairs trading cointegration scanner; 46 Factor exposure; 47 Market regime detector; 48 Volatility forecast (GARCH); 49 Strategy leaderboard (backtests only); 50 Trade journal with tags and stats (synced); 51 AI critic that reviews the journal. Heavy math runs in Web Workers.

Market structure and breadth: 52 Advance/decline line; 53 Percent above 200-day average; 54 McClellan oscillator; 55 Sector heat map; 56 Index treemap by market cap (label it by the tracking fund, for example "SPY holdings", never "S&P 500"); 57 Relative volume scanner; 58 Short interest (FINRA, twice monthly); 59 Fails-to-deliver (SEC); 60 Dark pool and OTC weekly volume (FINRA, delayed); 61 ETF holdings explorer (from SEC N-PORT filings); 62 ETF overlap checker; 63 ETF flow estimates; 64 Congress trade tracker (only if a free, permitted official source exists, otherwise omit and note why); 65 Corporate actions calendar; 66 Events timeline per stock; 67 Custom index builder; 68 Sector rotation clock.

Macro and commodities: 69 Treasury yield curve with animated history; 70 Real yields and breakevens; 71 Fed balance sheet and liquidity; 72 Reverse repo and Treasury General Account; 73 Credit spread tracker (free series only; check history limits); 74 Recession probability dashboard; 75 CPI component breakdown; 76 Jobs report drilldown; 77 Oil and gasoline inventories (EIA weekly); 78 Natural gas storage; 79 Crop reports (USDA); 80 Electricity grid load and prices (EIA); 81 Government contracts by company (USAspending); 82 Treasury auction results; 83 World map of GDP and inflation; 84 Money market rates dashboard. Plus the macro heatmaps (section 13).

Real-world signals: 85 Hurricane tracker for refineries and crops (NOAA); 86 Drought and wildfire map; 87 Earthquake alerts near factories (USGS); 88 Flight tracker and corporate jets (only if OpenSky or another source's terms clearly allow personal use, otherwise omit and note why); 89 Low-resolution satellite view of ports and storage (Sentinel-2, 10 m, about every 5 days; label limits); 90 Reddit sentiment (non-commercial app only; personal use); 91 Wikipedia pageview spikes; 92 Google Trends spikes (only through a permitted official route; if none, omit and note why); 93 Patent filing tracker; 94 FDA decision calendar (find a permitted free source; otherwise omit and note); 95 Clinical trial tracker; 96 Court case tracker (verify a free permitted source); 97 Lobbying spend by company; 98 Prediction market odds overlay (verify terms); 99 LNG carrier and container ship layers on the AIS map.

Crypto (limited): crypto sector heatmap, Bitcoin price and chart, Bitcoin news. NOTHING else. (Owner removed items 100 to 106.)

Filings intelligence: 107 10-K year-over-year diff; 108 Risk factor change detector; 109 Management tone analysis; 110 Earnings call summarizer (free transcript source such as API Ninjas where available, plus 8-K press releases; transcripts arrive hours later, label it; live audio is out of scope); 111 Buyback and dilution tracker; 112 Customer concentration alerts; 113 Late filing and auditor change alerts; 114 Going-concern warning scanner.

Interface and learning: 115 Color-linked panels; 116 Ticker tape; 117 Multi-monitor pop-outs; 118 Sticky notes per ticker (synced); 119 Learn mode that explains every panel; 121 Glossary on hover; 122 Auto daily morning brief (AI, cheap model); 123 Plain-English screener (AI); 124 Voice commands (Web Speech API where supported; degrade gracefully); 125 Sound alerts by event type; 126 Mobile companion view (this is the phone layout); 127 PDF report export; 129 Keyboard cheat sheet overlay; 131 Strategy version history; 132 Data health panel (every source: status, latency, last success, rate-limit headroom); 133 Offline mode with cached data.

More terminal-style pages: 134 Top news dashboard; 135 Intraday graph; 136 All-venue quote comparison (LIMITED, mostly single-venue; label it); 137 Relative value table; 138 Management and board page; 139 Earnings surprise history; 140 Insider and institutional ownership page.

Dedicated big features: live news with latency badges (12); macro heatmaps (13); tanker map (14); supply chain map (15); AI layer and scoreboard (16); portfolio (17); alerts (18).

## 12. NEWS

12.1 Sources (free): Alpaca News API (Benzinga; real time over WebSocket, history back to 2015; free-plan rate limits, verify current terms; note it carries Benzinga's own editorial and not full press release coverage), Finnhub news (60 calls per minute free, ticker tagging, sentiment; verify whether the news WebSocket is free), SEC EDGAR 8-K filings (companies file earnings and major events here, which fills the press release gap), GDELT (world news every 15 minutes, free, cite GDELT), official RSS feeds from the Fed, Treasury and BLS (verify URLs and terms), Marketaux free tier (100 requests per day) as a backup, plus Bitcoin news sources (free and permitted only).

12.2 Latency badge on every headline: show how old each headline is when the app first received it ("received 12s after publish"). Show a banner explaining that free feeds are slower than paid ones.

12.3 Copyright rule: show headline, source, timestamp and a link only. Never store or display full article text.

12.4 Features: per-ticker news, market-wide feed, filters, keyword alerts, sentiment scoring (use provider scores; use the cheap AI model only if needed and cached), de-duplication, source badges.

12.5 Do not scrape Stock Titan, EMMA or any site that forbids automated access. Link out instead.

## 13. MACRO HEATMAPS

13.1 Three scopes behind a toggle (owner wants all three): US (FRED, BLS, BEA, EIA, Fed, Chicago Fed CARTS, Treasury, FHFA), G7 (OECD SDMX API, FRED international series, ECB/Eurostat), Global major economies (IMF DataMapper and World Bank).

13.2 Metrics: GDP growth, inflation, unemployment, policy and long rates, yield spread, retail spending, housing, energy and commodity prices, trade, debt, PMI where free.

13.3 Every cell shows data age and source (IMF updates twice a year and World Bank data is often annual; label it so the owner is never misled). Never fake freshness.

13.4 WebGL heatmap and treemap views with animated morphs between metrics and time periods, plus flat map and globe country polygons (use public domain Natural Earth data, no tile server needed for the globe).

13.5 Also include sector heatmaps for equities and the crypto sector heatmap.

13.6 Hover tooltips, click to open the underlying series chart, compare countries, percentile coloring, "surprise vs nowcast" overlay using GDPNow and the Philadelphia Fed survey (free consensus substitute for item "economist surveys").

## 14. TANKER MAP

14.1 Data: AISStream (free WebSocket, global AIS; free key; terms: personal and non-commercial use, fair use; verify). Subscribe by bounding box and ship type to keep the stream small. In the AIS standard, ship type codes 80 to 89 are tankers. Message types: positions and static data.

14.2 Live relay: try a Cloudflare Worker or Durable Object relay that holds the AISStream key and streams to paired devices. TEST EARLY whether the free plan can hold the long-lived WebSocket and fan-out (section 24).

14.3 Owner-approved fallback if the relay cannot run free: a GitHub Actions workflow runs on a schedule (every few minutes; GitHub's scheduler is not exact, verify the minimum interval), connects to AISStream briefly with the key from an encrypted GitHub secret, collects positions for the chosen regions, and commits a small public-safe snapshot file. The app then reads snapshots and clearly labels the map "snapshot, not live, updated HH:MM". Do not call it live in that mode.

14.4 Three views (owner wants all three): (a) global tankers only (default), (b) chokepoints only, (c) all ships, which loads ONLY the visible region (viewport bounding box) to protect the free tier.

14.5 Chokepoints: Strait of Hormuz, Suez Canal, Bab el-Mandeb, Strait of Malacca, Panama Canal, Turkish Straits (Bosporus and Dardanelles), Danish Straits, Strait of Gibraltar, Cape of Good Hope, English Channel, Taiwan Strait, Lombok and Sunda Straits. Show a rolling 24 hour crossing counter per chokepoint and IMF PortWatch weekly transit counts where available (verify access).

14.6 Features: ship type filters (crude, products, LNG, LPG, chemical), vessel detail drawer (name, MMSI, IMO, flag, destination as broadcast, speed, course, draught if present), trails, heading arrows, dark-ship alerts (AIS gap over 60 minutes in monitored regions), congestion at ports, LNG carrier and container ship layers (feature 99), oil price overlay (WTI and Brent from EIA) so tanker traffic can be compared with prices, freight indices (Drewry WCI, Baltic indices if the license allows personal use).

14.7 Honest limits shown in the UI: AIS destination is self-reported, cargo is not broadcast, coverage thins offshore, free updates lag by minutes, ships can switch AIS off.

14.8 Sanctions context: optional layer using OpenSanctions non-commercial data only if the terms allow personal use; otherwise omit.

## 15. SUPPLY CHAIN MAP (BIGGEST VISUAL FEATURE)

15.1 Goal: pick any stock and see who it sells to and buys from, as an interactive 3D graph and globe (section 10.3), with what is traded and where, and a source filing link on every relationship.

15.2 Universe (owner's choice): every company listed on the NYSE and Nasdaq. Domestic operating companies number about 3,700 and foreign listings about 1,500 by one count (roughly 6,300 listings by another count that includes ETFs and funds). Skip ETFs, funds, warrants and shells. Build the ticker universe from SEC and exchange lists. Store universe size and skip reasons.

15.3 Model (owner's choice): extraction runs in the initial build phase using Claude Opus 5.5 (`claude-opus-5-5`). Use the Batch API (about half price) with prompt caching. Verify current Opus pricing at platform.claude.com/docs/en/about-claude/pricing before running.

15.4 COST GATE (mandatory, risk alert for the owner): my rough estimate for about 5,000 companies at about 30,000 input tokens and about 1,000 output tokens each is hundreds of dollars on Opus (a source says Opus costs about double Sonnet's $2 and $10 per million tokens; so roughly $350 with Batch to $700 without). The owner chose Opus and no cap. Therefore: (1) run a small pilot of 20 companies first and report real token use and cost; (2) print a full-run estimate; (3) wait for the owner's typed approval; (4) run in batches with a live cost meter and checkpointed progress so a limit or crash never loses paid results; (5) cache every result permanently.

15.5 Sources of relationships: SEC filings (10-K and 20-F: customer concentration, major customers over 10 percent of revenue, supplier and sourcing disclosures, business description, properties for facility locations, subsidiaries exhibit), 8-Ks, plus the free Vala-Fi beta data as a cross-check seed only if its terms allow. Bloomberg-style coverage is incomplete everywhere, so mark gaps honestly. Do not use any Bloomberg or paid data.

15.6 Schema (one JSON shard per company, plus an index file): ticker, CIK, name, sector, industry, HQ location, facilities (type, address, geocoded lat/lon, source), relationships (counterparty name, ticker if public, type supplier or customer or partner, what is traded (product or service), share of revenue or spend if disclosed, geographies, confidence score, evidence snippet under 15 words, source filing URL and date, period, extraction model and date). Validate with a schema. Reject outputs that cite no source. The extractor must never invent a relationship; if the filing does not say it, leave it out.

15.7 Geocoding: use free geocoders within their usage policies (for example the US Census geocoder for US addresses; Nominatim has strict limits, 1 request per second, no bulk abuse; cache results; verify). Store coordinates in the shard.

15.8 Updates (owner's choice): (a) monthly full refresh of changed filings via a scheduled GitHub Action that checks EDGAR for new 10-K, 10-Q and 8-K filings and re-extracts ONLY companies with new filings; (b) news-triggered updates: when news or an 8-K mentions a new or changed supplier, customer, contract, plant, outage or acquisition involving a covered company, queue a re-extraction for that company only. Use a cheap triage step first (Haiku 5.5) to decide whether the news is relevant, then Opus only on confirmed changes. Safety default (flag to owner): automated news-triggered re-extractions are capped at 25 per day, editable in Settings. Log every automated run with its cost.

15.9 Hosting size: keep shards compact and gzip-friendly; load on demand (index first, then a company shard and its neighbors). Public-safe data only (derived from public filings).

15.10 UI: command `SPLC`. Search any ticker, auto-fly the 3D camera, tier depth control (1 to 3 hops), relationship filters, side drawer with products, locations, revenue exposure, source links and a "disruption simulator" (select a node, mark it disrupted, animate downstream and upstream impact using disclosed revenue shares, label it an estimate). Table view as an accessible alternative. Link the node click to the chart, filings and AI explain panels. Works on phone with touch and a simplified 2D fallback.

15.11 Honesty rules: show confidence and evidence on every edge; mark missing data; never imply completeness.

## 16. AI LAYER

16.1 Where it runs: the proxy calls the Claude API. The key lives only in the proxy (and GitHub encrypted secret for batch jobs).

16.2 Models: `claude-haiku-5-5` for cheap tasks (search parsing, news triage, brief), `claude-sonnet-5-5` for explanations and predictions, `claude-opus-5-5` for supply chain extraction and only where the owner asks. Haiku 5.5 is $0.10 input and $0.50 output per million tokens for prompts up to 100K (higher above); Sonnet 5.5 is $2 and $10; Batch halves rates. Verify before relying on these. Use prompt caching and the Batch API wherever work can wait.

16.3 Rule: code computes, Claude explains. Numbers (valuations, indicators, probabilities inputs, statistics) come from deterministic code and real data. Claude receives those numbers and writes the narrative. Claude must never invent a figure. Every AI answer lists the data it used with timestamps and sources.

16.4 Features chosen by the owner:

* Plain-English search and screener (`ASK`, feature 123): converts a sentence to a structured query (screener filters, chart commands, panel opens), shows the parsed query for confirmation, then runs it with real data.
* Explain-this-panel (header button and learn mode 119): explains what the panel shows, what changed, and why it might matter. Cheap, cached per panel and data hash.
* Predictions: stock price ranges, earnings beat or miss odds, macro releases vs nowcasts, sector and market direction. Horizons toggle: next day, next week, next month, next quarter or earnings date (owner wants all, switchable). Each prediction is a probability or range with stated assumptions and the exact inputs, never a single confident number. Include base rates and a naive baseline for comparison.
* Valuation, side by side (owner's choice): per stock show (a) code-computed valuation (DCF with stated assumptions, peer multiples, analyst targets from free sources) and (b) Claude's opinion, side by side, flag when they disagree, show a verdict as "model says undervalued or overvalued, with range", never as advice.
* Journal critic (51), filings summaries and diffs (107 to 110), morning brief (122).

16.5 Scoreboard (owner's choice): log every prediction (inputs hash, model, prompt version, timestamp, horizon, probabilities). A scheduled scoring job resolves predictions when their horizon ends using real data. Show hit rate, Brier score, calibration chart, performance vs naive baselines and vs a buy-and-hold benchmark, by horizon and by prediction type. Show sample sizes and warn when small.

16.6 Safety: label everything "Model estimate. Not financial advice." Refuse to give personalized buy/sell commands. Never describe a prediction as certain.

16.7 Evaluation: keep a small test set of prompts with expected structure; validate outputs against JSON schemas; retry once on schema failure; fall back to code-only output on repeated failure.

16.8 Caching and cost control: cache by input hash, reuse results, stream long outputs, set max tokens per feature, deduplicate concurrent requests.

16.9 Usage meter (owner chose warning only, no cap): track tokens and estimated dollars per feature and per day in the proxy. Show usage in Settings. If spend in the last hour or day is far above the running average, show a warning banner and send an email alert. The owner declined a hard cap, so do not block features, EXCEPT the automated news-triggered jobs limit in 15.8 and the cost gates in 2.10.

## 17. PORTFOLIO (ROBINHOOD, READ ONLY)

17.1 Official route: Robinhood runs an official Trading MCP server. Connection is OAuth with dynamic client registration; the owner signs in on Robinhood's own page. It can read all of the owner's Robinhood accounts and place trades only in a separate Agentic account. Never use unofficial Robinhood APIs or handle the owner's Robinhood password.

17.2 Owner's choice: the app connects to Robinhood's MCP through the proxy (the proxy is the MCP client and holds the OAuth tokens; tokens encrypted in KV). Refresh hourly during US market hours (Monday to Friday, 9:30 to 16:00 Eastern) using a Cloudflare Cron Trigger (verify free-plan cron limits), store the latest snapshot in KV, and serve it to paired devices. Allow manual "refresh now" with a rate limit.

17.3 TEST FIRST (risk): one hands-on report found Robinhood accepted localhost OAuth callbacks but rejected hosted HTTPS callbacks, while an integration platform lists Robinhood MCP as supported. Test the hosted callback early. If it fails, do not hack around it: switch to the fallback.

17.4 Fallback (owner's choice): the app shows a red "portfolio stale or disconnected" banner on every device and sends an email alert. The owner then says "update the portfolio" to Claude (Claude Code or chat with the Robinhood connector, read only). Claude reads the portfolio through the owner's own connector and POSTs a snapshot to `POST /api/portfolio/snapshot` on the proxy, authenticated with a long admin token stored in a local untracked `.env` (never committed, never in the repo). The endpoint is write-only and stores to KV only. Build the endpoint, an owner-run script `scripts/update-portfolio.md` describing the exact steps, and the stale banner logic.

17.5 Read allowlist (section 6.7). No order tools ever. The owner should turn on trade approval in Robinhood for agent actions.

17.6 Panel: positions, quantities, cost basis, P&L, day change, allocation treemap and sector exposure, beta and concentration, correlation matrix of holdings, VaR (basic), upcoming earnings and dividends for holdings, AI notes about the portfolio (explain only, never advice), valuation overlay (section 16.4), data age and source clearly shown. Handle options and crypto positions only if the read tools return them; otherwise show a note.

17.7 Privacy: portfolio data never leaves the proxy storage and paired devices, never in the repo, never in logs, never sent to third parties other than the Claude API when the owner explicitly uses an AI feature on it (warn once before first use that this sends portfolio text to the AI provider).

17.8 Eligibility and ownership note: the owner is a student. Tell them to confirm with the account owner that connecting is allowed.

## 18. ALERTS AND NOTIFICATIONS

18.1 Alert types: price, percent move, indicator conditions, volume, news keyword, SEC filing, earnings, macro release, data feed failure, portfolio stale or disconnected, usage spike, supply chain event for watched companies, dark-ship or chokepoint anomalies.

18.2 Delivery (owner's choice): in-app banner plus email. Banner shows on any open device. Email goes through Cloudflare Email Service to the owner's VERIFIED destination address (free to verified destination addresses). Verify at setup that sending works on the free plan; if not, fall back to Resend's free tier (about 3,000 emails per month) and tell the owner. No SMS (costs money).

18.3 Evaluation: alerts that must fire while no device is open run in the proxy on a Cron Trigger (verify free-plan limits); client-side alerts also run while the app is open. De-duplicate, cooldowns, quiet hours (configurable), and an alert history log.

18.4 Sound alerts by event type (feature 125) with volume control, off by default on phone.

18.5 Failure drills: simulate a provider outage, a dropped WebSocket and a Worker error and confirm the banner and email appear.

## 19. PARTIAL-ROUTE ITEMS (FROM THE EARLIER "UNBUILDABLE" RESEARCH)

Build the free, legal version of each and label limits. Skip paid ones.

* Delayed unusual options activity: see section 11 options note.
* Estimate revision history: snapshot free consensus estimates daily into storage and chart revisions from the first snapshot forward (no back history).
* Earnings call transcripts: free transcript API where available, arrives hours later; no live audio.
* Corporate bonds and TRACE: show what free delayed data is permitted; otherwise link to FINRA's own site. Do not scrape.
* Municipal bonds: link out to EMMA per CUSIP (its terms ban scraping). No bulk data.
* CDS and swaps: DTCC weekly CDS aggregates and ISDA SwapsInfo averages; single-name CDS spreads are not available free.
* Leveraged loans: use BKLN as a labeled proxy for the loan market.
* Private companies: SEC Form D private raises (filed within 15 days, no business description); GLEIF open legal entity data.
* Real estate and mortgages: FRED commercial real estate price index (quarterly), FHFA house price index, Fannie Mae Data Dynamics, Freddie Mac loan-level data (non-commercial); build a prepayment (CPR) S-curve explorer.
* Commodities: EIA spot and weekly data; World Bank Pink Sheet monthly; label as benchmarks, not intraday assessments.
* Freight indexes: Drewry World Container Index weekly; Baltic indices only if licensing allows personal use.
* FX: indicative quotes (free tier, refresh about every 60 seconds) and ECB reference rates (daily); label clearly as not executable.
* Borrow rates: IBKR public short-stock file (fee rates, rebates, shares available); indicative, IBKR only.
* Consumer spending: Chicago Fed CARTS and the Bank of America Institute Consumer Checkpoint (public reports).
* Satellites: Sentinel-2 (10 m, about 5 day revisit) for ports, mines, farms and wildfires; not fine enough to count cars or tanks.
* Social: Bluesky Jetstream (free firehose, no stability promise) and Reddit (non-commercial); X is paid, skip.
* Index constituents: derive weights from fund SEC N-PORT filings; label by fund, never use the S&P name or marks.
* Credit ratings: SEC Rule 17g-7 rating histories (free, delayed 12 to 24 months) and each agency's public rating action pages by manual link only; no bulk scraping.
* Economist consensus substitute: GDPNow, other Fed nowcasts and the Philadelphia Fed Survey of Professional Forecasters; show "nowcast vs actual" surprise charts.
* Direct feed learning data: IEX HIST free T+1 files for tick-level studies (trailing 12 months), as an optional lab panel, processed offline in Actions or workers.
* Bloomberg TV: a button that opens the public live stream in a new tab or window (free for 15 minutes a day on the site, per the provider). No embedding without a license.
* Swaption and rates volatility: a learning calculator using SABR with user-chosen parameters, clearly labeled as a model with no real data.
* ESG: build your own composite from public records (EPA ECHO, OSHA, FEC, SEC); never copy vendor scores.
* Global fundamentals: use free tiers only (for example FMP free endpoints, SEC for US); label coverage gaps. Standardizing statements across accounting rules is hard; do not pretend it is solved.
* Government releases: poll official release pages and APIs at their scheduled release times as fast as the provider's limits allow. No early-access or lockup tricks.

## 20. EXCLUDED (DO NOT BUILD)

* Any trading, paper trading or order code (so item 130, paper trading leaderboard, is excluded).
* Crypto beyond the sector heatmap, Bitcoin and Bitcoin news (items 100 to 106).
* Items 120 (quiz mode) and 128 (green terminal theme).
* Any paid data: real-time options flow, historical options tick data, paid survivorship-free price feeds, paid ratings, CDS curves, loan prices, private company databases, card spend raw data, daily high-resolution satellite, full social firehose, licensed index data, broker consensus, live earnings audio, dealer FX quotes, institutional compliance and surveillance, order management for funds, colocation, direct exchange real-time feeds, Bloomberg TV embedding, embargoed data lockups.
* Real-time data beyond what free tiers provide.
* Anything that needs a Bloomberg login or Bloomberg data.

## 21. PERFORMANCE, RELIABILITY, TESTING

21.1 Targets: first load under about 3 seconds on a mid phone over 4G for the shell (3D and maps lazy-loaded), 60 fps panels on desktop, 30 fps floor on phone.

21.2 Code-split by panel. Web Workers for heavy math (backtests, GARCH, Monte Carlo, layouts). Virtualize long lists and tables.

21.3 Data health panel (132): per source status, last success, latency, error rate, rate-limit headroom, cache age.

21.4 Error handling: every panel has loading, empty, stale and error states with a retry. One failing provider never breaks the app (error boundaries).

21.5 Testing: unit tests for indicators, scheduler, pairing logic, sync merge, allowlists (assert blocked tools stay blocked), schema validators; integration tests with mocked providers; Playwright smoke tests at desktop and phone viewports; Lighthouse and bundle size checks in CI; a test that fails if any secret pattern appears; WebGL fallback tests.

21.6 Indicator correctness: test each indicator against known reference values.

21.7 Logging: structured, no secrets, no portfolio contents.

21.8 CI: lint, type-check, tests, build, secret scan, dependency audit on every push. Deploy to Pages from main.

## 22. LEGAL AND LICENSING

22.1 Personal use only. Free tiers and several sources (AISStream, Reddit, Freddie Mac, IBKR file, OilPriceAPI, Baltic indices) restrict commercial or public redistribution. Keep a `docs/LICENSES.md` listing each source, its terms link, and the date checked.

22.2 Respect robots and terms. No scraping of EMMA, Stock Titan or similar. SEC: declared User-Agent, 10 requests per second maximum, cache everything.

22.3 Trademarks: no Bloomberg branding; do not use "S&P 500" as a product label for derived data (use fund names); follow TradingView Lightweight Charts attribution requirements; follow MapLibre, Three.js (MIT), GSAP and font (OFL) license terms; include a third-party notices page.

22.4 Data from public filings is derived data; cite sources in the UI.

22.5 The footer and About page state: "Personal research tool. Not financial advice. Data may be delayed, incomplete or wrong."

22.6 If the owner ever wants to share or go public, STOP and tell them that paid redistribution licenses, legal review and possibly adviser registration for any trade signals would be required.

## 23. BUILD PLAN AND PROGRESS FILE

BUILD_STATUS.md format: current milestone, completed milestones with commit hashes, in-progress tasks, blocked items (what the owner must do), unverified items still open, decisions made and why, known bugs, next 5 steps, cost log for any paid AI jobs, and the date of the last update.

Milestones (do in order; commit and update status after each):

* M0 Scaffold: repo structure, Vite + React + TypeScript, lint, tests, CI, Pages deploy, CLAUDE.md, docs folder, secret scanning, config constants (app name, base path, origins).
* M1 Proxy and pairing: Worker, KV, CORS, device pairing (setup secret then six-digit codes), device list and revoke, encrypted key storage, key settings UI (write-only), allowlists, rate limits, usage meter skeleton, health endpoint.
* M2 Shell: themes, font, free grid, command line with registry and autocomplete, phone tab bar, PWA, settings, sync engine (watchlists, saved screens, alerts, notes, journal, drawings, settings), offline cache, error boundaries, data health panel skeleton.
* M3 Data and charts: adapters (Alpaca, Finnhub, Massive, EDGAR, FRED, EIA), scheduler, quotes, watchlist, charts with all indicators and drawing tools, HP, DES, COMP, multi-chart, replay, ticker tape.
* M4 News and filings: news feeds with latency badges, filings panels, FA from XBRL, insider and 13F, calendars, 8-K handling.
* M5 Macro and heatmaps: macro data adapters, US/G7/Global heatmaps (WebGL), sector heatmaps, crypto sector heatmap and Bitcoin, yield curve animation, nowcast overlay.
* M6 Tanker map: AIS relay test, Actions snapshot fallback if needed, three views, chokepoints, dark-ship alerts, ship layers, overlays.
* M7 Analytics: technical, options (delayed), quant and risk panels, backtester, screener, scanners, market structure and breadth panels, real-world signal panels, partial-route panels (section 19).
* M8 AI layer: proxy AI endpoints, ASK, explain, predictions with horizons, valuation side by side, scoreboard, morning brief, journal critic, filings summaries, usage meter and spike alerts.
* M9 Supply chain: universe build, schema, pilot extraction (20 companies), cost gate and owner approval, full Opus Batch extraction with checkpoints, geocoding, 3D graph and globe, disruption simulator, monthly update workflow, news-triggered updates with the daily cap.
* M10 Portfolio: Robinhood MCP client in the proxy with read allowlist, hourly cron, hosted-callback test, fallback endpoint and banner, portfolio panel.
* M11 Alerts: server-side alert engine, email delivery, banners, sounds, history, failure drills.
* M12 Polish: performance pass, Low power mode, accessibility, motion and 3D tuning, test coverage, docs (`README`, `docs/DATA_SOURCES.md`, `docs/LICENSES.md`, `docs/OWNER_SETUP.md`), final owner checklist.

When all milestones pass the Definition of Done (section 25), tell the owner what to verify on a real phone and desktop.

## 24. VERIFY LIST (CHECK BEFORE RELYING; RECORD RESULTS)

1. Cloudflare free plan limits: Workers requests and CPU time, KV reads and writes and storage, Durable Objects availability and WebSocket support on free, Cron Triggers count, Email Service sending to verified destination addresses on the free plan (one doc table suggests outbound sending is unavailable on free while the text says verified-destination sends are free).
2. AISStream current terms, rate limits and coverage; whether the Worker/Durable Object relay is viable free.
3. GitHub Actions scheduled workflow minimum interval and reliability; GitHub Pages requirements for free private vs public repos (assume public).
4. Robinhood MCP: hosted HTTPS OAuth callback acceptance, token refresh behavior, read tool list and exact names, eligibility and age rules, trade approval setting.
5. GSAP license terms for this use; TradingView Lightweight Charts attribution; map tile source with permissive terms and $0 cost (otherwise use Natural Earth vector data rendered in WebGL with no tiles).
6. Alpaca free-plan news and WebSocket symbol limits and terms; Finnhub free WebSocket (trades and news) limits; Massive Basic limits.
7. OECD, IMF, World Bank, FRED, EIA API formats and rate limits; CoinGecko free limits.
8. Terms for: Reddit non-commercial use, OpenSky, Wikipedia API User-Agent policy, CourtListener, FINRA API, USDA NASS, PatentsView, Polymarket or other prediction market data, Senate LDA API, Congress trade sources, FDA calendar sources, Copernicus Data Space access, IBKR short-stock file terms, Baltic and Drewry index terms, Bluesky Jetstream stability, Vala-Fi beta terms.
9. Anthropic pricing for Opus 5.5, Haiku 5.5 (including the 100K token price tier), Sonnet 5.5, Batch discount and prompt caching, using the official pricing page; recompute the supply chain cost gate with real numbers.
10. The real count of NYSE and Nasdaq operating companies and 10-K or 20-F filers from SEC and exchange lists.
11. EDGAR XBRL company facts coverage for small filers.
12. Free delayed options chain sources and their terms for personal use.

## 25. DEFINITION OF DONE

* All catalog features exist or are explicitly omitted with a documented reason in `docs/OMITTED.md`.
* Works on a desktop browser and an iPhone from the GitHub Pages URL, installable as a PWA.
* No secret anywhere in the repo history; secret scan passes.
* Unpaired devices see only the pairing screen; all proxy routes reject requests without a valid device token.
* No order or trade code exists; allowlists tested.
* Data health panel shows real status for every source; stale data is always labeled.
* 3D views run within performance budgets with working fallbacks and Low power mode.
* Supply chain pilot and full run completed under the owner's approval, with a cost log.
* AI features show sources, labels, usage meter and scoreboard; code computes, Claude explains.
* Portfolio works via direct MCP or via the documented fallback, with banner and email on failure.
* CI green, tests pass, Lighthouse and bundle budgets met.
* `README.md`, `docs/OWNER_SETUP.md`, `docs/DATA_SOURCES.md`, `docs/LICENSES.md`, `docs/OMITTED.md`, `BUILD_STATUS.md` are complete and accurate.

END OF PROMPT. When the owner types build, begin at section 0.2.
