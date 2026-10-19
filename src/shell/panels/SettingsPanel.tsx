import { dateTimeLocal } from '../../lib/format';
import { useRef, useState } from 'react';
import { validateRecord } from '../../../shared/sync';
import { DevicesSettings } from '../../features/settings/DevicesSettings';
import { KeysSettings } from '../../features/settings/KeysSettings';
import { UsageSettings } from '../../features/settings/UsageSettings';
import { api, setToken } from '../../lib/api';
import { updateSettings, useSettings, type ThemeName } from '../../state/settings';
import { sync, useSyncStatus } from '../../state/sync';
import type { PanelProps } from '../types';

const THEMES: { id: ThemeName; label: string }[] = [
  { id: 'classic', label: 'Classic (amber on black)' },
  { id: 'dark', label: 'Modern dark' },
  { id: 'light', label: 'Light' },
];

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export default function SettingsPanel(_: PanelProps) {
  const s = useSettings();
  const status = useSyncStatus();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');

  function exportData() {
    const blob = new Blob([sync.exportJson()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `meridian-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function importData(f: File) {
    try {
      const n = await sync.importJson(await f.text(), validateRecord);
      setMsg(`Imported ${n} record(s).`);
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="settings">
      <section className="settings__section" aria-labelledby="look-h">
        <h2 id="look-h">APPEARANCE</h2>
        <div className="pair__tabs" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={s.theme === t.id} aria-selected={s.theme === t.id} onClick={() => updateSettings({ theme: t.id })}>
              {t.label}
            </button>
          ))}
        </div>
        <Toggle label="Color-blind safe up/down (blue/orange)" checked={s.colorBlind} onChange={(v) => updateSettings({ colorBlind: v })} />
        <Toggle label="Ticker tape" checked={s.tickerTape} onChange={(v) => updateSettings({ tickerTape: v })} />
        <Toggle label="Learn mode (explains panels)" checked={s.learnMode} onChange={(v) => updateSettings({ learnMode: v })} />
        <Toggle label="Sound alerts" checked={s.sounds} onChange={(v) => updateSettings({ sounds: v })} />
        <label className="toggle">
          Low power mode
          <select value={s.lowPower} onChange={(e) => updateSettings({ lowPower: e.target.value as 'auto' | 'on' | 'off' })}>
            <option value="auto">Auto</option>
            <option value="on">On</option>
            <option value="off">Off</option>
          </select>
        </label>
      </section>

      <section className="settings__section" aria-labelledby="sync-h">
        <h2 id="sync-h">SYNC AND BACKUP</h2>
        <p className="settings__hint">
          Watchlists, screens, alerts, notes, journal, drawings and settings sync across devices. Layouts stay on each device.
        </p>
        <p>
          {status.syncing ? 'Syncing' : status.error ? `Error: ${status.error}` : 'Idle'}. Pending: {status.pending}. Last sync:{' '}
          {status.lastSync ? dateTimeLocal(status.lastSync) : 'never'}.
        </p>
        <div className="row">
          <button onClick={() => void sync.flush()}>SYNC NOW</button>
          <button onClick={exportData}>EXPORT JSON</button>
          <button onClick={() => file.current?.click()}>IMPORT JSON</button>
          <input ref={file} type="file" accept="application/json" hidden onChange={(e) => e.target.files?.[0] && void importData(e.target.files[0])} />
        </div>
        {msg && <p className="settings__hint">{msg}</p>}
      </section>

      <DevicesSettings />
      <KeysSettings />
      <UsageSettings />

      <section className="settings__section">
        <h2>THIS DEVICE</h2>
        <button
          className="settings__danger"
          onClick={() => {
            if (!window.confirm('Unpair this device? It is revoked on the proxy and needs a new code to pair again.')) return;
            const id = localStorage.getItem('meridian.deviceId');
            const done = () => setToken(null);
            if (id) void api(`/api/devices/${id}`, { method: 'DELETE' }).then(done, done);
            else done();
          }}
        >
          UNPAIR THIS DEVICE
        </button>
      </section>
    </div>
  );
}
