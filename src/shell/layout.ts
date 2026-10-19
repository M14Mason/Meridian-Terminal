// Desktop workspace model (9.3). Pure reducer so every layout operation is unit-tested.
// Frames sit on a 48-column grid with 16 px rows. A frame holds one or more panels as tabs.

import type { LinkColor } from './types';

export const COLS = 48;
export const ROW_PX = 16;

export interface PanelState {
  id: string;
  code: string;
  security?: string;
  link: LinkColor | null;
  args?: Record<string, string>;
}

export interface FrameState {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tabs: string[];
  active: string;
  minimized: boolean;
  maximized: boolean;
  locked: boolean;
  z: number;
}

export interface Layout {
  panels: Record<string, PanelState>;
  frames: FrameState[];
  focused: string | null;
}

export const EMPTY_LAYOUT: Layout = { panels: {}, frames: [], focused: null };

export type Action =
  | { type: 'open'; code: string; security?: string; size?: { w: number; h: number }; newFrame?: boolean; id?: string }
  | { type: 'close'; panelId: string }
  | { type: 'focus'; frameId: string }
  | { type: 'move'; frameId: string; x: number; y: number }
  | { type: 'resize'; frameId: string; w: number; h: number }
  | { type: 'toggle'; frameId: string; flag: 'minimized' | 'maximized' | 'locked' }
  | { type: 'duplicate'; panelId: string; id?: string }
  | { type: 'stack'; panelId: string; targetFrameId: string }
  | { type: 'unstack'; panelId: string; id?: string }
  | { type: 'activate'; frameId: string; panelId: string }
  | { type: 'setSecurity'; panelId: string; security: string }
  | { type: 'setLink'; panelId: string; link: LinkColor | null }
  | { type: 'replace'; layout: Layout };

let counter = 0;
export function newId(prefix: string): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

