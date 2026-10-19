// Per-device layouts (7.2): never synced. Current layout plus named saved layouts.
import { EMPTY_LAYOUT, sanitizeLayout, type Layout } from './layout';

const KEY = 'meridian.layouts.v1';

interface Stored {
  current: Layout;
  named: Record<string, Layout>;
}

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Stored | null;
    if (!raw) return { current: EMPTY_LAYOUT, named: {} };
    const named: Record<string, Layout> = {};
    for (const [k, v] of Object.entries(raw.named ?? {})) {
      const l = sanitizeLayout(v);
      if (l) named[k] = l;
    }
    return { current: sanitizeLayout(raw.current) ?? EMPTY_LAYOUT, named };
  } catch {
    return { current: EMPTY_LAYOUT, named: {} };
  }
}

function write(s: Stored) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked. Layout still works for this session.
  }
}

export const layoutStore = {
  loadCurrent: () => read().current,
  saveCurrent(l: Layout) {
    const s = read();
    write({ ...s, current: l });
  },
  names: () => Object.keys(read().named).sort(),
  saveAs(name: string, l: Layout) {
    const s = read();
    write({ ...s, named: { ...s.named, [name.slice(0, 40)]: l } });
  },
  load: (name: string) => read().named[name] ?? null,
  remove(name: string) {
    const s = read();
    delete s.named[name];
    write(s);
  },
};
