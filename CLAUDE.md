# CLAUDE.md (Meridian Terminal)

Auto-loaded rules for every session. Full spec: `docs/BUILD_PROMPT.md`. Progress: `BUILD_STATUS.md`.
When the owner types `build`: read `docs/BUILD_PROMPT.md` and `BUILD_STATUS.md`, then continue from the last unfinished milestone.

Repo: `M14Mason/Meridian-Terminal` (public). Pages URL: https://m14mason.github.io/Meridian-Terminal/
All names, origins and paths live in `src/config.ts` (frontend) and `worker/wrangler.toml` (proxy vars).

Commands: `npm run check` (lint + typecheck + test + build + secret scan). Run it before every commit.

---

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

## 22. LEGAL AND LICENSING

22.1 Personal use only. Free tiers and several sources (AISStream, Reddit, Freddie Mac, IBKR file, OilPriceAPI, Baltic indices) restrict commercial or public redistribution. Keep a `docs/LICENSES.md` listing each source, its terms link, and the date checked.

22.2 Respect robots and terms. No scraping of EMMA, Stock Titan or similar. SEC: declared User-Agent, 10 requests per second maximum, cache everything.

22.3 Trademarks: no Bloomberg branding; do not use "S&P 500" as a product label for derived data (use fund names); follow TradingView Lightweight Charts attribution requirements; follow MapLibre, Three.js (MIT), GSAP and font (OFL) license terms; include a third-party notices page.

22.4 Data from public filings is derived data; cite sources in the UI.

22.5 The footer and About page state: "Personal research tool. Not financial advice. Data may be delayed, incomplete or wrong."

22.6 If the owner ever wants to share or go public, STOP and tell them that paid redistribution licenses, legal review and possibly adviser registration for any trade signals would be required.

