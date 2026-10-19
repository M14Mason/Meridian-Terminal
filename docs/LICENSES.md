# Licenses and terms

Personal use only. Each data source and library, its terms link, and the date checked.

## Libraries

| Library | License | Notes |
| --- | --- | --- |
| React | MIT | |
| Vite | MIT | |
| GSAP 3.15 | GreenSock standard no-charge license, https://gsap.com/standard-license | Checked 2026-10-18. Free including plugins. Only bar relevant to us: no use in no-code animation builders that compete with Webflow. Not our case. |
| IBM Plex Mono (via @fontsource 5.3.0, Latin 400 and 600 WOFF2) | SIL OFL 1.1 | License copied to `public/fonts/OFL-IBM-Plex-Mono.txt`. |

More libraries: Lightweight Charts (Apache 2.0, TradingView attribution logo kept on), Three.js (MIT), MapLibre GL JS (BSD 3-Clause), topojson-client (ISC), world-atlas (ISC; Natural Earth data is public domain), pypdf (BSD, used only in the House job on GitHub Actions).

## Data sources

Personal, non-commercial research use only. Never redistribute. Live status and verification notes for every endpoint: `docs/DATA_SOURCES.md`.

| Source | Used for | Terms / note | Checked |
| --- | --- | --- | --- |
| SEC EDGAR (data.sec.gov, www.sec.gov, efts) | Filings, XBRL, 13F, Form 4, N-PORT, fails to deliver, comment letters | Public; declared User-Agent, max 10 requests/second, https://www.sec.gov/os/accessing-edgar-data | 2026-10-18 |
| Alpaca market data (paper key) | Quotes, bars, news (Benzinga), indicative options | Data only, no trading hosts; personal use | 2026-10-18 |
| Finnhub (free) | Metrics, peers, earnings, recommendations, quotes | Free tier, personal use | 2026-10-18 |
| Massive (Polygon) Stocks Basic | End-of-day snapshots, dividends, splits | Free tier, 5 calls/minute | 2026-10-18 |
| FRED (St. Louis Fed) | Macro series | Some series (ICE BofA) carry third-party copyright; display only | 2026-10-18 |
| EIA | Energy inventories and grid | Public | 2026-10-18 |
| FINRA public datasets | Short interest, ATS volume | Keyless public API | 2026-10-18 |
| IBKR public short-stock file | Borrow fees (indicative) | Anonymous FTP published by IBKR; terms page not separately verified; personal use only | 2026-10-19 |
| US House Clerk financial disclosures | Congress trades (PTRs) | Public bulk index; the law bars commercial use and solicitation | 2026-10-19 |
| Copernicus Data Space (Sentinel Hub) | Satellite images (SAT) | Free account quota; credit line shown in the panel | 2026-10-18 |
| Bluesky Jetstream | Cashtag sampler (SOCL) | Public firehose, no stability promise | 2026-10-19 |
| OpenStreetMap Nominatim | One-time geocoding of HQs and facilities | Max 1 request/second, identifying User-Agent, cached, "© OpenStreetMap contributors" shown; ODbL. https://operations.osmfoundation.org/policies/nominatim/ | 2026-10-19 |
| Natural Earth via world-atlas | Map land shapes | Public domain | 2026-10-18 |
| IMF PortWatch, NOAA NHC, USGS, NASA FIRMS, US Drought Monitor, ClinicalTrials.gov, Wikimedia, Senate LDA, Kalshi, USAspending, Treasury Fiscal Data, World Bank, Frankfurter, CoinGecko, GDELT, NY Fed, Federal Reserve, USDA NASS | Signals and macro panels | Public or free tiers; see DATA_SOURCES.md | 2026-10-18 |
| Robinhood Trading MCP (official) | Portfolio, read only | OAuth on Robinhood's page; app never sees the password; read allowlist only | 2026-10-19 |
| Anthropic API | AI features | Paid per token (the only paid item); prices in shared/ai.ts | 2026-10-19 |
| Resend (free tier) | Alert emails to the owner's own address | About 3,000 emails/month free | 2026-10-19 |
| API Ninjas | Not used | Earnings transcripts are premium only | 2026-10-19 |

Derived data in this repo (`public/supply/`) comes from public SEC filings and OpenStreetMap geocoding (ODbL: attribution kept; the small extract is used under fair use).
