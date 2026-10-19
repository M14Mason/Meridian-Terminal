// GURU: superinvestor 13F portfolios (owner additions). Holdings, quarter changes, consensus, overlap.
import { useEffect, useMemo, useState } from 'react';
import { compare, makeTickerMatcher, type Holding } from '../../shared/thirteenf';
import { tickers } from '../data/adapters/sec';
import { fundQuarters } from '../data/adapters/thirteenf';
import { FUNDS } from '../data/funds';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

type Tab = 'fund' | 'consensus' | 'overlap';
type Matcher = ReturnType<typeof makeTickerMatcher>;

const CHG: Record<string, string> = { NEW: 'up', ADD: 'up', TRIM: 'down', EXIT: 'down', SAME: 'muted' };
const daysSince = (d: string) => (Date.now() - Date.parse(d)) / 86_400_000;

function useMatcher(): Matcher | null {
  const [m, setM] = useState<Matcher | null>(null);
  useEffect(() => {
    void tickers().then((t) => setM(() => makeTickerMatcher(t)), () => undefined);
  }, []);
  return m;
}

function FundView({ cik, run, match }: { cik: number; run: PanelProps['run']; match: Matcher | null }) {
  const fund = FUNDS.find((f) => f.cik === cik)!;
  const state = useData(`guru:${cik}`, async (): Promise<Fetched<Awaited<ReturnType<typeof fundQuarters>>>> => {
    const q = await fundQuarters(cik);
    return { data: q, fetchedAt: q.fetchedAt, fromCache: false };
  }, { source: 'SEC 13F', note: '45-day lag', everyMs: 6 * 3600_000 });
  const d = state.data;
  const cmp = useMemo(() => (d?.cur ? compare(d.curH, d.prevH) : null), [d]);
  const stale = d?.cur ? daysSince(d.cur.filed) > 200 : false;
  return (
    <div>
      <div className="row" style={{ alignItems: 'baseline' }}>
        <strong className="accent">{fund.name}</strong>
        <span className="muted">{fund.manager} · {fund.style}</span>
      </div>
      <DataStatus state={state} empty={!!d && !d.cur} />
      {d?.cur && cmp && (
        <>
          <p>
            Quarter ending <span className="accent">{d.cur.reportDate}</span>, filed {d.cur.filed}. Reported value {fmtBig(cmp.total)} in {cmp.rows.length} positions.
            {d.prev && <span className="muted"> Compared with quarter ending {d.prev.reportDate}.</span>}
            {stale && <span className="down"> No new 13F in over 6 months: the fund may have stopped filing or closed.</span>}
          </p>
          <table className="grid-table">
            <thead><tr><th>Issuer</th><th>Ticker</th><th className="num">Value</th><th className="num">Weight</th><th className="num">Shares</th><th>Change</th></tr></thead>
            <tbody>
              {cmp.rows.slice(0, 150).map((r) => {
                const t = match?.(r.issuer, r.cls);
                return (
                  <tr key={`${r.cusip}${r.putCall}`}>
                    <td title={`CUSIP ${r.cusip} · ${r.cls}`}>{r.issuer}{r.putCall && <span className="accent"> {r.putCall.toUpperCase()}</span>}</td>
                    <td>{t ? <button className="link-btn" onClick={() => run(`${t} DES`)}>{t}</button> : <span className="muted">?</span>}</td>
                    <td className="num">{fmtBig(r.value)}</td>
                    <td className="num">{(r.weight * 100).toFixed(2)}%</td>
                    <td className="num">{fmtBig(r.shares)}</td>
                    <td className={CHG[r.change]}>{r.change}{r.sharesChangePct != null && r.change !== 'SAME' ? ` ${fmtPct(r.sharesChangePct, 0)}` : ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {cmp.exited.length > 0 && (
            <>
              <h4 className="down" style={{ fontSize: 12, margin: '8px 0 2px' }}>EXITED ({cmp.exited.length})</h4>
              <p className="muted">{cmp.exited.slice(0, 40).map((h) => `${h.issuer}${h.putCall ? ` ${h.putCall}` : ''}`).join(' · ')}</p>
            </>
          )}
        </>
      )}
    </div>
  );
}

/** Loads every fund's latest quarter (cached for hours) for consensus and overlap views. */
function useAllFunds() {
  return useData('guru:all', async (): Promise<Fetched<Record<number, { holdings: Holding[]; quarter: string; filed: string }>>> => {
    const out: Record<number, { holdings: Holding[]; quarter: string; filed: string }> = {};
    const res = await Promise.allSettled(FUNDS.map((f) => fundQuarters(f.cik)));
    res.forEach((r, i) => {
      // Funds that have not filed in 200 days are left out of consensus so stale picks do not count.
      if (r.status === 'fulfilled' && r.value.cur && daysSince(r.value.cur.filed) < 200) out[FUNDS[i]!.cik] = { holdings: r.value.curH, quarter: r.value.cur.reportDate, filed: r.value.cur.filed };
    });
    return { data: out, fetchedAt: Date.now(), fromCache: false };
  }, { source: 'SEC 13F', note: '45-day lag', everyMs: 12 * 3600_000 });
}

function Consensus({ run, match }: { run: PanelProps['run']; match: Matcher | null }) {
  const state = useAllFunds();
  const rows = useMemo(() => {
    if (!state.data) return [];
    const m = new Map<string, { issuer: string; cls: string; funds: string[]; value: number; weightSum: number }>();
    for (const [cik, f] of Object.entries(state.data)) {
      const total = f.holdings.reduce((s, h) => s + h.value, 0) || 1;
      const name = FUNDS.find((x) => x.cik === Number(cik))!.name;
      for (const h of f.holdings) {
        if (h.putCall) continue;
        const e = m.get(h.cusip) ?? { issuer: h.issuer, cls: h.cls, funds: [], value: 0, weightSum: 0 };
        if (!e.funds.includes(name)) e.funds.push(name);
        e.value += h.value;
        e.weightSum += h.value / total;
        m.set(h.cusip, e);
      }
    }
    return [...m.entries()].map(([cusip, e]) => ({ cusip, ...e })).sort((a, b) => b.funds.length - a.funds.length || b.weightSum - a.weightSum).slice(0, 60);
  }, [state.data]);
  const n = Object.keys(state.data ?? {}).length;
  return (
    <div>
      <p className="muted">Most widely held stocks across {n} tracked funds with a 13F in the last 200 days. Long stock only (options excluded). Crowding means many big funds could sell at once.</p>
      <DataStatus state={state} />
      <table className="grid-table">
        <thead><tr><th>Issuer</th><th>Ticker</th><th className="num">Funds</th><th className="num">Avg weight</th><th className="num">Combined value</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const t = match?.(r.issuer, r.cls);
            return (
              <tr key={r.cusip} title={r.funds.join(', ')}>
                <td>{r.issuer}</td>
                <td>{t ? <button className="link-btn" onClick={() => run(`${t} DES`)}>{t}</button> : <span className="muted">?</span>}</td>
                <td className="num accent">{r.funds.length}</td>
                <td className="num">{((r.weightSum / r.funds.length) * 100).toFixed(2)}%</td>
                <td className="num">{fmtBig(r.value)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Overlap({ match }: { match: Matcher | null }) {
  const state = useAllFunds();
  const [a, setA] = useState(FUNDS[0]!.cik);
  const [b, setB] = useState(FUNDS[6]!.cik);
  const common = useMemo(() => {
    const A = state.data?.[a]?.holdings ?? [];
    const B = new Map((state.data?.[b]?.holdings ?? []).map((h) => [h.cusip + h.putCall, h]));
    const ta = A.reduce((s, h) => s + h.value, 0) || 1;
    const tb = [...B.values()].reduce((s, h) => s + h.value, 0) || 1;
    return A.filter((h) => B.has(h.cusip + h.putCall)).map((h) => ({ h, wa: h.value / ta, wb: B.get(h.cusip + h.putCall)!.value / tb }));
  }, [state.data, a, b]);
  const overlap = common.reduce((s, x) => s + Math.min(x.wa, x.wb), 0);
  const sel = (v: number, set: (n: number) => void) => (
    <select value={v} onChange={(e) => set(Number(e.target.value))}>{FUNDS.map((f) => <option key={f.cik} value={f.cik}>{f.name}</option>)}</select>
  );
  return (
    <div>
      <div className="toolbar">{sel(a, setA)} vs {sel(b, setB)}</div>
      <DataStatus state={state} />
      <p>Weight overlap: <span className="accent">{(overlap * 100).toFixed(1)}%</span> ({common.length} shared positions). 100% would mean identical portfolios.</p>
      <table className="grid-table">
        <thead><tr><th>Issuer</th><th>Ticker</th><th className="num">Weight A</th><th className="num">Weight B</th></tr></thead>
        <tbody>
          {common.sort((x, y) => Math.min(y.wa, y.wb) - Math.min(x.wa, x.wb)).slice(0, 60).map(({ h, wa, wb }) => (
            <tr key={h.cusip + h.putCall}><td>{h.issuer}</td><td>{match?.(h.issuer, h.cls) ?? '?'}</td><td className="num">{(wa * 100).toFixed(2)}%</td><td className="num">{(wb * 100).toFixed(2)}%</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function GuruPanel({ run }: PanelProps) {
  const [tab, setTab] = useState<Tab>('fund');
  const [cik, setCik] = useState(FUNDS[0]!.cik);
  const match = useMatcher();
  return (
    <div className="guru">
      <div className="toolbar">
        <button aria-pressed={tab === 'fund'} onClick={() => setTab('fund')}>FUND</button>
        <button aria-pressed={tab === 'consensus'} onClick={() => setTab('consensus')}>MOST HELD</button>
        <button aria-pressed={tab === 'overlap'} onClick={() => setTab('overlap')}>OVERLAP</button>
        {tab === 'fund' && (
          <select value={cik} onChange={(e) => setCik(Number(e.target.value))} aria-label="Fund">
            {FUNDS.map((f) => <option key={f.cik} value={f.cik}>{f.manager} · {f.name}</option>)}
          </select>
        )}
      </div>
      {tab === 'fund' && <FundView cik={cik} run={run} match={match} />}
      {tab === 'consensus' && <Consensus run={run} match={match} />}
      {tab === 'overlap' && <Overlap match={match} />}
      <div className="disclaimer">
        Source: SEC Form 13F. Shows long US-listed stock and some options only: no shorts, cash, bonds or foreign shares. Filed up to 45 days after the quarter, so positions may have changed. Tickers are matched by issuer name and a few may be wrong (? = no match; CUSIP on hover). Not a recommendation to copy anyone. Not financial advice.
      </div>
    </div>
  );
}
