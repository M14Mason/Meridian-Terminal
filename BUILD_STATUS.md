# BUILD STATUS

Last updated: 2026-10-19 (all milestones built)

## Current milestone

ALL MILESTONES BUILT (M0 to M12). Supply chain extraction COMPLETE for the 500 largest companies (494 shards, 6 fund trusts skipped) on 2026-10-19. Any other company: EXTRACT WITH SONNET in SPLC. Refresh: SPLC flags newer 10-Ks and offers a Sonnet refresh.

## Completed milestones

| Milestone | Commit | Notes |
| --- | --- | --- |
| M0 Scaffold | 1361421 | Vite + React + TS, lint, tests, CI, Pages, secret scanning |
| M1 Proxy and pairing | 117f433 | Durable Object vault, pairing, encrypted keys, allowlists, gateway |
| M2 Shell | 9886054 | Themes, grid, command line, phone layout, PWA, sync |
| M3 Data and charts | 2332a7d | Adapters, scheduler, charts and indicators |
| M4 News and filings | 2629ed4 | News, filings, FA, insiders, 13F, calendars |
| M5 Macro and heatmaps | 143a4e8 | Heatmaps, yield curve, FX, Bitcoin |
| M6 Tanker map | c033b95 | AIS relay, map, chokepoints, PortWatch |
| M7 Analytics | 76727e7 | Hedge fund toolkit, quant, options (LIMITED), market structure, signals, EQS, MODEL |
| M8 AI layer | 184f13b | /api/ai, Explain, ASK, VAL, PRED, SCOR, BRIF, CMP, FDIF, ECS (PARTIAL), journal critic, spend banner |
| M9 Supply chain | f8c27c4 and later | Universe, schema and checks, SPLC (classic chart, 3D, globe map, table, CRITICAL markers, disruption simulator, stale-filing refresh), on-demand Sonnet extraction, geocoding (Nominatim, cached) |
| M10 Portfolio | 4bcecc3 | Official Robinhood MCP client in the proxy (OAuth PKCE, dynamic registration, encrypted tokens, read allowlist), hourly cron, fallback endpoint and procedure, PORT, stale banner |
| M11 Alerts | c0edfd7 | Proxy alert engine on 3 Cron Triggers, 11 rule types incl. chart-line crossings, cooldowns, quiet hours, history, Resend email (daily cap 40), test drill, ALRT, banner, sounds |
| M12 Polish | 6ad7f73, b5b0aa7, d51f2dc | Amber sampled from owner's reference (#f2a446), GLOS + hover glossary, RPT print to PDF, QCMP, CONC, voice commands, Playwright e2e in CI, docs |

## In progress

* Nothing in progress. To extend coverage later (for example ranks 501 to 1,000): `npm run supply:prep <from> <count>`, follow docs/SUPPLY_EXTRACTION.md, then `node scripts/supply/geocode.mjs`.

## Not built or partial (documented in docs/OMITTED.md)

* Earnings-beat and macro-release predictions (only price predictions are scored).
* Alert email depends on the owner's Resend key (Cloudflare Email Service needs a custom domain).
* ECS uses press releases (transcripts are premium); PAT, ESG, TICK are link-outs; options are LIMITED.
* Lighthouse audit not automated yet; bundle budget and e2e run in CI.

## Blocked (owner must do, see docs/OWNER_SETUP.md)

* DONE 2026-10-18: Pages enabled, Cloudflare account, Worker deployed at https://meridian-proxy.masonngo70.workers.dev, SETUP_SECRET, KEY_ENCRYPTION_KEY and SEC_USER_AGENT set as Worker secrets (SEC UA kept out of the public repo), PROXY_URL repo variable set, live site verified (pairing screen, CORS 204 for Pages origin, 403 for others, 401 without token).
* DONE: first device paired, all keys saved in SET > Keys (owner, 2026-10-19).
* DONE 2026-10-19: Data jobs triggered by Claude (congress job fixed: Cloudflare 403 on the Python User-Agent). ALERT_EMAIL Worker secret set to the owner's address.
* Owner: add a Resend key (free) for alert emails; connect Robinhood in PORT (turn on trade approval first; confirm with the account owner).
* Owner: open SAT once to confirm the Copernicus keys work (untested; keys live only in the proxy).
* Owner: try one AI feature (the ? button on any panel) to confirm the Anthropic key works in production.

## Unverified items still open (section 24)

* 1 (partial): Workers, KV and Durable Object limits verified 2026-10-18 (see Decisions). Still open: DO WebSocket hibernation on free, Email Service on free.
* Email Service on free: not usable here (needs a custom domain for Email Routing); Resend used instead.
* 4 Robinhood MCP: metadata verified 2026-10-19 (PKCE S256, dynamic registration, public client, token at api.robinhood.com); registration ACCEPTED the hosted HTTPS callback. The sign-in leg needs the owner's login to confirm.
* 5: GSAP checked; Lightweight Charts attribution logo kept on; maps use Natural Earth (no tiles).
* 9: Anthropic pricing verified 2026-10-19 (shared/ai.ts).
* 10: universe built from SEC lists (public/supply/universe.json, counts and skip reasons stored).
* 2, 3, 6, 7, 8, 11, 12: see docs/DATA_SOURCES.md for what was verified per source; remaining terms checks are noted there.
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

* FIXED 2026-10-19: classic amber retuned to #f2a446 sampled from the owner's reference screenshot (with reds #7c1d23 and #ac2217).
* None open. Dependabot PR "Bump typescript to 7.0.2" fails by design (typescript-eslint needs TS < 6.1); close it. An ignore rule now prevents new ones.

## Next 5 steps

1. Owner: Dependabot PRs for GitHub Actions versions (checkout, setup-node, upload-pages-artifact) clear the Node 20 deprecation warning; review and merge when convenient.
2. Owner: final checklist in docs/OWNER_SETUP.md (Resend key, Robinhood connect, test alert).
3. Verify live: Robinhood OAuth on the real sign-in page (hosted callback accepted at registration on 2026-10-19), SAT with Copernicus keys, first real AI calls.
4. Add earnings-beat predictions once a reliable free consensus source is confirmed.
5. Optional: Lighthouse run in CI.

## Cost log (paid AI jobs)

| Date | Job | Tokens | Cost |
| --- | --- | --- | --- |
| none | | | |
