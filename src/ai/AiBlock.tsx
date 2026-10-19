// Standard frame for every AI answer: label, model, prompt version, cost, cache and the exact inputs used (16.3).
import { useState, type ReactNode } from 'react';
import { timeNY } from '../lib/format';
import type { AiReply } from './client';

export function AiMeta({ reply }: { reply: AiReply<unknown> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ai-meta">
      <span className="badge">AI</span>
      <strong>{reply.label}</strong>{' '}
      <span className="muted">
        {reply.model} · {reply.version} · {reply.cached ? 'cached' : `$${reply.usd.toFixed(4)}`} · {timeNY(reply.at)} ET
      </span>{' '}
      <button className="link-btn" onClick={() => setOpen((o) => !o)}>{open ? 'hide inputs' : 'inputs used'}</button>
      {open && <pre className="ai-input">{reply.input}</pre>}
    </div>
  );
}

export function AiBlock({ reply, children }: { reply: AiReply<unknown>; children: ReactNode }) {
  return (
    <div className="ai-block">
      {children}
      <AiMeta reply={reply} />
    </div>
  );
}

export function List({ title, items, cls }: { title: string; items: string[]; cls?: string }) {
  if (!items.length) return null;
  return (
    <>
      <h4 className={`accent ${cls ?? ''}`} style={{ fontSize: 12, margin: '6px 0 2px' }}>{title}</h4>
      <ul style={{ margin: 0, paddingLeft: 18 }}>{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </>
  );
}
