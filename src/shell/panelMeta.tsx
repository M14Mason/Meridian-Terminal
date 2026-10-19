import { createContext, useContext, useEffect, useState } from 'react';

// Panels report data age and source here; the frame header shows it (5.5: "show data age on every panel").
export interface PanelMeta {
  fetchedAt: number | null;
  source: string;
  /** Extra honesty label, for example "IEX only" or "delayed 15m" or "ETF proxies". */
  note?: string;
}

export const PanelMetaContext = createContext<(m: PanelMeta | null) => void>(() => undefined);

/** Every dataset the panel loaded, by useData key, so ANALYZE can read the raw data and not only the screen. */
export type PanelData = Map<string, { source: string; data: unknown; at: number | null }>;
export const PanelDataContext = createContext<PanelData | null>(null);

export function usePanelData(key: string | null, source: string | undefined, data: unknown, at: number | null): void {
  const store = useContext(PanelDataContext);
  useEffect(() => {
    if (!store || !key || data === undefined) return;
    store.set(key, { source: source ?? key, data, at });
    return () => void store.delete(key);
  }, [store, key, source, data, at]);
}

export function usePanelMeta(meta: PanelMeta | null): void {
  const set = useContext(PanelMetaContext);
  const key = meta ? `${meta.fetchedAt}|${meta.source}|${meta.note ?? ''}` : '';
  useEffect(() => {
    set(meta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, set]);
}

function ageText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

export function AgeBadge({ meta }: { meta: PanelMeta | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);
  if (!meta) return null;
  const age = meta.fetchedAt ? now - meta.fetchedAt : null;
  const cls = age === null ? 'muted' : age < 60_000 ? 'up' : age < 15 * 60_000 ? 'accent' : 'down';
  return (
    <span className={`age ${cls}`} title={`Source: ${meta.source}${meta.note ? `. ${meta.note}` : ''}`}>
      {age === null ? 'NO DATA' : ageText(age)} {meta.source}
      {meta.note ? ` · ${meta.note}` : ''}
    </span>
  );
}
