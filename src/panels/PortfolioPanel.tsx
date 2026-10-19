// PORT: Robinhood portfolio, READ ONLY (BUILD_PROMPT 17). Snapshot from the proxy (official Robinhood MCP or the
// owner-run fallback), live prices from Alpaca, risk computed in the browser. No order code exists anywhere.
import { useEffect, useMemo, useRef, useState } from 'react';
import { heatColor, squarify } from '../../shared/heat';
import { correlation } from '../../shared/indicators';
import type { Snapshot } from '../../shared/portfolio';
import { varCvar } from '../../shared/quant';
import { AiBlock, List } from '../ai/AiBlock';
import { askAi, table, type AiReply } from '../ai/client';
import { multiBars, quotes, startFor } from '../data/adapters/alpaca';
import * as fh from '../data/adapters/finnhub';
import { upcomingDividends } from '../data/adapters/massive';
import { useData } from '../data/useData';
import { api } from '../lib/api';
import { dir, fmt, fmtBig, fmtPct, timeNY } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

interface PortState { snap: Snapshot | null; lastTry: number; lastError: string | null; disconnected: boolean; connected: boolean; stale: boolean }
const H4 = ({ children }: { children: string }) => <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>{children}</h4>;
const AI_OK = 'meridian:ai-portfolio-ok';

