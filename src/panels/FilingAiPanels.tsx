// FDIF: 10-K risk factor diff and tone (catalog 107 to 109). ECS: earnings release summary (110, from the
// 8-K item 2.02 press release because free call transcripts are not available). Code diffs; Claude summarizes.
import { useMemo, useState } from 'react';
import { AI_LABEL } from '../../shared/ai';
import { diffParagraphs, htmlToText, paragraphs, riskFactors, toneCounts } from '../../shared/filingtext';
import type { Filing } from '../../shared/market';
import { AiBlock, List } from '../ai/AiBlock';
import { askAi, type AiReply } from '../ai/client';
import { profile } from '../data/adapters/sec';
import { up, type Fetched } from '../data/client';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

interface Sum { summary: string; changes: string[]; risks: string[]; tone: string }
const DAY = 86_400_000;
const dirOf = (f: Filing, cik: number) => `/Archives/edgar/data/${cik}/${f.accession.replace(/-/g, '')}`;
const doc = (path: string) => up<string>('secwww', path, undefined, { text: true, maxAgeMs: 30 * DAY, priority: 1 }).then((r) => htmlToText(r.data));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'failed');

function Summarize({ input, label }: { input: string; label: string }) {
  const [s, setS] = useState<{ reply?: AiReply<Sum>; err?: string; busy?: boolean }>({});
  const r = s.reply?.result;
  return (
    <>
      {!s.reply && <button disabled={s.busy} onClick={() => { setS({ busy: true }); askAi<Sum>('filing', input).then((reply) => setS({ reply }), (e: unknown) => setS({ err: errMsg(e) })); }}>{s.busy ? 'READING...' : `${label} (about $0.003)`}</button>}
      {s.err && <p className="down">{s.err}</p>}
      {s.reply && r && (
        <AiBlock reply={s.reply}>
          <p>{r.summary}</p>
          <p>Tone vs before: <strong className={r.tone === 'more cautious' ? 'down' : r.tone === 'more confident' ? 'up' : ''}>{r.tone}</strong></p>
          <List title="WHAT CHANGED" items={r.changes} />
          <List title="RISKS TO NOTE" items={r.risks} />
        </AiBlock>
      )}
    </>
  );
}

// ---------- FDIF ----------
function Fdif({ sym }: { sym: string }) {
  const st = useData(`fdif:${sym}`, async (): Promise<Fetched<{ cur: Filing; prev: Filing; a: string; b: string }>> => {
    const p = await profile(sym);
    const ks = p.data.filings.filter((f) => f.form === '10-K' || f.form === '20-F');
    if (ks.length < 2) throw new Error(`Need two annual reports; found ${ks.length}.`);
    const [a, b] = await Promise.all([doc(`${dirOf(ks[0]!, p.data.cik)}/${ks[0]!.primaryDoc}`), doc(`${dirOf(ks[1]!, p.data.cik)}/${ks[1]!.primaryDoc}`)]);
    return { data: { cur: ks[0]!, prev: ks[1]!, a: riskFactors(a), b: riskFactors(b) }, fetchedAt: Date.now(), fromCache: false };
  }, { source: 'SEC EDGAR 10-K' });
  const res = useMemo(() => {
    if (!st.data || !st.data.a || !st.data.b) return null;
    return { d: diffParagraphs(paragraphs(st.data.b), paragraphs(st.data.a)), ta: toneCounts(st.data.a), tb: toneCounts(st.data.b) };
  }, [st.data]);
  const [show, setShow] = useState<'added' | 'removed' | 'changed'>('added');
  const input = res && st.data ? [
    `COMPANY: ${sym}. Risk factors (10-K Item 1A) filed ${st.data.cur.filed} vs previous filed ${st.data.prev.filed}.`,
    `CODE STATS: ${res.d.same} paragraphs unchanged, ${res.d.changed.length} edited, ${res.d.added.length} new, ${res.d.removed.length} removed. Words ${res.tb.words} -> ${res.ta.words}. Per 1,000 words: negative ${res.tb.negative.toFixed(1)} -> ${res.ta.negative.toFixed(1)}, uncertainty ${res.tb.uncertainty.toFixed(1)} -> ${res.ta.uncertainty.toFixed(1)}, litigious ${res.tb.litigious.toFixed(1)} -> ${res.ta.litigious.toFixed(1)}.`,
    `NEW PARAGRAPHS:\n${res.d.added.map((p) => `+ ${p}`).join('\n')}`,
    `REMOVED PARAGRAPHS:\n${res.d.removed.map((p) => `- ${p}`).join('\n')}`,
    `EDITED (after):\n${res.d.changed.map((c) => `~ ${c.after}`).join('\n')}`,
  ].join('\n\n').slice(0, 29000) : '';
  const list = res ? (show === 'added' ? res.d.added : show === 'removed' ? res.d.removed : res.d.changed.map((c) => c.after)) : [];
  return (
    <>
      <DataStatus state={st} />
      {st.data && !res && <p className="down">Could not find an Item 1A Risk Factors section in one of the filings (smaller companies may omit it).</p>}
      {res && st.data && (
        <>
          <p>Risk factors in the 10-K filed <strong>{st.data.cur.filed}</strong> vs <strong>{st.data.prev.filed}</strong>: {res.d.same} unchanged, <span className="accent">{res.d.changed.length} edited</span>, <span className="up">{res.d.added.length} new</span>, <span className="down">{res.d.removed.length} removed</span>.</p>
          <table className="grid-table">
            <thead><tr><th>Tone (per 1,000 words)</th><th className="num">Before</th><th className="num">Now</th></tr></thead>
            <tbody>{(['negative', 'uncertainty', 'litigious'] as const).map((k) => <tr key={k}><td>{k}</td><td className="num">{fmt(res.tb[k], 1)}</td><td className={`num ${res.ta[k] > res.tb[k] * 1.1 ? 'down' : res.ta[k] < res.tb[k] * 0.9 ? 'up' : ''}`}>{fmt(res.ta[k], 1)}</td></tr>)}<tr><td>words</td><td className="num">{res.tb.words.toLocaleString()}</td><td className="num">{res.ta.words.toLocaleString()}</td></tr></tbody>
          </table>
          <Summarize input={input} label="SUMMARIZE CHANGES" />
          <div className="toolbar">{(['added', 'removed', 'changed'] as const).map((k) => <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}>{k.toUpperCase()}</button>)}</div>
          <ul style={{ paddingLeft: 18 }}>{list.slice(0, 60).map((p, i) => <li key={i} className={show === 'added' ? 'up' : show === 'removed' ? 'down' : ''} style={{ marginBottom: 4 }}>{p}</li>)}</ul>
        </>
      )}
      <div className="disclaimer">Paragraph diff of 10-K Item 1A computed in your browser from SEC EDGAR. Tone counts use a small built-in word list in the style of Loughran-McDonald, not the full dictionary. AI summary: {AI_LABEL}</div>
    </>
  );
}

