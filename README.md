# Meridian Terminal

Personal, keyboard-first market research terminal. Static React site on GitHub Pages plus a Cloudflare Worker proxy that holds every key.

> Personal research tool. Not financial advice. Data may be delayed, incomplete or wrong.

* Live site: https://m14mason.github.io/Meridian-Terminal/ (shows only a pairing screen until a device is paired)
* Spec: [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md)
* Progress: [BUILD_STATUS.md](BUILD_STATUS.md)
* Owner setup steps: [docs/OWNER_SETUP.md](docs/OWNER_SETUP.md)

## Quick tour (type a code in the command line, or press MENU)

* **Markets:** WEI (index ETF proxies), MOST, BQ watchlist, HEAT, SECT, BRDH breadth, RVOL, TNKR tanker map
* **One company:** `AAPL GP` chart, DES, FA, CF filings, CN news, INS insiders, VAL valuation, PRED prediction, SPLC supply chain, DCF, RV, ESH, OMON options, FDIF risk-factor diff, ECS earnings release summary
* **Screening and quant:** EQS screener, ASK (plain English), BT backtester, STRT strategies, RISK, EF, MC, CORM, PAIR, FACT
* **Investors and hedge fund tools:** GURU 13F, CLUS insider clusters, CONG House trades, SQZ squeeze radar, MARB merger arb, SPIN, MODEL rules index, CMP Claude model portfolio
* **Macro:** ECO, YCRV, LIQ, CPIB, JOBS, CRED, RECS, CDS, FRT, INV, NGS, GRID
* **Yours:** PORT Robinhood portfolio (read only), ALRT alerts with email, JRNL journal with AI critic, NOTE, BRIF morning brief
* **Help:** HELP, LP launchpad, GLOS glossary (hover any table header), `?` on any panel explains it with AI

## How it works

* The site is static (GitHub Pages). Every data call goes through the proxy, which holds the keys (encrypted), enforces allowlists, caches at the edge and meters AI spend.
* Cron Triggers in the proxy refresh the Robinhood portfolio hourly in market hours and run alerts every 10 minutes (hourly otherwise), so alerts fire with no device open.
* GitHub Actions run daily data jobs (insiders, fails to deliver, borrow fees, House trades) into the proxy cache.
* Supply chain shards for the 500 largest companies live in `public/supply/` (derived from SEC filings); any other company is extracted on demand.

## Develop

```bash
npm ci
npm run hooks:install   # pre-commit secret scan
npm run dev             # site on http://localhost:5173/Meridian-Terminal/
npm run worker:dev      # proxy on http://localhost:8787
npm run check           # lint, typecheck, tests, build, secret scan
npm run e2e             # Playwright smoke tests (needs: npx playwright install chromium)
```

Supply chain extraction: see [docs/SUPPLY_EXTRACTION.md](docs/SUPPLY_EXTRACTION.md). Portfolio fallback: [scripts/update-portfolio.md](scripts/update-portfolio.md).

## Layout

| Path | What |
| --- | --- |
| `src/` | React app (shell, panels, adapters' client side) |
| `worker/` | Cloudflare Worker proxy (keys, pairing, allowlists, cache, AI, cron) |
| `shared/` | Types and pure logic used by both |
| `scripts/` | Build and safety scripts |
| `docs/` | Spec, data sources, licenses, omitted features, owner setup |

View only: this app contains no order placement code and the proxy blocks every trading endpoint.
