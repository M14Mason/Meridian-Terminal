import { useCallback, useEffect, useState } from 'react';
import { KEY_SPECS, type KeyMeta } from '../../../shared/keys';
import { api } from '../../lib/api';

type KeyStatus = 'ok' | 'missing' | 'rejected' | 'error' | 'unused';
interface KeyResult { group: string; keys: string[]; status: KeyStatus; detail: string; ms: number }
const STATUS_LABEL: Record<KeyStatus, string> = { ok: 'WORKING', missing: 'NOT SET', rejected: 'REJECTED', error: 'ERROR', unused: 'NOT USED' };
const STATUS_CLASS: Record<KeyStatus, string> = { ok: 'up', missing: 'muted', rejected: 'down', error: 'down', unused: 'muted' };
const ORDER: Record<KeyStatus, number> = { rejected: 0, error: 1, missing: 2, ok: 3, unused: 4 };
const resultFor = (rs: KeyResult[] | undefined, name: string) => rs?.find((r) => r.keys.includes(name));
function summary(rs: KeyResult[]): string {
  const bad = rs.filter((r) => r.status === 'rejected' || r.status === 'error');
  const ok = rs.filter((r) => r.status === 'ok').length;
  const missing = rs.filter((r) => r.status === 'missing').length;
  return bad.length ? `${bad.length} not working: ${bad.map((r) => r.group).join(', ')}. ${ok} working, ${missing} not set.` : `All saved keys work (${ok} working, ${missing} not set).`;
}

// Write-only key management (6.5). Values go to the proxy and are never shown again.
export function KeysSettings() {
  const [meta, setMeta] = useState<Record<string, KeyMeta>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [test, setTest] = useState<{ busy?: boolean; at?: number; results?: KeyResult[]; err?: string }>({});

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

  // TEST ALL: the proxy makes one small request per key and reports what works (keys never come back).
  async function testAll() {
    setTest({ busy: true });
    try {
      const r = await api<{ at: number; results: KeyResult[] }>('/api/keys/test', { method: 'POST' });
      setTest({ at: r.at, results: r.results });
    } catch (e) {
      setTest({ err: (e as Error).message });
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
      <div className="settings__key-row">
        <button type="button" onClick={() => void testAll()} disabled={test.busy}>{test.busy ? 'TESTING (UP TO 10 S)...' : 'TEST ALL'}</button>
        {test.results && <span className="settings__hint">{summary(test.results)}</span>}
      </div>
      {test.err && <p className="settings__hint down" role="alert">{test.err}</p>}
      {test.results && (
        <table className="settings__table" aria-label="Key test results">
          <thead><tr><th>Service</th><th>Result</th><th>Details</th></tr></thead>
          <tbody>
            {[...test.results].sort((a, b) => ORDER[a.status] - ORDER[b.status]).map((r) => (
              <tr key={r.group}>
                <td>{r.group}</td>
                <td className={STATUS_CLASS[r.status]}>{STATUS_LABEL[r.status]}</td>
                <td>{r.detail}{r.ms ? ` (${(r.ms / 1000).toFixed(1)} s)` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
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
                {resultFor(test.results, spec.name) && <span className={STATUS_CLASS[resultFor(test.results, spec.name)!.status]}> · {STATUS_LABEL[resultFor(test.results, spec.name)!.status]}</span>}
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
