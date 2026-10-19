// ASK: plain-English search and screener (16.4, feature 123). Shows the parsed query; nothing runs until you confirm.
import { useState } from 'react';
import { FIELDS, type FieldKey, type Filter } from '../../shared/screener';
import { AiBlock } from '../ai/AiBlock';
import { askAi, type AiReply } from '../ai/client';
import { FUNCTIONS, isBuilt } from '../shell/registry';
import type { PanelProps } from '../shell/types';
import { handOff } from '../state/handoff';

interface Parsed { kind: 'screen' | 'command' | 'unknown'; filters?: { field: string; op: '>' | '<'; value: number }[]; sort?: string; desc?: boolean; command?: string; note: string }

const KEYS = new Set(FIELDS.map((f) => f.key as string));
const EXAMPLES = ['profitable companies over $50B with ROE above 20% and low debt', 'cheap stocks with P/E under 12 and revenue growing over 10%', 'show me the NVDA chart', 'oil inventories'];

export default function AskPanel({ run }: PanelProps) {
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [reply, setReply] = useState<AiReply<Parsed> | null>(null);
  const go = (text: string) => {
    if (!text.trim()) return;
    setBusy(true);
    setErr(null);
    const fns = FUNCTIONS.filter(isBuilt).map((f) => `${f.code}${f.needsSecurity ? '*' : ''}: ${f.title}`).join('; ');
    askAi<Parsed>('ask', `FUNCTIONS (* = needs a ticker first, like "AAPL GP"): ${fns}\n\nREQUEST: ${text.slice(0, 400)}`)
      .then(setReply, (e: unknown) => setErr(e instanceof Error ? e.message : 'failed'))
      .finally(() => setBusy(false));
  };
  const p = reply?.result;
  const filters: Filter[] = (p?.filters ?? []).filter((f) => KEYS.has(f.field)).map((f) => ({ field: f.field as FieldKey, op: f.op, value: f.value }));
  const dropped = (p?.filters ?? []).filter((f) => !KEYS.has(f.field)).map((f) => f.field);
  const sort = p?.sort && KEYS.has(p.sort) ? (p.sort as FieldKey) : 'mcap';
  const confirm = () => {
    if (!p) return;
    if (p.kind === 'screen') {
      handOff('EQS', { name: 'ASK', filters, sort, desc: p.desc ?? true });
      run('EQS');
    } else if (p.kind === 'command' && p.command) run(p.command.toUpperCase());
  };
  return (
    <div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); go(q); }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask in plain English..." style={{ flex: 1 }} aria-label="Question" autoFocus />
        <button type="submit" disabled={busy}>{busy ? 'PARSING...' : 'PARSE'}</button>
      </form>
      {!reply && <p className="muted">Try: {EXAMPLES.map((x) => <button key={x} className="link-btn" onClick={() => { setQ(x); go(x); }}>{x}</button>).reduce<React.ReactNode[]>((a, b, i) => (i ? [...a, ' · ', b] : [b]), [])}</p>}
      {err && <p className="down">{err}</p>}
      {reply && p && (
        <AiBlock reply={reply}>
          <p><strong>Parsed:</strong> {p.note}</p>
          {p.kind === 'screen' && (
            <table className="grid-table"><tbody>
              {filters.map((f, i) => <tr key={i}><td>{FIELDS.find((x) => x.key === f.field)!.label}</td><td>{f.op}</td><td className="num">{f.value}</td></tr>)}
              <tr><td className="muted">Sort</td><td colSpan={2}>{FIELDS.find((x) => x.key === sort)!.label} {p.desc === false ? 'low first' : 'high first'}</td></tr>
            </tbody></table>
          )}
          {dropped.length > 0 && <p className="down">Ignored unknown fields: {dropped.join(', ')}</p>}
          {p.kind === 'command' && <p>Command: <code className="accent">{p.command}</code></p>}
          {p.kind !== 'unknown' && <div className="toolbar"><button onClick={confirm}>RUN THIS</button><button onClick={() => setReply(null)}>CANCEL</button></div>}
        </AiBlock>
      )}
      <div className="disclaimer">Claude only translates your words into a screener query or a command. The results come from real data in EQS and the other panels. Not financial advice.</div>
    </div>
  );
}