function Treemap({ items, run }: { items: { s: string; w: number; chg: number | null }[]; run: PanelProps['run'] }) {
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(500);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = Math.max(160, Math.round(w * 0.38));
  const rects = squarify(items.filter((x) => x.w > 0).map((x) => ({ value: x.w, data: x })), { x: 0, y: 0, w, h });
  return (
    <div ref={box}>
      <svg width={w} height={h} role="img" aria-label="Allocation treemap by weight, colored by today's move">
        {rects.map((r) => (
          <g key={r.data.s} onClick={() => run(`${r.data.s} DES`)} style={{ cursor: 'pointer' }}>
            <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={r.data.chg == null ? '#2b2f36' : heatColor(Math.max(-1, Math.min(1, r.data.chg / 3)))} stroke="#000" />
            {r.w > 36 && r.h > 22 && <text x={r.x + 3} y={r.y + 13} fill="#fff" fontSize={11}>{r.data.s}</text>}
            {r.w > 36 && r.h > 34 && <text x={r.x + 3} y={r.y + 26} fill="#eee" fontSize={10}>{fmt(r.data.w * 100, 1)}%</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}

export default function PortfolioPanel({ run }: PanelProps) {
  const [tick, setTick] = useState(0);
  const st = useData(`port:${tick}`, async () => ({ data: await api<PortState>('/api/portfolio'), fetchedAt: Date.now(), fromCache: false }), { source: 'Proxy (Robinhood, read only)', everyMs: 5 * 60_000 });
  const [msg, setMsg] = useState<string | null>(null);
  const d = st.data;
  const snap = d?.snap ?? null;
  const eq = useMemo(() => (snap?.positions ?? []).filter((p) => p.type === 'equity'), [snap]);
  const syms = useMemo(() => [...new Set(eq.map((p) => p.symbol))], [eq]);
  const q = useData(syms.length ? `port:q:${syms.join(',')}` : null, () => quotes(syms), { source: 'Alpaca quotes (IEX)', everyMs: 60_000 });

  const rows = useMemo(() => {
    const merged = new Map<string, { s: string; qty: number; cost: number | null; price: number | null; chg: number | null; prev: number | null }>();
    for (const p of eq) {
      const cur = merged.get(p.symbol) ?? { s: p.symbol, qty: 0, cost: 0, price: null, chg: null, prev: null };
      cur.cost = cur.cost != null && p.avgCost != null ? cur.cost + p.avgCost * p.qty : null;
      cur.qty += p.qty;
      merged.set(p.symbol, cur);
    }
    const out = [...merged.values()].map((r) => {
      const qq = q.data?.[r.s];
      const price = qq?.price ?? eq.find((p) => p.symbol === r.s)?.price ?? null;
      const value = price != null ? price * r.qty : null;
      return { ...r, price, chg: qq?.changePct ?? null, prev: qq?.prevClose ?? null, value, pnl: value != null && r.cost != null ? value - r.cost : null, dayPnl: qq?.change != null ? qq.change * r.qty : null };
    });
    const total = out.reduce((a, r) => a + (r.value ?? 0), 0);
    return { list: out.map((r) => ({ ...r, w: total ? (r.value ?? 0) / total : 0 })).sort((a, b) => (b.value ?? 0) - (a.value ?? 0)), total };
  }, [eq, q.data]);

  const top = rows.list.slice(0, 15).map((r) => r.s);
  const hist = useData(top.length ? `port:hist:${top.join(',')}` : null, () => multiBars(top, '1Day', startFor(380), true), { source: 'Alpaca daily bars', everyMs: 6 * 3600_000 });
  const meta = useData(top.length ? `port:meta:${top.join(',')}` : null, async () => {
    const res = await Promise.allSettled(top.map(async (s) => ({ s, p: (await fh.profile(s)).data, m: (await fh.metrics(s)).data.metric })));
    return { data: res.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : [])), fetchedAt: Date.now(), fromCache: false };
  }, { source: 'Finnhub' });
  const events = useData(syms.length ? `port:events:${syms.join(',')}` : null, async () => {
    const [e, dv] = await Promise.allSettled([fh.earningsCalendar(45), upcomingDividends()]);
    const set = new Set(syms);
    return {
      data: {
        earnings: e.status === 'fulfilled' ? e.value.data.earningsCalendar.filter((x) => set.has(x.symbol)) : [],
        dividends: dv.status === 'fulfilled' ? dv.value.data.filter((x) => set.has(x.ticker)) : [],
      },
      fetchedAt: Date.now(), fromCache: false,
    };
  }, { source: 'Finnhub, Massive', everyMs: 6 * 3600_000 });

  const risk = useMemo(() => {
    const H = hist.data;
    if (!H || rows.total <= 0) return null;
    const weights = new Map(rows.list.filter((r) => top.includes(r.s)).map((r) => [r.s, r.w]));
    const tw = [...weights.values()].reduce((a, b) => a + b, 0) || 1;
    const series = top.map((s) => { const b = H[s] ?? []; return b.slice(1).map((x, i) => x.c / b[i]!.c - 1); });
    const n = Math.min(...series.map((x) => x.length).filter((x) => x > 0));
    if (!Number.isFinite(n) || n < 60) return null;
    const port = Array.from({ length: n }, (_, i) => top.reduce((a, s, k) => a + ((weights.get(s) ?? 0) / tw) * (series[k]!.at(-n + i) ?? 0), 0));
    const v = varCvar(port, 0.95);
    const corr = top.slice(0, 10).map((_a, i) => top.slice(0, 10).map((_, j) => correlation(series[i]!.slice(-n), series[j]!.slice(-n))));
    const betas = meta.data?.map((x) => ({ s: x.s, b: typeof x.m.beta === 'number' ? x.m.beta : null })) ?? [];
    const beta = betas.reduce((a, x) => a + (x.b ?? 1) * ((weights.get(x.s) ?? 0) / tw), 0);
    const hhi = rows.list.reduce((a, r) => a + r.w * r.w, 0);
    return { v, corr, beta, hhi, top5: rows.list.slice(0, 5).reduce((a, r) => a + r.w, 0), n };
  }, [hist.data, rows, top, meta.data]);

  const sectors = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows.list) {
      const ind = meta.data?.find((x) => x.s === r.s)?.p.finnhubIndustry || 'Other or unknown';
      m.set(ind, (m.get(ind) ?? 0) + r.w);
    }
    return [...m].sort((a, b) => b[1] - a[1]);
  }, [rows, meta.data]);

  const connect = async () => {
    if (!window.confirm('Connect Robinhood (READ ONLY)?\n\nYou will sign in on Robinhood\'s own page; this app never sees your password.\nBefore connecting: turn ON trade approval for agent actions in Robinhood, and confirm with the account owner that connecting is allowed.')) return;
    try {
      const r = await api<{ url: string }>('/api/rh/connect', { method: 'POST' });
      window.open(r.url, '_blank', 'noopener');
      setMsg('Finish signing in on the Robinhood tab, then press REFRESH here.');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'failed');
    }
  };
  const refresh = async () => {
    try { await api('/api/portfolio/refresh', { method: 'POST' }); setTick((t) => t + 1); } catch (e) { setMsg(e instanceof Error ? e.message : 'failed'); }
  };
  const disconnect = async () => {
    if (!window.confirm('Disconnect Robinhood? The last snapshot stays until replaced.')) return;
    await api('/api/rh', { method: 'DELETE' });
    setTick((t) => t + 1);
  };

  const [ai, setAi] = useState<{ reply?: AiReply<{ summary: string; points: string[]; watch: string }>; err?: string; busy?: boolean }>({});
  const aiNotes = () => {
    let ok = false;
    try { ok = localStorage.getItem(AI_OK) === '1'; } catch { /* storage blocked */ }
    if (!ok) {
      if (!window.confirm('AI notes send your holdings (symbols, weights, P&L; no account numbers) to the AI provider (Anthropic) through your proxy. Continue? This warning shows once per device.')) return;
      try { localStorage.setItem(AI_OK, '1'); } catch { /* storage blocked */ }
    }
    const input = [
      'PANEL: PORT personal portfolio. Explain concentration, sector tilt and risk. Never advise buying or selling.',
      `HOLDINGS:\n${table(rows.list.slice(0, 30).map((r) => ({ s: r.s, weightPct: +(r.w * 100).toFixed(1), dayPct: r.chg, pnlPct: r.pnl != null && r.cost ? +((r.pnl / r.cost) * 100).toFixed(1) : null })))}`,
      risk ? `RISK: beta ${risk.beta.toFixed(2)}, top 5 weight ${(risk.top5 * 100).toFixed(0)}%, 1-day 95% VaR ${(risk.v.hVar * 100).toFixed(2)}% of value, HHI ${risk.hhi.toFixed(3)}` : 'RISK: not computed',
      `SECTORS: ${sectors.slice(0, 8).map(([k, v]) => `${k} ${(v * 100).toFixed(0)}%`).join(', ')}`,
    ].join('\n\n');
    setAi({ busy: true });
    askAi<{ summary: string; points: string[]; watch: string }>('explain', input).then((reply) => setAi({ reply }), (e: unknown) => setAi({ err: e instanceof Error ? e.message : 'failed' }));
  };

  const others = (snap?.positions ?? []).filter((p) => p.type !== 'equity');
  // P&L only over holdings that have both a price and a cost, so a missing quote never shows as a loss.
  const priced = rows.list.filter((r) => r.value != null && r.cost != null);
  const totalCost = priced.reduce((a, r) => a + r.cost!, 0);
  const pricedValue = priced.reduce((a, r) => a + r.value!, 0);
  const dayPnl = rows.list.reduce((a, r) => a + (r.dayPnl ?? 0), 0);
  return (
    <div>
      <div className="toolbar">
        <span className="badge">READ ONLY</span>
        {!d?.connected && <button onClick={() => void connect()}>CONNECT ROBINHOOD</button>}
        {d?.connected && <button onClick={() => void refresh()}>REFRESH</button>}
        {d?.connected && <button onClick={() => void disconnect()}>DISCONNECT</button>}
        {snap && <span className="muted">Source: {snap.source === 'mcp' ? 'Robinhood MCP (proxy, hourly in market hours)' : 'owner snapshot (fallback)'} · as of {new Date(snap.at).toLocaleString()}</span>}
      </div>
      <DataStatus state={st} />
      {msg && <p className="muted">{msg}</p>}
      {d && (d.stale || d.lastError) && (d.connected || snap) && <p className="banner banner--error" role="alert">PORTFOLIO {d.disconnected ? 'DISCONNECTED' : 'STALE'}{d.lastError ? `: ${d.lastError}` : ''}. Reconnect, or ask Claude &quot;update the portfolio&quot; (scripts/update-portfolio.md).</p>}
      {!snap && <p className="muted">No portfolio yet. Connect Robinhood (official MCP, read only), or use the fallback in scripts/update-portfolio.md. Nothing here can place orders.</p>}
      {snap && (
        <>
          <table className="grid-table"><tbody>
            <tr><td>Market value (equities)</td><td className="num">${fmtBig(rows.total)}</td><td>Day change</td><td className={`num ${dir(dayPnl)}`}>{dayPnl >= 0 ? '+' : ''}${fmt(dayPnl)} ({fmtPct(rows.total ? (dayPnl / (rows.total - dayPnl)) * 100 : null)})</td></tr>
            <tr><td>Cost basis</td><td className="num">${fmtBig(totalCost)}</td><td>Unrealized P&amp;L{priced.length < rows.list.length ? ` (${priced.length} of ${rows.list.length} priced)` : ''}</td><td className={`num ${dir(pricedValue - totalCost)}`}>{priced.length ? `$${fmt(pricedValue - totalCost)} (${fmtPct(totalCost ? ((pricedValue - totalCost) / totalCost) * 100 : null)})` : '-'}</td></tr>
            {snap.accounts.map((a) => <tr key={a.id}><td>Account {a.id} ({a.type})</td><td className="num">{a.value != null ? `$${fmtBig(a.value)}` : '-'}</td><td>Cash</td><td className="num">{a.cash != null ? `$${fmtBig(a.cash)}` : '-'}</td></tr>)}
          </tbody></table>
          <table className="grid-table">
            <thead><tr><th>Symbol</th><th className="num">Qty</th><th className="num">Avg cost</th><th className="num">Price</th><th className="num">Value</th><th className="num">Weight</th><th className="num">Day</th><th className="num">P&amp;L</th><th className="num">P&amp;L %</th><th /></tr></thead>
            <tbody>{rows.list.map((r) => <tr key={r.s}><td><button className="link-btn" onClick={() => run(`${r.s} DES`)}>{r.s}</button></td><td className="num">{fmt(r.qty, r.qty % 1 ? 4 : 0)}</td><td className="num">{fmt(r.cost != null && r.qty ? r.cost / r.qty : null)}</td><td className="num">{fmt(r.price)}</td><td className="num">{fmtBig(r.value)}</td><td className="num">{fmt(r.w * 100, 1)}%</td><td className={`num ${dir(r.chg)}`}>{fmtPct(r.chg)}</td><td className={`num ${dir(r.pnl)}`}>{fmt(r.pnl)}</td><td className={`num ${dir(r.pnl)}`}>{fmtPct(r.pnl != null && r.cost ? (r.pnl / r.cost) * 100 : null)}</td><td><button className="link-btn" onClick={() => run(`${r.s} VAL`)}>VAL</button></td></tr>)}</tbody>
          </table>
          {others.length > 0 && <p className="muted">Options and crypto ({others.length}): {others.map((p) => `${p.symbol} x${p.qty}`).join(', ')}. Shown as reported; not priced here.</p>}
          {snap.notes.length > 0 && <p className="muted">Notes: {snap.notes.join('; ')}</p>}
          {rows.total > 0 && <H4>ALLOCATION</H4>}
          {rows.total > 0 && <Treemap items={rows.list.map((r) => ({ s: r.s, w: r.w, chg: r.chg }))} run={run} />}
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <div style={{ flex: '1 1 240px' }}>
              <H4>SECTOR EXPOSURE</H4>
              <table className="grid-table"><tbody>{sectors.map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v * 100, 1)}%</td><td style={{ width: 90 }}><div style={{ height: 8, width: `${v * 100}%`, background: 'var(--accent, #fb8b1e)' }} /></td></tr>)}</tbody></table>
            </div>
            <div style={{ flex: '1 1 240px' }}>
              <H4>RISK</H4>
              {risk ? (
                <table className="grid-table"><tbody>
                  <tr><td>Portfolio beta (weighted)</td><td className="num">{fmt(risk.beta, 2)}</td></tr>
                  <tr><td>Top 5 holdings</td><td className="num">{fmt(risk.top5 * 100, 0)}%</td></tr>
                  <tr><td>Concentration (HHI)</td><td className="num">{fmt(risk.hhi, 3)}</td></tr>
                  <tr><td>1-day VaR 95% (historical)</td><td className="num down">{fmtPct(-risk.v.hVar * 100)} (${fmtBig(risk.v.hVar * rows.total)})</td></tr>
                  <tr><td>1-day CVaR 95%</td><td className="num down">{fmtPct(-risk.v.hCvar * 100)}</td></tr>
                </tbody></table>
              ) : <p className="muted">Needs price history for the top holdings.</p>}
            </div>
          </div>
          {risk && (
            <>
              <H4>CORRELATION (TOP 10, 1 YEAR DAILY)</H4>
              <table className="grid-table heat"><thead><tr><th />{top.slice(0, 10).map((s) => <th key={s} className="num">{s}</th>)}</tr></thead>
                <tbody>{risk.corr.map((row, i) => <tr key={i}><td>{top[i]}</td>{row.map((c, j) => <td key={j} className="cell" style={{ background: heatColor(Math.max(-1, Math.min(1, c))) }}>{fmt(c, 2)}</td>)}</tr>)}</tbody>
              </table>
            </>
          )}
          <H4>UPCOMING FOR YOUR HOLDINGS</H4>
          <table className="grid-table"><tbody>
            {(events.data?.earnings ?? []).map((e) => <tr key={`e${e.symbol}${e.date}`}><td>{e.date}</td><td className="accent">{e.symbol}</td><td>Earnings {e.hour === 'bmo' ? 'before open' : e.hour === 'amc' ? 'after close' : ''}</td><td className="num">EPS est {fmt(e.epsEstimate)}</td></tr>)}
            {(events.data?.dividends ?? []).map((x) => <tr key={`d${x.ticker}${x.ex_dividend_date}`}><td>{x.ex_dividend_date}</td><td className="accent">{x.ticker}</td><td>Ex-dividend</td><td className="num">${fmt(x.cash_amount, 4)}</td></tr>)}
            {events.data && !events.data.earnings.length && !events.data.dividends.length && <tr><td className="muted">Nothing in the free calendars for the next 45 days.</td></tr>}
          </tbody></table>
          <H4>AI NOTES</H4>
          {!ai.reply && <button disabled={ai.busy} onClick={aiNotes}>{ai.busy ? 'THINKING...' : 'EXPLAIN MY PORTFOLIO (about $0.001)'}</button>}
          {ai.err && <p className="down">{ai.err}</p>}
          {ai.reply && <AiBlock reply={ai.reply}><p>{ai.reply.result.summary}</p><List title="OBSERVATIONS" items={ai.reply.result.points} /><p><span className="accent">Watch:</span> {ai.reply.result.watch}</p></AiBlock>}
        </>
      )}
      <div className="disclaimer">Read only: this app has no order code, and the proxy blocks every Robinhood tool that is not on the read allowlist. Your portfolio stays in your proxy (encrypted) and on your paired devices; it is never in the repo or logs. Prices: IEX quotes (Alpaca free feed). VaR uses 1 year of history and can understate real losses. Last proxy refresh attempt: {d?.lastTry ? `${timeNY(d.lastTry)} ET` : 'never'}. Not financial advice.</div>
    </div>
  );
}
