// Number formatting for dense tables. Tabular figures come from CSS.
import { DISPLAY_TZ } from '../config';
export const fmt = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '-' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
export const fmtPct = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(d)}%`);
export const fmtChg = (v: number | null | undefined, d = 2) => (v == null || !Number.isFinite(v) ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(d)}`);
export function fmtBig(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  const a = Math.abs(v);
  if (a >= 1e12) return `${(v / 1e12).toFixed(2)}T`;
  if (a >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
}
export const dir = (v: number | null | undefined) => (v == null || v === 0 || !Number.isFinite(v) ? '' : v > 0 ? 'up' : 'down');
const fmtTime = new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const fmtDateTime = new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** HH:MM:SS in the display zone (Pacific). */
export const timeLocal = (ms: number | null) => (ms ? fmtTime.format(ms) : '-');
/** "Oct 19, 2:05 PM" in the display zone. */
export const dateTimeLocal = (ms: number | null) => (ms ? fmtDateTime.format(ms) : '-');
/** Short zone name right now, "PDT" or "PST". */
export const tzLabel = (ms = Date.now()) => new Intl.DateTimeFormat('en-US', { timeZone: DISPLAY_TZ, timeZoneName: 'short' }).formatToParts(ms).find((p) => p.type === 'timeZoneName')?.value ?? 'PT';
export const dateISO = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** CSV export (core terminal feature). Quotes every cell. */
export function downloadCsv(name: string, rows: (string | number | null)[][]): void {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}
