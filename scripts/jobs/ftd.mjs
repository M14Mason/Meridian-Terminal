// SEC fails-to-deliver: latest three half-month files, rows worth $250k or more, stored in the proxy cache.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cachePut, requireEnv } from './lib.mjs';

requireEnv('SEC_USER_AGENT', 'MERIDIAN_ADMIN_TOKEN', 'PROXY_URL');
const UA = `MeridianTerminal/1.0 ${process.env.SEC_USER_AGENT}`;
const MIN_VALUE = 250_000;

const page = await (await fetch('https://www.sec.gov/data-research/sec-markets-data/fails-deliver-data', { headers: { 'user-agent': UA } })).text();
const files = [...new Set([...page.matchAll(/\/files\/data\/fails-deliver-data\/(cnsfails\d{6}[ab]\.zip)/g)].map((m) => m[1]))].sort().reverse().slice(0, 3);
if (!files.length) throw new Error('no FTD files found on the SEC page');

const dir = mkdtempSync(join(tmpdir(), 'ftd-'));
const bySym = {};
let rows = 0;
for (const f of files) {
  await new Promise((r) => setTimeout(r, 500));
  const res = await fetch(`https://www.sec.gov/files/data/fails-deliver-data/${f}`, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`FTD download ${f}: ${res.status}`);
  const zip = join(dir, f);
  writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  const text = execFileSync('unzip', ['-p', zip], { maxBuffer: 64 * 1024 * 1024 }).toString('latin1');
  for (const line of text.split('\n').slice(1)) {
    const [date, , sym, qty, , price] = line.split('|');
    const q = Number(qty);
    const p = Number(price);
    if (!sym || !/^\d{8}$/.test(date ?? '') || !(q * p >= MIN_VALUE)) continue;
    (bySym[sym.trim()] ??= []).push([Number(date), q, p]);
    rows++;
  }
}
for (const k of Object.keys(bySym)) bySym[k].sort((a, b) => a[0] - b[0]);
console.log(`files ${files.join(', ')}: ${rows} rows, ${Object.keys(bySym).length} symbols`);
await cachePut('ftd', { at: Date.now(), files, minValue: MIN_VALUE, bySym });
