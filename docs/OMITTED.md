# Omitted or partial features

Every catalog item that is not built, or is built in a reduced form, with the reason. Excluded by the owner (section 20): items 100 to 106, 120, 128, 130, all order and paper trading code.

| Item | Status | Reason |
| --- | --- | --- |
| 90 Reddit sentiment | Omitted | Owner could not get a Reddit API app (2026-10-18). Social signals use Bluesky Jetstream and Wikipedia pageviews instead. |
| HDS 13F reverse lookup (who holds a stock) | Partial | Free sources do not offer holder lists by stock; that needs parsing every 13F. HDS shows 13D/13G (5%+ owners) and insider filings about the company instead. |
| IMF DataMapper | Replaced | Returns 403 to automated clients. World Bank and FRED international series used instead. |
| 32 Max pain | Unavailable | Needs open interest. Alpaca's free options feed has none; Cboe's delayed JSON has it but automated-use terms are unconfirmed. |
| 30 IV rank and percentile | Partial | Needs an IV history; will build from daily snapshots stored by a job, starting from the first snapshot (no back history). |
| Unusual options activity (UOA) | Partial | Volume-based and delayed; volume vs open interest is not possible without open interest. |
| 94 FDA decision calendar | Omitted | No free official calendar of PDUFA dates; company press releases only. Clinical trials (TRIAL) cover the pipeline. |
| 25 Market profile (TPO) | Partial | Volume profile is built (GP overlay). True TPO needs 30-minute bars by price for each session; the free IEX feed is a thin slice of volume, so a TPO built on it would mislead. |
| 63 ETF flow estimates | Partial | ETFH shows the change in net assets between the last two N-PORT filings (flows plus performance). Daily creations and redemptions are not free. |
| 88 Flight tracker (corporate jets) | Omitted | OpenSky's free API is limited to research and non-commercial use with registered accounts and strict rate limits, and tail-number-to-company mapping is not public; ADS-B Exchange's free API ended. |
| 92 Google Trends spikes | Omitted | Google offers no general public Trends API (only an invite-only alpha); scraping is against its terms. Wikipedia pageview spikes (WIKI) are the permitted substitute. |
| 96 Court case tracker | Omitted | PACER charges per page; CourtListener's free API needs an account and token in the owner's name. Can be added if the owner creates one. |
| 110 Earnings call summarizer | Partial (ECS) | See below: summarizes the 8-K press release. |
| 93 Patents, ESG composite, IEX tick lab | Partial (link-outs) | PAT, ESG and TICK open the official search pages pre-filled; bulk data is several GB or needs entity mapping. |
| 136 All-venue quote | Limited (QCMP) | Free sources side by side (IEX, Finnhub, previous close); a consolidated real-time quote needs a paid feed. |
| Alert email via Cloudflare | Replaced | Cloudflare Email Service needs a custom domain with Email Routing; the proxy runs on workers.dev, so alerts email through Resend's free tier. |
| Supply chain bulk API run | Replaced | Owner decision: Claude Code sessions extract the 500 largest companies at no API cost; others on demand with Sonnet. |
| SOCL Bluesky search | Partial | Bluesky's search API now requires login; a live sample from the public Jetstream firehose is the fallback. |

## Earnings call transcripts (catalog 110), checked 2026-10-19

API Ninjas' earnings transcript endpoint is labeled "Premium only" and commercial use is not allowed on the free tier. No other free, permitted transcript source was found. ECS summarizes the company's own earnings press release (8-K item 2.02, exhibit 99.1) instead and is labeled PARTIAL. The API Ninjas key in Settings is not used.

## Prediction types not yet scored (16.4)

Price direction and ranges (any ticker, including SPY and sector ETFs for market and sector direction) are predicted and scored. Earnings beat or miss odds and macro release vs nowcast predictions are not built yet; they need a reliable free consensus source for every release. Tracked in BUILD_STATUS.
