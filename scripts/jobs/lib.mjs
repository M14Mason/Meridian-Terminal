// Shared helpers for data jobs that run in GitHub Actions. Never print secrets.
const UA = process.env.SEC_USER_AGENT;
const PROXY = (process.env.PROXY_URL ?? '').replace(/\/$/, '');
const ADMIN = process.env.MERIDIAN_ADMIN_TOKEN;

export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) {
    console.log(`missing env: ${missing.join(', ')}; skipping`);
    process.exit(0);
  }
}

let last = 0;
/**
 * SEC fetch: declared User-Agent, at most 8 requests per second, retries on 429/5xx.
 * `missingOk` treats 403/404 as "not published" (SEC answers 403 for absent index files).
 */
export async function sec(url, as = 'text', missingOk = false) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const wait = Math.max(0, last + 125 - Date.now());
    if (wait) await new Promise((r) => setTimeout(r, wait));
    last = Date.now();
    const r = await fetch(url, { headers: { 'user-agent': `MeridianTerminal/1.0 ${UA}`, 'accept-encoding': 'gzip, deflate' } });
    if (r.ok) return as === 'json' ? r.json() : r.text();
    if (r.status === 404 || (missingOk && r.status === 403)) return null;
    await new Promise((res) => setTimeout(res, 2000 * (attempt + 1)));
  }
  throw new Error(`SEC fetch failed after retries: ${new URL(url).pathname}`);
}

export async function cacheGet(name) {
  const r = await fetch(`${PROXY}/api/cache/${name}`, { headers: { authorization: `Bearer ${ADMIN}` } });
  return r.ok ? r.json() : null;
}

export async function cachePut(name, data) {
  const body = JSON.stringify(data);
  const r = await fetch(`${PROXY}/api/cache/${name}`, { method: 'PUT', headers: { authorization: `Bearer ${ADMIN}`, 'content-type': 'application/json' }, body });
  if (!r.ok) throw new Error(`cache put ${name} failed: ${r.status}`);
  console.log(`stored ${name}: ${(body.length / 1024).toFixed(0)} KB`);
}

export const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
