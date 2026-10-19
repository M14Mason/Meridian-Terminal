import { useCallback, useEffect, useState } from 'react';
import type { AddDeviceCode, DeviceInfo } from '../../../shared/api-types';
import { api } from '../../lib/api';

function ago(ts: number): string {
  const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export function DevicesSettings() {
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [code, setCode] = useState<AddDeviceCode | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api<DeviceInfo[]>('/api/devices').then(setDevices, (e: Error) => setError(e.message));
  }, []);
  useEffect(load, [load]);

  useEffect(() => {
    if (!code) return;
    const id = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= code.expiresAt) {
        setCode(null);
        load();
      }
    }, 1000);
    return () => clearInterval(id);
  }, [code, load]);

  async function addDevice() {
    setError('');
    try {
      setCode(await api<AddDeviceCode>('/api/devices/code', { method: 'POST' }));
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function revoke(d: DeviceInfo) {
    const msg = d.current ? `Revoke THIS device (${d.name})? You will need to pair it again.` : `Revoke ${d.name}? Its access stops immediately.`;
    if (!window.confirm(msg)) return;
    try {
      await api(`/api/devices/${d.id}`, { method: 'DELETE' });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <section className="settings__section" aria-labelledby="dev-h">
      <h2 id="dev-h">DEVICES</h2>
      <table className="settings__table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Last seen</th>
            <th aria-label="actions" />
          </tr>
        </thead>
        <tbody>
          {devices.map((d) => (
            <tr key={d.id}>
              <td>
                {d.name}
                {d.current && <span className="settings__tag"> THIS DEVICE</span>}
              </td>
              <td>{ago(d.lastSeen)}</td>
              <td>
                <button className="settings__danger" onClick={() => revoke(d)}>
                  REVOKE
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addDevice}>ADD DEVICE</button>
      {code && (
        <div className="settings__code" role="status">
          <div className="settings__code-digits">{code.code.replace(/(\d{3})(\d{3})/, '$1 $2')}</div>
          <div>Expires in {Math.max(0, Math.ceil((code.expiresAt - now) / 1000))}s. Single use.</div>
          <div className="settings__warn">Six digits are short, so codes expire fast. Never share this code.</div>
        </div>
      )}
      {error && <p className="settings__warn">{error}</p>}
    </section>
  );
}
