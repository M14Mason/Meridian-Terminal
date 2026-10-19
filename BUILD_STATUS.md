# BUILD STATUS

Last updated: 2026-10-18

## Current milestone

M3 Data and charts (next)

## Completed milestones

| Milestone | Commit | Notes |
| --- | --- | --- |
| M0 Scaffold | 1361421 | Vite 8 + React 19 + TS 6, ESLint 10, Vitest 5, CI + Pages deploy, secret scan, CLAUDE.md, docs |
| M1 Proxy and pairing | 117f433 | Worker + SQLite Durable Object vault, CORS, setup-secret and six-digit pairing, devices and revoke, AES-GCM keys, Alpaca and Robinhood allowlists, rate limits, usage meter skeleton, health, upstream gateway with edge cache and coalescing, pairing and Settings UI. Verified end to end against `wrangler dev` and in a browser. |
| M2 Shell | 9886054 | Themes (classic, modern dark, light, color-blind), IBM Plex Mono, free grid (drag, resize, snap, min/max, tab-stack, duplicate, lock, pop-out), command line with registry and fuzzy autocomplete, history, cheat sheet, phone layout with bottom tabs, swipe and pull to refresh, PWA manifest and icons, service worker, sync engine (LWW, tombstones, offline outbox, export/import), error boundaries, offline banner, data health skeleton, sticky notes. Verified in a browser at desktop and 375 px phone width. |

## In progress

* None

## Blocked (owner must do, see docs/OWNER_SETUP.md)

* Enable GitHub Pages with Source = GitHub Actions.
* Create Cloudflare account and run `npx wrangler login`.
* Set Worker secrets `SETUP_SECRET` and `KEY_ENCRYPTION_KEY`, deploy the Worker, add the `PROXY_URL` repo variable.
* Answer: which name and email to use in the SEC User-Agent.

## Unverified items still open (section 24)

* 1 (partial): Workers, KV and Durable Object limits verified 2026-10-18 (see Decisions). Still open: DO WebSocket hibernation on free, Email Service on free.
* 2 to 4, 6 to 12: open.
* 5 (partial): GSAP license checked 2026-10-18, fine. Lightweight Charts attribution and map tiles still open.
* Service worker and offline reload: code builds and serves correctly, but the in-app test browser does not support service workers, so offline mode is NOT yet verified. Verify on the iPhone and desktop after the first Pages deploy.

## Decisions made and why

* **TypeScript 6.0.3, not 7.0.** typescript-eslint 8.71 supports TS < 6.1 only.
* **`ignore-scripts=true` in .npmrc.** Blocks all install scripts (6.8). Everything still builds.
* **Durable Object (SQLite) is the primary proxy store, not KV.** Verified 2026-10-18 on developers.cloudflare.com: Workers Free gives 100,000 requests/day, 10 ms CPU per invocation, 50 subrequests, 5 cron triggers; KV Free gives only 1,000 writes/day (100,000 reads, 1 GB); SQLite Durable Objects are on Free with 100,000 row writes/day, 5M row reads/day, 5 GB. Pairing, sync, rate limiting and usage metering would exceed 1,000 KV writes on a busy day. Upstream response caching uses the free edge Cache API.
* **10 ms CPU limit per request.** Keep Worker handlers thin; heavy work goes to the browser (Web Workers) or GitHub Actions.
* **Font: IBM Plex Mono** over JetBrains Mono. Compared both rendered amber on black: Plex is narrower and squarer, closer to the classic terminal, and 30% lighter (14.7 KB vs 21.2 KB per weight). Two weights, Latin only, about 30 KB total.
* **Layouts allow overlap.** Frames snap to a 48-column, 16 px-row grid and can overlap like windows; new frames go to the first free slot. Simpler than a packing grid and closer to a terminal's free panels.
* **Commands run in the focused panel** (like the real terminal). Alt+Enter or Shift+Enter opens a new panel. Clicking a function inside HELP opens a new panel.
* **Every planned function code is registered now** with its milestone, so autocomplete is complete and unbuilt functions say "Not built yet. Arrives in Mx" instead of pretending.
* **Hash routing** (`#/pop?...` for pop-outs), so GitHub Pages needs no 404 fallback.
* **Sync clock skew guard:** the proxy clamps record timestamps to at most 5 minutes in the future so one bad device clock cannot win every conflict.
* **Bundle budget is 150 KB gzip for initial JS** (React alone is about 60 KB gzip).
* **Pairing security model (M1).** Device tokens: 256-bit random, only SHA-256 stored. Setup secret: constant-time compare, 5 failures per hour then locked (global, so a stranger can delay first pairing but not get in). Codes: one live code at a time, HMAC-peppered hash, 3 minutes, single use (deleted before the token is issued), 5 wrong then destroyed, 15 wrong per 15 minutes globally then locked. Max 10 devices. Revoke deletes the row, so the next request fails.
* **Rate-limit counters live in Durable Object memory**, not storage, to save row writes. They reset if the object is evicted, which is acceptable for a single owner. `last_seen` writes are throttled to once per 5 minutes per device.
* **No token cache in the Worker.** Every authed request checks the Durable Object so revocation is instant. Cost: each request is one Worker request plus one DO request against separate 100,000/day free limits.
* **Request budget warning:** 100,000 Worker requests per day sounds large, but 10 panels polling every 10 seconds for 24 hours is 86,400. M3 must batch quotes into one request and slow polling when the tab is hidden.
* **Robinhood read allowlist** uses tool names observed in the official Robinhood MCP tool list on 2026-10-18 plus a second mutating-verb filter. Re-verify at M10.
* **CSP:** production `style-src 'self'` with no inline scripts or styles; the dev server alone allows inline styles because Vite injects them.
* **Repo name `Meridian-Terminal`, base path `/Meridian-Terminal/`.** Owner created it.

## Known bugs

* None open. Dependabot PR "Bump typescript to 7.0.2" fails by design (typescript-eslint needs TS < 6.1); close it. An ignore rule now prevents new ones.

## Next 5 steps

1. M3: verify Alpaca, Finnhub and Massive free-tier limits and terms (verify items 6), record in docs/DATA_SOURCES.md.
2. M3: client adapter layer (normalized shapes) and the central token-bucket scheduler (5.5) with tests; batch quote requests to protect the 100,000/day Worker budget.
3. M3: proxy providers for Finnhub, Massive, EDGAR (SEC User-Agent var), FRED, EIA; ticker universe from SEC company_tickers.json for autocomplete.
4. M3: charts (TradingView Lightweight Charts, check attribution), indicators with reference-value tests, drawing tools synced as `drawings`.
5. M3: BQ watchlist, HP, DES, COMP, BETA, TRA, MOST, WEI (labeled ETF proxies), multi-chart, replay, ticker tape, IndexedDB data cache with staleness labels.

## Cost log (paid AI jobs)

| Date | Job | Tokens | Cost |
| --- | --- | --- | --- |
| none | | | |
