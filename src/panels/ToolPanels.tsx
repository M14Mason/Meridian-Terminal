// CIDX custom index, ORB opening range, JRNL trade journal.
import { useMemo, useState } from 'react';
import { Lines } from '../charts/Lines';
import { bars, multiBars, startFor } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { dir, downloadCsv, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

// ---------- CIDX ----------
interface Idx { name: string; items: { t: string; w: number }[] }

/** "AAPL 30, MSFT 30, NVDA" -> weights (missing weights split the remainder equally). */
export function parseIndex(s: string): { t: string; w: number }[] {
  const parts = s.split(/[,;\n]+/).map((p) => p.trim().toUpperCase()).filter(Boolean);
  const rows = parts.map((p) => {
    const [t, w] = p.split(/\s+/);
    return { t: (t ?? '').replace(/[^A-Z0-9.-]/g, ''), w: w ? Number(w) : NaN };
  }).filter((r) => r.t);
  const given = rows.filter((r) => Number.isFinite(r.w) && r.w > 0).reduce((a, r) => a + r.w, 0);
  const free = rows.filter((r) => !(Number.isFinite(r.w) && r.w > 0)).length;
  const share = free ? Math.max(0, 100 - given) / free : 0;
  return rows.slice(0, 30).map((r) => ({ t: r.t, w: Number.isFinite(r.w) && r.w > 0 ? r.w : share }));
}

function Cidx() {
  const saved = useCollection<Idx>('screens').filter((s) => s.id.startsWith('cidx:'));
  const [text, setText] = useState('AAPL 25, MSFT 25, NVDA 25, GOOGL 25');
  const [items, setItems] = useState(() => parseIndex(text));
  const [name, setName] = useState('My index');
  const syms = useMemo(() => [...new Set([...items.map((i) => i.t), 'SPY'])], [items]);
  const st = useData(`cidx:${syms.join(',')}`, () => multiBars(syms, '1Day', startFor(370), true), { source: 'Alpaca daily bars', everyMs: 3600_000 });
  const out = useMemo(() => {
    const d = st.data;
    if (!d) return null;
    const spy = d.SPY ?? [];
    const times = spy.map((b) => b.t);
    const total = items.reduce((a, i) => a + i.w, 0) || 1;
    const idx: { t: number; v: number }[] = [];
    const maps = items.map((i) => ({ ...i, m: new Map((d[i.t] ?? []).map((b) => [b.t, b.c])) }));
    const base = maps.map((x) => x.m.get(times[0]!) ?? (d[x.t]?.[0]?.c ?? NaN));
    const missing = maps.filter((x) => !x.m.size).map((x) => x.t);
    for (const t of times) {
      let v = 0;
      maps.forEach((x, k) => {
        const p = x.m.get(t);
        v += (x.w / total) * (p != null && base[k] ? p / base[k]! : 1);
      });
      idx.push({ t, v: v * 100 });
    }
    const spyIdx = spy.map((b) => ({ t: b.t, v: (b.c / spy[0]!.c) * 100 }));
    return { series: [{ name, rows: idx }, { name: 'SPY', rows: spyIdx }], ret: (idx.at(-1)?.v ?? 100) - 100, spyRet: (spyIdx.at(-1)?.v ?? 100) - 100, missing };
  }, [st.data, items, name]);
  return (
    <>
      <div className="toolbar">
        {saved.map((s) => <button key={s.id} onClick={() => { setName(s.value.name); setItems(s.value.items); setText(s.value.items.map((i) => `${i.t} ${+i.w.toFixed(2)}`).join(', ')); }}>★ {s.value.name}</button>)}
      </div>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setItems(parseIndex(text)); }}>
        <input value={name} onChange={(e) => setName(e.target.value)} style={{ width: 120 }} aria-label="Index name" />
        <input value={text} onChange={(e) => setText(e.target.value)} style={{ flex: 1 }} placeholder="TICKER WEIGHT, ..." aria-label="Constituents" />
        <button type="submit">BUILD</button>
        <button type="button" onClick={() => void sync.put('screens', `cidx:${name.trim().slice(0, 30) || 'index'}`, { name: name.trim().slice(0, 30) || 'index', items })}>SAVE</button>
      </form>
      <DataStatus state={st} keyName="Alpaca" />
      {out && (
        <>
          <p>1-year return: <strong className={dir(out.ret)}>{fmtPct(out.ret)}</strong> vs SPY <span className={dir(out.spyRet)}>{fmtPct(out.spyRet)}</span>{out.missing.length > 0 && <span className="down"> (no data: {out.missing.join(', ')})</span>}</p>
          <Lines series={out.series} height={260} />
        </>
      )}
      <div className="disclaimer">Buy and hold from one year ago with the weights you set (weights drift with prices; no rebalancing, no dividends). Starts at 100. Hypothetical, not financial advice.</div>
    </>
  );
}

