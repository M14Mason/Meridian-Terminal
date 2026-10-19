// M8 AI panels: VAL valuation side by side, PRED predictions, SCOR scoreboard, BRIF morning brief.
// Rule 16.3: code computes every number; Claude explains and gives an opinion, labeled.
import { useMemo, useState } from 'react';
import { AI_LABEL } from '../../shared/ai';
import { calibration, HORIZONS, priceSetup, resolvePrice, score, type Pred } from '../../shared/predict';
import { codeValuation, type ValOut } from '../../shared/valuation';
import { extract, STATEMENTS, type Facts } from '../../shared/xbrl';
import { AiBlock, List } from '../ai/AiBlock';
import { askAi, table, type AiReply } from '../ai/client';
import { bars, news, quotes, startFor } from '../data/adapters/alpaca';
import * as fh from '../data/adapters/finnhub';
import { latest, releaseCalendar } from '../data/adapters/fred';
import { companyFacts } from '../data/adapters/sec';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

const H4 = ({ children }: { children: string }) => <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>{children}</h4>;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'failed');
const today = () => new Date().toISOString().slice(0, 10);

function annual(f: Facts, label: string, back = 0) {
  const def = [...STATEMENTS.income, ...STATEMENTS.balance, ...STATEMENTS.cashflow].find((d) => d.label === label)!;
  const m = extract(f, def, 'annual');
  const k = [...m.keys()].sort().at(-1 - back);
  return k ? { year: k, val: m.get(k)!.val } : null;
}
const median = (xs: number[]) => { const v = xs.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? v[Math.floor(v.length / 2)]! : null; };

// ---------- VAL ----------
interface ValAi { verdict: string; low: number; high: number; reasoning: string[]; agreesWithCode: boolean; disagreement: string; risks: string[] }
interface ValData { price: number; code: ValOut; facts: Record<string, string>; peers: { s: string; pe: number | null; ps: number | null }[] }

