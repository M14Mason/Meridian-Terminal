# Owner setup

> **Status 2026-10-19:** steps 1 to 3 are done (Pages, Cloudflare, Worker, secrets, PROXY_URL). Your first device is paired. Use the **Final checklist** at the bottom; it is everything left.

Things only you can do. Never paste a key or secret into chat. You type secrets into your own terminal or into the app's Settings > Keys screen.

Run every command from the repo folder.

## 1. GitHub Pages (2 minutes)

1. Open https://github.com/M14Mason/Meridian-Terminal/settings/pages
2. Under **Build and deployment > Source**, pick **GitHub Actions**.
3. That is all. Every push to `main` now deploys the site.

## 2. Cloudflare account and Worker (10 minutes)

1. Sign up free at https://dash.cloudflare.com/sign-up (no card needed for the free plan).
2. In this repo folder run:
   ```bash
   npx wrangler login
   ```
   A browser tab opens. Click **Allow**.
3. No storage setup needed. The proxy uses a free SQLite **Durable Object**, which is created automatically on first deploy.

## 3. Worker secrets (5 minutes)

Each command asks you to paste a value. The value goes straight to Cloudflare and is never shown again.

1. **Setup secret** (pairs your first device). Generate one:
   ```bash
   openssl rand -hex 32
   ```
   Save the output in your password manager. Then:
   ```bash
   npx wrangler secret put SETUP_SECRET -c worker/wrangler.toml
   ```
   and paste it.
2. **Key encryption key** (encrypts API keys stored in KV). You never need to see this one:
   ```bash
   openssl rand -base64 32 | npx wrangler secret put KEY_ENCRYPTION_KEY -c worker/wrangler.toml
   ```
3. **Deploy:**
   ```bash
   npm run worker:deploy
   ```
   It prints a URL like `https://meridian-proxy.<your-subdomain>.workers.dev`. That URL is not a secret.
4. Put that URL in GitHub: https://github.com/M14Mason/Meridian-Terminal/settings/variables/actions > **New repository variable** > Name `PROXY_URL`, Value = the URL. (A **variable**, not a secret, because the site needs it at build time and it protects nothing by itself. Every request still needs a paired device token.)

## 4. API keys

Settings > Keys (in the app) > paste > Save. Stored encrypted in the proxy, synced to every device, never shown again. A Worker secret with the same name (`npx wrangler secret put NAME -c worker/wrangler.toml`) takes priority.

| Key | Where to get it | Used for |
| --- | --- | --- |
| Alpaca (key ID + secret) | https://app.alpaca.markets > **Paper** account > API Keys | Quotes, charts, news, options. Use PAPER keys: same data, cannot move real money. |
| Anthropic | https://console.anthropic.com > API Keys | Every AI feature (the only paid item). Set a monthly limit under Billing > Limits as a backstop. |
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html | Macro dashboards, yield curve, heatmaps |
| EIA | https://www.eia.gov/opendata/register.php | Oil, gas and power panels |
| Finnhub | https://finnhub.io/register | Metrics, peers, earnings, ratings |
| Massive (Polygon) | https://massive.com (Stocks Basic, free) | Screener, breadth, relative volume, dividends |
| AISStream | https://aisstream.io (sign in with GitHub) | Tanker map |
| Resend | https://resend.com/signup with **masonngo70@gmail.com** > API Keys > Create | Alert emails. The free plan only sends to the email you signed up with, which is the alert address already set in the proxy. |
| Copernicus client ID + secret | https://shapps.dataspace.copernicus.eu/dashboard > User settings > OAuth clients | Satellite images (SAT) |
| NASA FIRMS | https://firms.modaps.eosdis.nasa.gov/api/map_key/ | Wildfires (FIRE) |
| CoinGecko, USDA NASS (optional) | coingecko.com/api, quickstats.nass.usda.gov/api | Crypto sectors, crop reports |

Not needed: API Ninjas (transcripts are premium only), FINRA (public data is keyless), Reddit and PatentsView (omitted).

## 5. Decisions already made

* SEC User-Agent and alert email: set by Claude as Worker secrets (not in the repo).
* Supply chain: the 500 largest companies are extracted by Claude Code sessions (no API cost); any other company: press EXTRACT WITH SONNET in SPLC (cost shown first, about $0.02).

## Final checklist (about 15 minutes, once)

1. **Keys:** add any key above that SET > Keys shows as "not set". Then open SET > Data health: every source should turn green within a few minutes.
2. **Robinhood (read only):** before connecting, turn ON trade approval for agent actions in the Robinhood app, and confirm with the account owner that connecting is allowed (you are a student; the account may be custodial). Then PORT > CONNECT ROBINHOOD > sign in on Robinhood's page > back in PORT press REFRESH. If Robinhood refuses the connection, tell Claude "update the portfolio" (see `scripts/update-portfolio.md`).
3. **Alerts:** ALRT > TEST ALERT. You should get an email within a minute (after adding the Resend key) and an orange banner on every open device.
4. **AI:** press **?** on any panel header. Then try ASK, VAL, BRIF and CMP (CMP shows its cost before it runs).
5. **Satellite:** open SAT once; if it says the Copernicus key is not set or rejected, recheck both Copernicus fields.
6. **Phone:** open https://m14mason.github.io/Meridian-Terminal/ in Safari > Share > Add to Home Screen. Pair it: on the Mac, SET > Devices > Add device, then type the six-digit code on the phone within 3 minutes.
7. **Data jobs:** already started by Claude. They run every weekday morning on their own (GitHub > Actions > Data jobs).

Personal research tool. Not financial advice. Data may be delayed, incomplete or wrong.
