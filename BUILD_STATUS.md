# BUILD STATUS

Last updated: 2026-10-19 (after M7)

## Current milestone

M9 Supply chain (starting 2026-10-19)

## Completed milestones

| Milestone | Commit | Notes |
| --- | --- | --- |
| M0 Scaffold | 1361421 | Vite 8 + React 19 + TS 6, ESLint 10, Vitest 5, CI + Pages deploy, secret scan, CLAUDE.md, docs |
| M1 Proxy and pairing | 117f433 | Worker + SQLite Durable Object vault, pairing, devices, AES-GCM keys, allowlists, rate limits, upstream gateway with edge cache and coalescing. |
| M2 Shell | 9886054 | Themes, font, free grid, command line, phone layout, PWA, sync engine, error boundaries. |
| M3 Data and charts | 2332a7d | Adapters, scheduler, quotes, charts with indicators and drawings, HP, DES, COMP, multi-chart, replay, tape. |
| M4 News and filings | 2629ed4 | News with latency badges, filings, FA (XBRL), insiders, 13F, calendars, 8-K. |
| M5 Macro and heatmaps | 143a4e8 | Macro heatmaps, yield curve, FX, Bitcoin, crypto and sector heatmaps. |
| M6 Tanker map | c033b95 | AIS relay DO, ticket auth, MapLibre map, chokepoints, PortWatch transits. |
| M8 AI layer | 184f13b (parts 1 to 3, 1e31273..184f13b) | Proxy /api/ai (versioned prompts, schema validation + 1 retry, edge cache by input hash, in-flight dedupe, usage metered per feature), Explain on every panel, ASK, VAL, PRED (logged), SCOR, BRIF, CMP (cost confirm before each rebalance), FDIF, ECS (PARTIAL), journal critic, spend spike banner. Verified: unit tests with mocked Anthropic; UI and no-key error path in a browser. NOT verified live: real Claude replies (key is only in the production proxy). |
| M7 Analytics | 76727e7 (parts 1 to 13, b932e36..76727e7) | Launchpad, presets, favorites, GURU, CLUS, backtester and strategy library, FRED dashboards, EIA energy, quant and risk, options (LIMITED), equity tools, filings intelligence, signals, EQS, MODEL, RVOL, BRDH, CIDX, ORB, JRNL, ETFH, TMAP, SOCL, FTD, BORR, CONG, SQZ, SAT, FRT, CDS, PARTIAL PAT/ESG/TICK. Data jobs: insiders, ftd, borrow, congress (GitHub Actions to proxy cache). |

## In progress

* **M9 Supply chain** per section 15 and the owner's plan (Decisions): universe and schema, keyword filter for 10-K text, Claude Code sub-agents extract the top 500 by market cap in batches of 40 (`docs/SUPPLY_EXTRACTION.md`, progress in `public/supply/progress.json`), on-demand Sonnet extraction for everything else, 3D graph and globe, disruption simulator.
* M8 leftovers: spend spike EMAIL (with M11 email), earnings-beat and macro-release predictions (docs/OMITTED.md), live prompt eval set (needs the key; run once the owner opens VAL/PRED/ASK).
* Chart-line alerts (idea 3) with M11.

## Blocked (owner must do, see docs/OWNER_SETUP.md)

