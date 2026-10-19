import { useEffect } from 'react';
import { useHealth, report } from '../../data/health';
import { api } from '../../lib/api';
import { useSyncStatus } from '../../state/sync';
import type { PanelProps } from '../types';

function age(ts: number | null): string {
  if (!ts) return '-';
  const s = Math.round((Date.now() - ts) / 1000);
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.round(s / 60)}m` : `${Math.round(s / 3600)}h`;
}

export default function HealthPanel(_: PanelProps) {
  const sources = useHealth();
  const sync = useSyncStatus();

  useEffect(() => {
    const ping = async () => {
      const t0 = performance.now();
      try {
        await api('/api/health', { auth: false });
        report('proxy', { ok: true, latencyMs: Math.round(performance.now() - t0) });
      } catch (e) {
        report('proxy', { ok: false, error: (e as Error).message });
      }
    };
    void ping();
    const id = setInterval(ping, 30_000);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <table className="grid-table">
        <thead>
          <tr>
            <th>Source</th>
            <th>Status</th>
            <th>Latency</th>
            <th>Last OK</th>
            <th>Err</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => {
            const status = s.id === 'sync' ? (sync.error ? 'down' : sync.lastSync ? 'ok' : 'idle') : s.status;
            const last = s.id === 'sync' ? sync.lastSync : s.lastSuccess;
            return (
              <tr key={s.id} title={s.lastError ?? undefined}>
                <td>{s.label}</td>
                <td className={status === 'ok' ? 'up' : status === 'down' ? 'down' : 'muted'}>
                  {status === 'planned' ? `planned ${s.milestone}` : status.toUpperCase()}
                </td>
                <td>{s.latencyMs != null ? `${s.latencyMs}ms` : '-'}</td>
                <td>{age(last)}</td>
                <td>{s.errors || '-'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">Sync: {sync.pending} change(s) waiting{sync.error ? `, last error: ${sync.error}` : ''}.</p>
    </div>
  );
}
