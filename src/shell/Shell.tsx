import { useEffect, useState, useSyncExternalStore } from 'react';
import { detectLowPower, setLowPower } from '../lib/motion';
import { applyTheme, useSettings } from '../state/settings';
import { startSync } from '../state/sync';
import { tickers } from '../data/adapters/sec';
import { api } from '../lib/api';
import { setTickerIndex } from './command';
import { DesktopShell } from './DesktopShell';
import { MobileShell } from './MobileShell';
import { PopoutShell } from './PopoutShell';
import './shell.css';

const PHONE_QUERY = '(max-width: 767px)';

function useIsPhone(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia(PHONE_QUERY);
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => window.matchMedia(PHONE_QUERY).matches,
  );
}

function useHash(): string {
  return useSyncExternalStore(
    (fn) => {
      window.addEventListener('hashchange', fn);
      return () => window.removeEventListener('hashchange', fn);
    },
    () => window.location.hash,
  );
}

// Root of the paired app. Hash routing works on GitHub Pages without a 404 fallback (5.1).
export function Shell() {
  const settings = useSettings();
  const phone = useIsPhone();
  const hash = useHash();
  const [autoLow, setAutoLow] = useState(false);

  useEffect(() => startSync(), []);
  // Keep the ship relay collecting while the app is open anywhere, so TNKR is already full when opened.
  // One tiny request every 5 minutes; the relay stays connected 12 minutes past the last one.
  useEffect(() => {
    const warm = () => void api('/api/ais/warm', { method: 'POST' }).catch(() => undefined);
    warm();
    const id = setInterval(warm, 5 * 60_000);
    return () => clearInterval(id);
  }, []);
  // Ticker autocomplete. Loaded in the background, cached for a day.
  useEffect(() => {
    void tickers().then(setTickerIndex, () => undefined);
  }, []);
  useEffect(() => applyTheme(settings), [settings]);
  useEffect(() => {
    void detectLowPower().then(setAutoLow);
  }, []);
  useEffect(() => {
    const low = settings.lowPower === 'on' || (settings.lowPower === 'auto' && autoLow);
    setLowPower(low);
    document.documentElement.dataset.lowpower = low ? '1' : '0';
  }, [settings.lowPower, autoLow]);

  if (hash.startsWith('#/pop')) return <PopoutShell params={new URLSearchParams(hash.split('?')[1] ?? '')} />;
  return phone ? <MobileShell /> : <DesktopShell />;
}
