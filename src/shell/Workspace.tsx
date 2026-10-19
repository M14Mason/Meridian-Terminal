import { useEffect, useRef, useState } from 'react';
import { COLS, ROW_PX, type Action, type Layout } from './layout';
import { Frame } from './Frame';

interface Props {
  layout: Layout;
  dispatch: (a: Action) => void;
  run: (command: string, opts: { fromPanel: string; replace?: boolean }) => void;
  popOut: (panelId: string) => void;
}

// Free grid (9.3): frames are absolutely placed on a 48-column grid and snap while dragging.
export function Workspace({ layout, dispatch, run, popOut }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const colPx = width / COLS;
  const bottom = layout.frames.reduce((m, f) => Math.max(m, f.y + (f.minimized ? 2 : f.h)), 0);
  const maximized = layout.frames.some((f) => f.maximized);

  return (
    <div ref={ref} className={`workspace${maximized ? ' workspace--max' : ''}`} role="application" aria-label="Panel workspace">
      <div className="workspace__canvas" style={{ height: maximized ? '100%' : (bottom + 4) * ROW_PX }}>
        {layout.frames.length === 0 && <div className="workspace__empty muted">Empty workspace. Type a command above, for example HELP.</div>}
        {layout.frames.map((f) => (
          <Frame key={f.id} frame={f} panels={layout.panels} focused={layout.focused === f.id} colPx={colPx} dispatch={dispatch} run={run} popOut={popOut} />
        ))}
      </div>
    </div>
  );
}
