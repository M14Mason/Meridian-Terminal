// Server-side alert engine (BUILD_PROMPT 18.3): runs on Cron Triggers so alerts fire with no device open.
// Rules come from the owner's synced "alerts" collection. Data comes through the same allowlisted gateway.
// Email goes through Resend's free tier (Cloudflare Email Service needs a custom domain the proxy does not have).
import { isFredFomc, parseFomcCalendar } from '../../shared/fomc';
import { checkQuote, coolingDown, DEFAULT_SETTINGS, inQuietHours, matchesKeyword, validRule, type AlertSettings, type Fired, type Rule } from '../../shared/alerts';
import { spendSpike } from '../../shared/ai';
import { rsi } from '../../shared/indicators';
import { isStale, type Snapshot } from '../../shared/portfolio';
import { buildUpstreamUrl, fetchUpstream, PROVIDERS, type KeyResolver } from './upstream';

export interface AlertDeps {
  rules: { id: string; v: unknown }[];
  key: KeyResolver;
  get(name: string): Promise<string | null>;
  put(name: string, value: string): Promise<void>;
  usage(): Promise<{ day: string; usd: number }[]>;
  portfolio(): Promise<{ snap: Snapshot | null; lastError: string | null; disconnected: boolean } | null>;
  email: string | null;
  ctx: { waitUntil(p: Promise<unknown>): void };
}

interface State { last: Record<string, number>; prev: Record<string, number>; seen: string[]; emails: { day: string; n: number } }
const EMAIL_CAP = 40;

async function gw<T>(d: AlertDeps, provider: string, path: string, search = ''): Promise<T | null> {
  const p = PROVIDERS[provider];
  if (!p) return null;
  const u = buildUpstreamUrl(p, path, search);
  if (!u) return null;
  const r = await fetchUpstream(p, u, d.key, d.ctx);
  if ('error' in r || r.res.status !== 200) return null;
  const text = new TextDecoder().decode(r.res.body);
  try { return JSON.parse(text) as T; } catch { return text as unknown as T; }
}

async function sendEmail(d: AlertDeps, subject: string, text: string): Promise<boolean> {
  const key = await d.key('RESEND_API_KEY');
  if (!key || !d.email) return false;
  const r = await fetch('https://api.resend.com/emails', {
    signal: AbortSignal.timeout(15_000),
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ from: 'Meridian Alerts <onboarding@resend.dev>', to: [d.email], subject: subject.slice(0, 120), text: `${text}\n\nPersonal research tool. Not financial advice.` }),
  });
  return r.ok;
}

