import { useCallback, useEffect, useRef, useState } from 'react';
import { usePanelMeta } from '../shell/panelMeta';
import { cached, isMissingKey, type Fetched } from './client';

export interface DataState<T> {
  data: T | undefined;
  error: string | null;
  missingKey: boolean;
  loading: boolean;
  fetchedAt: number | null;
  refresh: () => void;
}

interface Opts {
  /** Natural update cadence of the source (5.5). Omit for load-once data. */
  everyMs?: number;
  /** Label for the panel header age badge. */
  source?: string;
  note?: string;
  /** Local cache key used to paint stale data instantly while the refresh runs. */
  cacheKey?: string;
}

/**
 * Loads data for a panel: paints cached data first (stale-while-revalidate), refreshes at the
 * source's cadence, backs off on errors, slows when the tab is hidden, and reports data age.
 * `key` null means "not ready" (for example no ticker yet).
 */
export function useData<T>(key: string | null, load: () => Promise<Fetched<T>>, opts: Opts = {}): DataState<T> {
  const [state, setState] = useState<{ data?: T; error: string | null; missingKey: boolean; loading: boolean; fetchedAt: number | null }>({
    error: null,
    missingKey: false,
    loading: Boolean(key),
    fetchedAt: null,
  });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    if (!key) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let failures = 0;
    if (opts.cacheKey) {
      void cached<T>(opts.cacheKey).then((c) => {
        if (alive && c) setState((s) => (s.data === undefined ? { ...s, data: c.data, fetchedAt: c.fetchedAt } : s));
      });
    }
    const run = () => {
      setState((s) => ({ ...s, loading: true }));
      loadRef.current().then(
        (r) => {
          if (!alive) return;
          failures = 0;
          setState({ data: r.data, error: null, missingKey: false, loading: false, fetchedAt: r.fetchedAt });
          if (opts.everyMs) timer = setTimeout(run, document.visibilityState === 'hidden' ? opts.everyMs * 4 : opts.everyMs);
        },
        (e: unknown) => {
          if (!alive) return;
          failures++;
          setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : 'failed', missingKey: isMissingKey(e) }));
          // A missing key will not fix itself in seconds. Otherwise back off exponentially.
          if (!isMissingKey(e)) timer = setTimeout(run, Math.min(5 * 60_000, (opts.everyMs ?? 15_000) * 2 ** failures));
        },
      );
    };
    run();
    const onRefresh = () => {
      if (timer) clearTimeout(timer);
      run();
    };
    window.addEventListener('meridian:refresh', onRefresh);
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      window.removeEventListener('meridian:refresh', onRefresh);
    };
  }, [key, tick, opts.everyMs, opts.cacheKey]);

  usePanelMeta(key && opts.source ? { fetchedAt: state.fetchedAt, source: opts.source, note: opts.note } : null);
  return { ...state, data: state.data, refresh };
}
