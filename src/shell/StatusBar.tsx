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
