#!/usr/bin/env node
// Daily job: open-market insider purchases (Form 4, code P) for CLUS. Incremental: processes
// each SEC business day once and keeps a rolling 45 days in the proxy cache ("insiders").
import { parseForm4 } from '../../shared/form4.ts';
import { cacheGet, cachePut, requireEnv, sec, ymd } from './lib.mjs';

requireEnv('SEC_USER_AGENT', 'PROXY_URL', 'MERIDIAN_ADMIN_TOKEN');
const MAX_DAYS_PER_RUN = Number(process.env.MAX_DAYS ?? 4);
const KEEP_DAYS = 45;

const state = (await cacheGet('insiders')) ?? { at: 0, days: [], buys: [] };
const done = new Set(state.days);
let processed = 0;

for (let back = 1; back <= 14 && processed < MAX_DAYS_PER_RUN; back++) {
  const d = new Date(Date.now() - back * 86_400_000);
  if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
  const day = ymd(d);
  if (done.has(day)) continue;
  const q = Math.floor(d.getUTCMonth() / 3) + 1;
  const idx = await sec(`https://www.sec.gov/Archives/edgar/daily-index/${d.getUTCFullYear()}/QTR${q}/form.${day}.idx`);
  if (!idx) {
    done.add(day); // holiday or not published
    continue;
  }
  const files = new Map();
  for (const line of idx.split('\n')) {
    if (!/^4\s/.test(line)) continue;
    const file = line.trim().split(/\s+/).at(-1);
    const acc = file.split('/').at(-1).replace('.txt', '');
    files.set(acc, file); // the same filing is listed under owner and issuer
  }
  let n = 0;
  for (const [acc, file] of files) {
    try {
      const doc = await sec(`https://www.sec.gov/Archives/${file}`);
      if (doc) state.buys.push(...parseForm4(doc, acc));
    } catch {
      // skip one bad filing, keep going
    }
    if (++n % 500 === 0) console.log(`${day}: ${n}/${files.size}`);
  }
  console.log(`${day}: ${files.size} Form 4 filings scanned`);
  done.add(day);
  processed++;
}

const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString().slice(0, 10);
const seen = new Set();
state.buys = state.buys.filter((b) => {
  const k = `${b.acc}|${b.owner}|${b.date}|${b.shares}|${b.price}`;
  if (b.date < cutoff || seen.has(k)) return false;
  seen.add(k);
  return true;
});
state.days = [...done].filter((d) => d >= cutoff.replace(/-/g, '')).sort();
state.at = Date.now();
console.log(`open-market buys kept: ${state.buys.length}`);
await cachePut('insiders', state);
