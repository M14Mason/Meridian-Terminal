import { useEffect, useState } from 'react';
import type { UsageRow } from '../../../shared/api-types';
import { api } from '../../lib/api';

// Usage meter (16.9): spend per day, feature and model. Spike warnings show as a banner (SpendBanner).
export function UsageSettings() {
  const [rows, setRows] = useState<UsageRow[] | null>(null);
  useEffect(() => {
    api<UsageRow[]>('/api/usage?days=30').then(setRows, () => setRows([]));
  }, []);
  const total = rows?.reduce((s, r) => s + r.usd, 0) ?? 0;
  return (
    <section className="settings__section" aria-labelledby="usage-h">
      <h2 id="usage-h">AI USAGE (30 DAYS)</h2>
      <p>Estimated spend: ${total.toFixed(4)}. By feature: {Object.entries((rows ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.feature]: (a[r.feature] ?? 0) + r.usd }), {})).sort((a, b) => b[1] - a[1]).map(([f, u]) => `${f} $${u.toFixed(3)}`).join(', ') || 'none'}.</p>
      <p className="settings__hint">Estimates from token counts and the published price list (checked 2026-10-19). Your Anthropic console shows the exact bill. A banner warns when a day's spend is far above normal; there is no hard cap.</p>
      {rows && rows.length === 0 && <p className="settings__hint">No AI calls yet.</p>}
      {rows && rows.length > 0 && (
        <table className="settings__table">
          <thead>
            <tr><th>Day</th><th>Feature</th><th>Model</th><th>Calls</th><th>Tokens in/out</th><th>USD</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={`${r.day}${r.feature}${r.model}`}>
                <td>{r.day}</td><td>{r.feature}</td><td>{r.model}</td><td>{r.calls}</td>
                <td>{r.inputTokens}/{r.outputTokens}</td><td>{r.usd.toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
