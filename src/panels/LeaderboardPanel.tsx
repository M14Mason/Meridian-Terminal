import { useState } from 'react';
import type { Metrics } from '../../shared/backtest';
import { fmt, fmtPct } from '../lib/format';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

interface Saved { name: string; strategy: string; params: Record<string, number>; universe: string[]; from: string; to: string; metrics: Metrics; shuffle: number | null; savedAt: number; costBps: number; slippageBps: number }

// LDR: saved backtests ranked (item 49). Backtests only; synced across devices. Each save is a version (item 131).
export default function LeaderboardPanel({ run }: PanelProps) {
  const list = useCollection<Saved>('strategies');
  const [by, setBy] = useState<'sharpe' | 'cagr' | 'maxDd' | 'calmar'>('sharpe');
  const rows = [...list].sort((a, b) => (by === 'maxDd' ? b.value.metrics.maxDd - a.value.metrics.maxDd : b.value.metrics[by] - a.value.metrics[by]));
  return (
    <div>
      <div className="toolbar">
        <span className="muted">Rank by</span>
        {(['sharpe', 'cagr', 'calmar', 'maxDd'] as const).map((k) => <button key={k} aria-pressed={by === k} onClick={() => setBy(k)}>{k === 'maxDd' ? 'DRAWDOWN' : k.toUpperCase()}</button>)}
        <button onClick={() => run('BT')}>NEW BACKTEST</button>
      </div>
      {rows.length === 0 && <p className="muted">No saved backtests yet. Run one in BT and press SAVE TO LEADERBOARD.</p>}
      <table className="grid-table">
        <thead><tr><th>#</th><th>Strategy</th><th>Period</th><th className="num">CAGR</th><th className="num">Sharpe</th><th className="num">Max DD</th><th className="num">Shuffle</th><th>Params</th><th /></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.id}>
              <td className="muted">{i + 1}</td>
              <td>{r.value.name}</td>
              <td className="muted">{r.value.from} to {r.value.to}</td>
              <td className="num">{fmtPct(r.value.metrics.cagr * 100, 1)}</td>
              <td className="num accent">{fmt(r.value.metrics.sharpe)}</td>
              <td className="num down">{fmtPct(r.value.metrics.maxDd * 100, 1)}</td>
              <td className={`num ${r.value.shuffle != null && r.value.shuffle < 0.9 ? 'down' : ''}`}>{r.value.shuffle != null ? `${Math.round(r.value.shuffle * 100)}%` : '-'}</td>
              <td className="muted" style={{ whiteSpace: 'normal' }}>{Object.entries(r.value.params).map(([k, v]) => `${k}=${v}`).join(' ')} · costs {r.value.costBps + r.value.slippageBps}bps</td>
              <td><button className="link-btn down" onClick={() => window.confirm(`Delete "${r.value.name}"?`) && void sync.remove('strategies', r.id)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer">Hypothetical backtests only. A high rank on past data is not evidence of future results; prefer strategies with high shuffle percentiles and stable walk-forward results. Not financial advice.</div>
    </div>
  );
}
