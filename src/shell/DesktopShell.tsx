import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from 'react';
import { APP_SHORT_NAME, BASE_PATH } from '../config';
import { CheatSheet } from './CheatSheet';
import { CommandLine } from './CommandLine';
import { EMPTY_LAYOUT, reduce, type Layout } from './layout';
import { layoutStore } from './layoutStore';
import { resolveCommand } from './runCommand';
import { OfflineBanner, StatusBar } from './StatusBar';
import { Workspace } from './Workspace';
import { linkChannel } from './linkChannel';

function initialLayout(): Layout {
  const stored = layoutStore.loadCurrent();
  if (stored.frames.length) return stored;
  // First run on this device.
  let l = reduce(EMPTY_LAYOUT, { type: 'open', code: 'HELP', size: { w: 20, h: 28 } });
  l = reduce(l, { type: 'open', code: 'HLTH', size: { w: 28, h: 16 }, newFrame: true });
  l = reduce(l, { type: 'open', code: 'NOTE', size: { w: 28, h: 12 }, newFrame: true });
  return l;
}

export function DesktopShell() {
  const [layout, dispatch] = useReducer(reduce, undefined, initialLayout);
  const [cheat, setCheat] = useState(false);
  const [layoutsOpen, setLayoutsOpen] = useState(false);
  const cmdRef = useRef<HTMLInputElement>(null);
  // Latest layout for event handlers, updated after each commit.
  const layoutRef = useRef(layout);
  useLayoutEffect(() => {
    layoutRef.current = layout;
  }, [layout]);

  // Persist per device, debounced.
  useEffect(() => {
    const id = setTimeout(() => layoutStore.saveCurrent(layout), 400);
    return () => clearTimeout(id);
  }, [layout]);

  const run = useCallback((input: string, opts: { newFrame?: boolean; fromPanel?: string; replace?: boolean } = {}): string | null => {
    const l = layoutRef.current;
    const ctxPanel = opts.fromPanel ? l.panels[opts.fromPanel] : l.panels[l.frames.find((f) => f.id === l.focused)?.active ?? ''];
    const r = resolveCommand(input, ctxPanel?.security);
    if (typeof r === 'string') return r;
    if (opts.fromPanel) {
      const frame = l.frames.find((f) => f.tabs.includes(opts.fromPanel!));
      if (frame) dispatch({ type: 'focus', frameId: frame.id });
    }
    dispatch({ type: 'open', code: r.fn.code, security: r.security, size: r.fn.size, newFrame: opts.newFrame || (opts.fromPanel !== undefined && !opts.replace) });
    return null;
  }, []);

  const popOut = useCallback((panelId: string) => {
    const p = layoutRef.current.panels[panelId];
    if (!p) return;
    const q = new URLSearchParams({ code: p.code, ...(p.security ? { sec: p.security } : {}), ...(p.link ? { link: p.link } : {}) });
    window.open(`${BASE_PATH}#/pop?${q}`, `meridian-${panelId}`, 'popup,width=960,height=640');
  }, []);

  // Pop-out windows broadcast ticker changes for their link color (feature 117).
  useEffect(
    () =>
      linkChannel.listen((m) => {
        const p = Object.values(layoutRef.current.panels).find((x) => x.link === m.link);
        if (p && p.security !== m.security) dispatch({ type: 'setSecurity', panelId: p.id, security: m.security });
      }),
    [],
  );

  // And send our own linked-ticker changes out to pop-outs.
  const sent = useRef<Record<string, string>>({});
  useEffect(() => {
    for (const p of Object.values(layout.panels)) {
      if (p.link && p.security && sent.current[p.link] !== p.security) {
        sent.current[p.link] = p.security;
        linkChannel.send({ link: p.link, security: p.security });
      }
    }
  }, [layout.panels]);

  // Global keyboard shortcuts (9.4, 129). e.code is used so Option-key symbols on macOS still match.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable]');
      const l = layoutRef.current;
      const frame = l.frames.find((f) => f.id === l.focused);
      if ((e.key === 'k' && (e.metaKey || e.ctrlKey)) || (e.key === '/' && !typing && !e.ctrlKey)) {
        e.preventDefault();
        cmdRef.current?.focus();
      } else if (e.key === '/' && e.ctrlKey) {
        e.preventDefault();
        setCheat((c) => !c);
      } else if (e.key === 'F1' || (e.key === '?' && !typing)) {
        e.preventDefault();
        run('HELP', { newFrame: true });
      } else if (e.key === 'Escape') {
        setCheat(false);
        setLayoutsOpen(false);
      } else if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const digit = /^Digit([1-9])$/.exec(e.code);
        if (digit) {
          const f = [...l.frames].sort((a, b) => a.y - b.y || a.x - b.x)[Number(digit[1]) - 1];
          if (f) dispatch({ type: 'focus', frameId: f.id });
          e.preventDefault();
          return;
        }
        if (!frame) return;
        const acts: Record<string, () => void> = {
          KeyW: () => dispatch({ type: 'close', panelId: frame.active }),
          KeyM: () => dispatch({ type: 'toggle', frameId: frame.id, flag: 'maximized' }),
          KeyN: () => dispatch({ type: 'toggle', frameId: frame.id, flag: 'minimized' }),
          KeyD: () => dispatch({ type: 'duplicate', panelId: frame.active }),
          KeyL: () => dispatch({ type: 'toggle', frameId: frame.id, flag: 'locked' }),
          KeyP: () => popOut(frame.active),
        };
        const act = acts[e.code];
        if (act) {
          e.preventDefault();
          act();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [run, popOut]);

  const names = layoutsOpen ? layoutStore.names() : [];

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">{APP_SHORT_NAME.toUpperCase()}</span>
        <CommandLine inputRef={cmdRef} onRun={(c, o) => run(c, o)} />
        <div className="topbar__menu">
          <button onClick={() => setLayoutsOpen((v) => !v)} aria-haspopup="menu" aria-expanded={layoutsOpen}>
            LAYOUTS
          </button>
          {layoutsOpen && (
            <ul className="menu menu--right" role="menu">
              <li role="menuitem">
                <button
                  onClick={() => {
                    const name = window.prompt('Save layout as:');
                    if (name?.trim()) layoutStore.saveAs(name.trim(), layout);
                    setLayoutsOpen(false);
                  }}
                >
                  Save current as…
                </button>
              </li>
              {names.map((n) => (
                <li key={n} role="menuitem" className="menu__row">
                  <button
                    onClick={() => {
                      const l = layoutStore.load(n);
                      if (l) dispatch({ type: 'replace', layout: l });
                      setLayoutsOpen(false);
                    }}
                  >
                    Load {n}
                  </button>
                  <button className="down" aria-label={`Delete layout ${n}`} onClick={() => window.confirm(`Delete layout ${n}?`) && (layoutStore.remove(n), setLayoutsOpen(false))}>
                    ×
                  </button>
                </li>
              ))}
              <li role="menuitem">
                <button
                  onClick={() => {
                    if (window.confirm('Close every panel?')) dispatch({ type: 'replace', layout: EMPTY_LAYOUT });
                    setLayoutsOpen(false);
                  }}
                >
                  Clear workspace
                </button>
              </li>
            </ul>
          )}
        </div>
        <button onClick={() => run('SET', { newFrame: true })} aria-label="Settings">
          SET
        </button>
        <button onClick={() => setCheat(true)} aria-label="Keyboard shortcuts">
          KEYS
        </button>
        <StatusBar />
      </div>
      <OfflineBanner />
      <Workspace layout={layout} dispatch={dispatch} run={(c, o) => void run(c, o)} popOut={popOut} />
      {cheat && <CheatSheet onClose={() => setCheat(false)} />}
    </div>
  );
}
