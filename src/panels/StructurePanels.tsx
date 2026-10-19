// FTD fails to deliver, BORR borrow fees, CONG House trades, SQZ squeeze radar.
import { useMemo, useState } from 'react';
import { squeeze } from '../../shared/squeeze';
import { Lines } from '../charts/Lines';
import { tickers } from '../data/adapters/sec';
import { jobData } from '../data/adapters/jobs';
import { upPost } from '../data/client';
import { useData } from '../data/useData';
import { dir, downloadCsv, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

interface FtdJob { at: number; files: string[]; minValue: number; bySym: Record<string, [number, number, number][]> }
interface BorrowJob { at: number; asOf: string; rows: Record<string, [number, number, number, string]> }
interface Trade { t: string; kind: string; type: string; date: string; lo: number; hi: number; owner: string }
interface Filing { id: string; name: string; dist: string; filed: string; url: string; trades: Trade[] | null }
interface CongJob { at: number; filings: Filing[] }

const d8 = (n: number) => `${String(n).slice(0, 4)}-${String(n).slice(4, 6)}-${String(n).slice(6, 8)}`;
const avail = (n: number | null) => (n == null ? '-' : n > 10_000_000 ? '>10M' : fmtBig(n));
const OWNER: Record<string, string> = { SP: 'Spouse', JT: 'Joint', DC: 'Child', self: 'Member' };
const TYPE: Record<string, string> = { P: 'BUY', S: 'SELL', 'S (partial)': 'SELL (part)', E: 'EXCHANGE' };

// ---------- FTD ----------
function Ftd({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData('job:ftd', () => jobData<FtdJob>('ftd'), { source: 'SEC fails-to-deliver (daily job)', everyMs: 6 * 3600_000 });
  const rows = useMemo(() => st.data?.bySym[sym] ?? [], [st.data, sym]);
  const top = useMemo(() => {
    const m = st.data?.bySym ?? {};
    return Object.entries(m).map(([s, r]) => ({ s, v: Math.max(...r.map((x) => x[1] * x[2])), last: r.at(-1)! })).sort((a, b) => b.v - a.v).slice(0, 40);
  }, [st.data]);
  const chart = useMemo(() => [{ name: `${sym} fails ($M)`, rows: rows.map((r) => ({ t: Date.parse(d8(r[0])), v: (r[1] * r[2]) / 1e6 })) }], [rows, sym]);
  return (
    <>
      <DataStatus state={st} />
      <p><strong className="accent">{sym}</strong>: {rows.length ? `${rows.length} settlement days with fails of $${fmtBig(st.data!.minValue)} or more` : `no fails of $${fmtBig(st.data?.minValue ?? 250_000)} or more`} in {st.data?.files.length ?? 0} half-month SEC files.</p>
      {rows.length > 1 && <Lines series={chart} height={160} />}
      {rows.length > 0 && <table className="grid-table"><thead><tr><th>Settlement</th><th className="num">Shares failed</th><th className="num">Price</th><th className="num">Value</th></tr></thead><tbody>{[...rows].reverse().map((r) => <tr key={r[0]}><td>{d8(r[0])}</td><td className="num">{fmtBig(r[1])}</td><td className="num">{fmt(r[2])}</td><td className="num">${fmtBig(r[1] * r[2])}</td></tr>)}</tbody></table>}
      <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>LARGEST FAILS (PEAK DAY VALUE)</h4>
      <table className="grid-table"><tbody>{top.map((x) => <tr key={x.s} className="clickable" onClick={() => run(`${x.s} FTD`)}><td className="accent">{x.s}</td><td className="num">${fmtBig(x.v)}</td><td className="muted">{d8(x.last[0])}</td></tr>)}</tbody></table>
      <div className="disclaimer">SEC fails-to-deliver: shares not delivered on settlement date, published twice a month with about a two-week lag. Fails have many benign causes (operational delays, ETF creation timing). Not a direct measure of naked shorting.</div>
    </>
  );
}

// ---------- BORR ----------
function Borr({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData('job:borrow', () => jobData<BorrowJob>('borrow'), { source: 'IBKR short-stock file (daily job)', everyMs: 6 * 3600_000 });
  const r = st.data?.rows[sym];
  const hot = useMemo(() => Object.entries(st.data?.rows ?? {}).filter(([, v]) => v[2] >= 1000).sort((a, b) => b[1][0] - a[1][0]).slice(0, 50), [st.data]);
  return (
    <>
      <DataStatus state={st} />
      {st.data && (
        <table className="grid-table"><tbody>
          <tr><td><strong className="accent">{sym}</strong></td><td>{r?.[3] ?? 'not in the IBKR file'}</td><td>As of</td><td className="num">{st.data.asOf} ET</td></tr>
          <tr><td>Borrow fee (annual)</td><td className={`num ${r && r[0] > 10 ? 'down' : ''}`}>{r ? `${fmt(r[0], 2)}%` : '-'}</td><td>Rebate rate</td><td className="num">{r ? `${fmt(r[1], 2)}%` : '-'}</td></tr>
          <tr><td>Shares available</td><td className="num">{avail(r?.[2] ?? null)}</td><td /><td /></tr>
        </tbody></table>
      )}
      <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>MOST EXPENSIVE TO BORROW (1,000+ SHARES AVAILABLE)</h4>
      <table className="grid-table"><thead><tr><th>Ticker</th><th>Name</th><th className="num">Fee</th><th className="num">Available</th></tr></thead><tbody>{hot.map(([s, v]) => <tr key={s} className="clickable" onClick={() => run(`${s} BORR`)}><td className="accent">{s}</td><td className="muted">{v[3]}</td><td className="num down">{fmt(v[0], 1)}%</td><td className="num">{avail(v[2])}</td></tr>)}</tbody></table>
      <div className="disclaimer">Indicative rates from Interactive Brokers&apos; public short-stock file, IBKR only; other brokers differ. A high fee and low availability mean shorts are crowded. Personal use only.</div>
    </>
  );
}

// ---------- CONG ----------
function Cong({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData('job:congress', () => jobData<CongJob>('congress'), { source: 'House Clerk PTR filings (daily job)', everyMs: 6 * 3600_000 });
  const [q, setQ] = useState(sym === 'ALL' ? '' : sym);
  const rows = useMemo(() => {
    const out: { f: Filing; t: Trade }[] = [];
    for (const f of st.data?.filings ?? []) for (const t of f.trades ?? []) out.push({ f, t });
    const k = q.trim().toUpperCase();
    return (k ? out.filter((x) => x.t.t === k || x.f.name.toUpperCase().includes(k)) : out).slice(0, 400);
  }, [st.data, q]);
  const pending = (st.data?.filings ?? []).filter((f) => f.trades == null).length;
  const buys = useMemo(() => {
    const m = new Map<string, { n: number; members: Set<string> }>();
    for (const { f, t } of rows) if (t.type === 'P' && t.kind === 'ST') { const x = m.get(t.t) ?? { n: 0, members: new Set() }; x.n++; x.members.add(f.name); m.set(t.t, x); }
    return [...m].sort((a, b) => b[1].members.size - a[1].members.size || b[1].n - a[1].n).slice(0, 12);
  }, [rows]);
  return (
    <>
      <div className="toolbar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ticker or member name" style={{ width: 180 }} aria-label="Filter" /><button disabled={!rows.length} onClick={() => downloadCsv('congress.csv', [['filed', 'member', 'district', 'owner', 'ticker', 'type', 'trade_date', 'low', 'high', 'url'], ...rows.map(({ f, t }) => [f.filed, f.name, f.dist, OWNER[t.owner] ?? t.owner, t.t, t.type, t.date, t.lo, t.hi, f.url])])}>CSV</button></div>
      <DataStatus state={st} />
      {buys.length > 0 && <p className="muted">Most bought (by number of members): {buys.map(([t, v]) => <button key={t} className="link-btn" onClick={() => run(`${t} DES`)}>{t} ({v.members.size})</button>)}</p>}
      <table className="grid-table">
        <thead><tr><th>Filed</th><th>Member</th><th>Owner</th><th>Ticker</th><th>Type</th><th>Trade date</th><th className="num">Amount</th><th /></tr></thead>
        <tbody>{rows.map(({ f, t }, i) => <tr key={`${f.id}${i}`}><td>{f.filed}</td><td>{f.name} <span className="muted">{f.dist}</span></td><td className="muted">{OWNER[t.owner] ?? t.owner}</td><td><button className="link-btn" onClick={() => run(`${t.t} DES`)}>{t.t}</button>{t.kind === 'OP' && <span className="muted"> opt</span>}</td><td className={t.type === 'P' ? 'up' : t.type.startsWith('S') ? 'down' : ''}>{TYPE[t.type] ?? t.type}</td><td>{t.date}</td><td className="num">${fmtBig(t.lo)} to ${fmtBig(t.hi)}</td><td><a href={f.url} target="_blank" rel="noreferrer noopener">PDF</a></td></tr>)}</tbody>
      </table>
      <div className="disclaimer">US House periodic transaction reports (STOCK Act), from the Clerk&apos;s public bulk index. Trades are read from electronically filed PDFs automatically and can be missed or misread; always check the PDF. {pending} filings are paper scans or not yet parsed (link only). Members have up to 45 days to report. Senate reports are not included (the Senate site requires accepting terms per session). Use for research only; commercial use of this data is prohibited by law.</div>
    </>
  );
}

// ---------- SQZ ----------
interface SiRow { symbolCode: string; daysToCoverQuantity: number; changePercent: number; currentShortPositionQuantity: number; averageDailyVolumeQuantity: number }
const SI = '/data/group/otcMarket/name/consolidatedShortInterest';
const iso = (d: Date) => d.toISOString().slice(0, 10);

async function latestSettlement(): Promise<string> {
  const probe = async (from: Date) => (await upPost<{ settlementDate: string }[]>('finra', SI, { limit: 1, fields: ['settlementDate'], dateRangeFilters: [{ fieldName: 'settlementDate', startDate: iso(from), endDate: iso(new Date()) }] }, { maxAgeMs: 6 * 3600_000 })).data[0]?.settlementDate;
  let d = await probe(new Date(Date.now() - 35 * 86_400_000));
  if (!d) throw new Error('No recent FINRA short interest found');
  const newer = await probe(new Date(Date.parse(d) + 86_400_000));
  if (newer) d = newer;
  return d;
}

function Sqz({ run }: { run: PanelProps['run'] }) {
  const st = useData('sqz', async () => {
    const date = await latestSettlement();
    const [si, borrow, list] = await Promise.all([
      upPost<SiRow[]>('finra', SI, { limit: 3000, fields: ['symbolCode', 'daysToCoverQuantity', 'changePercent', 'currentShortPositionQuantity', 'averageDailyVolumeQuantity'], sortFields: ['-daysToCoverQuantity'], compareFilters: [{ fieldName: 'settlementDate', fieldValue: date, compareType: 'EQUAL' }, { fieldName: 'averageDailyVolumeQuantity', fieldValue: 100000, compareType: 'GTE' }] }, { maxAgeMs: 6 * 3600_000 }),
      jobData<BorrowJob>('borrow').catch(() => null),
      tickers(),
    ]);
    const listed = new Set(list.filter((t) => /^(NYSE|Nasdaq)$/.test(t.exchange)).map((t) => t.ticker));
    const rows = squeeze(si.data.filter((r) => listed.has(r.symbolCode) && r.daysToCoverQuantity > 0).map((r) => {
      const b = borrow?.data.rows[r.symbolCode];
      return { sym: r.symbolCode, dtc: r.daysToCoverQuantity, siChg: r.changePercent, shortQty: r.currentShortPositionQuantity, adv: r.averageDailyVolumeQuantity, fee: b ? b[0] : null, avail: b ? b[2] : null };
    }));
    return { data: { date, rows, borrowAsOf: borrow?.data.asOf ?? null }, fetchedAt: Date.now(), fromCache: false };
  }, { source: 'FINRA short interest + IBKR borrow file', everyMs: 6 * 3600_000 });
  const rows = (st.data?.rows ?? []).slice(0, 60);
  return (
    <>
      <DataStatus state={st} />
      {st.data && <p className="muted">Short interest settled {st.data.date}{st.data.borrowAsOf ? `; borrow fees ${st.data.borrowAsOf} ET` : '; borrow fees not loaded (run the Data jobs workflow)'}. NYSE and Nasdaq, average volume 100k+.</p>}
      <table className="grid-table">
        <thead><tr><th>#</th><th>Ticker</th><th className="num">Score</th><th className="num">Days to cover</th><th className="num">SI change</th><th className="num">Shares short</th><th className="num">Borrow fee</th><th className="num">Available</th></tr></thead>
        <tbody>{rows.map((r, i) => <tr key={r.sym} className="clickable" onClick={() => run(`${r.sym} SI`)}><td>{i + 1}</td><td className="accent">{r.sym}</td><td className="num">{fmt(r.score * 100, 0)}</td><td className="num">{fmt(r.dtc, 1)}</td><td className={`num ${dir(-r.siChg)}`}>{fmtPct(r.siChg, 1)}</td><td className="num">{fmtBig(r.shortQty)}</td><td className="num">{r.fee == null ? '-' : `${fmt(r.fee, 1)}%`}</td><td className="num">{avail(r.avail)}</td></tr>)}</tbody>
      </table>
      <div className="disclaimer">Score = average percentile of days to cover, short interest growth and borrow fee (fee weighted double). It ranks crowded shorts; it does not predict a squeeze, and most crowded shorts are crowded for good reasons. Short interest lags about two weeks. Not financial advice.</div>
    </>
  );
}

export default function StructurePanels({ code, security, run }: PanelProps) {
  const sym = (security ?? (code === 'CONG' || code === 'SQZ' ? 'ALL' : 'AAPL')).toUpperCase();
  return <div>{code === 'FTD' ? <Ftd sym={sym} run={run} /> : code === 'BORR' ? <Borr sym={sym} run={run} /> : code === 'CONG' ? <Cong sym={sym} run={run} /> : <Sqz run={run} />}</div>;
}
