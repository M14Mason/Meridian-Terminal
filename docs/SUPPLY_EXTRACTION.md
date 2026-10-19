# Supply chain extraction procedure (M9)

Owner decision 2026-10-19 (revised the same day from 1,000 to 500): Claude Code sessions (or their sub-agents) extract the 500 largest NYSE and Nasdaq companies with no API cost. Everything else is extracted on demand in the app with Claude Sonnet, with the cost shown first.

## Files

* `public/supply/universe.json`: the ranked list (ordering only; ADR market caps are overstated).
* `.cache/supply/<rank>-<TICKER>.txt`: prepared filing text (gitignored). Made by `npm run supply:prep <from> <count>` (SEC rate limit: run only ONE prep at a time).
* `public/supply/c/<TICKER>.json`: one shard per company (public-safe, derived from SEC filings).
* `public/supply/edges.json`, `public/supply/progress.json`: rebuilt automatically by every save.

## Steps for a batch

1. Read the candidate sentences: `node scripts/supply/brief.mjs <rankFrom> <rankTo>`. If a company looks thin or a sentence is cut off, read more with `grep` or `sed` on its `.cache/supply` file.
2. Write a JSON array and pipe it to `npm run -s supply:save`. One object per company:
   `{"t":"TICKER","industry":"...","hq":{"city":"...","state":"XX","country":"..."},"facilities":[{"type":"...","place":"...","country":"..."}],"rels":[{"n":"Name","t":"TICKER or omit","k":"supplier|customer|partner","what":"...","share":12.5,"conf":0.9,"ev":"exact quote under 15 words","per":"FY2025"}],"gaps":"what is not disclosed"}`
3. The save script fills the CIK, name, filing link and source, then validates. Fix and resave anything reported INVALID.
4. Save a shard for EVERY company in the batch, even with zero relationships (then `gaps` says why), so it counts as done.

## Rules (BUILD_PROMPT 15.6 and 2.11)

* Only what the filing text says. Never add a relationship from your own knowledge, even if you are sure it is true.
* `k` is what the counterparty is TO this company: it sells to us = supplier, it buys from us = customer, collaboration, JV, license or alliance = partner. Subsidiaries are not relationships.
* `share`: percent of THIS company's revenue (customers) or purchases (suppliers), only when the filing states it. Omit otherwise. Never use a receivables share as a revenue share.
* Unnamed counterparties ("one customer accounted for 17%") are included as "Largest customer (unnamed)" only when a share or an explicit dependency is stated.
* `t`: ticker only for NYSE or Nasdaq listed counterparties you can match with certainty (check `public/supply/universe.json` or the SEC ticker list). Omit for private or foreign-only companies.
* `conf`: 0.9 to 0.95 named with a share or an explicit contract, 0.8 to 0.85 named, 0.6 to 0.7 unnamed or vague.
* `ev`: an exact quote from the text, fewer than 15 words. "..." may join two parts of one sentence.
* `facilities`: from the Properties section only. Leave lat and lon out; geocoding is a separate step.
* Skip universe rows marked `skip` (commodity and crypto trusts, SIC 6221): they are funds, not operating companies. Do not save shards for them. REITs and banks are kept.
* No em dashes anywhere.
* Do not commit; the main session commits.
