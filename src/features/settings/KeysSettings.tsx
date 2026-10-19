import { useCallback, useEffect, useState } from 'react';
import { KEY_SPECS, type KeyMeta } from '../../../shared/keys';
import { api } from '../../lib/api';

// Write-only key management (6.5). Values go to the proxy and are never shown again.
export function KeysSettings() {
  const [meta, setMeta] = useState<Record<string, KeyMeta>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  const load = useCallback(() => {
    api<KeyMeta[]>('/api/keys').then(
      (list) => setMeta(Object.fromEntries(list.map((k) => [k.name, k]))),
      (e: Error) => setMsg(e.message),
    );
  }, []);
  useEffect(load, [load]);

  async function save(name: string) {
    const value = drafts[name]?.trim();
    if (!value) return;
    try {
      await api(`/api/keys/${name}`, { method: 'PUT', body: { value } });
      setDrafts((d) => ({ ...d, [name]: '' }));
      setMsg(`${name} saved.`);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  async function remove(name: string) {
    // Two confirmations (6.5).
    if (!window.confirm(`Delete ${name}? Features that need it will stop working.`)) return;
    if (!window.confirm(`Really delete ${name}? This cannot be undone.`)) return;
    try {
      await api(`/api/keys/${name}`, { method: 'DELETE' });
      setMsg(`${name} deleted.`);
      load();
    } catch (e) {
      setMsg((e as Error).message);
    }
  }

  return (
    <section className="settings__section" aria-labelledby="keys-h">
      <h2 id="keys-h">KEYS</h2>
      <p className="settings__hint">Keys are stored encrypted in your proxy and sync to every paired device. They are never stored on this device or shown again.</p>
      {KEY_SPECS.map((spec) => {
        const m = meta[spec.name];
        return (
          <div className="settings__key" key={spec.name}>
            <div className="settings__key-head">
              <strong>{spec.label}</strong>
              <span className="settings__key-state">
                {m?.source === 'dashboard' && 'set in Cloudflare dashboard (takes priority)'}
                {m?.source === 'app' && `saved, ends in ${m.last4}`}
                {(!m || m.source === 'none') && 'not set'}
              </span>
            </div>
            <div className="settings__hint">{spec.help}</div>
            {m?.source !== 'dashboard' && (
              <form
                className="settings__key-row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void save(spec.name);
                }}
              >
                <input
                  type="password"
                  autoComplete="off"
                  aria-label={`${spec.label} value`}
                  placeholder={m?.source === 'app' ? 'replace' : 'paste key'}
                  value={drafts[spec.name] ?? ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [spec.name]: e.target.value }))}
                />
                <button type="submit">SAVE</button>
                {m?.source === 'app' && (
                  <button type="button" className="settings__danger" onClick={() => remove(spec.name)}>
                    DELETE
                  </button>
                )}
              </form>
            )}
          </div>
        );
      })}
      {msg && (
        <p className="settings__hint" role="status">
          {msg}
        </p>
      )}
    </section>
  );
}
