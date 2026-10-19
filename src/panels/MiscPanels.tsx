// GLOS glossary (121), RPT PDF report (127), QCMP quote comparison across free sources (136, LIMITED),
// CONC customer concentration from extracted filings (112).
import { useMemo, useState } from 'react';
import { GLOSSARY } from '../../shared/glossary';
import { quotes } from '../data/adapters/alpaca';
import { staticEdges } from '../data/adapters/supply';
import { up } from '../data/client';
import { useData } from '../data/useData';
import { fmt, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

function Glos() {
  const [q, setQ] = useState('');
  const rows = Object.entries(GLOSSARY).filter(([k, v]) => !q || `${k} ${v}`.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a[0].localeCompare(b[0]));
  return (
    <>
      <div className="toolbar"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms" aria-label="Search glossary" /></div>
      <dl className="kv">{rows.map(([k, v]) => <div key={k} style={{ display: 'contents' }}><dt className="accent">{k}</dt><dd style={{ whiteSpace: 'normal' }}>{v}</dd></div>)}</dl>
      <div className="disclaimer">Hover any table header that matches a term (dotted underline) to see its definition anywhere in the app.</div>
    </>
  );
}

function Rpt() {
  return (
    <>
      <p>Prints every open panel, one after another on white paper, with buttons and menus hidden. In the print dialog choose <strong>Save as PDF</strong>.</p>
      <button onClick={() => window.print()}>PRINT / SAVE AS PDF</button>
      <div className="disclaimer">Tip: arrange the panels you want first (or load a preset), close the rest, then print. 3D and map views print as they look on screen; long tables print in full. On iPhone use Share &gt; Print, then pinch out on the preview to save a PDF.</div>
    </>
  );
}

function Qcmp({ sym }: { sym: string }) {
  const st = useData(`qcmp:${sym}`, async () => {
    const [a, f, m] = await Promise.allSettled([
      quotes([sym]),
      up<{ c: number; pc: number; t: number }>('finnhub', '/api/v1/quote', { symbol: sym }, { maxAgeMs: 15_000 }),
      up<{ results?: { c: number; t: number }[] }>('massive', `/v2/aggs/ticker/${sym}/prev`, { adjusted: 'true' }, { maxAgeMs: 3600_000 }),
    ]);
    const rows: { src: string; price: number | null; at: number | null; note: string }[] = [
      { src: 'Alpaca (IEX)', price: a.status === 'fulfilled' ? a.value.data[sym]?.price ?? null : null, at: a.status === 'fulfilled' ? a.value.data[sym]?.time ?? null : null, note: 'IEX exchange only, about 2 to 3% of volume, real time' },
      { src: 'Finnhub', price: f.status === 'fulfilled' ? f.value.data.c || null : null, at: f.status === 'fulfilled' && f.value.data.t ? f.value.data.t * 1000 : null, note: 'Free tier last price (source venue not stated)' },
      { src: 'Massive (previous close)', price: m.status === 'fulfilled' ? m.value.data.results?.[0]?.c ?? null : null, at: m.status === 'fulfilled' ? m.value.data.results?.[0]?.t ?? null : null, note: 'Consolidated close of the previous session (free tier is end of day)' },
    ];
    return { data: rows, fetchedAt: Date.now(), fromCache: false };
  }, { source: 'Alpaca, Finnhub, Massive', everyMs: 30_000 });
  const ref = st.data?.find((r) => r.price != null)?.price ?? null;
  return (
    <>
      <p><span className="badge">LIMITED</span> <strong className="accent">{sym}</strong>: free sources side by side. True all-venue (consolidated) real-time quotes need a paid feed.</p>
      <DataStatus state={st} />
      <table className="grid-table"><thead><tr><th>Source</th><th className="num">Price</th><th className="num">vs first</th><th>As of</th><th>Coverage</th></tr></thead>
        <tbody>{(st.data ?? []).map((r) => <tr key={r.src}><td>{r.src}</td><td className="num">{fmt(r.price)}</td><td className="num">{r.price != null && ref ? fmtPct((r.price / ref - 1) * 100, 3) : '-'}</td><td>{r.at ? new Date(r.at).toLocaleString() : '-'}</td><td className="muted" style={{ whiteSpace: 'normal' }}>{r.note}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function Conc({ run }: { run: PanelProps['run'] }) {
  const st = useData('conc', async () => ({ data: await staticEdges(), fetchedAt: Date.now(), fromCache: false }), { source: 'Extracted SEC filings' });
  const rows = useMemo(() => {
    const m = new Map<string, { total: number; top: number; parts: string[] }>();
    for (const e of st.data?.edges ?? []) {
      if (e.kind !== 'supplies' || e.from !== e.via || e.share == null) continue; // customers disclosed by the seller
      const x = m.get(e.from) ?? { total: 0, top: 0, parts: [] };
      x.total += e.share;
      x.top = Math.max(x.top, e.share);
      x.parts.push(`${e.to} ${fmt(e.share, 0)}%`);
      m.set(e.from, x);
    }
    return [...m].filter(([, v]) => v.top >= 10).sort((a, b) => b[1].top - a[1].top);
  }, [st.data]);
  return (
    <>
      <DataStatus state={st} />
      <p className="muted">Companies whose own filing says one customer is 10% or more of revenue ({rows.length} found in {st.data?.companies ?? 0} extracted companies).</p>
      <table className="grid-table"><thead><tr><th>Company</th><th className="num">Largest customer</th><th className="num">Named total</th><th>Customers</th></tr></thead>
        <tbody>{rows.map(([t, v]) => <tr key={t} className="clickable" onClick={() => run(`${t} SPLC`)}><td className="accent">{t}</td><td className={`num ${v.top >= 25 ? 'down' : ''}`}>{fmt(v.top, 1)}%</td><td className="num">{fmt(v.total, 1)}%</td><td style={{ whiteSpace: 'normal' }}>{v.parts.join(', ')}</td></tr>)}</tbody>
      </table>
      <div className="disclaimer">Losing a customer this large would hit revenue hard; it is a risk flag, not a forecast. Coverage is limited to the extracted companies (the 500 largest plus any you extract in SPLC). Set an SEC filing alert in ALRT to hear about new 8-Ks.</div>
    </>
  );
}

export default function MiscPanels({ code, security, run }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  return <div>{code === 'GLOS' ? <Glos /> : code === 'RPT' ? <Rpt /> : code === 'QCMP' ? <Qcmp sym={sym} /> : <Conc run={run} />}</div>;
}