export async function runAlerts(d: AlertDeps, mode: 'market' | 'hourly' | 'manual', now = Date.now()): Promise<Fired[]> {
  const settings: AlertSettings = { ...DEFAULT_SETTINGS, ...((d.rules.find((r) => r.id === '_settings')?.v as Partial<AlertSettings>) ?? {}) };
  const rules = d.rules.filter((r) => r.id !== '_settings' && validRule(r.v) && (r.v as Rule).enabled).map((r) => ({ id: r.id, r: r.v as Rule }));
  const st: State = { last: {}, prev: {}, seen: [], emails: { day: '', n: 0 }, ...JSON.parse((await d.get('alert_state')) ?? '{}') };
  const fired: Fired[] = [];
  const fire = (id: string, r: Rule | null, title: string, detail: string) => {
    if (r && coolingDown(r, st.last[id] ?? null, now)) return;
    if (!r && st.last[id] != null && now - st.last[id]! < 20 * 3600_000) return; // system alerts: once a day
    st.last[id] = now;
    fired.push({ id: `${id}:${now}`, rule: id, type: r?.type ?? 'system', sym: r?.sym, at: now, title, detail });
  };

  // Price-type rules: one snapshot request for every symbol.
  const priceTypes = new Set(['price_above', 'price_below', 'pct_move', 'line_cross', 'volume_spike', 'rsi_above', 'rsi_below']);
  const pr = rules.filter((x) => priceTypes.has(x.r.type));
  const syms = [...new Set(pr.map((x) => x.r.sym!))].slice(0, 100);
  if (syms.length && mode !== 'hourly') {
    const snaps = await gw<Record<string, { latestTrade?: { p: number; t: string }; dailyBar?: { c: number; v: number }; prevDailyBar?: { c: number } }>>(d, 'alpaca', '/v2/stocks/snapshots', `?symbols=${syms.join(',')}&feed=iex`);
    const needBars = [...new Set(pr.filter((x) => ['volume_spike', 'rsi_above', 'rsi_below'].includes(x.r.type)).map((x) => x.r.sym!))];
    const bars = needBars.length ? await gw<{ bars: Record<string, { c: number; v: number }[]> }>(d, 'alpaca', '/v2/stocks/bars', `?symbols=${needBars.join(',')}&timeframe=1Day&limit=40&feed=iex&start=${new Date(now - 70 * 86_400_000).toISOString().slice(0, 10)}`) : null;
    for (const { id, r } of pr) {
      const s = snaps?.[r.sym!];
      const price = s?.latestTrade?.p ?? s?.dailyBar?.c;
      if (price == null) continue;
      const b = bars?.bars?.[r.sym!] ?? [];
      const closes = b.map((x) => x.c);
      const quote = { price, prevClose: s?.prevDailyBar?.c ?? null, volume: s?.dailyBar?.v ?? null, avgVolume: b.length > 5 ? b.slice(-21, -1).reduce((a, x) => a + x.v, 0) / Math.min(20, b.length - 1) : null, rsi: closes.length > 15 ? rsi([...closes.slice(0, -1), price]).at(-1) ?? null : null, t: Math.floor(now / 1000) };
      const msg = checkQuote(r, quote, st.prev[id] ?? null);
      st.prev[id] = price;
      if (msg) fire(id, r, msg, r.note ?? 'Price alert');
    }
  }

  // News keyword rules (per symbol, or market-wide).
  for (const { id, r } of rules.filter((x) => x.r.type === 'news')) {
    const n = await gw<{ news: { id: number; headline: string; url: string; created_at: string }[] }>(d, 'alpaca', '/v1beta1/news', `?limit=30&sort=desc${r.sym ? `&symbols=${r.sym}` : ''}`);
    for (const a of n?.news ?? []) {
      const key = `n${a.id}`;
      if (st.seen.includes(key) || now - Date.parse(a.created_at) > 6 * 3600_000 || !matchesKeyword(a.headline, r.keyword!)) continue;
      st.seen.push(key);
      fired.push({ id: `${id}:${a.id}`, rule: id, type: 'news', sym: r.sym, at: now, title: `News: ${a.headline.slice(0, 140)}`, detail: a.url });
    }
  }

  // New SEC filings per ticker (EDGAR atom feed accepts a ticker).
  for (const { id, r } of rules.filter((x) => x.r.type === 'filing')) {
    const atom = await gw<string>(d, 'secwww', '/cgi-bin/browse-edgar', `?action=getcompany&CIK=${r.sym}&type=${encodeURIComponent((r.forms ?? '').split(',')[0]?.trim() ?? '')}&dateb=&owner=include&count=10&output=atom`);
    if (typeof atom !== 'string') continue;
    for (const m of atom.matchAll(/<entry>[\s\S]*?<\/entry>/g)) {
      const e = m[0];
      const acc = /<accession-number>([^<]+)/.exec(e)?.[1];
      const form = /<filing-type>([^<]+)/.exec(e)?.[1] ?? '';
      const date = /<filing-date>([^<]+)/.exec(e)?.[1] ?? '';
      const forms = (r.forms ?? '').split(',').map((x) => x.trim().toUpperCase()).filter(Boolean);
      if (!acc || st.seen.includes(acc) || (forms.length && !forms.includes(form.toUpperCase())) || now - Date.parse(date) > 3 * 86_400_000) continue;
      st.seen.push(acc);
      fired.push({ id: `${id}:${acc}`, rule: id, type: 'filing', sym: r.sym, at: now, title: `${r.sym} filed ${form} (${date})`, detail: /<filing-href>([^<]+)/.exec(e)?.[1] ?? '' });
    }
  }

  // Earnings tomorrow and macro releases today (once a day, hourly run).
  if (mode !== 'market') {
    const tomorrow = new Date(now + 86_400_000).toISOString().slice(0, 10);
    const er = rules.filter((x) => x.r.type === 'earnings');
    if (er.length) {
      const cal = await gw<{ earningsCalendar: { symbol: string; date: string; hour: string }[] }>(d, 'finnhub', '/api/v1/calendar/earnings', `?from=${tomorrow}&to=${tomorrow}`);
      for (const { id, r } of er) if (cal?.earningsCalendar.some((c) => c.symbol === r.sym)) fire(id, r, `${r.sym} reports earnings tomorrow (${tomorrow})`, 'Earnings calendar (Finnhub)');
    }
    const mr = rules.filter((x) => x.r.type === 'macro');
    if (mr.length) {
      const today = new Date(now).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      const rel = await gw<{ release_dates: { release_name: string; date: string }[] }>(d, 'fred', '/fred/releases/dates', `?realtime_start=${today}&realtime_end=${today}&include_release_dates_with_no_data=true&file_type=json`);
      // FRED's FOMC entry appears almost daily (data updates, not meetings); use the Fed's calendar instead.
      const list = (rel?.release_dates ?? []).filter((x) => !isFredFomc(x.release_name));
      const fedHtml = await gw<string>(d, 'fed', '/monetarypolicy/fomccalendars.htm');
      const fomc = typeof fedHtml === 'string' ? parseFomcCalendar(fedHtml).find((m) => m.statement === today) : undefined;
      if (fomc) list.push({ release_name: `FOMC statement at 2:00 PM ET (11:00 AM PT)${fomc.sep ? ' with projections' : ''}`, date: today });
      for (const { id, r } of mr) {
        const hit = list.find((x) => x.date === today && matchesKeyword(x.release_name, r.keyword!));
        if (hit) fire(id, r, `Today: ${hit.release_name}`, 'FRED release calendar and federalreserve.gov');
      }
    }
    // System alerts: portfolio stale or disconnected, AI spend spike.
    const p = await d.portfolio();
    if (p?.snap && (isStale(p.snap.at, now) || p.disconnected)) fire('sys:portfolio', null, `Portfolio ${p.disconnected ? 'disconnected' : 'stale'}`, p.lastError ?? 'Reconnect in PORT or ask Claude to "update the portfolio".');
    const spike = spendSpike(await d.usage(), new Date(now).toISOString().slice(0, 10));
    if (spike.warn) fire('sys:spend', null, `AI spend spike: $${spike.today.toFixed(2)} today`, `14-day average $${spike.avg.toFixed(2)} per day. No cap is set; review SET > AI usage.`);
  }

  // Delivery: email unless quiet hours, settings or the rule say no; daily cap.
  const day = new Date(now).toISOString().slice(0, 10);
  if (st.emails.day !== day) st.emails = { day, n: 0 };
  const quiet = inQuietHours(settings, now);
  const toEmail = fired.filter((f) => { const r = rules.find((x) => x.id === f.rule)?.r; return settings.email && !quiet && (r ? r.email : true); });
  if (toEmail.length && st.emails.n < EMAIL_CAP) {
    const subject = toEmail.length === 1 ? toEmail[0]!.title : `${toEmail.length} alerts: ${toEmail[0]!.title}`;
    const ok = await sendEmail(d, subject, toEmail.map((f) => `- ${f.title}\n  ${f.detail}`).join('\n'));
    if (ok) { st.emails.n++; toEmail.forEach((f) => (f.emailed = true)); }
  }

  st.seen = st.seen.slice(-500);
  await d.put('alert_state', JSON.stringify(st));
  if (fired.length) {
    const hist = JSON.parse((await d.get('alert_history')) ?? '[]') as Fired[];
    await d.put('alert_history', JSON.stringify([...fired, ...hist].slice(0, 300)));
  }
  return fired;
}
