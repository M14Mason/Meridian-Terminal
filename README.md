# Meridian Terminal

Personal, keyboard-first market research terminal. Static React site on GitHub Pages plus a Cloudflare Worker proxy that holds every key.

> Personal research tool. Not financial advice. Data may be delayed, incomplete or wrong.

* Live site: https://m14mason.github.io/Meridian-Terminal/ (shows only a pairing screen until a device is paired)
* Spec: [docs/BUILD_PROMPT.md](docs/BUILD_PROMPT.md)
* Progress: [BUILD_STATUS.md](BUILD_STATUS.md)
* Owner setup steps: [docs/OWNER_SETUP.md](docs/OWNER_SETUP.md)

## Develop

```bash
npm ci
npm run hooks:install   # pre-commit secret scan
npm run dev             # site on http://localhost:5173/Meridian-Terminal/
npm run worker:dev      # proxy on http://localhost:8787
npm run check           # lint, typecheck, tests, build, secret scan
```

## Layout

| Path | What |
| --- | --- |
| `src/` | React app (shell, panels, adapters' client side) |
| `worker/` | Cloudflare Worker proxy (keys, pairing, allowlists, cache, AI, cron) |
| `shared/` | Types and pure logic used by both |
| `scripts/` | Build and safety scripts |
| `docs/` | Spec, data sources, licenses, omitted features, owner setup |

View only: this app contains no order placement code and the proxy blocks every trading endpoint.
