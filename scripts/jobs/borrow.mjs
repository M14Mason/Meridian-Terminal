// IBKR public short-stock file (indicative borrow fee, rebate, shares available), stored in the proxy cache.
// Anonymous FTP published by IBKR for this purpose; personal use only (docs/LICENSES.md).
import { execFileSync } from 'node:child_process';
import { cachePut, requireEnv } from './lib.mjs';

requireEnv('MERIDIAN_ADMIN_TOKEN', 'PROXY_URL');
const text = execFileSync('curl', ['-s', '--max-time', '120', '--user', 'shortstock:', 'ftp://ftp2.interactivebrokers.com/usa.txt'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8');
const lines = text.split('\n');
const stamp = /^#BOF\|([\d.]+)\|([\d:]+)/.exec(lines[0] ?? '');
if (!stamp) throw new Error('unexpected IBKR file header');
const rows = {};
for (const line of lines) {
  if (line.startsWith('#')) continue;
  const [sym, cur, name, , , rebate, fee, avail] = line.split('|');
  if (cur !== 'USD' || !/^[A-Z][A-Z.]{0,6}$/.test(sym ?? '')) continue;
  rows[sym] = [Number(fee), Number(rebate), avail === '>10000000' ? 10_000_001 : Number(avail) || 0, (name ?? '').slice(0, 40)];
}
console.log(`IBKR file ${stamp[1]} ${stamp[2]}: ${Object.keys(rows).length} symbols`);
await cachePut('borrow', { at: Date.now(), asOf: `${stamp[1].replace(/\./g, '-')} ${stamp[2]}`, rows });
