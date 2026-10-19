# Owner setup

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

Two ways, pick either per key:

* **In the app (recommended):** Settings > Keys > paste > Save. Stored encrypted in the proxy, synced to every device, never shown again.
* **Terminal:** `npx wrangler secret put ALPACA_KEY_ID -c worker/wrangler.toml` (dashboard secrets win over app-saved keys).

Free keys to request (all free tiers):

| Key | Where | Notes |
| --- | --- | --- |
| Alpaca | https://app.alpaca.markets > **Paper** account > API Keys | Use the PAPER account's keys. Same market data, and a leaked paper key cannot move real money. |
| Anthropic | You already have one | Also set a monthly spend limit at https://console.anthropic.com > Billing > Limits as a backstop. |
| FRED | https://fred.stlouisfed.org/docs/api/api_key.html | |
| EIA | https://www.eia.gov/opendata/register.php | |
| Finnhub | https://finnhub.io/register | |
| AISStream | https://aisstream.io (sign in with GitHub) | Needed for the tanker map (M6). |

Optional keys (only when the related panel is built): USDA NASS, PatentsView, Copernicus Data Space, FINRA, Reddit (non-commercial app).

## 5. Decisions Claude needs from you (no secrets)

* **SEC User-Agent:** SEC requires a name and contact email in every request header. Which name and email should the proxy send? It is stored as a Worker variable, not in the repo.

## 6. Later milestones

* **Alert email (M11):** verify your email as a destination in Cloudflare Email Routing. Steps will be added here.
* **Robinhood (M10):** you sign in on Robinhood's own page. Turn ON trade approval for agent actions in Robinhood, and confirm with the account owner that connecting is allowed (the account may be custodial).
