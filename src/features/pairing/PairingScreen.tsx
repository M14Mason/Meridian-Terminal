import { useState, type FormEvent } from 'react';
import type { PairResponse } from '../../../shared/api-types';
import { APP_NAME, DISCLAIMER, PROXY_URL } from '../../config';
import { api, ApiError, defaultDeviceName, setToken } from '../../lib/api';

// The only thing an unpaired visitor can see (6.4).
export function PairingScreen() {
  const [mode, setMode] = useState<'code' | 'setup'>('code');
  const [value, setValue] = useState('');
  const [name, setName] = useState(defaultDeviceName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = mode === 'code' ? { code: value.trim(), deviceName: name } : { secret: value.trim(), deviceName: name };
      const r = await api<PairResponse>(mode === 'code' ? '/api/pair/code' : '/api/pair/setup', { method: 'POST', body, auth: false });
      setValue('');
      setToken(r.token);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 429 ? 'Too many attempts. Wait and try again.' : 'Pairing failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="pair">
      <h1 className="pair__title">{APP_NAME.toUpperCase()}</h1>
      {!PROXY_URL ? (
        <p className="pair__warn">Proxy not configured. See docs/OWNER_SETUP.md, step 3.</p>
      ) : (
        <form className="pair__form" onSubmit={submit}>
          <div className="pair__tabs" role="tablist">
            <button type="button" role="tab" aria-selected={mode === 'code'} onClick={() => setMode('code')}>
              PAIR WITH CODE
            </button>
            <button type="button" role="tab" aria-selected={mode === 'setup'} onClick={() => setMode('setup')}>
              FIRST DEVICE
            </button>
          </div>
          <label className="pair__label">
            {mode === 'code' ? 'Six-digit code from a paired device' : 'Setup secret'}
            <input
              className="pair__input"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              type={mode === 'code' ? 'text' : 'password'}
              inputMode={mode === 'code' ? 'numeric' : undefined}
              pattern={mode === 'code' ? '\\d{6}' : undefined}
              maxLength={mode === 'code' ? 6 : 512}
              autoComplete={mode === 'code' ? 'one-time-code' : 'current-password'}
              required
              autoFocus
            />
          </label>
          <label className="pair__label">
            Device name
            <input className="pair__input" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} required />
          </label>
          <button className="pair__go" type="submit" disabled={busy}>
            {busy ? 'PAIRING' : 'GO'}
          </button>
          {error && (
            <p className="pair__warn" role="alert">
              {error}
            </p>
          )}
          <p className="pair__hint">
            {mode === 'code'
              ? 'On a paired device open Settings > Devices > Add device. Codes expire in 3 minutes.'
              : 'Use the setup secret from your password manager. Used once per new install.'}
          </p>
        </form>
      )}
      <footer className="pair__footer">{DISCLAIMER}</footer>
    </main>
  );
}
