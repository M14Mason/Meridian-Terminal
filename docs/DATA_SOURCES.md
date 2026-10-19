# Data sources

One row per provider: what it feeds, free limits, cadence used, terms note, and what was verified. "Live-tested" means a real request went through the proxy and returned data on that date. Keyed providers (marked "needs key") are wired and unit-tested but cannot be live-tested until the owner saves the key.

| Provider (proxy id) | Feeds | Free limits | Cadence used | Status (checked 2026-10-18) |
| --- | --- | --- | --- | --- |
| Alpaca data (`alpaca`) | Quotes, bars, news, movers | 200 calls/min; IEX venue only | Quotes 15 s, intraday bars 30 s, daily 10 min, news 30 s | Needs key. Allowlist blocks all trading hosts and paths (tests). |
| Finnhub (`finnhub`) | Profile, ratios, estimates, calendars, news | 60 calls/min | Profile daily, ratios 6 h, calendars 1 h | Needs key. |
| Massive, formerly Polygon (`massive`) | End-of-day aggregates, reference | 5 calls/min, EOD | 1 h | Needs key. Host api.massive.com answers (401 without key). |
| SEC EDGAR data (`sec`) | Submissions, XBRL company facts and frames | 10 requests/s, declared User-Agent | 10 min to 6 h | Live-tested: Apple submissions and 503 us-gaap concepts. UA stored as Worker secret. |
| SEC EDGAR files (`secwww`) | Ticker list with exchange, filing documents, current filings feed | Same | Ticker list daily | Live-tested: company_tickers_exchange.json. |
| SEC full-text search (`efts`) | Phrase search in filings (going concern, auditor changes) | Same | 10 min | Live-tested. |
| FRED (`fred`) | Macro series, release calendar, Treasury yields, TGA, RRP | About 120 requests/min | 30 min | Needs key. |
| EIA v2 (`eia`) | Oil, gas, inventories, grid | Generous, key required | 1 h (grid 15 min) | Needs key. |
| CoinGecko (`coingecko`) | Bitcoin, crypto categories | Keyless low limit; Demo key 30/min | 30 s price, 5 min categories | Live-tested keyless. |
| Frankfurter (`frankfurter`) | ECB reference FX rates (daily, not executable) | No key | 1 h | Live-tested. |
| World Bank (`worldbank`) | Global macro (annual) | No key | Daily | Live-tested. |
| GDELT (`gdelt`) | World news | About 1 request per 5 s | 15 min | Reachable; returned 429 when called too fast. Client budget 20/min. |
| USGS (`usgs`) | Earthquakes | No key | 5 min | Live-tested. |
| NOAA NHC (`nhc`) | Active hurricanes | No key | 15 min | Live-tested. |
| NY Fed (`nyfed`) | SOFR, EFFR, reverse repo operations | No key | 30 min | Live-tested. |
| ClinicalTrials.gov (`clinicaltrials`) | Trials by sponsor | No key | 6 h | Live-tested. |
| Wikimedia (`wikimedia`) | Pageviews | No key, UA required | 6 h | Live-tested. |
| Senate LDA (`lda`) | Lobbying filings | No key | Daily | Moved to lda.gov; lda.gov returned 503 on 2026-10-18 (their outage). |
| CFTC (`cftc`) | Commitments of Traders | No key | Daily | Wired, not yet tested. |
| IMF DataMapper | (dropped) | | | Returns 403 to all automated clients, including direct curl. Replaced by World Bank and FRED international series. |
| US Treasury fiscaldata and TreasuryDirect | (not proxied) | | | Both fail TLS with Cloudflare (HTTP 525 from the edge, tested with a temporary Worker). Auction data will come from a GitHub Actions cache job (5.3). |
