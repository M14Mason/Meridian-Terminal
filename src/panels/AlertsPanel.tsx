// ALRT: alert rules, settings and history (BUILD_PROMPT 18). Rules sync to every device and run in the proxy
// every 10 minutes in market hours (hourly otherwise), so they fire with no device open.
import { useState } from 'react';
import { DEFAULT_SETTINGS, RULE_LABEL, validRule, type AlertSettings, type Fired, type Rule, type RuleType } from '../../shared/alerts';
import { useData } from '../data/useData';
import { api } from '../lib/api';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection, useRecord } from '../state/sync';

interface Drawing { kind: 'trend' | 'hline' | 'fib'; a: { t: number; p: number }; b?: { t: number; p: number } }
const newRuleId = () => `r${Date.now().toString(36)}`;
const VALUE_TYPES: RuleType[] = ['price_above', 'price_below', 'pct_move', 'volume_spike', 'rsi_above', 'rsi_below'];
const hhmm = (m: number | null) => (m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`);
const toMin = (s: string) => (/^\d{2}:\d{2}$/.test(s) ? Number(s.slice(0, 2)) * 60 + Number(s.slice(3)) : null);

function describe(r: Rule): string {
  switch (r.type) {
    case 'news': return `${r.sym ? `${r.sym} ` : ''}news mentions "${r.keyword}"`;
    case 'macro': return `Release today matching "${r.keyword}"`;
    case 'filing': return `${r.sym} files ${r.forms || 'anything'}`;
    case 'earnings': return `${r.sym} reports tomorrow`;
    case 'line_cross': return `${r.sym} crosses chart line (${r.line!.a.p.toFixed(2)} to ${r.line!.b.p.toFixed(2)})`;
    default: return `${r.sym} ${RULE_LABEL[r.type].toLowerCase()} ${r.value}`;
  }
}

export default function AlertsPanel({ security }: PanelProps) {
  const all = useCollection<Rule | AlertSettings>('alerts');
  const rules = all.filter((x) => x.id !== '_settings' && validRule(x.value)) as { id: string; value: Rule }[];
  const settings: AlertSettings = { ...DEFAULT_SETTINGS, ...((all.find((x) => x.id === '_settings')?.value as AlertSettings | undefined) ?? {}) };
  const [tick, setTick] = useState(0);
  const hist = useData(`alrt:hist:${tick}`, async () => ({ data: await api<{ items: Fired[]; email: boolean }>('/api/alerts/history'), fetchedAt: Date.now(), fromCache: false }), { source: 'Proxy alert engine', everyMs: 60_000 });
  const [f, setF] = useState<{ type: RuleType; sym: string; value: string; keyword: string; forms: string; note: string; email: boolean; line: number }>({ type: 'price_above', sym: (security ?? '').toUpperCase(), value: '', keyword: '', forms: '', note: '', email: true, line: 0 });
  const drawings = useRecord<{ items: Drawing[] }>('drawings', f.sym.toUpperCase())?.items?.filter((d) => d.kind === 'trend' || d.kind === 'hline') ?? [];
  const [msg, setMsg] = useState<string | null>(null);

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    const d = drawings[f.line];
    const rule: Rule = {
      type: f.type, enabled: true, email: f.email, note: f.note.slice(0, 120) || undefined,
      ...(f.sym.trim() ? { sym: f.sym.trim().toUpperCase() } : {}),
      ...(VALUE_TYPES.includes(f.type) ? { value: Number(f.value) } : {}),
      ...(f.type === 'news' || f.type === 'macro' ? { keyword: f.keyword.trim().slice(0, 60) } : {}),
      ...(f.type === 'filing' ? { forms: f.forms.trim().toUpperCase().slice(0, 40) } : {}),
      ...(f.type === 'line_cross' && d ? { line: { a: d.a, b: d.kind === 'hline' ? { t: d.a.t + 1, p: d.a.p } : d.b ?? d.a } } : {}),
    };
    if (!validRule(rule)) { setMsg('Check the fields: ticker in capitals, a number for levels, a keyword for news or macro, a drawn line for line alerts.'); return; }
    void sync.put('alerts', newRuleId(), rule);
    setMsg(`Added: ${describe(rule)}.`);
  };
  const saveSettings = (patch: Partial<AlertSettings>) => void sync.put('alerts', '_settings', { ...settings, ...patch });
  const post = async (path: string, ok: string) => {
    try { const r = await api<{ emailed?: boolean; fired?: number }>(path, { method: 'POST' }); setMsg(`${ok}${r.emailed != null ? (r.emailed ? ' Email sent.' : ' No email (see history).') : ''}${r.fired != null ? ` ${r.fired} fired.` : ''}`); setTick((t) => t + 1); } catch (e) { setMsg(e instanceof Error ? e.message : 'failed'); }
  };

  return (
    <div>
      <form className="toolbar" onSubmit={add}>
        <select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value as RuleType })} aria-label="Alert type">{(Object.keys(RULE_LABEL) as RuleType[]).map((t) => <option key={t} value={t}>{RULE_LABEL[t]}</option>)}</select>
        <input value={f.sym} onChange={(e) => setF({ ...f, sym: e.target.value.toUpperCase() })} placeholder={f.type === 'news' ? 'Ticker (optional)' : f.type === 'macro' ? '(none)' : 'Ticker'} style={{ width: 90 }} aria-label="Ticker" disabled={f.type === 'macro'} />
        {VALUE_TYPES.includes(f.type) && <input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder={f.type === 'pct_move' ? '%' : f.type === 'volume_spike' ? 'x avg' : f.type.startsWith('rsi') ? 'RSI' : 'Price'} style={{ width: 70 }} aria-label="Level" />}
        {(f.type === 'news' || f.type === 'macro') && <input value={f.keyword} onChange={(e) => setF({ ...f, keyword: e.target.value })} placeholder={f.type === 'macro' ? 'Release name, e.g. Consumer Price' : 'Keyword'} style={{ width: 190 }} aria-label="Keyword" />}
        {f.type === 'filing' && <input value={f.forms} onChange={(e) => setF({ ...f, forms: e.target.value })} placeholder="Form (8-K, 10-Q, 4) or blank" style={{ width: 170 }} aria-label="Forms" />}
        {f.type === 'line_cross' && (drawings.length ? <select value={f.line} onChange={(e) => setF({ ...f, line: Number(e.target.value) })} aria-label="Chart line">{drawings.map((d, i) => <option key={i} value={i}>{d.kind === 'hline' ? `Horizontal ${d.a.p.toFixed(2)}` : `Trend ${d.a.p.toFixed(2)} to ${d.b?.p.toFixed(2)}`}</option>)}</select> : <span className="muted">Draw a trend or horizontal line on {f.sym || 'the'} chart (GP) first</span>)}
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Note (optional)" style={{ width: 140 }} aria-label="Note" />
        <label className="toggle"><input type="checkbox" checked={f.email} onChange={(e) => setF({ ...f, email: e.target.checked })} /> email</label>
        <button type="submit">ADD ALERT</button>
      </form>
      {msg && <p className="muted">{msg}</p>}
      <table className="grid-table">
        <thead><tr><th>On</th><th>Alert</th><th>Email</th><th>Note</th><th /></tr></thead>
        <tbody>{rules.map((r) => <tr key={r.id}><td><input type="checkbox" checked={r.value.enabled} onChange={(e) => void sync.put('alerts', r.id, { ...r.value, enabled: e.target.checked })} aria-label="Enabled" /></td><td>{describe(r.value)}</td><td>{r.value.email ? 'yes' : 'no'}</td><td className="muted">{r.value.note}</td><td><button className="link-btn down" onClick={() => { if (window.confirm(`Delete alert: ${describe(r.value)}?`)) void sync.remove('alerts', r.id); }} aria-label="Delete alert">×</button></td></tr>)}</tbody>
      </table>
      {!rules.length && <p className="muted">No alerts yet.</p>}
      <div className="toolbar">
        <span className="muted">Quiet hours (New York)</span>
        <input type="time" value={hhmm(settings.quietStart)} onChange={(e) => saveSettings({ quietStart: toMin(e.target.value) })} aria-label="Quiet start" />
        <span className="muted">to</span>
        <input type="time" value={hhmm(settings.quietEnd)} onChange={(e) => saveSettings({ quietEnd: toMin(e.target.value) })} aria-label="Quiet end" />
        <label className="toggle"><input type="checkbox" checked={settings.email} onChange={(e) => saveSettings({ email: e.target.checked })} /> email</label>
        <SoundToggle />
        <button onClick={() => void post('/api/alerts/test', 'Test alert written.')}>TEST ALERT</button>
        <button onClick={() => void post('/api/alerts/run', 'Checked now.')}>RUN NOW</button>
      </div>
      <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>HISTORY</h4>
      <DataStatus state={hist} />
      <table className="grid-table"><tbody>{(hist.data?.items ?? []).map((h) => <tr key={h.id}><td>{new Date(h.at).toLocaleString()}</td><td>{h.title}</td><td className="muted" style={{ whiteSpace: 'normal', maxWidth: 320 }}>{/^https?:\/\//.test(h.detail) ? <a href={h.detail} target="_blank" rel="noreferrer noopener">source</a> : h.detail}</td><td>{h.emailed ? 'emailed' : ''}</td></tr>)}</tbody></table>
      <div className="disclaimer">Alerts run in your proxy every 10 minutes in US market hours and hourly otherwise (IEX prices, so levels can differ slightly from other feeds). Email uses Resend&apos;s free tier: save a Resend key in SET &gt; Keys, sent to your own address; max 40 a day. Quiet hours mute email and sound but still log. Not financial advice.</div>
    </div>
  );
}

/** Sound is per device (phones default off), so it lives in this browser's storage, not in synced settings. */
function SoundToggle() {
  const [on, setOn] = useState(() => { try { return localStorage.getItem('meridian:alert-sound') === '1'; } catch { return false; } });
  return <label className="toggle"><input type="checkbox" checked={on} onChange={(e) => { setOn(e.target.checked); try { localStorage.setItem('meridian:alert-sound', e.target.checked ? '1' : '0'); } catch { /* storage blocked */ } }} /> sound (this device)</label>;
}
