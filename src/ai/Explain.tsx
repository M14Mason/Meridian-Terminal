// Explain-this-panel (16.4, learn mode 119): sends the panel's visible numbers, never invents its own.
import { useState } from 'react';
import type { PanelMeta } from '../shell/panelMeta';
import { AiBlock, List } from './AiBlock';
import { askAi, type AiReply } from './client';

interface Ex { summary: string; points: string[]; watch: string }

export function Explain({ getBody, title, description, code, security, meta, onClose }: { getBody: () => HTMLElement | null; title: string; description: string; code: string; security?: string; meta: PanelMeta | null; onClose: () => void }) {
  const [state, setState] = useState<{ reply?: AiReply<Ex>; err?: string; busy: boolean }>({ busy: false });
  const run = (fresh = false) => {
    const el = getBody();
    // Panel text without this dialog's own text.
    const parts = el ? [...el.children].filter((c) => !c.classList.contains('explain')).map((c) => (c as HTMLElement).innerText) : [];
    const text = parts.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, 7500);
    const input = [
      `PANEL: ${code}${security ? ` for ${security}` : ''}: ${title}. ${description}`,
      meta ? `SOURCE: ${meta.source}${meta.note ? ` (${meta.note})` : ''}; data as of ${meta.fetchedAt ? new Date(meta.fetchedAt).toISOString() : 'unknown'}` : 'SOURCE: see panel text',
      `VISIBLE CONTENT:\n${text}`,
    ].join('\n');
    setState({ busy: true });
    askAi<Ex>('explain', input, fresh).then((reply) => setState({ reply, busy: false }), (e: unknown) => setState({ err: e instanceof Error ? e.message : 'failed', busy: false }));
  };
  const r = state.reply?.result;
  return (
    <div className="explain" role="dialog" aria-label="Explain this panel">
      <div className="toolbar">
        <strong className="accent">EXPLAIN {code}</strong>
        {!state.reply && <button disabled={state.busy} onClick={() => run()}>{state.busy ? 'THINKING...' : 'EXPLAIN (about $0.001)'}</button>}
        {state.reply && <button disabled={state.busy} onClick={() => run(true)}>REFRESH</button>}
        <button onClick={onClose} aria-label="Close explanation">×</button>
      </div>
      {state.err && <p className="down">{state.err}</p>}
      {state.reply && r && (
        <AiBlock reply={state.reply}>
          <p>{r.summary}</p>
          <List title="WHAT STANDS OUT" items={r.points} />
          <p><span className="accent">Watch:</span> {r.watch}</p>
        </AiBlock>
      )}
      {!state.reply && !state.err && <p className="muted">Sends what this panel currently shows (text and numbers) to Claude Haiku through your proxy. Cached for 6 hours per panel content.</p>}
    </div>
  );
}