function Val({ sym }: { sym: string }) {
  const st = useData(`val:${sym}`, async (): Promise<Fetched<ValData>> => {
    const [f, q, m, rf, peerList] = await Promise.all([companyFacts(sym), quotes([sym]), fh.metrics(sym).catch(() => null), latest('DGS10').catch(() => null), fh.peers(sym).catch(() => null)]);
    const facts = f.data.facts as Facts;
    const price = q.data[sym]?.price;
    if (!price) throw new Error(`No price for ${sym}`);
    const peerSyms = (peerList?.data ?? []).filter((p) => p !== sym).slice(0, 8);
    const pm = await Promise.allSettled(peerSyms.map((p) => fh.metrics(p)));
    const peers = peerSyms.map((s, i) => { const r = pm[i]!; const mm = r.status === 'fulfilled' ? r.value.data.metric : {}; return { s, pe: typeof mm.peTTM === 'number' && mm.peTTM > 0 && mm.peTTM < 200 ? mm.peTTM : null, ps: typeof mm.psTTM === 'number' && mm.psTTM > 0 ? mm.psTTM : null }; });
    const ocf = annual(facts, 'Operating cash flow'), capex = annual(facts, 'Capital expenditure'), rev = annual(facts, 'Revenue'), revP = annual(facts, 'Revenue', 1), ni = annual(facts, 'Net income'), sh = annual(facts, 'Diluted shares'), cash = annual(facts, 'Cash and equivalents'), debt = annual(facts, 'Long-term debt');
    if (!sh) throw new Error('Diluted share count not found in SEC XBRL');
    const code = codeValuation({ price, shares: sh.val, fcf: ocf && capex ? ocf.val - capex.val : null, revenue: rev?.val ?? null, revenuePrev: revP?.val ?? null, netIncome: ni?.val ?? null, netCash: (cash?.val ?? 0) - (debt?.val ?? 0), debt: debt?.val ?? 0, beta: typeof m?.data.metric.beta === 'number' ? m.data.metric.beta : null, rf: rf?.data?.value ?? null, peerPE: median(peers.map((p) => p.pe ?? NaN)), peerPS: median(peers.map((p) => p.ps ?? NaN)) });
    const fm = (x: { year: string; val: number } | null) => (x ? `${fmtBig(x.val)} (FY ${x.year})` : 'n/a');
    return { data: { price, code, peers, facts: { Revenue: fm(rev), 'Revenue prior year': fm(revP), 'Net income': fm(ni), 'Operating cash flow': fm(ocf), 'Capital expenditure': fm(capex), 'Diluted shares': fm(sh), Cash: fm(cash), 'Long-term debt': fm(debt), Beta: String(m?.data.metric.beta ?? 'n/a'), '10y Treasury %': String(rf?.data?.value ?? 'n/a') } }, fetchedAt: f.fetchedAt, fromCache: false };
  }, { source: 'SEC XBRL, Alpaca, Finnhub, FRED' });
  const [ai, setAi] = useState<{ reply?: AiReply<ValAi>; err?: string; busy?: boolean }>({});
  const d = st.data;
  const ask = () => {
    if (!d) return;
    const input = [`COMPANY: ${sym}. PRICE: $${d.price.toFixed(2)} (as of ${new Date(st.fetchedAt ?? 0).toISOString()})`, `FUNDAMENTALS (SEC XBRL, USD):\n${Object.entries(d.facts).map(([k, v]) => `${k}: ${v}`).join('\n')}`, `CODE VALUATION METHODS (per share):\n${d.code.methods.map((m) => `${m.name}: $${m.perShare.toFixed(2)} (${m.note})`).join('\n')}`, `CODE RANGE: ${d.code.low?.toFixed(2) ?? 'n/a'} to ${d.code.high?.toFixed(2) ?? 'n/a'}; CODE VERDICT: ${d.code.verdict}`, `CODE ASSUMPTIONS: ${d.code.assumptions.join(' ')}`, `PEERS (Finnhub TTM):\n${table(d.peers)}`].join('\n\n');
    setAi({ busy: true });
    askAi<ValAi>('valuation', input).then((reply) => setAi({ reply }), (e: unknown) => setAi({ err: errMsg(e) }));
  };
  const r = ai.reply?.result;
  const disagree = r && d && (r.verdict !== d.code.verdict || (d.code.low != null && d.code.high != null && (r.high < d.code.low || r.low > d.code.high)));
  return (
    <>
      <DataStatus state={st} />
      {d && (
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: '1 1 260px' }}>
            <H4>CODE VALUATION</H4>
            <table className="grid-table"><tbody>
              {d.code.methods.map((m) => <tr key={m.name}><td>{m.name}</td><td className="num">${fmt(m.perShare)}</td><td className={`num ${dir(m.perShare / d.price - 1)}`}>{fmtPct((m.perShare / d.price - 1) * 100, 0)}</td></tr>)}
            </tbody></table>
            <p>Price <strong>${fmt(d.price)}</strong>. Range <strong className="accent">${fmt(d.code.low)} to ${fmt(d.code.high)}</strong>: model says <strong className={d.code.verdict === 'undervalued' ? 'up' : d.code.verdict === 'overvalued' ? 'down' : ''}>{d.code.verdict}</strong>.</p>
            <ul className="muted" style={{ margin: 0, paddingLeft: 18 }}>{d.code.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          </div>
          <div style={{ flex: '1 1 260px' }}>
            <H4>CLAUDE&apos;S VIEW</H4>
            {!ai.reply && <button disabled={ai.busy} onClick={ask}>{ai.busy ? 'THINKING...' : "GET CLAUDE'S VIEW (about $0.02)"}</button>}
            {ai.err && <p className="down">{ai.err}</p>}
            {ai.reply && r && (
              <AiBlock reply={ai.reply}>
                <p>Range <strong className="accent">${fmt(r.low)} to ${fmt(r.high)}</strong>: <strong>{r.verdict}</strong>.</p>
                {disagree && <p className="down"><span className="badge">DISAGREES</span> Claude and the code model disagree. {r.disagreement}</p>}
                {!disagree && r.disagreement && <p className="muted">{r.disagreement}</p>}
                <List title="REASONING" items={r.reasoning} />
                <List title="RISKS" items={r.risks} />
              </AiBlock>
            )}
          </div>
        </div>
      )}
      <div className="disclaimer">{AI_LABEL} Code valuation from SEC filings and peer medians (Finnhub free tier). Analyst price targets are paid data and not included. Verdicts describe a model, not a recommendation.</div>
    </>
  );
}

// ---------- PRED ----------
interface PredAi { pUp: number; reasoning: string[]; assumptions: string[]; vsBaseline: string }

