// Filings intelligence: FLAG, CORR, FORMD, SPIN, MARB (catalog 112 to 114, owner hedge fund toolkit).
import { useMemo, useState } from 'react';
import { ITEMS_8K } from '../../shared/edgar8k';
import { quotes } from '../data/adapters/alpaca';
import { currentFilings, fullText, type FtsHit } from '../data/adapters/edgar';
import { profile } from '../data/adapters/sec';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { dir, fmt, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

const tickerOf = (company: string) => /\(([A-Z][A-Z0-9.-]{0,9})(?:,[^)]*)?\)/.exec(company)?.[1] ?? null;
const clean = (company: string) => company.replace(/\s*\([^)]*\)/g, '').trim();

function Hits({ rows, run, empty }: { rows: FtsHit[]; run: PanelProps['run']; empty: string }) {
  if (!rows.length) return <p className="muted">{empty}</p>;
  return (
    <table className="grid-table">
      <tbody>
        {rows.map((h) => {
          const t = tickerOf(h.company);
          return (
            <tr key={h.id}>
              <td>{h.filed}</td>
              <td className="accent">{h.form}</td>
              <td>{t ? <button className="link-btn" onClick={() => run(`${t} DES`)}>{t}</button> : '-'}</td>
              <td><a href={h.url} target="_blank" rel="noreferrer noopener">{clean(h.company)}</a></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- FLAG ----------
function Flag({ run }: { run: PanelProps['run'] }) {
  const [tab, setTab] = useState<'gc' | 'late' | 'auditor'>('gc');
  const gc = useData(tab === 'gc' ? 'flag:gc' : null, () => fullText('substantial doubt about its ability to continue as a going concern', '10-K,10-Q', 30), { source: 'SEC full-text search', everyMs: 3600_000 });
  const late = useData(tab === 'late' ? 'flag:late' : null, async (): Promise<Fetched<FtsHit[]>> => {
    const [k, q] = await Promise.all([currentFilings('NT 10-K', 100), currentFilings('NT 10-Q', 100)]);
    return { data: [...k.data, ...q.data].map((f) => ({ id: f.url, form: f.form, company: f.company, filed: new Date(f.updated).toISOString().slice(0, 10), url: f.url })).sort((a, b) => b.filed.localeCompare(a.filed)), fetchedAt: k.fetchedAt, fromCache: false };
  }, { source: 'SEC EDGAR live feed', everyMs: 1800_000 });
  const aud = useData(tab === 'auditor' ? 'flag:aud' : null, async (): Promise<Fetched<(FtsHit & { items: string[] })[]>> => {
    const r = await currentFilings('8-K', 100);
    return { data: r.data.filter((f) => f.items.includes('4.01') || f.items.includes('4.02')).map((f) => ({ id: f.url, form: f.form, company: f.company, filed: new Date(f.updated).toISOString().slice(0, 10), url: f.url, items: f.items })), fetchedAt: r.fetchedAt, fromCache: false };
  }, { source: 'SEC EDGAR live feed', everyMs: 1800_000 });
  return (
    <>
      <div className="toolbar">
        <button aria-pressed={tab === 'gc'} onClick={() => setTab('gc')}>GOING CONCERN (30D)</button>
        <button aria-pressed={tab === 'late'} onClick={() => setTab('late')}>LATE FILINGS</button>
        <button aria-pressed={tab === 'auditor'} onClick={() => setTab('auditor')}>AUDITOR / RESTATEMENT</button>
      </div>
      {tab === 'gc' && (<><DataStatus state={gc} /><Hits rows={gc.data ?? []} run={run} empty="No matches." /><p className="disclaimer">10-K and 10-Q filings in the last 30 days containing the phrase used when auditors or management doubt the company can survive the next 12 months.</p></>)}
      {tab === 'late' && (<><DataStatus state={late} /><Hits rows={late.data ?? []} run={run} empty="No recent late-filing notices." /><p className="disclaimer">NT 10-K / NT 10-Q: the company told the SEC it will miss its filing deadline. Often a warning sign (accounting problems), sometimes benign.</p></>)}
      {tab === 'auditor' && (
        <>
          <DataStatus state={aud} />
          <table className="grid-table"><tbody>{(aud.data ?? []).map((h) => <tr key={h.id}><td>{h.filed}</td><td className="down">{h.items.filter((i) => i === '4.01' || i === '4.02').map((i) => ITEMS_8K[i]).join(', ')}</td><td><a href={h.url} target="_blank" rel="noreferrer noopener">{clean(h.company)}</a></td></tr>)}</tbody></table>
          {aud.data?.length === 0 && <p className="muted">None in the latest 100 8-K filings.</p>}
          <p className="disclaimer">8-K item 4.01 = auditor changed; 4.02 = previously issued financials can no longer be relied on (a restatement). From the latest 100 8-Ks in EDGAR&apos;s live feed.</p>
        </>
      )}
    </>
  );
}

// ---------- CORR: comment letters ----------
function Corr({ sym }: { sym: string }) {
  const st = useData(`corr:${sym}`, () => profile(sym), { source: 'SEC EDGAR' });
  const rows = (st.data?.filings ?? []).filter((f) => f.form === 'UPLOAD' || f.form === 'CORRESP');
  return (
    <>
      <DataStatus state={st} empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Date</th><th>Type</th><th>Document</th></tr></thead>
        <tbody>{rows.slice(0, 60).map((f) => <tr key={f.accession}><td>{f.filed}</td><td className={f.form === 'UPLOAD' ? 'down' : 'accent'}>{f.form === 'UPLOAD' ? 'SEC letter to company' : 'Company reply'}</td><td><a href={f.url} target="_blank" rel="noreferrer noopener">Open</a></td></tr>)}</tbody>
      </table>
      <div className="disclaimer">SEC staff comment letters (UPLOAD) and company responses (CORRESP). The SEC publishes them at least 20 business days after a review closes, so they describe past questions, often about revenue recognition or non-GAAP measures.</div>
    </>
  );
}

// ---------- FORMD: private raises ----------
function FormD({ run }: { run: PanelProps['run'] }) {
  const st = useData('formd', async (): Promise<Fetched<FtsHit[]>> => {
    const r = await currentFilings('D', 100);
    return { data: r.data.map((f) => ({ id: f.url, form: f.form, company: f.company, filed: new Date(f.updated).toISOString().slice(0, 10), url: f.url })), fetchedAt: r.fetchedAt, fromCache: false };
  }, { source: 'SEC EDGAR live feed', everyMs: 1800_000 });
  return (
    <>
      <DataStatus state={st} />
      <Hits rows={st.data ?? []} run={run} empty="No recent Form D filings." />
      <div className="disclaimer">Form D: notice of an exempt private offering, filed within 15 days of the first sale. No business description or valuation is required; open the filing for the amount raised and industry.</div>
    </>
  );
}

// ---------- SPIN ----------
function Spin({ run }: { run: PanelProps['run'] }) {
  const st = useData('spin', () => fullText('spin-off', '10-12B,10-12B/A', 180), { source: 'SEC full-text search', everyMs: 6 * 3600_000 });
  return (
    <>
      <DataStatus state={st} />
      <Hits rows={st.data ?? []} run={run} empty="No Form 10 spin-off registrations in 180 days." />
      <div className="disclaimer">Form 10-12B registrations mentioning a spin-off (last 180 days). Spin-offs are often sold by index funds right after listing, a pattern some event-driven funds study. Not financial advice.</div>
    </>
  );
}

// ---------- MARB: merger arbitrage ----------
interface Offer { ticker: string; offer: number; note: string }
function Marb({ run }: { run: PanelProps['run'] }) {
  const deals = useData('marb', () => fullText('agreement and plan of merger', '8-K,DEFM14A,PREM14A', 45), { source: 'SEC full-text search', everyMs: 6 * 3600_000 });
  const saved = useCollection<Offer>('screens').filter((x) => x.id.startsWith('marb:'));
  const syms = useMemo(() => saved.map((s) => s.value.ticker), [saved]);
  const q = useData(syms.length ? `marb:q:${syms.join(',')}` : null, () => quotes(syms), { everyMs: 60_000 });
  const [t, setT] = useState('');
  const [o, setO] = useState('');
  const [n, setN] = useState('');
  return (
    <>
      <h4 className="accent" style={{ fontSize: 12, margin: '2px 0' }}>YOUR TRACKED DEALS</h4>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); const tk = t.trim().toUpperCase(); if (!tk || !(Number(o) > 0)) return; void sync.put('screens', `marb:${tk}`, { ticker: tk, offer: Number(o), note: n.slice(0, 80) }); setT(''); setO(''); setN(''); }}>
        <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Target ticker" style={{ width: 100 }} />
        <input value={o} onChange={(e) => setO(e.target.value)} placeholder="Cash offer $/share" style={{ width: 130 }} />
        <input value={n} onChange={(e) => setN(e.target.value)} placeholder="Note (acquirer, expected close)" style={{ flex: 1 }} />
        <button type="submit">TRACK</button>
      </form>
      <table className="grid-table">
        <thead><tr><th>Target</th><th className="num">Price</th><th className="num">Offer</th><th className="num">Spread</th><th>Note</th><th /></tr></thead>
        <tbody>
          {saved.map((d) => {
            const px = q.data?.[d.value.ticker]?.price;
            const sp = px ? (d.value.offer / px - 1) * 100 : null;
            return <tr key={d.id}><td><button className="link-btn" onClick={() => run(`${d.value.ticker} CN`)}>{d.value.ticker}</button></td><td className="num">{fmt(px)}</td><td className="num">{fmt(d.value.offer)}</td><td className={`num ${dir(sp)}`}>{sp == null ? '-' : fmtPct(sp, 2)}</td><td className="muted">{d.value.note}</td><td><button className="link-btn down" onClick={() => void sync.remove('screens', d.id)}>×</button></td></tr>;
          })}
        </tbody>
      </table>
      <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>NEW MERGER AGREEMENTS (45 DAYS)</h4>
      <DataStatus state={deals} />
      <Hits rows={deals.data ?? []} run={run} empty="None found." />
      <div className="disclaimer">Deals found by full-text search for merger agreements in 8-Ks and merger proxies. Offer terms are not parsed automatically: read the filing and enter the cash offer. The spread is the market&apos;s view of deal risk; stock or mixed deals need the acquirer&apos;s price too. Not financial advice.</div>
    </>
  );
}

export default function FilingsIntel({ code, security, run }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  return (
    <div>
      {code === 'FLAG' && <Flag run={run} />}
      {code === 'CORR' && (<><div className="toolbar"><strong className="accent">{sym}</strong></div><Corr sym={sym} /></>)}
      {code === 'FORMD' && <FormD run={run} />}
      {code === 'SPIN' && <Spin run={run} />}
      {code === 'MARB' && <Marb run={run} />}
    </div>
  );
}
