import { useEffect, useState } from 'react';
import { APP_NAME, DISCLAIMER } from './config';
import { getToken } from './lib/api';
import { PairingScreen } from './features/pairing/PairingScreen';
import { DevicesSettings } from './features/settings/DevicesSettings';
import { KeysSettings } from './features/settings/KeysSettings';
import { UsageSettings } from './features/settings/UsageSettings';
import './App.css';

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

// M1 shell: pairing gate plus Settings. M2 replaces the paired view with the full terminal.
export function App() {
  const paired = usePaired();
  if (!paired) return <PairingScreen />;
  return (
    <main className="boot">
      <h1 className="boot__title">{APP_NAME.toUpperCase()}</h1>
      <p className="boot__line">
        STATUS <span className="boot__ok">PAIRED</span>
      </p>
      <DevicesSettings />
      <KeysSettings />
      <UsageSettings />
      <footer className="boot__footer">{DISCLAIMER}</footer>
    </main>
  );
}
