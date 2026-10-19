import { useMemo, useState } from 'react';
import { updateSettings, useSettings } from '../state/settings';
import { suggest } from './command';
import { PRESETS, type Preset } from './presets';
import { FUNCTIONS, isBuilt } from './registry';
import type { FunctionDef, PanelProps } from './types';

// Launchpad (owner additions): every function by section, search, favorites, recent, presets.
export const SECTIONS: { name: string; cats: string[] }[] = [
  { name: 'Markets', cats: ['Markets', 'FX', 'Crypto', 'Calendars'] },
  { name: 'Equity', cats: ['Equity', 'Charts', 'News'] },
  { name: 'Filings', cats: ['Filings'] },
  { name: 'Macro', cats: ['Macro'] },
  { name: 'Hedge Fund', cats: ['Hedge Fund'] },
  { name: 'Investors', cats: ['Investors'] },
  { name: 'Quant and Risk', cats: ['Quant', 'Analytics', 'Risk'] },
  { name: 'Options', cats: ['Options'] },
  { name: 'Maps and Signals', cats: ['Maps', 'Signals', 'Market structure'] },
  { name: 'AI', cats: ['AI'] },
  { name: 'Portfolio and Tools', cats: ['Portfolio', 'Tools'] },
  { name: 'System', cats: ['System'] },
];

function recent(): string[] {
  try {
    const h = JSON.parse(localStorage.getItem('meridian.cmdHistory') ?? '[]') as string[];
    return [...new Set(h.map((c) => c.split(/\s+/).at(-1)!).filter(Boolean))].slice(0, 8);
  } catch {
    return [];
  }
}

interface Props {
  onRun: (command: string) => void;
  onPreset?: (p: Preset) => void;
}

export function LaunchpadBody({ onRun, onPreset }: Props) {
  const [q, setQ] = useState('');
  const favs = useSettings().favorites;
  const hits = useMemo(() => (q.trim() ? suggest(q, 40).map((s) => s.fn!) : null), [q]);
  const toggleFav = (code: string) => updateSettings({ favorites: favs.includes(code) ? favs.filter((c) => c !== code) : [...favs, code].slice(0, 24) });

  const Chip = ({ f }: { f: FunctionDef }) => (
    <span className={`lp__chip${isBuilt(f) ? '' : ' lp__chip--planned'}`}>
      <button className="lp__run" onClick={() => onRun(f.code)} title={f.description}>
        <span className="lp__code">{f.code}</span> {f.title}
        {!isBuilt(f) && <span className="muted"> {f.milestone}</span>}
      </button>
      <button className="lp__star" aria-label={favs.includes(f.code) ? `Unfavorite ${f.code}` : `Favorite ${f.code}`} aria-pressed={favs.includes(f.code)} onClick={() => toggleFav(f.code)}>
        {favs.includes(f.code) ? '★' : '☆'}
      </button>
    </span>
  );
  const byCode = (c: string) => FUNCTIONS.find((f) => f.code === c);
  const rec = recent().map(byCode).filter(Boolean) as FunctionDef[];

  return (
    <div className="lp">
      <input className="lp__search" autoFocus placeholder="Search every function (name, code or topic)" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search functions" />
      {hits ? (
        <div className="lp__chips">{hits.map((f) => <Chip key={f.code} f={f} />)}</div>
      ) : (
        <>
          {onPreset && (
            <section>
              <h3>WORKSPACES</h3>
              <div className="lp__chips">
                {PRESETS.map((p) => (
                  <button key={p.id} className="lp__preset" onClick={() => onPreset(p)} title={p.description}>{p.name}</button>
                ))}
              </div>
            </section>
          )}
          {favs.length > 0 && (
            <section>
              <h3>FAVORITES</h3>
              <div className="lp__chips">{favs.map(byCode).filter(Boolean).map((f) => <Chip key={f!.code} f={f!} />)}</div>
            </section>
          )}
          {rec.length > 0 && (
            <section>
              <h3>RECENT</h3>
              <div className="lp__chips">{rec.map((f) => <Chip key={f.code} f={f} />)}</div>
            </section>
          )}
          <div className="lp__grid">
            {SECTIONS.map((s) => {
              const fns = FUNCTIONS.filter((f) => s.cats.includes(f.category));
              if (!fns.length) return null;
              return (
                <section key={s.name}>
                  <h3>{s.name.toUpperCase()}</h3>
                  <div className="lp__list">{fns.map((f) => <Chip key={f.code} f={f} />)}</div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export function LaunchpadOverlay({ onClose, onRun, onPreset }: Props & { onClose: () => void }) {
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Launchpad" onClick={onClose} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="overlay__box lp__box" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <h2>LAUNCHPAD</h2>
          <button onClick={onClose}>CLOSE</button>
        </div>
        <LaunchpadBody onRun={(c) => { onRun(c); onClose(); }} onPreset={onPreset ? (p) => { onPreset(p); onClose(); } : undefined} />
      </div>
    </div>
  );
}

/** LP as a panel (used by the phone's More tab and the command LP). */
export default function LaunchpadPanel({ run }: PanelProps) {
  return <LaunchpadBody onRun={(c) => run(c, { replace: true })} />;
}

export function FavoritesBar({ onRun }: { onRun: (c: string) => void }) {
  const favs = useSettings().favorites;
  if (!favs.length) return null;
  return (
    <nav className="favbar" aria-label="Favorite functions">
      {favs.map((c) => (
        <button key={c} onClick={() => onRun(c)} title={FUNCTIONS.find((f) => f.code === c)?.title}>{c}</button>
      ))}
    </nav>
  );
}
