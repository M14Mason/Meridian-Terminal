import { spendSpike } from '../../shared/ai';
import type { UsageRow } from '../../shared/api-types';
import { api } from '../lib/api';
import { useEffect, useState } from 'react';
import { timeLocal, tzLabel } from '../lib/format';
import { useSyncStatus } from '../state/sync';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const fmtNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });

export function StatusBar() {
  const now = useClock();
  const s = useSyncStatus();
  const syncLabel = s.syncing ? 'SYNC…' : s.error ? 'SYNC ERR' : s.pending ? `SYNC ${s.pending}` : 'SYNC OK';
  return (
    <div className="status" aria-live="off">
      <span className={s.error ? 'down' : s.pending ? 'accent' : 'up'} title={s.error ?? undefined}>
        {syncLabel}
      </span>
      <span title={`Pacific time (all times in the app). Market (New York) time: ${fmtNY.format(now)}`}>{tzLabel(now.getTime())} {timeLocal(now.getTime())}</span>
    </div>
  );
}

export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const s = useSyncStatus();
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);
  if (online) return null;
  const at = s.lastSync ? timeLocal(s.lastSync).slice(0, 5) : 'never';
  return (
    <div className="banner banner--warn" role="status">
      OFFLINE, cached at {at}. Edits are saved and will sync when you reconnect.
    </div>
  );
}

/** AI spend spike warning (16.9). Warning only; the owner chose no hard cap. */
export function SpendBanner() {
  const [spike, setSpike] = useState<{ today: number; avg: number } | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let live = true;
    const check = () => {
      api<UsageRow[]>('/api/usage?days=15').then((rows) => {
        const s = spendSpike(rows, new Date().toISOString().slice(0, 10));
        if (live) setSpike(s.warn ? s : null);
      }, () => undefined);
    };
    check();
    const id = setInterval(check, 10 * 60_000);
    window.addEventListener('meridian:ai-used', check);
    return () => { live = false; clearInterval(id); window.removeEventListener('meridian:ai-used', check); };
  }, []);
  if (!spike || hidden) return null;
  return (
    <div className="banner banner--warn" role="alert">
      AI spend spike: ${spike.today.toFixed(2)} today vs ${spike.avg.toFixed(2)}/day average over the last 14 days. See SET &gt; AI usage.{' '}
      <button className="link-btn" onClick={() => setHidden(true)}>dismiss</button>
    </div>
  );
}

/** Red banner on every device when the Robinhood portfolio is stale or disconnected (17.4). */
export function PortfolioBanner({ onOpen }: { onOpen?: () => void }) {
  const [s, setS] = useState<{ stale: boolean; connected: boolean; hasSnap: boolean; error: string | null; disconnected: boolean } | null>(null);
  useEffect(() => {
    let live = true;
    const check = () => api<{ stale: boolean; connected: boolean; snap: unknown; lastError: string | null; disconnected: boolean }>('/api/portfolio').then((r) => { if (live) setS({ stale: r.stale, connected: r.connected, hasSnap: Boolean(r.snap), error: r.lastError, disconnected: r.disconnected }); }, () => undefined);
    check();
    const id = setInterval(check, 10 * 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);
  // Only once the owner has set up the portfolio (connected before or has a snapshot).
  if (!s || !(s.connected || s.hasSnap) || !(s.stale || s.error)) return null;
  return (
    <div className="banner banner--error" role="alert">
      PORTFOLIO {s.disconnected ? 'DISCONNECTED' : 'STALE'}{s.error ? `: ${s.error}` : ''}. Open PORT to reconnect, or ask Claude &quot;update the portfolio&quot;.{' '}
      {onOpen && <button className="link-btn" onClick={onOpen}>open PORT</button>}
    </div>
  );
}

const SEEN = 'meridian:alerts-seen';
/** New alerts as a banner on any open device, with an optional sound per type (18.2, 18.4). */
export function AlertBanner() {
  const [items, setItems] = useState<{ id: string; title: string; type: string; at: number }[]>([]);
  useEffect(() => {
    let live = true;
    let seen = 0;
    try { seen = Number(localStorage.getItem(SEEN) ?? '0') || Date.now() - 3600_000; } catch { seen = Date.now() - 3600_000; }
    const check = () => api<{ items: { id: string; title: string; type: string; at: number }[] }>('/api/alerts/history').then((r) => {
      if (!live) return;
      const fresh = r.items.filter((x) => x.at > seen);
      if (!fresh.length) return;
      setItems((cur) => [...fresh, ...cur].slice(0, 5));
      seen = Math.max(...fresh.map((x) => x.at));
      try { localStorage.setItem(SEEN, String(seen)); } catch { /* storage blocked */ }
      playAlertSound(fresh[0]!.type);
    }, () => undefined);
    check();
    const id = setInterval(check, 60_000);
    return () => { live = false; clearInterval(id); };
  }, []);
  if (!items.length) return null;
  return (
    <div className="banner banner--alert" role="alert">
      ALERT: {items[0]!.title}{items.length > 1 ? ` (+${items.length - 1} more, see ALRT)` : ''}{' '}
      <button className="link-btn" onClick={() => setItems([])}>dismiss</button>
    </div>
  );
}

/** Short tone by alert type. Off unless enabled in ALRT; off by default on phones (18.4). */
function playAlertSound(type: string) {
  try {
    if (localStorage.getItem('meridian:alert-sound') !== '1') return;
    const ctx = new AudioContext();
    const freq: Record<string, number> = { price_above: 880, price_below: 440, pct_move: 660, line_cross: 990, news: 520, filing: 600, system: 330 };
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = freq[type] ?? 700;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {
    // audio blocked until the user interacts with the page
  }
}