function PredPanel({ sym }: { sym: string }) {
  const [h, setH] = useState<(typeof HORIZONS)[number]>(HORIZONS[1]);
  const st = useData(`pred:${sym}`, async () => {
    const [b, n, m] = await Promise.all([bars(sym, '1Day', startFor(800)), news([sym], 8).catch(() => null), fh.metrics(sym).catch(() => null)]);
    return { data: { bars: b.data, news: n?.data ?? [], metric: m?.data.metric ?? {} }, fetchedAt: b.fetchedAt, fromCache: false };
  }, { source: 'Alpaca daily bars, news, Finnhub' });
  const setup = useMemo(() => (st.data && st.data.bars.length > 80 ? priceSetup(st.data.bars.map((x) => x.c), h.days) : null), [st.data, h]);
  const [ai, setAi] = useState<{ reply?: AiReply<PredAi>; err?: string; busy?: boolean; key?: string }>({});
  const preds = useCollection<Pred>('predictions');
  const run = () => {
    if (!st.data || !setup) return;
    const c = st.data.bars.map((x) => x.c);
    const ret = (k: number) => (c.length > k ? (c.at(-1)! / c.at(-1 - k)! - 1) * 100 : null);
    const sma = (k: number) => c.slice(-k).reduce((a, b) => a + b, 0) / Math.min(k, c.length);
    const mm = st.data.metric;
    const input = [
      `TICKER: ${sym}. HORIZON: ${h.label} (${h.days} trading days). LAST CLOSE: ${setup.last.toFixed(2)} on ${new Date(st.data.bars.at(-1)!.t).toISOString().slice(0, 10)}.`,
      `CODE RANGE (80%, from 60-day volatility ${(setup.dailyVol * 100).toFixed(2)}%/day): ${setup.low.toFixed(2)} to ${setup.high.toFixed(2)}.`,
      `BASELINE P(up) = ${setup.pBase.toFixed(3)} (share of ${setup.baseN} past ${h.days}-day windows in about 3 years that ended higher).`,
      `MOMENTUM: 1m ${ret(21)?.toFixed(1)}%, 3m ${ret(63)?.toFixed(1)}%, 6m ${ret(126)?.toFixed(1)}%, 12m ${ret(252)?.toFixed(1)}%. Price vs 50d avg ${((setup.last / sma(50) - 1) * 100).toFixed(1)}%, vs 200d avg ${((setup.last / sma(200) - 1) * 100).toFixed(1)}%.`,
      `VALUATION (Finnhub TTM): P/E ${mm.peTTM ?? 'n/a'}, P/S ${mm.psTTM ?? 'n/a'}, beta ${mm.beta ?? 'n/a'}.`,
      `RECENT HEADLINES:\n${st.data.news.map((x) => `- ${new Date(x.publishedAt).toISOString().slice(0, 10)} ${x.headline}`).join('\n') || '(none)'}`,
    ].join('\n');
    const key = `${sym}:${h.key}`;
    setAi({ busy: true, key });
    askAi<PredAi>('predict', input).then((reply) => {
      setAi({ reply, key });
      // Log every prediction for the scoreboard (16.5). One per ticker, horizon and day.
      const p: Pred = { kind: 'price', sym, horizon: h.key, days: h.days, made: today(), at: Date.now(), start: setup.last, low: setup.low, high: setup.high, pBase: setup.pBase, pAi: reply.result.pUp, model: reply.model, version: reply.version };
      void sync.put('predictions', `price:${sym}:${h.key}:${today()}`, p);
    }, (e: unknown) => setAi({ err: errMsg(e), key }));
  };
  const cur = ai.key === `${sym}:${h.key}` ? ai : {};
  const r = cur.reply?.result;
  const mine = preds.filter((p) => p.value.sym === sym).sort((a, b) => b.value.at - a.value.at).slice(0, 8);
  return (
    <>
      <div className="toolbar">{HORIZONS.map((x) => <button key={x.key} aria-pressed={h.key === x.key} onClick={() => setH(x)}>{x.label.toUpperCase()}</button>)}</div>
      <DataStatus state={st} keyName="Alpaca" />
      {setup && (
        <table className="grid-table"><tbody>
          <tr><td>Last close</td><td className="num">{fmt(setup.last)}</td><td>80% range ({h.label.toLowerCase()})</td><td className="num accent">{fmt(setup.low)} to {fmt(setup.high)}</td></tr>
          <tr><td>Baseline P(up)</td><td className="num">{fmt(setup.pBase * 100, 0)}%</td><td>Base rate sample</td><td className="num">{setup.baseN} windows</td></tr>
        </tbody></table>
      )}
      {setup && !cur.reply && <button disabled={cur.busy} onClick={run}>{cur.busy ? 'THINKING...' : "ADD CLAUDE'S PROBABILITY (about $0.01)"}</button>}
      {cur.err && <p className="down">{cur.err}</p>}
      {cur.reply && r && setup && (
        <AiBlock reply={cur.reply}>
          <p>Claude P(up): <strong className={dir(r.pUp - 0.5)}>{fmt(r.pUp * 100, 0)}%</strong> vs baseline {fmt(setup.pBase * 100, 0)}%. {r.vsBaseline}</p>
          <List title="REASONING" items={r.reasoning} />
          <List title="ASSUMPTIONS" items={r.assumptions} />
          <p className="muted">Logged to the scoreboard (SCOR); it is scored automatically when the horizon ends.</p>
        </AiBlock>
      )}
      {mine.length > 0 && (<><H4>YOUR PAST PREDICTIONS FOR THIS TICKER</H4><table className="grid-table"><tbody>{mine.map((p) => <tr key={p.id}><td>{p.value.made}</td><td>{p.value.horizon}</td><td className="num">AI {p.value.pAi == null ? '-' : `${fmt(p.value.pAi * 100, 0)}%`}</td><td className="num">base {fmt(p.value.pBase * 100, 0)}%</td><td>{p.value.resolved ? (p.value.resolved.up ? <span className="up">UP</span> : <span className="down">DOWN</span>) : <span className="muted">open</span>}</td></tr>)}</tbody></table></>)}
      <div className="disclaimer">{AI_LABEL} The range comes from recent volatility (assumes it stays similar); the baseline is the historical base rate. Claude adds a probability, never a target. Earnings and macro release predictions are scored the same way in a later update.</div>
    </>
  );
}

