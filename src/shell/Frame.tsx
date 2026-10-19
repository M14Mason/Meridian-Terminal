import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { animateIn } from '../lib/motion';
import { COLS, ROW_PX, type Action, type FrameState, type PanelState } from './layout';
import { PanelHost } from './PanelHost';
import { Explain } from '../ai/Explain';
import { AgeBadge, type PanelMeta } from './panelMeta';
import { findFunction } from './registry';
import { LINK_COLORS, type LinkColor } from './types';

interface Props {
  frame: FrameState;
  panels: Record<string, PanelState>;
  focused: boolean;
  colPx: number;
  dispatch: (a: Action) => void;
  run: (command: string, opts: { fromPanel: string; replace?: boolean }) => void;
  popOut: (panelId: string) => void;
}

type Drag = { kind: 'move' | 'resize'; startX: number; startY: number; ox: number; oy: number };

const HEADER_ROWS = 2;

export function Frame({ frame, panels, focused, colPx, dispatch, run, popOut }: Props) {
  const ref = useRef<HTMLElement>(null);
  const drag = useRef<Drag | null>(null);
  const tabDrag = useRef<{ id: string; x: number; y: number } | null>(null);
  const [menu, setMenu] = useState(false);
  const [meta, setMeta] = useState<PanelMeta | null>(null);
  const [explain, setExplain] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const active = panels[frame.active];

  useEffect(() => animateIn(ref.current), []);
  // A newly opened or newly focused frame may be below the fold.
  useEffect(() => {
    if (focused) ref.current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [focused]);

  if (!active) return null;
  const fn = findFunction(active.code);

  function start(kind: Drag['kind'], e: RPointerEvent) {
    if (frame.locked || frame.maximized || e.button !== 0) return;
    if ((e.target as HTMLElement).closest('button, input, select')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, startX: e.clientX, startY: e.clientY, ox: kind === 'move' ? frame.x : frame.w, oy: kind === 'move' ? frame.y : frame.h };
  }

  function moveTo(e: RPointerEvent) {
    const d = drag.current;
    if (!d) return;
    // Snap to grid units while dragging.
    const dx = Math.round((e.clientX - d.startX) / colPx);
    const dy = Math.round((e.clientY - d.startY) / ROW_PX);
    if (d.kind === 'move') dispatch({ type: 'move', frameId: frame.id, x: d.ox + dx, y: d.oy + dy });
    else dispatch({ type: 'resize', frameId: frame.id, w: d.ox + dx, h: d.oy + dy });
  }

  function end(e: RPointerEvent) {
    if (!drag.current) return;
    drag.current = null;
    (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
  }

  // Tab drag: drop on another frame's header to stack, on empty space to unstack.
  function tabDrop(panelId: string, e: RPointerEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const target = el?.closest<HTMLElement>('[data-frame-id]')?.dataset.frameId;
    if (target && target !== frame.id) dispatch({ type: 'stack', panelId, targetFrameId: target });
    else if (!target && frame.tabs.length > 1) dispatch({ type: 'unstack', panelId });
  }

  const cycleLink = () => {
    const i = active.link ? LINK_COLORS.indexOf(active.link) : -1;
    const next: LinkColor | null = i + 1 < LINK_COLORS.length ? LINK_COLORS[i + 1]! : null;
    dispatch({ type: 'setLink', panelId: active.id, link: next });
  };

  const style = frame.maximized
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: 1000 }
    : {
        left: frame.x * colPx,
        top: frame.y * ROW_PX,
        width: Math.min(frame.w, COLS - frame.x) * colPx,
        height: (frame.minimized ? HEADER_ROWS : frame.h) * ROW_PX,
        zIndex: frame.z,
      };

  return (
    <section
      ref={ref}
      className={`frame${focused ? ' frame--focused' : ''}${frame.locked ? ' frame--locked' : ''}`}
      style={style}
      data-frame-id={frame.id}
      aria-label={`${fn?.title ?? active.code} panel`}
      onPointerDown={() => !focused && dispatch({ type: 'focus', frameId: frame.id })}
    >
      <header className="frame__head" onPointerDown={(e) => start('move', e)} onPointerMove={moveTo} onPointerUp={end} onDoubleClick={() => dispatch({ type: 'toggle', frameId: frame.id, flag: 'maximized' })}>
        <div className="frame__tabs" role="tablist">
          {frame.tabs.map((id) => {
            const p = panels[id];
            if (!p) return null;
            return (
              <button
                key={id}
                role="tab"
                aria-selected={id === frame.active}
                className="frame__tab"
                onPointerDown={(e) => {
                  if (e.button !== 0) return;
                  e.currentTarget.setPointerCapture(e.pointerId);
                  tabDrag.current = { id, x: e.clientX, y: e.clientY };
                }}
                onPointerUp={(e) => {
                  const t = tabDrag.current;
                  tabDrag.current = null;
                  if (!t) return;
                  if (Math.hypot(e.clientX - t.x, e.clientY - t.y) > 10) tabDrop(id, e);
                  else dispatch({ type: 'activate', frameId: frame.id, panelId: id });
                }}
                onKeyDown={(e) => e.key === 'Enter' && dispatch({ type: 'activate', frameId: frame.id, panelId: id })}
              >
                {p.security ? `${p.security} ` : ''}
                {p.code}
              </button>
            );
          })}
        </div>
        <span className="frame__title">{fn?.title}</span>
        <AgeBadge meta={meta} />
        <button className={`frame__link link--${active.link ?? 'none'}`} onClick={cycleLink} title="Link color: panels with the same color follow the same ticker" aria-label={`Link color ${active.link ?? 'none'}`}>
          ●
        </button>
        <button className="frame__btn" onClick={() => setExplain((x) => !x)} aria-pressed={explain} title="Explain this panel (AI)" aria-label="Explain this panel">
          ?
        </button>
        <button className="frame__btn" onClick={() => setMenu((m) => !m)} aria-haspopup="menu" aria-expanded={menu} aria-label="Panel menu">
          ≡
        </button>
        <button className="frame__btn" onClick={() => dispatch({ type: 'close', panelId: active.id })} aria-label="Close panel">
          ×
        </button>
        {menu && (
          <ul className="menu" role="menu" onMouseLeave={() => setMenu(false)}>
            {[
              ['Duplicate', () => dispatch({ type: 'duplicate', panelId: active.id })],
              [frame.minimized ? 'Restore' : 'Minimize', () => dispatch({ type: 'toggle', frameId: frame.id, flag: 'minimized' })],
              [frame.maximized ? 'Restore size' : 'Maximize', () => dispatch({ type: 'toggle', frameId: frame.id, flag: 'maximized' })],
              [frame.locked ? 'Unlock' : 'Lock', () => dispatch({ type: 'toggle', frameId: frame.id, flag: 'locked' })],
              ['Pop out window', () => popOut(active.id)],
              ...(frame.tabs.length > 1 ? [['Unstack tab', () => dispatch({ type: 'unstack', panelId: active.id })] as const] : []),
            ].map(([label, fnc]) => (
              <li key={label as string} role="menuitem">
                <button
                  onClick={() => {
                    (fnc as () => void)();
                    setMenu(false);
                  }}
                >
                  {label as string}
                </button>
              </li>
            ))}
          </ul>
        )}
      </header>
      {!frame.minimized && (
        <div className="frame__body" ref={bodyRef}>
          {explain && <Explain key={active.id} getBody={() => bodyRef.current} title={fn?.title ?? active.code} description={fn?.description ?? ''} code={active.code} security={active.security} meta={meta} onClose={() => setExplain(false)} />}
          <PanelHost onMeta={setMeta} panelId={active.id} code={active.code} security={active.security} args={active.args ?? {}} run={(c, o) => run(c, { fromPanel: active.id, replace: o?.replace })} />
        </div>
      )}
      {!frame.minimized && !frame.maximized && !frame.locked && (
        <div className="frame__resize" onPointerDown={(e) => start('resize', e)} onPointerMove={moveTo} onPointerUp={end} aria-hidden />
      )}
    </section>
  );
}