// ---------- ORB ----------
const etMinute = (ms: number) => {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms));
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
};
const etDate = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

function Orb({ sym }: { sym: string }) {
  const [mins, setMins] = useState(15);
  const st = useData(`orb:${sym}`, () => bars(sym, '1Min', startFor(8)), { source: 'Alpaca 1-minute bars (IEX)', everyMs: 60_000 });
  const r = useMemo(() => {
    const all = (st.data ?? []).filter((b) => { const m = etMinute(b.t); return m >= 570 && m < 960; });
    if (!all.length) return null;
    const days = [...new Set(all.map((b) => etDate(b.t)))];
    const today = days.at(-1)!;
    const cur = all.filter((b) => etDate(b.t) === today);
    const range = cur.filter((b) => etMinute(b.t) < 570 + mins);
    const hi = Math.max(...range.map((b) => b.h));
    const lo = Math.min(...range.map((b) => b.l));
    const after = cur.filter((b) => etMinute(b.t) >= 570 + mins);
    const up = after.find((b) => b.c > hi);
    const dn = after.find((b) => b.c < lo);
    const last = cur.at(-1)!;
    // Cumulative volume by minute: today vs average of the prior sessions.
    const cum = (rows: typeof all) => { const m = new Map<number, number>(); let s = 0; for (const b of rows) { s += b.v; m.set(etMinute(b.t), s); } return m; };
    const prior = days.slice(0, -1).slice(-5).map((d) => cum(all.filter((b) => etDate(b.t) === d)));
    const todayCum = cum(cur);
    const avgRows: { t: number; v: number }[] = [];
    const todayRows: { t: number; v: number }[] = [];
    const t0 = Date.parse(`${today}T00:00:00Z`);
    for (let m = 570; m < 960; m += 5) {
      const vals = prior.map((p) => { let k = m; while (k >= 570 && !p.has(k)) k--; return p.get(k) ?? 0; });
      avgRows.push({ t: t0 + m * 60_000, v: vals.reduce((a, b) => a + b, 0) / (vals.length || 1) });
      if (m <= etMinute(last.t)) { let k = m; while (k >= 570 && !todayCum.has(k)) k--; todayRows.push({ t: t0 + m * 60_000, v: todayCum.get(k) ?? 0 }); }
    }
    const pace = avgRows.find((x) => x.t === todayRows.at(-1)?.t)?.v;
    return { today, hi, lo, last, up, dn, complete: range.length >= Math.min(mins, 3), series: [{ name: 'Today', rows: todayRows }, { name: `Avg prior ${prior.length}`, rows: avgRows }], pace: pace ? (todayRows.at(-1)!.v / pace) : null, n: prior.length };
  }, [st.data, mins]);
  return (
    <>
      <div className="toolbar"><strong className="accent">{sym}</strong>{[5, 15, 30, 60].map((m) => <button key={m} aria-pressed={mins === m} onClick={() => setMins(m)}>{m}M</button>)}</div>
      <DataStatus state={st} keyName="Alpaca" />
      {r && (
        <table className="grid-table">
          <tbody>
            <tr><td>Session</td><td className="num">{r.today}</td><td>Last</td><td className="num">{fmt(r.last.c)}</td></tr>
            <tr><td>Range high ({mins}m)</td><td className="num up">{fmt(r.hi)}</td><td>Range low</td><td className="num down">{fmt(r.lo)}</td></tr>
            <tr><td>Breakout up</td><td className="num">{r.up ? new Date(r.up.t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : '-'}</td><td>Breakdown</td><td className="num">{r.dn ? new Date(r.dn.t).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' }) : '-'}</td></tr>
            <tr><td>Volume pace vs {r.n}-day avg</td><td className={`num ${r.pace && r.pace > 1 ? 'up' : ''}`}>{r.pace ? `${fmt(r.pace, 2)}x` : '-'}</td><td>Position in range</td><td className={`num ${r.last.c > r.hi ? 'up' : r.last.c < r.lo ? 'down' : ''}`}>{r.last.c > r.hi ? 'ABOVE' : r.last.c < r.lo ? 'BELOW' : 'INSIDE'}</td></tr>
          </tbody>
        </table>
      )}
      {r && <Lines series={r.series} height={200} />}
      <div className="disclaimer">IEX-only 1-minute bars (free feed): volume is a small slice of the market, so compare shapes, not absolute size. Regular session 9:30 to 16:00 ET. Breakout = first 1-minute close outside the range. Not financial advice.</div>
    </>
  );
}

// ---------- JRNL ----------
interface Trade { date: string; ticker: string; side: 'long' | 'short'; qty: number; entry: number; exit: number | null; tags: string; notes: string }
const pnl = (t: Trade) => (t.exit == null ? null : (t.exit - t.entry) * t.qty * (t.side === 'long' ? 1 : -1));

function Jrnl({ run }: { run: PanelProps['run'] }) {
  const all = useCollection<Trade>('journal');
  const trades = useMemo(() => [...all].sort((a, b) => b.value.date.localeCompare(a.value.date)), [all]);
  const [f, setF] = useState({ date: new Date().toISOString().slice(0, 10), ticker: '', side: 'long' as Trade['side'], qty: '', entry: '', exit: '', tags: '', notes: '' });
  const [tag, setTag] = useState('');
  const shown = tag ? trades.filter((t) => t.value.tags.split(/[ ,]+/).includes(tag)) : trades;
  const stats = useMemo(() => {
    const closed = shown.map((t) => pnl(t.value)).filter((x): x is number => x != null);
    const wins = closed.filter((x) => x > 0);
    const losses = closed.filter((x) => x < 0);
    const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
    return { n: closed.length, win: closed.length ? wins.length / closed.length : null, avgW: wins.length ? sum(wins) / wins.length : null, avgL: losses.length ? sum(losses) / losses.length : null, total: sum(closed), pf: losses.length ? sum(wins) / -sum(losses) : null };
  }, [shown]);
  const tags = useMemo(() => [...new Set(trades.flatMap((t) => t.value.tags.split(/[ ,]+/).filter(Boolean)))].sort(), [trades]);
  const save = (e: React.FormEvent) => {
    e.preventDefault();
    const tk = f.ticker.trim().toUpperCase();
    if (!tk || !(Number(f.qty) > 0) || !(Number(f.entry) > 0)) return;
    void sync.put('journal', `${f.date}:${tk}:${Date.now().toString(36)}`, { date: f.date, ticker: tk.slice(0, 12), side: f.side, qty: Number(f.qty), entry: Number(f.entry), exit: f.exit ? Number(f.exit) : null, tags: f.tags.slice(0, 80), notes: f.notes.slice(0, 2000) });
    setF((x) => ({ ...x, ticker: '', qty: '', entry: '', exit: '', notes: '' }));
  };
  return (
    <>
      <form className="toolbar" onSubmit={save}>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} aria-label="Date" />
        <input value={f.ticker} onChange={(e) => setF({ ...f, ticker: e.target.value })} placeholder="Ticker" style={{ width: 70 }} />
        <select value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as Trade['side'] })}><option value="long">Long</option><option value="short">Short</option></select>
        <input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="Qty" style={{ width: 60 }} />
        <input value={f.entry} onChange={(e) => setF({ ...f, entry: e.target.value })} placeholder="Entry" style={{ width: 70 }} />
        <input value={f.exit} onChange={(e) => setF({ ...f, exit: e.target.value })} placeholder="Exit (blank = open)" style={{ width: 120 }} />
        <input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Tags (breakout, earnings)" style={{ width: 150 }} />
        <input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} placeholder="Why I took it, what I learned" style={{ flex: 1, minWidth: 140 }} />
        <button type="submit">ADD</button>
      </form>
      <div className="toolbar">
        <button aria-pressed={!tag} onClick={() => setTag('')}>ALL</button>
        {tags.map((t) => <button key={t} aria-pressed={tag === t} onClick={() => setTag(t)}>{t}</button>)}
        <button disabled={!shown.length} onClick={() => downloadCsv('journal.csv', [['date', 'ticker', 'side', 'qty', 'entry', 'exit', 'pnl', 'tags', 'notes'], ...shown.map((t) => [t.value.date, t.value.ticker, t.value.side, t.value.qty, t.value.entry, t.value.exit, pnl(t.value), t.value.tags, t.value.notes])])}>CSV</button>
      </div>
      <table className="grid-table">
        <tbody><tr><td>Closed trades</td><td className="num">{stats.n}</td><td>Win rate</td><td className="num">{stats.win == null ? '-' : `${fmt(stats.win * 100, 0)}%`}</td><td>Total P&amp;L</td><td className={`num ${dir(stats.total)}`}>{fmtBig(stats.total)}</td></tr>
          <tr><td>Avg win</td><td className="num up">{fmt(stats.avgW)}</td><td>Avg loss</td><td className="num down">{fmt(stats.avgL)}</td><td>Profit factor</td><td className="num">{fmt(stats.pf)}</td></tr></tbody>
      </table>
      <table className="grid-table">
        <thead><tr><th>Date</th><th>Ticker</th><th>Side</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th><th className="num">P&amp;L</th><th>Tags</th><th>Notes</th><th /></tr></thead>
        <tbody>{shown.map((t) => { const p = pnl(t.value); return <tr key={t.id}><td>{t.value.date}</td><td><button className="link-btn" onClick={() => run(`${t.value.ticker} GP`)}>{t.value.ticker}</button></td><td>{t.value.side}</td><td className="num">{t.value.qty}</td><td className="num">{fmt(t.value.entry)}</td><td className="num">{t.value.exit == null ? 'open' : fmt(t.value.exit)}</td><td className={`num ${dir(p)}`}>{p == null ? '-' : fmt(p)}</td><td className="muted">{t.value.tags}</td><td style={{ maxWidth: 260, whiteSpace: 'normal' }}>{t.value.notes}</td><td><button className="link-btn down" onClick={() => { if (window.confirm('Delete this journal entry?') && window.confirm('Really delete? This syncs to all devices.')) void sync.remove('journal', t.id); }} aria-label="Delete entry">×</button></td></tr>; })}</tbody>
      </table>
      <div className="disclaimer">Your own records, synced across your devices through the proxy (never in the public repo). The AI journal critic arrives with the AI layer.</div>
    </>
  );
}

export default function ToolPanels({ code, security, run }: PanelProps) {
  const sym = (security ?? 'SPY').toUpperCase();
  return <div>{code === 'CIDX' ? <Cidx /> : code === 'ORB' ? <Orb sym={sym} /> : <Jrnl run={run} />}</div>;
}
