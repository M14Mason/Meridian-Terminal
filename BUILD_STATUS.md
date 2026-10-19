# BUILD STATUS

Last updated: 2026-10-18

## Current milestone

M1 Proxy and pairing (next)

## Completed milestones

| Milestone | Commit | Notes |
| --- | --- | --- |
| M0 Scaffold | (see git log: "M0 scaffold") | Vite 8 + React 19 + TS 6, ESLint 10, Vitest 5, CI + Pages deploy, secret scan, CLAUDE.md, docs |

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
* **Repo name `Meridian-Terminal`, base path `/Meridian-Terminal/`.** Owner created it.

## Known bugs

* None

## Next 5 steps

1. M1: Worker router, CORS, Durable Object store, device tokens (hashed), setup-secret pairing with lockout.
2. M1: six-digit add-device codes (3 min, single use, 5 attempts, global limit), device list and revoke.
3. M1: AES-GCM encrypted key storage, write-only Settings > Keys UI.
4. M1: upstream allowlists (Alpaca data/news only, Robinhood read tools only) with tests.
5. M1: per-device rate limits, usage meter skeleton, health endpoint, pairing screen in the app.

## Cost log (paid AI jobs)

| Date | Job | Tokens | Cost |
| --- | --- | --- | --- |
| none | | | |
