import { lazy, Suspense, useEffect, useState } from 'react';
import { getToken } from './lib/api';
import { PairingScreen } from './features/pairing/PairingScreen';
import './App.css';

// The terminal shell is its own chunk, so an unpaired visitor downloads only the pairing screen.
const Shell = lazy(() => import('./shell/Shell').then((m) => ({ default: m.Shell })));

function usePaired(): boolean {
  const [paired, setPaired] = useState(() => Boolean(getToken()));
  useEffect(() => {
    const on = () => setPaired(Boolean(getToken()));
    window.addEventListener('meridian:auth', on);
    window.addEventListener('storage', on);
    return () => {
      window.removeEventListener('meridian:auth', on);
      window.removeEventListener('storage', on);
    };
  }, []);
  return paired;
}

export function App() {
  const paired = usePaired();
  if (!paired) return <PairingScreen />;
  return (
    <Suspense fallback={<div className="skeleton skeleton--full" aria-busy="true" />}>
      <Shell />
    </Suspense>
  );
}