// ---------- SCOR ----------
function Scor() {
  const all = useCollection<Pred>('predictions');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const preds = useMemo(() => all.map((p) => p.value), [all]);
  const s = score(preds);
  const cal = calibration(preds);
  const byH = HORIZONS.map((h) => ({ h, s: score(preds.filter((p) => p.horizon === h.key)) }));
  const open = all.filter((p) => !p.value.resolved);
  const resolveNow = async () => {
    setBusy(true);
    let done = 0;
    const syms = [...new Set(open.map((p) => p.value.sym))];
    for (const sym of syms) {
      try {
        const b = await bars(sym, '1Day', startFor(140));
        for (const p of open.filter((x) => x.value.sym === sym)) {
          const r = resolvePrice(p.value, b.data);
          if (r) { await sync.put('predictions', p.id, { ...p.value, resolved: r }); done++; }
        }
      } catch {
        // try again next time
      }
    }
    setMsg(`${done} predictions resolved, ${open.length - done} still open.`);
    setBusy(false);
  };
  const pct = (v: number | null) => (v == null ? '-' : `${fmt(v * 100, 0)}%`);
  return (
    <>
      <div className="toolbar"><button disabled={busy || !open.length} onClick={() => void resolveNow()}>{busy ? 'SCORING...' : `SCORE OPEN PREDICTIONS (${open.length})`}</button>{msg && <span className="muted">{msg}</span>}</div>
      {s.n < 30 && <p className="down"><span className="badge">SMALL SAMPLE</span> {s.n} resolved predictions. Under about 30, hit rates and Brier scores are mostly noise.</p>}
      <table className="grid-table">
        <thead><tr><th>Horizon</th><th className="num">Resolved</th><th className="num">Claude hit</th><th className="num">Baseline hit</th><th className="num">Claude Brier</th><th className="num">Baseline Brier</th><th className="num">Range coverage</th></tr></thead>
        <tbody>
          {[{ h: { key: 'all', label: 'All' }, s }, ...byH].map(({ h, s: x }) => <tr key={h.key}><td>{h.label}</td><td className="num">{x.n}</td><td className="num">{pct(x.hitAi)}</td><td className="num">{pct(x.hitBase)}</td><td className={`num ${x.brierAi != null && x.brierBase != null ? (x.brierAi < x.brierBase ? 'up' : 'down') : ''}`}>{fmt(x.brierAi, 3)}</td><td className="num">{fmt(x.brierBase, 3)}</td><td className="num">{pct(x.coverage)}</td></tr>)}
        </tbody>
      </table>
      <H4>CALIBRATION (CLAUDE)</H4>
      <table className="grid-table"><thead><tr><th>Said</th><th className="num">Count</th><th className="num">Avg predicted</th><th className="num">Actually up</th></tr></thead><tbody>{cal.map((b) => <tr key={b.lo}><td>{fmt(b.lo * 100, 0)} to {fmt(b.hi * 100, 0)}%</td><td className="num">{b.n}</td><td className="num">{pct(b.predicted)}</td><td className="num">{pct(b.observed)}</td></tr>)}</tbody></table>
      <div className="disclaimer">{AI_LABEL} Brier score: lower is better; 0.25 is what always saying 50% scores. Range coverage should be near 80% if the volatility ranges are honest. Predictions are scored when you press SCORE (or open this panel after the horizon); they live only in your synced data. The Claude model portfolio and MODEL index are tracked in CMP and MODEL.</div>
    </>
  );
}

