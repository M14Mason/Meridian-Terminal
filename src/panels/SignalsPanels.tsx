// Real-world signals and market structure: HURR, QUAK, FIRE, WIKI, TRIAL, LOBB, PMKT, GOVC, SI, DPOOL,
// CROP, FOMC, MEVT, CACT, TV (catalog 58, 60, 65, 79, 81, 85 to 98; owner ideas 5 and 9).
import { useEffect, useMemo, useState } from 'react';
import { changeRatio, wordDiff } from '../../shared/diff';
import { matchEvent, normEvents, normSearch, type KEvent } from '../../shared/kalshi';
import { profile } from '../data/adapters/sec';
import { direct } from '../data/adapters/direct';
import { up, upPost } from '../data/client';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const km = (a: [number, number], b: [number, number]) => {
  const R = 6371;
  const toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(b[0] - a[0]);
  const dLon = toR(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const companyName = async (sym: string) => (await profile(sym)).data.name.replace(/\s*\/[A-Z]{2,3}\/?$/, '').replace(/,?\s+(INC|CORP|CORPORATION|CO|LTD|PLC|HOLDINGS?)\.?$/i, '').trim();
const iso = (d: Date) => d.toISOString().slice(0, 10);

// ---------- HURR ----------
const ENERGY_SITES: [string, number, number][] = [['Houston refining', 29.73, -95.05], ['Port Arthur / Beaumont refining', 29.9, -93.93], ['Lake Charles refining and LNG', 30.18, -93.25], ['New Orleans / Baton Rouge refining', 30.2, -91.0], ['Corpus Christi refining and LNG', 27.81, -97.4], ['Sabine Pass LNG', 29.73, -93.87], ['Florida citrus belt', 27.8, -81.5], ['Gulf of America offshore platforms', 27.5, -90.5]];
function Hurr() {
  const st = useData('hurr', () => up<{ activeStorms: { id: string; name: string; classification: string; intensity: string; pressure: string; latitudeNumeric: number; longitudeNumeric: number; movementDir: number; movementSpeed: number; lastUpdate: string; publicAdvisory?: { url: string } }[] }>('nhc', '/CurrentStorms.json'), { source: 'NOAA NHC', everyMs: 15 * 60_000 });
  const storms = st.data?.activeStorms ?? [];
  return (
    <>
      <DataStatus state={st} />
      {st.data && storms.length === 0 && <p className="muted">No active storms in the Atlantic or eastern Pacific.</p>}
      <table className="grid-table">
        <thead><tr><th>Storm</th><th>Type</th><th className="num">Wind (kt)</th><th>Position</th><th>Nearest energy or crop site</th></tr></thead>
        <tbody>
          {storms.map((s) => {
            const near = ENERGY_SITES.map(([n, la, lo]) => ({ n, d: km([s.latitudeNumeric, s.longitudeNumeric], [la, lo]) })).sort((a, b) => a.d - b.d)[0]!;
            return (
              <tr key={s.id}>
                <td>{s.publicAdvisory?.url ? <a href={s.publicAdvisory.url} target="_blank" rel="noreferrer noopener">{s.name}</a> : s.name}</td>
                <td>{s.classification}</td>
                <td className="num">{s.intensity}</td>
                <td className="muted">{fmt(s.latitudeNumeric, 1)}, {fmt(s.longitudeNumeric, 1)} moving {s.movementSpeed} mph</td>
                <td className={near.d < 500 ? 'down' : 'muted'}>{near.n}: {fmt(near.d, 0)} km{near.d < 500 ? ' (WATCH)' : ''}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="disclaimer">Source: NOAA National Hurricane Center. Distance is straight-line to the storm center, not a forecast track. Official forecasts and cones: nhc.noaa.gov.</div>
    </>
  );
}

// ---------- QUAK ----------
const INDUSTRY: [string, number, number][] = [['Taiwan chip fabs (Hsinchu)', 24.78, 121.0], ['Taiwan chip fabs (Tainan)', 23.0, 120.27], ['Japan chip fab (Kumamoto)', 32.8, 130.7], ['Korea chip fabs (Pyeongtaek)', 37.0, 127.06], ['Chile copper (Escondida)', -24.27, -69.07], ['Peru copper (Cerro Verde)', -16.53, -71.6], ['Silicon Valley', 37.4, -122.0], ['Japan autos (Toyota City)', 35.08, 137.15], ['Mexico autos (Bajio)', 21.0, -101.3], ['Turkey industry (Izmit)', 40.76, 29.9], ['Shenzhen electronics', 22.54, 114.06], ['Indonesia nickel (Sulawesi)', -2.5, 121.4]];
function Quak() {
  const st = useData('quak', () => up<{ features: { id: string; properties: { mag: number; place: string; time: number; url: string; tsunami: number }; geometry: { coordinates: [number, number, number] } }[] }>('usgs', '/earthquakes/feed/v1.0/summary/4.5_week.geojson'), { source: 'USGS', everyMs: 5 * 60_000 });
  const rows = (st.data?.features ?? []).map((f) => {
    const [lon, lat] = f.geometry.coordinates;
    const near = INDUSTRY.map(([n, la, lo]) => ({ n, d: km([lat, lon], [la, lo]) })).sort((a, b) => a.d - b.d)[0]!;
    return { ...f.properties, id: f.id, near };
  }).sort((a, b) => (a.near.d < 300 ? 0 : 1) - (b.near.d < 300 ? 0 : 1) || b.mag - a.mag);
  return (
    <>
      <DataStatus state={st} />
      <table className="grid-table">
        <thead><tr><th className="num">Mag</th><th>Where</th><th>When (UTC)</th><th>Nearest industrial site</th></tr></thead>
        <tbody>{rows.slice(0, 60).map((q) => <tr key={q.id}><td className={`num ${q.mag >= 6 ? 'down' : ''}`}>{fmt(q.mag, 1)}</td><td><a href={q.url} target="_blank" rel="noreferrer noopener">{q.place}</a>{q.tsunami ? <span className="down"> tsunami flag</span> : ''}</td><td className="muted">{new Date(q.time).toISOString().slice(0, 16).replace('T', ' ')}</td><td className={q.near.d < 300 && q.mag >= 5 ? 'down' : 'muted'}>{q.near.n}: {fmt(q.near.d, 0)} km</td></tr>)}</tbody>
      </table>
      <div className="disclaimer">Source: USGS, magnitude 4.5+ in the last 7 days. Sites near a magnitude 5+ quake within 300 km are flagged; actual damage depends on depth and building codes.</div>
    </>
  );
}

// ---------- FIRE: wildfires (FIRMS) and drought ----------
function Fire() {
  const drought = useData('fire:usdm', async () => {
    const end = new Date();
    const start = new Date(Date.now() - 21 * 86_400_000);
    const f = (d: Date) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${d.getUTCFullYear()}`;
    const r = await up<{ mapDate: string; d0: number; d1: number; d2: number; d3: number; d4: number }[]>('usdm', '/api/USStatistics/GetDroughtSeverityStatisticsByAreaPercent', { aoi: 'us', startdate: f(start), enddate: f(end), statisticsType: 1 });
    const last = [...r.data].sort((a, b) => a.mapDate.localeCompare(b.mapDate)).at(-1);
    if (!last) throw new Error('No drought data');
    return { ...r, data: { MapDate: last.mapDate.slice(0, 10), D0: last.d0, D1: last.d1, D2: last.d2, D3: last.d3 } };
  }, { source: 'US Drought Monitor', everyMs: 6 * 3600_000 });
  const fires = useData('fire:firms', async () => {
    const r = await up<string>('firms', '/api/country/csv/KEY/VIIRS_SNPP_NRT/USA/1', undefined, { text: true });
    const lines = r.data.trim().split('\n').slice(1);
    const cells = new Map<string, { lat: number; lon: number; n: number }>();
    for (const l of lines) {
      const [lat, lon] = l.split(',').map(Number);
      if (!Number.isFinite(lat!) || !Number.isFinite(lon!)) continue;
      const k = `${Math.round(lat! * 2) / 2},${Math.round(lon! * 2) / 2}`;
      const c = cells.get(k) ?? { lat: Math.round(lat! * 2) / 2, lon: Math.round(lon! * 2) / 2, n: 0 };
      c.n++;
      cells.set(k, c);
    }
    return { ...r, data: { total: lines.length, clusters: [...cells.values()].sort((a, b) => b.n - a.n).slice(0, 15) } };
  }, { source: 'NASA FIRMS', everyMs: 1800_000 });
  const d = drought.data;
  return (
    <>
      <h4 className="accent" style={{ fontSize: 12, margin: '2px 0' }}>US DROUGHT (share of contiguous US area)</h4>
      <DataStatus state={drought} />
      {d && <dl className="kv"><dt>Week of</dt><dd>{d.MapDate}</dd><dt>Abnormally dry or worse (D0-D4)</dt><dd>{d.D0}%</dd><dt>Moderate drought or worse (D1-D4)</dt><dd>{d.D1}%</dd><dt>Severe or worse (D2-D4)</dt><dd className="down">{d.D2}%</dd><dt>Extreme or exceptional (D3-D4)</dt><dd className="down">{d.D3}%</dd></dl>}
      <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>US FIRE DETECTIONS (LAST 24 HOURS)</h4>
      <DataStatus state={fires} keyName="NASA FIRMS" />
      {fires.data && (
        <>
          <p>{fmtBig(fires.data.total)} satellite fire detections. Largest clusters (half-degree cells):</p>
          <table className="grid-table"><tbody>{fires.data.clusters.map((c) => <tr key={`${c.lat},${c.lon}`}><td>{c.lat}, {c.lon}</td><td className="num">{c.n}</td></tr>)}</tbody></table>
        </>
      )}
      <div className="disclaimer">Sources: US Drought Monitor (weekly, Thursdays) and NASA FIRMS VIIRS active fire detections. A detection is a hot pixel, which can include industrial flares and prescribed burns.</div>
    </>
  );
}

// ---------- WIKI: attention spikes ----------
function Wiki({ sym }: { sym: string }) {
  const st = useData(`wiki:${sym}`, async () => {
    const name = await companyName(sym);
    const s = await up<[string, string[]]>('wikipedia', '/w/api.php', { action: 'opensearch', search: name, limit: 1, format: 'json' });
    const title = s.data[1][0];
    if (!title) throw new Error(`No Wikipedia article found for ${name}`);
    const end = new Date(Date.now() - 86_400_000);
    const start = new Date(Date.now() - 91 * 86_400_000);
    const f = (d: Date) => iso(d).replace(/-/g, '');
    const v = await up<{ items: { timestamp: string; views: number }[] }>('wikimedia', `/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/daily/${f(start)}/${f(end)}`);
    return { ...v, data: { title, items: v.data.items } };
  }, { source: 'Wikimedia pageviews', everyMs: 6 * 3600_000 });
  const items = st.data?.items ?? [];
  const views = items.map((i) => i.views);
  const median = [...views].sort((a, b) => a - b)[Math.floor(views.length / 2)] ?? 0;
  const last = views.at(-1) ?? 0;
  const max = Math.max(...views, 1);
  return (
    <>
      <DataStatus state={st} />
      {st.data && (
        <>
          <p>Article: <a href={`https://en.wikipedia.org/wiki/${encodeURIComponent(st.data.title)}`} target="_blank" rel="noreferrer noopener">{st.data.title}</a>. Yesterday {fmtBig(last)} views vs 90-day median {fmtBig(median)}: <span className={last > median * 2 ? 'accent' : ''}>{fmt(median ? last / median : 0, 1)}x</span>{last > median * 2 ? ' (spike)' : ''}.</p>
          <svg viewBox="0 0 450 80" style={{ width: '100%', maxWidth: 600 }} role="img" aria-label="Daily Wikipedia pageviews">{views.map((v, i) => <rect key={i} x={i * 5} y={80 - (v / max) * 78} width={4} height={(v / max) * 78} fill={v > median * 2 ? 'var(--text)' : 'var(--text-dim)'} />)}</svg>
        </>
      )}
      <div className="disclaimer">Wikimedia pageviews (human traffic, English Wikipedia). Attention spikes often follow news; they are not buy or sell signals.</div>
    </>
  );
}

// ---------- TRIAL ----------
function Trial({ sym }: { sym: string }) {
  const st = useData(`trial:${sym}`, async () => {
    const name = await companyName(sym);
    const r = await up<{ studies: { protocolSection: { identificationModule: { nctId: string; briefTitle: string }; statusModule: { overallStatus: string; primaryCompletionDateStruct?: { date: string } }; designModule?: { phases?: string[] }; conditionsModule?: { conditions?: string[] } } }[] }>('clinicaltrials', '/api/v2/studies', { 'query.spons': name, 'filter.overallStatus': 'RECRUITING,ACTIVE_NOT_RECRUITING,NOT_YET_RECRUITING', pageSize: 60, sort: 'LastUpdatePostDate:desc' });
    return { ...r, data: { name, studies: r.data.studies ?? [] } };
  }, { source: 'ClinicalTrials.gov', everyMs: 6 * 3600_000 });
  const s = st.data?.studies ?? [];
  const phase3 = s.filter((x) => x.protocolSection.designModule?.phases?.includes('PHASE3')).length;
  return (
    <>
      <DataStatus state={st} />
      {st.data && <p>{s.length} active trials sponsored by &quot;{st.data.name}&quot;, {phase3} in Phase 3.</p>}
      <table className="grid-table">
        <thead><tr><th>Trial</th><th>Phase</th><th>Status</th><th>Primary completion</th></tr></thead>
        <tbody>{s.map((x) => { const p = x.protocolSection; return <tr key={p.identificationModule.nctId}><td><a href={`https://clinicaltrials.gov/study/${p.identificationModule.nctId}`} target="_blank" rel="noreferrer noopener">{p.identificationModule.briefTitle}</a></td><td className="accent">{(p.designModule?.phases ?? []).join('/').replace(/PHASE/g, 'P')}</td><td className="muted">{p.statusModule.overallStatus.replace(/_/g, ' ').toLowerCase()}</td><td>{p.statusModule.primaryCompletionDateStruct?.date ?? '-'}</td></tr>; })}</tbody>
      </table>
      <div className="disclaimer">ClinicalTrials.gov, matched by sponsor name. Completion dates are estimates set by sponsors. FDA decision dates are not published in a free official calendar (docs/OMITTED.md).</div>
    </>
  );
}

// ---------- LOBB ----------
function Lobb({ sym }: { sym: string }) {
  const st = useData(`lobb:${sym}`, async () => {
    const name = await companyName(sym);
    const year = new Date().getUTCFullYear();
    const rows = await Promise.all([year, year - 1].map((y) => up<{ results: { filing_year: number; filing_period_display: string; income: string | null; expenses: string | null; registrant: { name: string }; lobbying_activities: { general_issue_code_display: string }[] }[] }>('lda', '/api/v1/filings/', { client_name: name, filing_year: y }).then((r) => r.data.results ?? []).catch(() => [])));
    return { data: { name, filings: rows.flat() }, fetchedAt: Date.now(), fromCache: false };
  }, { source: 'Senate LDA', everyMs: 24 * 3600_000 });
  const f = st.data?.filings ?? [];
  const byYear = new Map<number, number>();
  const issues = new Map<string, number>();
  for (const x of f) {
    byYear.set(x.filing_year, (byYear.get(x.filing_year) ?? 0) + Number(x.expenses ?? x.income ?? 0));
    for (const a of x.lobbying_activities ?? []) issues.set(a.general_issue_code_display, (issues.get(a.general_issue_code_display) ?? 0) + 1);
  }
  return (
    <>
      <DataStatus state={st} />
      {st.data && <p>Client name searched: &quot;{st.data.name}&quot;. {f.length} filings. {[...byYear.entries()].map(([y, v]) => `${y}: $${fmtBig(v)}`).join(' · ')}</p>}
      <p className="muted">Top issues: {[...issues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k]) => k).join(', ') || '-'}</p>
      <div className="disclaimer">Senate Lobbying Disclosure Act filings (lda.gov), matched by client name, so subsidiaries filed under other names are missed. Quarterly amounts are reported in ranges by some filers.</div>
    </>
  );
}

// ---------- PMKT ----------
const cents = (v: number | null) => (v == null ? '-' : `${fmt(v, v % 1 ? 1 : 0)}¢`);
function MarketRows({ e }: { e: KEvent }) {
  const [all, setAll] = useState(false);
  const rows = all ? e.markets : e.markets.slice(0, 6);
  return (
    <div style={{ marginBottom: 8 }}>
      <div><a className="accent" href={`https://kalshi.com/markets/${e.ticker.split('-')[0]!.toLowerCase()}`} target="_blank" rel="noreferrer noopener">{e.title}</a> <span className="muted">{e.sub}</span></div>
      <table className="grid-table">
        <thead><tr><th>Outcome</th><th className="num">Chance</th><th /><th className="num">Bid</th><th className="num">Ask</th><th className="num">Last</th><th className="num">Chg</th><th className="num">Vol 24h</th><th className="num">Vol</th><th>Closes</th></tr></thead>
        <tbody>{rows.map((m) => {
          const chg = m.last != null && m.prev != null && m.prev > 0 ? m.last - m.prev : null;
          return (
            <tr key={m.ticker}>
              <td title={m.ticker}>{m.label}</td>
              <td className="num accent"><strong>{m.chance == null ? '-' : `${fmt(m.chance, m.chance < 1 || m.chance > 99 ? 1 : 0)}%`}</strong></td>
              <td style={{ width: 70 }}><div style={{ height: 6, background: 'var(--border, #333)' }}><div style={{ width: `${Math.min(100, m.chance ?? 0)}%`, height: 6, background: 'var(--accent, #ffa028)' }} /></div></td>
              <td className="num up">{cents(m.bid)}</td>
              <td className="num down">{cents(m.ask)}</td>
              <td className="num">{cents(m.last)}</td>
              <td className={`num ${dir(chg ?? 0)}`}>{chg == null || chg === 0 ? '' : `${chg > 0 ? '+' : ''}${fmt(chg, chg % 1 ? 1 : 0)}`}</td>
              <td className="num muted">{fmtBig(m.vol24)}</td>
              <td className="num muted">{fmtBig(m.vol)}</td>
              <td className="muted">{m.close ? m.close.slice(0, 10) : '-'}</td>
            </tr>
          );
        })}</tbody>
      </table>
      {e.markets.length > 6 && <button className="link-btn" onClick={() => setAll(!all)}>{all ? 'show fewer' : `show all ${e.markets.length}`}</button>}
    </div>
  );
}

function Pmkt({ sym }: { sym: string }) {
  const [cat, setCat] = useState('Economics');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  // Search Kalshi 400 ms after typing stops.
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 400);
    return () => clearTimeout(t);
  }, [text]);
  const st = useData('pmkt', async () => {
    const r = await up<{ events?: Record<string, unknown>[] }>('kalshi', '/trade-api/v2/events', { status: 'open', with_nested_markets: 'true', limit: 200 });
    return { ...r, data: normEvents(r.data) };
  }, { source: 'Kalshi', everyMs: 5 * 60_000 });
  const found = useData(q.length >= 2 ? `pmkt:q:${q.toLowerCase()}` : null, async () => {
    const r = await up<{ current_page?: Record<string, unknown>[] }>('kalshi', '/v1/search/series', { query: q, page_size: 25 });
    return { ...r, data: normSearch(r.data) };
  }, { source: 'Kalshi search', everyMs: 2 * 60_000 });
  const loaded = st.data ?? [];
  const cats = [...new Set(loaded.map((e) => e.category))].sort();
  const searching = q.length >= 2;
  // Search results first, then any loaded events that also match (deduplicated).
  const hits = searching ? [...(found.data ?? []), ...loaded.filter((e) => matchEvent(e, q))].filter((e, i, arr) => e.markets.length && arr.findIndex((x) => x.ticker === e.ticker) === i) : [];
  const events = searching ? hits : loaded.filter((e) => e.category === cat && e.markets.length);
  return (
    <>
      <div className="toolbar">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search markets: nvda, fed, cpi, bitcoin..." aria-label="Search prediction markets" style={{ width: 260 }} />
        <button onClick={() => setText(sym)}>{sym}</button>
        {text && <button onClick={() => setText('')}>CLEAR</button>}
      </div>
      {!searching && <div className="toolbar">{cats.map((c) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}</div>}
      <DataStatus state={searching ? found : st} />
      {searching && !found.loading && <p className="muted">{events.length ? `${events.length} events match "${q}"` : `No open markets match "${q}". Try a company name (nvidia) or topic (fed, cpi, oil).`}</p>}
      {events.slice(0, 40).map((e) => <MarketRows key={e.ticker} e={e} />)}
      <div className="disclaimer">Kalshi (a CFTC-regulated exchange) public market data. Chance is the market-implied probability: the bid/ask midpoint when the spread is 10¢ or less, otherwise the last trade. Bid and ask are the YES side in cents (a YES contract pays $1). Model estimate of the crowd, not financial advice. Viewing only; this app never trades. Thin markets can be noisy.</div>
    </>
  );
}

// ---------- GOVC ----------
function Govc({ sym }: { sym: string }) {
  const st = useData(`govc:${sym}`, async () => {
    const name = await companyName(sym);
    const end = new Date();
    const start = new Date(Date.now() - 365 * 86_400_000);
    const r = await direct<{ results: { 'Award ID': string; 'Recipient Name': string; 'Award Amount': number; 'Awarding Agency': string; 'Start Date'?: string }[] }>('usaspending', '/api/v2/search/spending_by_award/', { maxAgeMs: 24 * 3600_000, body: {
      filters: { recipient_search_text: [name], award_type_codes: ['A', 'B', 'C', 'D'], time_period: [{ start_date: iso(start), end_date: iso(end) }] },
      fields: ['Award ID', 'Recipient Name', 'Award Amount', 'Awarding Agency', 'Start Date'],
      limit: 50, sort: 'Award Amount', order: 'desc',
    } });
    return { ...r, data: { name, rows: r.data.results ?? [] } };
  }, { source: 'USAspending', everyMs: 24 * 3600_000 });
  const rows = st.data?.rows ?? [];
  return (
    <>
      <DataStatus state={st} />
      {st.data && <p>Contracts to recipients matching &quot;{st.data.name}&quot; (last 12 months, largest 50): ${fmtBig(rows.reduce((s, r) => s + (r['Award Amount'] ?? 0), 0))}</p>}
      <table className="grid-table"><thead><tr><th>Recipient</th><th>Agency</th><th className="num">Award</th><th>Start</th></tr></thead><tbody>{rows.map((r) => <tr key={r['Award ID']}><td>{r['Recipient Name']}</td><td className="muted">{r['Awarding Agency']}</td><td className="num">${fmtBig(r['Award Amount'])}</td><td>{r['Start Date'] ?? '-'}</td></tr>)}</tbody></table>
      <div className="disclaimer">USAspending.gov federal contract awards, matched by recipient name text. Award amounts are obligations, not revenue recognized.</div>
    </>
  );
}

// ---------- SI and DPOOL (FINRA public data) ----------
function Si({ sym }: { sym: string }) {
  const st = useData(`si:${sym}`, () => upPost<{ settlementDate: string; currentShortPositionQuantity: number; changePercent: number; daysToCoverQuantity: number; averageDailyVolumeQuantity: number }[]>('finra', '/data/group/otcMarket/name/consolidatedShortInterest', { limit: 20, compareFilters: [{ fieldName: 'symbolCode', fieldValue: sym, compareType: 'EQUAL' }], dateRangeFilters: [{ fieldName: 'settlementDate', startDate: iso(new Date(Date.now() - 400 * 86_400_000)), endDate: iso(new Date()) }] }, { maxAgeMs: 6 * 3600_000 }), { source: 'FINRA', note: 'twice monthly', everyMs: 6 * 3600_000 });
  const rows = [...(st.data ?? [])].sort((a, b) => b.settlementDate.localeCompare(a.settlementDate));
  return (
    <>
      <DataStatus state={st} empty={rows.length === 0} />
      <table className="grid-table"><thead><tr><th>Settlement</th><th className="num">Shares short</th><th className="num">Change</th><th className="num">Days to cover</th><th className="num">Avg daily volume</th></tr></thead><tbody>{rows.map((r) => <tr key={r.settlementDate}><td>{r.settlementDate}</td><td className="num">{fmtBig(r.currentShortPositionQuantity)}</td><td className={`num ${r.changePercent > 0 ? 'down' : 'up'}`}>{fmtPct(r.changePercent, 1)}</td><td className="num">{fmt(r.daysToCoverQuantity, 2)}</td><td className="num">{fmtBig(r.averageDailyVolumeQuantity)}</td></tr>)}</tbody></table>
      <div className="disclaimer">FINRA consolidated short interest, reported twice a month with about a two-week lag. Short interest as % of float needs share float data, which is not free.</div>
    </>
  );
}

function Dpool({ sym }: { sym: string }) {
  const st = useData(`dpool:${sym}`, () => upPost<{ weekStartDate: string; totalWeeklyShareQuantity: number; marketParticipantName: string; summaryTypeCode: string }[]>('finra', '/data/group/otcMarket/name/weeklySummary', { limit: 500, compareFilters: [{ fieldName: 'issueSymbolIdentifier', fieldValue: sym, compareType: 'EQUAL' }], dateRangeFilters: [{ fieldName: 'weekStartDate', startDate: iso(new Date(Date.now() - 120 * 86_400_000)), endDate: iso(new Date()) }] }, { maxAgeMs: 6 * 3600_000 }), { source: 'FINRA', note: 'weekly, delayed', everyMs: 6 * 3600_000 });
  const res = useMemo(() => {
    const ats = (st.data ?? []).filter((r) => r.summaryTypeCode === 'ATS_W_SMBL_FIRM');
    const weeks = new Map<string, number>();
    const venues = new Map<string, number>();
    for (const r of ats) {
      weeks.set(r.weekStartDate, (weeks.get(r.weekStartDate) ?? 0) + r.totalWeeklyShareQuantity);
      venues.set(r.marketParticipantName, (venues.get(r.marketParticipantName) ?? 0) + r.totalWeeklyShareQuantity);
    }
    return { weeks: [...weeks.entries()].sort((a, b) => b[0].localeCompare(a[0])), venues: [...venues.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8) };
  }, [st.data]);
  return (
    <>
      <DataStatus state={st} empty={res.weeks.length === 0} />
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <table className="grid-table" style={{ width: 'auto' }}><thead><tr><th>Week of</th><th className="num">ATS shares</th></tr></thead><tbody>{res.weeks.map(([w, v]) => <tr key={w}><td>{w}</td><td className="num">{fmtBig(v)}</td></tr>)}</tbody></table>
        <table className="grid-table" style={{ width: 'auto' }}><thead><tr><th>Top venues</th><th className="num">Shares</th></tr></thead><tbody>{res.venues.map(([n, v]) => <tr key={n}><td>{n}</td><td className="num">{fmtBig(v)}</td></tr>)}</tbody></table>
      </div>
      <div className="disclaimer">FINRA OTC Transparency: weekly volume on alternative trading systems (dark pools). Published with a 2 to 4 week delay. Direction (buy or sell) is not reported.</div>
    </>
  );
}

// ---------- CROP ----------
const CROPS = ['CORN', 'SOYBEANS', 'WHEAT', 'COTTON'];
function Crop() {
  const year = new Date().getUTCFullYear();
  const st = useData(`crop:${year}`, async () => {
    const res = await Promise.allSettled(CROPS.map((c) => up<{ data: { week_ending: string; Value: string; unit_desc: string; short_desc: string }[] }>('nass', '/api/api_GET/', { commodity_desc: c, statisticcat_desc: 'CONDITION', agg_level_desc: 'NATIONAL', year, format: 'JSON' })));
    const ok = res.filter((r) => r.status === 'fulfilled');
    if (!ok.length) throw (res[0] as PromiseRejectedResult).reason;
    return { data: CROPS.map((c, i) => {
      const r = res[i]!;
      if (r.status !== 'fulfilled') return { c, week: null, ge: null };
      const rows = r.value.data.data.filter((x) => /GOOD|EXCELLENT/.test(x.unit_desc));
      const week = rows.map((x) => x.week_ending).sort().at(-1);
      const ge = rows.filter((x) => x.week_ending === week).reduce((s, x) => s + Number(x.Value), 0);
      return { c, week: week ?? null, ge: week ? ge : null };
    }), fetchedAt: Date.now(), fromCache: false };
  }, { source: 'USDA NASS', everyMs: 6 * 3600_000 });
  return (
    <>
      <DataStatus state={st} keyName="USDA NASS" />
      <table className="grid-table"><thead><tr><th>Crop</th><th className="num">Good or excellent</th><th>Week ending</th></tr></thead><tbody>{(st.data ?? []).map((r) => <tr key={r.c}><td>{r.c.toLowerCase()}</td><td className="num">{r.ge != null ? `${r.ge}%` : 'out of season'}</td><td className="muted">{r.week ?? '-'}</td></tr>)}</tbody></table>
      <div className="disclaimer">USDA NASS weekly Crop Progress, national condition ratings (in season only). Higher good-or-excellent shares usually mean bigger harvests and softer prices.</div>
    </>
  );
}

// ---------- FOMC: statement diff ----------
function Fomc() {
  const st = useData('fomc', async () => {
    const cal = await up<string>('fed', '/monetarypolicy/fomccalendars.htm', undefined, { text: true });
    const links = [...new Set([...cal.data.matchAll(/monetary(20\d{6})a\.htm/g)].map((m) => m[1]!))].sort();
    const [prev, cur] = links.slice(-2);
    if (!prev || !cur) throw new Error('No statements found');
    const text = async (d: string) => {
      const h = (await up<string>('fed', `/newsevents/pressreleases/monetary${d}a.htm`, undefined, { text: true })).data;
      const art = /<div[^>]*id="article"[^>]*>([\s\S]*?)(<div[^>]*(class="[^"]*lastUpdate|id="lastUpdate))/.exec(h)?.[1] ?? '';
      const paras = [...art.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()).filter((p) => p.length > 40 && !/^(For media inquiries|Implementation Note|For release at)/.test(p));
      return paras.join(' ');
    };
    const [a, b] = await Promise.all([text(prev), text(cur)]);
    // Upcoming meetings from the calendar blocks.
    const meetings: string[] = [];
    for (const blk of cal.data.split(/(\d{4}) FOMC Meetings/).slice(1).reduce<[string, string][]>((acc, x, i, arr) => (i % 2 === 0 ? [...acc, [x, arr[i + 1] ?? '']] : acc), [])) {
      for (const m of blk[1].matchAll(/fomc-meeting__month[^>]*><strong>([A-Za-z/]+)<\/strong>[\s\S]*?fomc-meeting__date[^>]*>([0-9*-]+)/g)) meetings.push(`${m[1]} ${m[2]} ${blk[0]}`);
    }
    return { ...cal, data: { prev, cur, a, b, meetings } };
  }, { source: 'federalreserve.gov', everyMs: 6 * 3600_000 });
  const ops = useMemo(() => (st.data ? wordDiff(st.data.a, st.data.b) : []), [st.data]);
  const fmtD = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
  return (
    <>
      <DataStatus state={st} />
      {st.data && (
        <>
          <p>Statement {fmtD(st.data.cur)} vs {fmtD(st.data.prev)}: <span className="accent">{fmt(changeRatio(ops) * 100, 0)}% of words changed</span>. <span className="up">Green = added</span>, <span className="down" style={{ textDecoration: 'line-through' }}>red = removed</span>.</p>
          <div style={{ lineHeight: 1.6, color: 'var(--value)' }}>
            {ops.map((o, i) => <span key={i} className={o.kind === 'add' ? 'up' : o.kind === 'del' ? 'down' : ''} style={o.kind === 'del' ? { textDecoration: 'line-through' } : o.kind === 'add' ? { background: 'rgba(30,224,90,0.12)' } : undefined}>{o.text} </span>)}
          </div>
          <p className="muted">Meetings listed on the Fed calendar: {st.data.meetings.slice(-8).join(' · ')} (* = with projections)</p>
        </>
      )}
      <div className="disclaimer">Source: federalreserve.gov (public domain). Word-level comparison of the two most recent FOMC statements.</div>
    </>
  );
}

// ---------- MEVT: market event calendar (computed) ----------
function nthWeekday(y: number, m: number, weekday: number, n: number) {
  const d = new Date(Date.UTC(y, m, 1));
  const shift = (weekday - d.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(y, m, 1 + shift + (n - 1) * 7));
}
function Mevt() {
  const rows = useMemo(() => {
    const out: { date: string; what: string; kind: string }[] = [];
    const now = new Date();
    for (let k = 0; k < 7; k++) {
      const y = now.getUTCFullYear() + Math.floor((now.getUTCMonth() + k) / 12);
      const m = (now.getUTCMonth() + k) % 12;
      const opex = nthWeekday(y, m, 5, 3);
      const quad = [2, 5, 8, 11].includes(m);
      out.push({ date: iso(opex), what: quad ? 'Quad witching (stock and index options and futures expire); quarterly large-cap index rebalance takes effect after the close' : 'Monthly options expiration', kind: quad ? 'QUAD' : 'OPEX' });
      // VIX options expire on the Wednesday 30 days before the next month's standard expiration.
      const nextOpex = nthWeekday(m === 11 ? y + 1 : y, (m + 1) % 12, 5, 3);
      const vix = new Date(nextOpex.getTime() - 30 * 86_400_000);
      out.push({ date: iso(vix), what: 'VIX options and futures settle (usual rule; holidays shift it)', kind: 'VIX' });
      if (m === 5) out.push({ date: iso(nthWeekday(y, 5, 5, 4)), what: 'Small-cap index annual reconstitution (usually late June; check the index provider)', kind: 'REBAL' });
    }
    return out.filter((r) => r.date >= iso(now)).sort((a, b) => a.date.localeCompare(b.date));
  }, []);
  return (
    <>
      <table className="grid-table"><tbody>{rows.map((r) => <tr key={r.date + r.kind}><td>{r.date}</td><td className="accent">{r.kind}</td><td>{r.what}</td></tr>)}</tbody></table>
      <div className="disclaimer">Computed from standard exchange rules; holidays can move dates. Fed blackout windows (staff do not speak publicly) start the second Saturday before each FOMC meeting: see FOMC for meeting dates.</div>
    </>
  );
}

// ---------- CACT: corporate actions ----------
function Cact({ run }: { run: PanelProps['run'] }) {
  const st = useData('cact', () => up<{ results?: { ticker: string; execution_date: string; split_from: number; split_to: number }[] }>('massive', '/v3/reference/splits', { 'execution_date.gte': iso(new Date()), order: 'asc', sort: 'execution_date', limit: 200 }, { maxAgeMs: 6 * 3600_000 }), { source: 'Massive', everyMs: 6 * 3600_000 });
  const rows = st.data?.results ?? [];
  return (
    <>
      <DataStatus state={st} keyName="Massive" empty={rows.length === 0} />
      <table className="grid-table"><thead><tr><th>Date</th><th>Ticker</th><th>Split</th></tr></thead><tbody>{rows.map((r) => <tr key={r.ticker + r.execution_date}><td>{r.execution_date}</td><td><button className="link-btn" onClick={() => run(`${r.ticker} DES`)}>{r.ticker}</button></td><td className={r.split_to > r.split_from ? 'up' : 'down'}>{r.split_to}-for-{r.split_from}{r.split_to < r.split_from ? ' (reverse)' : ''}</td></tr>)}</tbody></table>
      <div className="disclaimer">Upcoming stock splits from Massive. Dividends: BDVD. Reverse splits often come with listing-compliance problems.</div>
    </>
  );
}

// ---------- AUCT: Treasury auctions ----------
interface Auction { auction_date: string; security_type: string; security_term: string; high_yield: string | null; high_discnt_rate: string | null; bid_to_cover_ratio: string | null; offering_amt: string | null; indirect_bidder_accepted: string | null; total_accepted: string | null }
function Auct() {
  const st = useData('auct', () => direct<{ data: Auction[] }>('treasury', '/services/api/fiscal_service/v1/accounting/od/auctions_query?sort=-auction_date&page%5Bsize%5D=60&filter=auction_date:lte:' + iso(new Date()), { maxAgeMs: 3600_000 }), { source: 'US Treasury', everyMs: 3600_000 });
  const rows = (st.data?.data ?? []).filter((r) => r.bid_to_cover_ratio && r.bid_to_cover_ratio !== 'null');
  const n = (x: string | null) => (x && x !== 'null' ? Number(x) : null);
  return (
    <>
      <DataStatus state={st} />
      <table className="grid-table">
        <thead><tr><th>Date</th><th>Security</th><th className="num">High yield / rate</th><th className="num">Bid-to-cover</th><th className="num">Indirect share</th><th className="num">Size</th></tr></thead>
        <tbody>
          {rows.map((r, i) => {
            const ind = n(r.indirect_bidder_accepted);
            const tot = n(r.total_accepted);
            return <tr key={i}><td>{r.auction_date}</td><td>{r.security_term} {r.security_type}</td><td className="num">{fmt(n(r.high_yield) ?? n(r.high_discnt_rate), 3)}%</td><td className={`num ${(n(r.bid_to_cover_ratio) ?? 0) < 2.3 ? 'down' : ''}`}>{fmt(n(r.bid_to_cover_ratio), 2)}</td><td className="num">{ind && tot ? fmt((ind / tot) * 100, 1) + '%' : '-'}</td><td className="num">${fmtBig(n(r.offering_amt))}</td></tr>;
          })}
        </tbody>
      </table>
      <div className="disclaimer">US Treasury Fiscal Data, auction results. A low bid-to-cover or a weak indirect (often foreign) share can signal soft demand. The grading of an auction as tailing needs the when-issued yield, which is not free.</div>
    </>
  );
}

function Tv() {
  return (
    <div className="state">
      <p>Live business TV streams cannot be embedded without a license. This opens a free public stream in a new tab (the site limits free viewing time).</p>
      <a className="cmd__go" style={{ padding: '6px 12px', textDecoration: 'none', width: 'fit-content' }} href="https://www.bloomberg.com/live/us" target="_blank" rel="noreferrer noopener">OPEN LIVE TV</a>
    </div>
  );
}

export default function SignalsPanels({ code, security, run }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  const needsSym = ['WIKI', 'TRIAL', 'LOBB', 'GOVC', 'SI', 'DPOOL'].includes(code);
  return (
    <div>
      {needsSym && <div className="toolbar"><strong className="accent">{sym}</strong></div>}
      {code === 'HURR' && <Hurr />}
      {code === 'QUAK' && <Quak />}
      {code === 'FIRE' && <Fire />}
      {code === 'WIKI' && <Wiki sym={sym} />}
      {code === 'TRIAL' && <Trial sym={sym} />}
      {code === 'LOBB' && <Lobb sym={sym} />}
      {code === 'PMKT' && <Pmkt sym={sym} />}
      {code === 'GOVC' && <Govc sym={sym} />}
      {code === 'SI' && <Si sym={sym} />}
      {code === 'DPOOL' && <Dpool sym={sym} />}
      {code === 'CROP' && <Crop />}
      {code === 'FOMC' && <Fomc />}
      {code === 'MEVT' && <Mevt />}
      {code === 'CACT' && <Cact run={run} />}
      {code === 'TV' && <Tv />}
      {code === 'AUCT' && <Auct />}
    </div>
  );
}

export { dir };