* DONE 2026-10-18: Pages enabled, Cloudflare account, Worker deployed at https://meridian-proxy.masonngo70.workers.dev, SETUP_SECRET, KEY_ENCRYPTION_KEY and SEC_USER_AGENT set as Worker secrets (SEC UA kept out of the public repo), PROXY_URL repo variable set, live site verified (pairing screen, CORS 204 for Pages origin, 403 for others, 401 without token).
* DONE: first device paired, all keys saved in SET > Keys (owner, 2026-10-19).
* Owner: run GitHub > Actions > Data jobs > Run workflow once to fill FTD, BORR and CONG.
* Owner: open SAT once to confirm the Copernicus keys work (untested; keys live only in the proxy).
* Owner: try one AI feature (the ? button on any panel) to confirm the Anthropic key works in production.

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
* **RSI reference values** are computed independently in Python at full precision from the StockCharts ChartSchool example series (70.4641, 66.2496). The published table is an image that rounds intermediate averages and could not be machine-read, so its numbers are not used.
* **Indicators live in `shared/`** so the same code runs in the browser, in Web Workers and in the proxy (for server-side alerts in M11).
* **Owner decisions 2026-10-18:** Reddit omitted (no API access). PatentsView key skipped (asks for address; owner is a minor): use PatentsView bulk files in a monthly Action instead. Copernicus: Sentinel Hub OAuth client (Processing API). FINRA: Public credentials. Extra keys possibly needed later: NASA FIRMS, API Ninjas, Resend (only if Cloudflare email fails), Anthropic key as GitHub secret for M9.
* **Classic theme palette** retuned to orange labels, white values, FB8B1E / 4AF6C3 / FF433D / 0068FF, green GO, at owner request.
* **Treasury (fiscaldata, TreasuryDirect) refuse Cloudflare TLS (525)**: auctions via a GitHub Actions cache job (M7).
* **AIS relay**: AISStream allows 3 connections per account and forbids browser connections; since Sept 2026 uncompressed connections are bandwidth-capped. The relay logs CompressionEnabled to the health feed. IMF PortWatch (ArcGIS, keyless) provides official daily chokepoint transits.
* **Bundle budget is 150 KB gzip for initial JS** (React alone is about 60 KB gzip).
* **Pairing security model (M1).** Device tokens: 256-bit random, only SHA-256 stored. Setup secret: constant-time compare, 5 failures per hour then locked (global, so a stranger can delay first pairing but not get in). Codes: one live code at a time, HMAC-peppered hash, 3 minutes, single use (deleted before the token is issued), 5 wrong then destroyed, 15 wrong per 15 minutes globally then locked. Max 10 devices. Revoke deletes the row, so the next request fails.
* **Rate-limit counters live in Durable Object memory**, not storage, to save row writes. They reset if the object is evicted, which is acceptable for a single owner. `last_seen` writes are throttled to once per 5 minutes per device.
* **No token cache in the Worker.** Every authed request checks the Durable Object so revocation is instant. Cost: each request is one Worker request plus one DO request against separate 100,000/day free limits.
* **Request budget warning:** 100,000 Worker requests per day sounds large, but 10 panels polling every 10 seconds for 24 hours is 86,400. M3 must batch quotes into one request and slow polling when the tab is hidden.
* **Robinhood read allowlist** uses tool names observed in the official Robinhood MCP tool list on 2026-10-18 plus a second mutating-verb filter. Re-verify at M10.
* **CSP:** production `style-src 'self'` with no inline scripts or styles; the dev server alone allows inline styles because Vite injects them.
* **Supply chain plan (owner decision 2026-10-19):** Claude Code extracts the top 500 companies by market cap itself (owner reduced it from 1,000 on 2026-10-19), using parallel sub-agents in batches of 40 during M9 sessions (no API cost), reading keyword-filtered 10-K paragraphs (customers, suppliers, manufacturing, % of revenue) and committing public-safe JSON derived from SEC filings, with a checkpoint file so work resumes across usage limits (estimate 50 to 150 companies per session). All other companies: on-demand extraction with claude-sonnet-5-5 through the proxy when SPLC opens, cost shown before running, cached. No bulk API run unless the owner asks later (estimates: Haiku batch ~$4, Sonnet batch ~$80, Opus batch ~$155 filtered, ~$975 unfiltered; pricing verified 2026-10-19).
* **AI pricing verified 2026-10-19** (platform.claude.com pricing page): Haiku 5.5 $0.10/$0.50 per MTok (prompts up to 100k; $0.50/$2.50 above), Sonnet 5.5 $2/$10, Opus 5.5 $4/$20, Batch 50% off. Stored in shared/ai.ts PRICES.
* **API Ninjas earnings transcripts are premium only** (checked 2026-10-19): earnings call summaries (110) use the 8-K item 2.02 press release (exhibit 99.1) instead. The API Ninjas key is not used.
* **Repo name `Meridian-Terminal`, base path `/Meridian-Terminal/`.** Owner created it.

## Known bugs

* **Owner feedback 2026-10-19: the orange (amber) in the classic theme looks off.** Retune `--text`/`--accent`/`--select-bg` in src/styles/tokens.css during M12 polish, comparing against real terminal screenshots. Rest of the palette (white values, saturated green/red, navy title bands, dark red action buttons) is accepted.

* None open. Dependabot PR "Bump typescript to 7.0.2" fails by design (typescript-eslint needs TS < 6.1); close it. An ignore rule now prevents new ones.

## Next 5 steps

1. M8: proxy AI endpoint with usage meter, cache and schema validation; verify current Anthropic pricing (verify item 9).
2. M8: Explain button on every panel header, ASK, VAL.
3. M8: PRED with prediction log, SCOR with scoring job.
4. M8: BRIF, journal critic, filings summaries, CMP.
5. M9: supply chain pilot (20 companies) with cost estimate, then wait for owner approval.

## Cost log (paid AI jobs)

| Date | Job | Tokens | Cost |
| --- | --- | --- | --- |
| none | | | |