function overlaps(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** First free slot scanning top to bottom, left to right. Falls back to below everything. */
export function findSlot(frames: FrameState[], w: number, h: number): { x: number; y: number } {
  const visible = frames.filter((f) => !f.minimized);
  const maxY = visible.reduce((m, f) => Math.max(m, f.y + f.h), 0);
  for (let y = 0; y <= maxY; y++) {
    for (let x = 0; x + w <= COLS; x++) {
      const box = { x, y, w, h };
      if (!visible.some((f) => overlaps(box, f))) return { x, y };
    }
  }
  return { x: 0, y: maxY };
}

const topZ = (l: Layout) => l.frames.reduce((m, f) => Math.max(m, f.z), 0) + 1;

function frameOf(l: Layout, panelId: string): FrameState | undefined {
  return l.frames.find((f) => f.tabs.includes(panelId));
}

/** Panels linked to the same color follow the same security (feature 115). */
function propagate(l: Layout, link: LinkColor | null, security: string | undefined): Record<string, PanelState> {
  if (!link || !security) return l.panels;
  const out: Record<string, PanelState> = {};
  for (const [id, p] of Object.entries(l.panels)) out[id] = p.link === link ? { ...p, security } : p;
  return out;
}

export function reduce(l: Layout, a: Action): Layout {
  switch (a.type) {
    case 'replace':
      return a.layout;

    case 'open': {
      const focused = l.frames.find((f) => f.id === l.focused);
      // Default: run in the focused frame's active panel, like the real terminal. newFrame opens a new one.
      if (focused && !a.newFrame && !focused.locked) {
        const p = l.panels[focused.active]!;
        const next: PanelState = { ...p, code: a.code, security: a.security ?? p.security };
        const panels = { ...l.panels, [p.id]: next };
        // Another frame left maximized would hide the panel the command just ran in.
        const frames = l.frames.map((f) => (f.maximized && f.id !== focused.id ? { ...f, maximized: false } : f));
        return { ...l, frames, panels: a.security ? propagate({ ...l, panels }, p.link, a.security) : panels };
      }
      const size = a.size ?? { w: 18, h: 18 };
      const id = a.id ?? newId('p');
      const fid = newId('f');
      const slot = findSlot(l.frames, size.w, size.h);
      const frame: FrameState = {
        id: fid, ...slot, ...size, tabs: [id], active: id,
        minimized: false, maximized: false, locked: false, z: topZ(l),
      };
      return {
        panels: { ...l.panels, [id]: { id, code: a.code, security: a.security, link: null } },
        // A maximized frame would hide the new one, so opening a frame restores any maximized frame.
        frames: [...l.frames.map((f) => (f.maximized ? { ...f, maximized: false } : f)), frame],
        focused: fid,
      };
    }

    case 'close': {
      const f = frameOf(l, a.panelId);
      if (!f) return l;
      const panels = { ...l.panels };
      delete panels[a.panelId];
      const tabs = f.tabs.filter((t) => t !== a.panelId);
      if (tabs.length === 0) {
        const frames = l.frames.filter((x) => x.id !== f.id);
        return { panels, frames, focused: l.focused === f.id ? (frames.at(-1)?.id ?? null) : l.focused };
      }
      const active = f.active === a.panelId ? tabs[Math.max(0, f.tabs.indexOf(a.panelId) - 1)]! : f.active;
      return { ...l, panels, frames: l.frames.map((x) => (x.id === f.id ? { ...x, tabs, active } : x)) };
    }

    case 'focus': {
      if (!l.frames.some((f) => f.id === a.frameId)) return l;
      const z = topZ(l);
      return { ...l, focused: a.frameId, frames: l.frames.map((f) => (f.id === a.frameId ? { ...f, z } : f.maximized ? { ...f, maximized: false } : f)) };
    }

    case 'move':
      return {
        ...l,
        frames: l.frames.map((f) =>
          f.id === a.frameId && !f.locked ? { ...f, x: clamp(Math.round(a.x), 0, COLS - f.w), y: Math.max(0, Math.round(a.y)) } : f,
        ),
      };

    case 'resize':
      return {
        ...l,
        frames: l.frames.map((f) =>
          f.id === a.frameId && !f.locked ? { ...f, w: clamp(Math.round(a.w), 6, COLS - f.x), h: clamp(Math.round(a.h), 4, 200) } : f,
        ),
      };

    case 'toggle':
      return {
        ...l,
        frames: l.frames.map((f) => {
          if (f.id !== a.frameId) return a.flag === 'maximized' && f.maximized ? { ...f, maximized: false } : f;
          const next = { ...f, [a.flag]: !f[a.flag] };
          if (a.flag === 'maximized' && next.maximized) next.minimized = false;
          if (a.flag === 'minimized' && next.minimized) next.maximized = false;
          return next;
        }),
      };

    case 'duplicate': {
      const src = l.panels[a.panelId];
      const f = frameOf(l, a.panelId);
      if (!src || !f) return l;
      const id = a.id ?? newId('p');
      const fid = newId('f');
      const slot = findSlot(l.frames, f.w, f.h);
      return {
        panels: { ...l.panels, [id]: { ...src, id } },
        frames: [...l.frames, { ...f, id: fid, ...slot, tabs: [id], active: id, maximized: false, minimized: false, locked: false, z: topZ(l) }],
        focused: fid,
      };
    }

    case 'stack': {
      const from = frameOf(l, a.panelId);
      const to = l.frames.find((f) => f.id === a.targetFrameId);
      if (!from || !to || from.id === to.id) return l;
      let frames = l.frames.map((f) => {
        if (f.id === to.id) return { ...f, tabs: [...f.tabs, a.panelId], active: a.panelId };
        if (f.id === from.id) {
          const tabs = f.tabs.filter((t) => t !== a.panelId);
          return { ...f, tabs, active: f.active === a.panelId ? (tabs[0] ?? '') : f.active };
        }
        return f;
      });
      frames = frames.filter((f) => f.tabs.length > 0);
      return { ...l, frames, focused: to.id };
    }

    case 'unstack': {
      const f = frameOf(l, a.panelId);
      if (!f || f.tabs.length < 2) return l;
      const tabs = f.tabs.filter((t) => t !== a.panelId);
      const fid = a.id ?? newId('f');
      const slot = findSlot(l.frames, f.w, f.h);
      return {
        ...l,
        frames: [
          ...l.frames.map((x) => (x.id === f.id ? { ...x, tabs, active: x.active === a.panelId ? tabs[0]! : x.active } : x)),
          { ...f, id: fid, ...slot, tabs: [a.panelId], active: a.panelId, maximized: false, z: topZ(l) },
        ],
        focused: fid,
      };
    }

    case 'activate':
      return { ...l, frames: l.frames.map((f) => (f.id === a.frameId && f.tabs.includes(a.panelId) ? { ...f, active: a.panelId } : f)) };

    case 'setSecurity': {
      const p = l.panels[a.panelId];
      if (!p) return l;
      const panels = { ...l.panels, [a.panelId]: { ...p, security: a.security } };
      return { ...l, panels: propagate({ ...l, panels }, p.link, a.security) };
    }

    case 'setLink': {
      const p = l.panels[a.panelId];
      if (!p) return l;
      // Joining a group adopts the group's current security, if it has one.
      const groupSec = a.link ? Object.values(l.panels).find((x) => x.link === a.link && x.security)?.security : undefined;
      return { ...l, panels: { ...l.panels, [a.panelId]: { ...p, link: a.link, security: groupSec ?? p.security } } };
    }
  }
}

/** Validates a layout loaded from storage. Returns null if it is unusable. */
export function sanitizeLayout(raw: unknown): Layout | null {
  if (!raw || typeof raw !== 'object') return null;
  const l = raw as Layout;
  if (!l.panels || typeof l.panels !== 'object' || !Array.isArray(l.frames)) return null;
  const frames = l.frames.filter(
    (f) => f && typeof f.id === 'string' && Array.isArray(f.tabs) && f.tabs.length > 0 && f.tabs.every((t) => l.panels[t]),
  );
  return { panels: l.panels, frames, focused: frames.some((f) => f.id === l.focused) ? l.focused : (frames[0]?.id ?? null) };
}
