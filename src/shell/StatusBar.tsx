import { spendSpike } from '../../shared/ai';
import type { UsageRow } from '../../shared/api-types';
import { api } from '../lib/api';
import { useEffect, useState } from 'react';
import { useSyncStatus } from '../state/sync';

function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

const fmtNY = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export function StatusBar() {
  const now = useClock();
  const s = useSyncStatus();
  const syncLabel = s.syncing ? 'SYNC…' : s.error ? 'SYNC ERR' : s.pending ? `SYNC ${s.pending}` : 'SYNC OK';
  return (
    <div className="status" aria-live="off">
      <span className={s.error ? 'down' : s.pending ? 'accent' : 'up'} title={s.error ?? undefined}>
        {syncLabel}
      </span>
      <span title="New York time">NY {fmtNY.format(now)}</span>
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
  const at = s.lastSync ? new Date(s.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'never';
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
