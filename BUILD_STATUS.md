# BUILD STATUS

Last updated: 2026-10-18

## Current milestone

M2 Shell (next)

## Completed milestones

| Milestone | Commit | Notes |
| --- | --- | --- |
| M0 Scaffold | 1361421 | Vite 8 + React 19 + TS 6, ESLint 10, Vitest 5, CI + Pages deploy, secret scan, CLAUDE.md, docs |
| M1 Proxy and pairing | (see git log: "M1 proxy") | Worker + SQLite Durable Object vault, CORS, setup-secret and six-digit pairing, devices and revoke, AES-GCM keys, Alpaca and Robinhood allowlists, rate limits, usage meter skeleton, health, upstream gateway with edge cache and coalescing, pairing and Settings UI. Verified end to end against `wrangler dev` and in a browser. |

## In progress

* None

## Blocked (owner must do, see docs/OWNER_SETUP.md)

* Enable GitHub Pages with Source = GitHub Actions.
* Create Cloudflare account and run `npx wrangler login`.
* Set Worker secrets `SETUP_SECRET` and `KEY_ENCRYPTION_KEY`, deploy the Worker, add the `PROXY_URL` repo variable.
* Answer: which name and email to use in the SEC User-Agent.

## Unverified items still open (section 24)

* 1 (partial): Workers, KV and Durable Object limits verified 2026-10-18 (see Decisions). Still open: DO WebSocket hibernation on free, Email Service on free.
* 2 to 12: open.

## Decisions made and why

* **TypeScript 6.0.3, not 7.0.** typescript-eslint 8.71 supports TS < 6.1 only.
* **`ignore-scripts=true` in .npmrc.** Blocks all install scripts (6.8). Everything still builds.
* **Durable Object (SQLite) is the primary proxy store, not KV.** Verified 2026-10-18 on developers.cloudflare.com: Workers Free gives 100,000 requests/day, 10 ms CPU per invocation, 50 subrequests, 5 cron triggers; KV Free gives only 1,000 writes/day (100,000 reads, 1 GB); SQLite Durable Objects are on Free with 100,000 row writes/day, 5M row reads/day, 5 GB. Pairing, sync, rate limiting and usage metering would exceed 1,000 KV writes on a busy day. Upstream response caching uses the free edge Cache API.
* **10 ms CPU limit per request.** Keep Worker handlers thin; heavy work goes to the browser (Web Workers) or GitHub Actions.
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

1. M2: font choice (JetBrains Mono vs IBM Plex Mono, Latin subset WOFF2), theme switcher with color-blind option.
2. M2: free grid (drag, resize, snap, min/max, tab-stack, lock), named per-device layouts, panel header contract.
3. M2: command line with function registry, fuzzy autocomplete, history, help (F1 / ?), cheat sheet.
4. M2: phone layout (bottom tabs, safe areas), PWA manifest + service worker, offline banner.
5. M2: sync engine (per-item LWW with tombstones, IndexedDB queue, proxy /api/sync on the Durable Object), export/import, error boundaries, data health skeleton.

## Cost log (paid AI jobs)

| Date | Job | Tokens | Cost |
| --- | --- | --- | --- |
| none | | | |
