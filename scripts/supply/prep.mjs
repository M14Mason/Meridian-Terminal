// M9 extraction prep: for universe ranks [from, from+count), fetch the latest annual report from SEC
// and write the relevant paragraphs to .cache/supply/<rank>-<ticker>.txt for extraction.
// Usage: SEC_USER_AGENT="name email" node scripts/supply/prep.mjs <from> <count>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { htmlToText } from '../../shared/filingtext.ts';
import { relevantText } from '../../shared/supply.ts';

const UA = process.env.SEC_USER_AGENT;
if (!UA) throw new Error('set SEC_USER_AGENT');
const [from = '1', count = '10'] = process.argv.slice(2);
const uni = JSON.parse(readFileSync('public/supply/universe.json', 'utf8')).top;
mkdirSync('.cache/supply', { recursive: true });
const cikFix = JSON.parse(readFileSync('scripts/supply/cik-overrides.json', 'utf8'));

let last = 0;
async function sec(url, json = true) {
  for (let a = 0; a < 4; a++) {
    const wait = Math.max(0, last + 130 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(url, { headers: { 'user-agent': `MeridianTerminal/1.0 ${UA}` } });
    if (r.ok) return json ? r.json() : r.text();
    if (r.status === 404) return null;
    await new Promise((res) => setTimeout(res, 1500 * (a + 1)));
  }
  return null;
}

for (const c of uni.filter((u) => u.rank >= Number(from) && u.rank < Number(from) + Number(count))) {
  const file = `.cache/supply/${String(c.rank).padStart(4, '0')}-${c.t}.txt`;
  if (existsSync(file) || existsSync(`public/supply/c/${c.t}.json`)) continue;
  const cik = cikFix[c.t] ?? c.cik;
  const sub = await sec(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`);
  if (!sub) { console.log(`${c.t}: no submissions`); continue; }
  const isAnnual = (f) => f === '10-K' || f === '20-F' || f === '40-F';
  let r = sub.filings.recent;
  let i = r.form.findIndex(isAnnual);
  // Heavy filers push the 10-K out of the "recent" window; look in the older pages.
  for (const page of sub.filings.files ?? []) {
    if (i >= 0) break;
    const older = await sec(`https://data.sec.gov/submissions/${page.name}`);
    if (!older) continue;
    r = older;
    i = r.form.findIndex(isAnnual);
  }
  if (i < 0) { writeFileSync(file, `NO ANNUAL REPORT for ${c.t}`); console.log(`${c.t}: no 10-K/20-F/40-F`); continue; }
  const acc = r.accessionNumber[i].replace(/-/g, '');
  const url = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}/${r.primaryDocument[i]}`;
  const html = await sec(url, false);
  if (!html) { console.log(`${c.t}: document fetch failed`); continue; }
  const { body, properties } = relevantText(htmlToText(html));
  const a = sub.addresses?.business ?? {};
  const head = [
    `TICKER ${c.t} | CIK ${cik} | ${sub.name} | SIC ${sub.sic} ${sub.sicDescription}`,
    `HQ ${a.city ?? ''}, ${a.stateOrCountryDescription ?? a.stateOrCountry ?? ''}`,
    `FILING ${r.form[i]} ${r.filingDate[i]} period ${r.reportDate[i]} ${url}`,
  ].join('\n');
  writeFileSync(file, `${head}\n--- PROPERTIES ---\n${properties}\n--- RELEVANT PARAGRAPHS ---\n${body}\n`);
  console.log(`${c.rank} ${c.t}: ${Math.round((body.length + properties.length) / 4)} tokens`);
}