// ---------- ECS ----------
async function release(f: Filing, cik: number): Promise<{ text: string; url: string } | null> {
  const idx = await up<{ directory: { item: { name: string; size: string }[] } }>('secwww', `${dirOf(f, cik)}/index.json`, undefined, { maxAgeMs: 30 * DAY, priority: 1 });
  // Exhibit 99.1 naming varies (msft-ex99_1.htm, a8-kex991...htm, q2fy27pr.htm): name match first, else the largest other document.
  const htm = idx.data.directory.item.filter((i) => /\.htm$/i.test(i.name) && i.name !== f.primaryDoc && !/^R\d+\.htm$/i.test(i.name) && !/index/i.test(i.name));
  const ex = (htm.find((i) => /ex.?99.?0?1?\b|ex991|ex99_1/i.test(i.name)) ?? htm.find((i) => /(^|[^a-z])pr\.htm$|press|release/i.test(i.name)) ?? [...htm].sort((a, b) => Number(b.size || 0) - Number(a.size || 0))[0])?.name;
  if (!ex) return null;
  return { text: await doc(`${dirOf(f, cik)}/${ex}`), url: `https://www.sec.gov${dirOf(f, cik)}/${ex}` };
}

function Ecs({ sym }: { sym: string }) {
  const st = useData(`ecs:${sym}`, async () => {
    const p = await profile(sym);
    const ers = p.data.filings.filter((f) => f.form === '8-K' && f.items.split(',').includes('2.02')).slice(0, 2);
    if (!ers.length) throw new Error('No 8-K earnings releases (item 2.02) found.');
    const [cur, prev] = await Promise.all([release(ers[0]!, p.data.cik), ers[1] ? release(ers[1], p.data.cik).catch(() => null) : Promise.resolve(null)]);
    if (!cur) throw new Error('The latest earnings 8-K has no press release exhibit (99.1).');
    return { data: { filed: ers[0]!.filed, prevFiled: ers[1]?.filed ?? null, cur, prev }, fetchedAt: Date.now(), fromCache: false };
  }, { source: 'SEC EDGAR 8-K item 2.02' });
  const d = st.data;
  const input = d ? [`COMPANY: ${sym}. Earnings press release filed ${d.filed}.`, `CURRENT RELEASE:\n${d.cur.text.slice(0, 20000)}`, d.prev ? `PREVIOUS RELEASE (filed ${d.prevFiled}):\n${d.prev.text.slice(0, 8000)}` : 'No previous release available.'].join('\n\n') : '';
  return (
    <>
      <DataStatus state={st} />
      {d && (
        <>
          <p>Latest earnings release: <a href={d.cur.url} target="_blank" rel="noreferrer noopener">8-K exhibit 99.1 filed {d.filed}</a> ({Math.round(d.cur.text.length / 1000)}k characters).</p>
          <Summarize input={input} label="SUMMARIZE RESULTS" />
          <details><summary className="muted">Release text</summary><pre className="ai-input" style={{ maxHeight: 400 }}>{d.cur.text.slice(0, 20000)}</pre></details>
        </>
      )}
      <div className="disclaimer">PARTIAL for catalog 110: free earnings call transcripts are not available (API Ninjas transcripts are premium only), so this summarizes the company&apos;s own earnings press release from its 8-K. Management commentary from the live call is not included. AI summary: {AI_LABEL}</div>
    </>
  );
}

export default function FilingAiPanels({ code, security }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  return <div>{code === 'ECS' ? <Ecs sym={sym} /> : <Fdif sym={sym} />}</div>;
}