// ---------- BRIF ----------
interface Brief { headline: string; bullets: string[]; watch: string[] }
const BRIEF_ETFS = ['SPY', 'QQQ', 'IWM', 'DIA', 'TLT', 'GLD', 'USO', 'UUP', 'HYG'];

function Brif() {
  const [state, setState] = useState<{ reply?: AiReply<Brief>; err?: string; busy?: boolean }>({});
  const go = async (fresh = false) => {
    setState({ busy: true });
    try {
      const [q, n, cal, ...fred] = await Promise.all([quotes(BRIEF_ETFS), news(undefined, 15), releaseCalendar(2).catch(() => null), ...['DGS10', 'DGS2', 'VIXCLS', 'DCOILWTICO', 'UNRATE'].map((id) => latest(id).catch(() => null))]);
      const ids = ['10y Treasury %', '2y Treasury %', 'VIX', 'WTI oil $', 'Unemployment %'];
      const input = [
        `DATE: ${today()}`,
        `ETF QUOTES (Alpaca, IEX; change vs previous close):\n${table(BRIEF_ETFS.map((s) => ({ s, price: q.data[s]?.price ?? null, chgPct: q.data[s]?.changePct ?? null })))}`,
        `MACRO (FRED latest):\n${fred.map((f, i) => `${ids[i]}: ${f?.data?.value ?? 'n/a'} (${f?.data?.date ?? ''})`).join('\n')}`,
        `RELEASES NEXT 2 DAYS (FRED):\n${(cal?.data ?? []).slice(0, 12).map((r) => `${r.date} ${r.release_name}`).join('\n') || '(none)'}`,
        `HEADLINES:\n${n.data.map((x) => `- ${x.headline}`).join('\n')}`,
      ].join('\n\n');
      const reply = await askAi<Brief>('brief', input, fresh);
      setState({ reply });
    } catch (e) {
      setState({ err: errMsg(e) });
    }
  };
  const r = state.reply?.result;
  return (
    <div>
      <div className="toolbar"><button disabled={state.busy} onClick={() => void go(Boolean(state.reply))}>{state.busy ? 'WRITING...' : state.reply ? 'REFRESH' : "TODAY'S BRIEF (about $0.001)"}</button></div>
      {state.err && <p className="down">{state.err}</p>}
      {state.reply && r && (
        <AiBlock reply={state.reply}>
          <p className="accent" style={{ fontSize: 14 }}>{r.headline}</p>
          <List title="MARKETS" items={r.bullets} />
          <List title="WATCH TODAY" items={r.watch} />
        </AiBlock>
      )}
      <div className="disclaimer">{AI_LABEL} Written by Claude Haiku only from the quotes, FRED data, release calendar and headlines shown under &quot;inputs used&quot;. ETF quotes are IEX (a slice of volume) and may lag.</div>
    </div>
  );
}

export default function AiPanels({ code, security }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  return <div>{code === 'VAL' ? <Val sym={sym} /> : code === 'PRED' ? <PredPanel sym={sym} /> : code === 'SCOR' ? <Scor /> : <Brif />}</div>;
}
