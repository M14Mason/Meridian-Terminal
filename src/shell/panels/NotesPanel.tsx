import { useState } from 'react';
import { sync, useCollection } from '../../state/sync';
import type { PanelProps } from '../types';

interface Note {
  text: string;
}

function NoteEditor({ noteKey, initial }: { noteKey: string; initial: string }) {
  const [text, setText] = useState(initial);
  function save(v: string) {
    if (v === initial) return;
    if (v.trim()) void sync.put('notes', noteKey, { text: v.slice(0, 20_000) });
    else void sync.remove('notes', noteKey);
  }
  return (
    <textarea
      className="notes__text"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => save(e.target.value)}
      aria-label={`Note for ${noteKey}`}
    />
  );
}

// Sticky notes per ticker (feature 118), synced. Without a ticker it is a general note.
export default function NotesPanel({ security, run }: PanelProps) {
  const notes = useCollection<Note>('notes');
  const key = security ?? 'GENERAL';
  const saved = notes.find((n) => n.id === key)?.value.text ?? '';
  return (
    <div className="notes">
      <div className="muted">Note for {key}. Saves when you click away and syncs to your devices.</div>
      {/* Keyed so a different ticker, or an edit synced from another device, reloads the editor. */}
      <NoteEditor key={`${key}:${saved}`} noteKey={key} initial={saved} />
      {notes.length > 0 && (
        <div className="notes__list">
          {notes.map((n) => (
            <button key={n.id} className="link-btn" onClick={() => run(n.id === 'GENERAL' ? 'NOTE' : `${n.id} NOTE`, { replace: true })}>
              {n.id}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
