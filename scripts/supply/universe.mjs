// M9 universe (15.2): NYSE and Nasdaq operating companies ranked by market cap.
// Inputs: SEC ticker/exchange list, SEC XBRL frames (shares outstanding), and a prices JSON {ticker: close}.
// Usage: SEC_USER_AGENT="name email" node scripts/supply/universe.mjs <prices.json> [topN]
import { readFileSync, writeFileSync } from 'node:fs';

const UA = process.env.SEC_USER_AGENT;
if (!UA) throw new Error('set SEC_USER_AGENT');
const [pricesPath, topArg] = process.argv.slice(2);
const TOP = Number(topArg ?? 1000);
const prices = JSON.parse(readFileSync(pricesPath, 'utf8'));
const overridePath = process.argv[4];
const overrides = overridePath ? JSON.parse(readFileSync(overridePath, 'utf8')) : {};
const get = async (u) => {
  await new Promise((r) => setTimeout(r, 150));
  const r = await fetch(u, { headers: { 'user-agent': `MeridianTerminal/1.0 ${UA}` } });
  if (!r.ok) return null;
  return r.json();
};

const list = await get('https://www.sec.gov/files/company_tickers_exchange.json');
const shares = new Map();
const now = new Date();
let y = now.getUTCFullYear(), q = Math.floor(now.getUTCMonth() / 3) + 1;
for (let k = 0; k < 6; k++) {
  const f = await get(`https://data.sec.gov/api/xbrl/frames/dei/EntityCommonStockSharesOutstanding/shares/CY${y}Q${q}I.json`);
  for (const d of f?.data ?? []) if (!shares.has(d.cik)) shares.set(d.cik, { val: d.val, loc: d.loc });
  if (--q === 0) { q = 4; y--; }
}

const skip = { notNyseNasdaq: 0, notCommonTicker: 0, noShares: 0, noPrice: 0, duplicateCik: 0 };
const byCik = new Map();
for (const [cik, name, ticker, exchange] of list.data) {
  if (!/^(NYSE|Nasdaq)$/.test(exchange)) { skip.notNyseNasdaq++; continue; }
  if (!/^[A-Z]{1,5}(\.[A-Z])?$/.test(ticker)) { skip.notCommonTicker++; continue; }
  const shRow = shares.get(cik);
  if (!shRow) { skip.noShares++; continue; }
  const sh = shRow.val;
  const px = prices[ticker];
  if (!px) { skip.noPrice++; continue; }
  // Foreign filers report ordinary shares, not ADS units, so their computed cap can be far off.
  // An override file ({ticker: capB}) from a market data source fixes them.
  const fix = overrides[ticker];
  const row = { t: ticker, cik, name, ex: exchange, mcapB: fix ?? +((sh * px) / 1e9).toFixed(2) };
  const cur = byCik.get(cik);
  if (cur) skip.duplicateCik++;
  // One row per company: keep the more valuable listing (usually the main share class).
  if (!cur || row.mcapB > cur.mcapB) byCik.set(cik, row);
}
const ranked = [...byCik.values()].sort((a, b) => b.mcapB - a.mcapB);
const out = {
  at: new Date().toISOString().slice(0, 10),
  priceFile: pricesPath.split('/').pop(),
  method: 'ORDERING ONLY, not a market cap source: latest SEC cover-page shares outstanding (dei) x close. Foreign ADRs are overstated by their ADS ratio (for example LTM, TSM, TM) and multi-class companies count one class, so ranks near the cutoff are approximate.',
  counts: { secListings: list.data.length, ranked: ranked.length, top: Math.min(TOP, ranked.length) },
  skipped: skip,
  top: ranked.slice(0, TOP).map((r, i) => ({ rank: i + 1, ...r })),
};
writeFileSync('public/supply/universe.json', JSON.stringify(out));
console.log(JSON.stringify(out.counts), JSON.stringify(skip));
console.log(out.top.slice(0, 12).map((r) => `${r.t} ${r.mcapB}B`).join(', '));
console.log('rank 1000:', out.top.at(-1)?.t, out.top.at(-1)?.mcapB);
