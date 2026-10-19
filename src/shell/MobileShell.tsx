import { useEffect, useRef, useState, type TouchEvent } from 'react';
import { slideIn } from '../lib/motion';
import { CommandLine } from './CommandLine';
import { PanelHost } from './PanelHost';
import { AgeBadge, type PanelMeta } from './panelMeta';
import { resolveCommand } from './runCommand';
import { OfflineBanner, StatusBar } from './StatusBar';
import { TickerTape } from '../panels/TickerTape';
import { useSettings } from '../state/settings';
import type { MobileTab } from './types';

// Phone layout (9.5): bottom tab bar, one panel at a time, command sheet, swipe between tabs.

const TABS: { id: MobileTab; label: string; icon: string }[] = [
  { id: 'markets', label: 'Markets', icon: '▤' },
  { id: 'charts', label: 'Charts', icon: '◢' },
  { id: 'news', label: 'News', icon: '≣' },
  { id: 'maps', label: 'Maps', icon: '◎' },
  { id: 'portfolio', label: 'Portfolio', icon: '◧' },
  { id: 'more', label: 'More', icon: '⋯' },
];

type TabState = Record<MobileTab, { code: string; security?: string }>;

const DEFAULTS: TabState = {
  markets: { code: 'BQ' },
  charts: { code: 'GP', security: 'SPY' },
  news: { code: 'N' },
  maps: { code: 'TNKR' },
  portfolio: { code: 'PORT' },
  more: { code: 'LP' },
};

const KEY = 'meridian.mobileTabs.v1';

function load(): { tabs: TabState; active: MobileTab } {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { tabs: TabState; active: MobileTab } | null;
    if (raw?.tabs && TABS.some((t) => t.id === raw.active)) return { tabs: { ...DEFAULTS, ...raw.tabs }, active: raw.active };
  } catch {
    // fall through
  }
  return { tabs: DEFAULTS, active: 'markets' };
}

export function MobileShell() {
  const [state, setState] = useState(load);
  const [sheet, setSheet] = useState(false);
  const settings = useSettings();
  const cmdRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number; top: number } | null>(null);
  const [pull, setPull] = useState(0);
  const [meta, setMeta] = useState<PanelMeta | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state]);

  const cur = state.tabs[state.active];

  function go(tab: MobileTab, dir: 1 | -1 = 1) {
    if (tab === state.active) return;
    setState((s) => ({ ...s, active: tab }));
    requestAnimationFrame(() => slideIn(bodyRef.current, dir));
  }

  function run(input: string, replace = true): string | null {
    const r = resolveCommand(input, cur.security);
    if (typeof r === 'string') return r;
    const tab = r.fn.mobileTab ?? (replace ? state.active : 'more');
    setState((s) => ({ active: tab, tabs: { ...s.tabs, [tab]: { code: r.fn.code, security: r.security } } }));
    setSheet(false);
    return null;
  }

  function onTouchStart(e: TouchEvent) {
    const t = e.touches[0]!;
    touch.current = { x: t.clientX, y: t.clientY, top: bodyRef.current?.scrollTop ?? 0 };
  }
  function onTouchMove(e: TouchEvent) {
    const s = touch.current;
    if (!s || s.top > 0) return;
    const dy = e.touches[0]!.clientY - s.y;
    setPull(dy > 0 ? Math.min(80, dy / 2) : 0);
  }
  function onTouchEnd(e: TouchEvent) {
    const s = touch.current;
    touch.current = null;
    if (!s) return;
    const t = e.changedTouches[0]!;
    const dx = t.clientX - s.x;
    const dy = t.clientY - s.y;
    if (pull >= 60) window.dispatchEvent(new Event('meridian:refresh'));
    setPull(0);
    // Horizontal swipe between tabs. Panels with their own pan (charts, maps) stop propagation.
    if (Math.abs(dx) > 70 && Math.abs(dy) < 40) {
      const i = TABS.findIndex((x) => x.id === state.active);
      const next = TABS[i + (dx < 0 ? 1 : -1)];
      if (next) go(next.id, dx < 0 ? 1 : -1);
    }
  }

  return (
    <div className="mshell">
      <div className="mshell__top">
        <button className="mshell__cmd" onClick={() => setSheet(true)} aria-label="Open command line">
          &gt; {cur.security ? `${cur.security} ` : ''}
          {cur.code}
        </button>
        <StatusBar />
      </div>
      <OfflineBanner />
      {settings.tickerTape && <TickerTape onPick={(sym) => void run(`${sym} GP`)} />}
      {meta && (
        <div className="mshell__meta">
          <AgeBadge meta={meta} />
        </div>
      )}
      {pull > 0 && (
        <div className="mshell__pull muted" style={{ height: pull }}>
          {pull >= 60 ? 'Release to refresh' : 'Pull to refresh'}
        </div>
      )}
      <div ref={bodyRef} className="mshell__body" onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
        <PanelHost onMeta={setMeta} panelId={`m-${state.active}`} code={cur.code} security={cur.security} args={{}} run={(c, o) => void run(c, o?.replace ?? false)} />
      </div>
      <nav className="tabbar" aria-label="Sections">
        {TABS.map((t, i) => (
          <button
            key={t.id}
            className="tabbar__btn"
            aria-current={t.id === state.active ? 'page' : undefined}
            onClick={() => go(t.id, i > TABS.findIndex((x) => x.id === state.active) ? 1 : -1)}
          >
            <span aria-hidden>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </nav>
      {sheet && (
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Command line" onClick={() => setSheet(false)}>
          <div className="sheet__box" onClick={(e) => e.stopPropagation()}>
            <CommandLine inputRef={cmdRef} autoFocus onRun={(c) => run(c)} onDone={() => setSheet(false)} />
            <p className="muted">Examples: AAPL GP, N, ECO, NOTE, SET, HELP</p>
          </div>
        </div>
      )}
    </div>
  );
}
