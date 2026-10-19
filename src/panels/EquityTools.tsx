// Single-company tools: DCF, DIL, RV, ESH, PEAD, OWN, EVTS, MGMT, ANR, EE.
import { useMemo, useState } from 'react';
import { heatColor } from '../../shared/heat';
import { normName } from '../../shared/thirteenf';
import { dcf, wacc } from '../../shared/quant';
import { buildStatement, extract, STATEMENTS, type Facts } from '../../shared/xbrl';
import { bars, quotes, startFor } from '../data/adapters/alpaca';
import * as fh from '../data/adapters/finnhub';
import { latest } from '../data/adapters/fred';
import { tickerDividends } from '../data/adapters/massive';
import { companyFacts, filingUrl, profile } from '../data/adapters/sec';
import { allFundsLatest } from '../data/adapters/thirteenf';
import { up, type Fetched } from '../data/client';
import { FUNDS } from '../data/funds';
import { useData } from '../data/useData';
import { dir, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const MODEL = 'Model estimate. Not financial advice.';
const latestAnnual = (facts: Facts, label: string) => {
  const def = [...STATEMENTS.income, ...STATEMENTS.balance, ...STATEMENTS.cashflow].find((d) => d.label === label)!;
  const m = extract(facts, def, 'annual');
  const k = [...m.keys()].sort().at(-1);
  return k ? { year: k, val: m.get(k)!.val } : null;
};

// ---------- DCF and WACC ----------
function Dcf({ sym }: { sym: string }) {
  const st = useData(`dcf:${sym}`, async (): Promise<Fetched<{ facts: Facts; price: number | null; beta: number | null; rf: number | null }>> => {
    const [f, q, m, rf] = await Promise.all([companyFacts(sym), quotes([sym]).catch(() => null), fh.metrics(sym).catch(() => null), latest('DGS10').catch(() => null)]);
    return { data: { facts: f.data.facts as Facts, price: q?.data[sym]?.price ?? null, beta: (m?.data.metric.beta as number) ?? null, rf: rf?.data?.value ?? null }, fetchedAt: f.fetchedAt, fromCache: false };
  }, { source: 'SEC XBRL, Finnhub, FRED' });
  const base = useMemo(() => {
    if (!st.data) return null;
    const f = st.data.facts;
    const ocf = latestAnnual(f, 'Operating cash flow');
    const capex = latestAnnual(f, 'Capital expenditure');
    const sh = latestAnnual(f, 'Diluted shares');
    const cash = latestAnnual(f, 'Cash and equivalents');
    const debt = latestAnnual(f, 'Long-term debt');
    return { fcf: ocf && capex ? ocf.val - capex.val : null, year: ocf?.year, shares: sh?.val ?? null, netCash: (cash?.val ?? 0) - (debt?.val ?? 0), debt: debt?.val ?? 0 };
  }, [st.data]);
  const [g, setG] = useState(8);
  const [years, setYears] = useState(5);
  const [tg, setTg] = useState(2.5);
  const [erp, setErp] = useState(5);
  const [override, setOverride] = useState<number | null>(null);
  const rf = (st.data?.rf ?? 4.2) / 100;
  const beta = st.data?.beta ?? 1;
  const mcap = st.data?.price && base?.shares ? st.data.price * base.shares : null;
  const w = mcap ? wacc({ rf, beta, erp: erp / 100, costDebt: rf + 0.015, tax: 0.21, equity: mcap, debt: base!.debt }) : null;
  const disc = override ?? (w ? w.wacc * 100 : 9);
  const run = (d: number, t: number) => (base?.fcf && base.shares ? dcf({ fcf: base.fcf, growth: g / 100, years, terminalGrowth: t / 100, discount: d / 100, netCash: base.netCash, shares: base.shares }) : null);
  const r = run(disc, tg);
  const num = (v: number, set: (n: number) => void, label: string, step = 0.5) => <label className="toggle">{label}<input type="number" value={v} step={step} onChange={(e) => set(Number(e.target.value))} style={{ width: 60 }} /></label>;
  return (
    <>
      <DataStatus state={st} />
      {base && (
        <>
          <dl className="kv">
            <dt>Free cash flow ({base.year})</dt><dd>{base.fcf != null ? `$${fmtBig(base.fcf)}` : 'not reported in XBRL'}</dd>
            <dt>Diluted shares</dt><dd>{fmtBig(base.shares)}</dd>
            <dt>Net cash (cash minus long-term debt)</dt><dd className={dir(base.netCash)}>${fmtBig(base.netCash)}</dd>
            <dt>WACC</dt><dd>{w ? `${fmtPct(w.wacc * 100, 2)} (cost of equity ${fmtPct(w.costEquity * 100, 2)} = 10y ${fmtPct(rf * 100, 2)} + beta ${fmt(beta)} x ERP ${erp}%)` : '-'}</dd>
          </dl>
          <div className="toolbar">{num(g, setG, 'Growth %/yr')}{num(years, setYears, 'Years', 1)}{num(tg, setTg, 'Terminal growth %', 0.25)}{num(erp, setErp, 'Equity risk premium %')}<label className="toggle">Discount % <input type="number" value={override ?? +disc.toFixed(2)} step={0.25} onChange={(e) => setOverride(Number(e.target.value))} style={{ width: 60 }} /></label></div>
          {r && (
            <dl className="kv">
              <dt>Value per share</dt><dd className="accent" style={{ fontSize: 15 }}>${fmt(r.perShare)}</dd>
              <dt>Current price</dt><dd>{st.data?.price ? `$${fmt(st.data.price)} (${fmtPct((r.perShare / st.data.price - 1) * 100, 1)} vs model)` : '-'}</dd>
              <dt>Terminal value share of total</dt><dd className={r.terminalShare > 0.75 ? 'down' : ''}>{fmt(r.terminalShare * 100, 0)}% {r.terminalShare > 0.75 ? '(most value is far in the future: very assumption-sensitive)' : ''}</dd>
            </dl>
          )}
          <h4 className="accent" style={{ fontSize: 12, margin: '6px 0 2px' }}>SENSITIVITY: VALUE PER SHARE</h4>
          <table className="grid-table heat">
            <thead><tr><th>Discount \ Terminal g</th>{[1.5, 2, 2.5, 3, 3.5].map((t) => <th key={t} className="num">{t}%</th>)}</tr></thead>
            <tbody>
              {[disc - 2, disc - 1, disc, disc + 1, disc + 2].map((d) => (
                <tr key={d}><td>{fmt(d, 2)}%</td>{[1.5, 2, 2.5, 3, 3.5].map((t) => { const v = run(d, t)?.perShare; const p = st.data?.price; return <td key={t} className="cell" style={{ background: v && p ? heatColor(Math.max(-1, Math.min(1, v / p - 1))) : undefined }}>{v ? fmt(v) : '-'}</td>; })}</tr>
              ))}
            </tbody>
          </table>
        </>
      )}
      <div className="disclaimer">Two-stage free cash flow model with your assumptions. Small changes in growth or discount rate move the result a lot. Banks and insurers do not fit this model. {MODEL}</div>
    </>
  );
}

// ---------- DIL: buybacks and dilution ----------
function Dil({ sym }: { sym: string }) {
  const st = useData(`dil:${sym}`, () => companyFacts(sym), { source: 'SEC XBRL' });
  const t = useMemo(() => (st.data ? buildStatement(st.data.facts as Facts, 'cashflow', 'annual', 8) : null), [st.data]);
  const sh = useMemo(() => (st.data ? buildStatement(st.data.facts as Facts, 'income', 'annual', 8) : null), [st.data]);
  const shares = sh?.rows.find((r) => r.label === 'Diluted shares');
  return (
    <>
      <DataStatus state={st} />
      {t && shares && (
        <table className="grid-table">
          <thead><tr><th /> {t.periods.map((p) => <th key={p} className="num">{p}</th>)}</tr></thead>
          <tbody>
            <tr><td>Diluted shares</td>{sh!.periods.map((p, i) => <td key={p} className="num">{fmtBig(shares.values[i])}</td>)}</tr>
            <tr><td>Share count change</td>{sh!.periods.map((p, i) => { const a = shares.values[i - 1]; const b = shares.values[i]; const c = a && b ? (b / a - 1) * 100 : null; return <td key={p} className={`num ${c == null ? '' : c > 0 ? 'down' : 'up'}`}>{c == null ? '-' : fmtPct(c, 1)}</td>; })}</tr>
            {['Buybacks', 'Dividends paid', 'Stock-based comp'].map((l) => { const row = t.rows.find((r) => r.label === l); return <tr key={l}><td>{l}</td>{t.periods.map((p, i) => <td key={p} className="num">{row?.values[i] != null ? `$${fmtBig(row.values[i])}` : '-'}</td>)}</tr>; })}
          </tbody>
        </table>
      )}
      <div className="disclaimer">From SEC XBRL annual filings. A falling share count (green) means buybacks outpace stock compensation; rising (red) means dilution. Columns can differ when a company did not tag a line in a year.</div>
    </>
  );
}

// ---------- RV: peers ----------
const RV_KEYS: [string, string, boolean][] = [['peTTM', 'P/E', false], ['psTTM', 'P/S', false], ['pbQuarterly', 'P/B', false], ['roeTTM', 'ROE %', true], ['netProfitMarginTTM', 'Net margin %', true], ['revenueGrowthTTMYoy', 'Revenue growth %', true], ['52WeekPriceReturnDaily', '52w return %', true]];
function Rv({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData(`rv:${sym}`, async (): Promise<Fetched<{ s: string; m: Record<string, number | string | null> }[]>> => {
    const peers = (await fh.peers(sym)).data.slice(0, 10);
    const list = [sym, ...peers.filter((p) => p !== sym)].slice(0, 10);
    const res = await Promise.allSettled(list.map((s) => fh.metrics(s)));
    return { data: list.map((s, i) => ({ s, m: res[i]!.status === 'fulfilled' ? (res[i] as PromiseFulfilledResult<Awaited<ReturnType<typeof fh.metrics>>>).value.data.metric : {} })), fetchedAt: Date.now(), fromCache: false };
  }, { source: 'Finnhub' });
  const rows = st.data ?? [];
  const med = (k: string) => {
    const v = rows.map((r) => r.m[k]).filter((x): x is number => typeof x === 'number').sort((a, b) => a - b);
    return v.length ? v[Math.floor(v.length / 2)]! : null;
  };
  return (
    <>
      <DataStatus state={st} keyName="Finnhub" />
      <table className="grid-table">
        <thead><tr><th>Ticker</th>{RV_KEYS.map(([, l]) => <th key={l} className="num">{l}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.s} className={r.s === sym ? 'accent' : ''}>
              <td><button className="link-btn" onClick={() => run(`${r.s} DES`)}>{r.s}</button></td>
              {RV_KEYS.map(([k, , hi]) => { const v = typeof r.m[k] === 'number' ? (r.m[k] as number) : null; const m = med(k); const better = v != null && m != null ? (hi ? v > m : v < m) : null; return <td key={k} className={`num ${better == null ? '' : better ? 'up' : 'down'}`}>{fmt(v, 1)}</td>; })}
            </tr>
          ))}
          <tr className="muted"><td>Peer median</td>{RV_KEYS.map(([k]) => <td key={k} className="num">{fmt(med(k), 1)}</td>)}</tr>
        </tbody>
      </table>
      <div className="disclaimer">Peers and ratios from Finnhub (free tier). Green = cheaper or stronger than the peer median. Cheap can stay cheap. {MODEL}</div>
    </>
  );
}

// ---------- ESH and PEAD ----------
function useEarningsWithDates(sym: string) {
  return useData(`esh:${sym}`, async () => {
    const [e, p] = await Promise.all([fh.earningsSurprises(sym), profile(sym)]);
    // Report date = first 8-K with item 2.02 (results of operations) filed after the quarter ended.
    const results = p.data.filings.filter((f) => f.form.startsWith('8-K') && f.items.includes('2.02')).map((f) => f.filed).sort();
    const rows = e.data.map((x) => ({ ...x, reported: results.find((d) => d > x.period && Date.parse(d) - Date.parse(x.period) < 100 * 86_400_000) ?? null }));
    return { data: rows, fetchedAt: e.fetchedAt, fromCache: false };
  }, { source: 'Finnhub, SEC 8-K' });
}

function Esh({ sym }: { sym: string }) {
  const st = useEarningsWithDates(sym);
  const rows = st.data ?? [];
  const beats = rows.filter((r) => (r.surprise ?? 0) > 0).length;
  return (
    <>
      <DataStatus state={st} keyName="Finnhub" empty={rows.length === 0} />
      {rows.length > 0 && <p>Beat estimates {beats} of {rows.length} quarters shown.</p>}
      <table className="grid-table">
        <thead><tr><th>Quarter end</th><th>Reported (8-K 2.02)</th><th className="num">Actual EPS</th><th className="num">Estimate</th><th className="num">Surprise</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.period}><td>{r.period}</td><td className="muted">{r.reported ?? '-'}</td><td className="num">{fmt(r.actual)}</td><td className="num">{fmt(r.estimate)}</td><td className={`num ${dir(r.surprisePercent)}`}>{fmtPct(r.surprisePercent, 1)}</td></tr>)}</tbody>
      </table>
      <div className="disclaimer">Finnhub free tier returns the last few quarters. Estimates are consensus at the time per Finnhub. Report dates come from SEC 8-K filings with item 2.02.</div>
    </>
  );
}

function Pead({ sym }: { sym: string }) {
  const e = useEarningsWithDates(sym);
  const px = useData(`pead:px:${sym}`, () => bars(sym, '1Day', startFor(1500), undefined, 5000), { source: 'Alpaca' });
  const res = useMemo(() => {
    if (!e.data || !px.data) return null;
    const b = px.data;
    const dates = b.map((x) => new Date(x.t).toISOString().slice(0, 10));
    const rows = e.data.filter((r) => r.reported).map((r) => {
      // Reaction measured from the close before the report, since many companies report after the close.
      const i = dates.findIndex((d) => d >= r.reported!);
      if (i < 1) return null;
      const base = b[i - 1]!.c;
      const at = (n: number) => (b[i - 1 + n] ? b[i - 1 + n]!.c / base - 1 : null);
      return { ...r, d1: at(1), d5: at(5), d20: at(20), beat: (r.surprise ?? 0) > 0 };
    }).filter((x): x is NonNullable<typeof x> => x != null);
    const avg = (xs: (number | null)[]) => { const v = xs.filter((x): x is number => x != null); return v.length ? v.reduce((a, b2) => a + b2, 0) / v.length : null; };
    const grp = (beat: boolean) => { const g = rows.filter((r) => r.beat === beat); return { n: g.length, d1: avg(g.map((x) => x.d1)), d5: avg(g.map((x) => x.d5)), d20: avg(g.map((x) => x.d20)) }; };
    return { rows, beat: grp(true), miss: grp(false) };
  }, [e.data, px.data]);
  return (
    <>
      <DataStatus state={e} keyName="Finnhub" />
      {res && (
        <>
          <table className="grid-table">
            <thead><tr><th>After a…</th><th className="num">Count</th><th className="num">1 day</th><th className="num">5 days</th><th className="num">20 days</th></tr></thead>
            <tbody>{[['Beat', res.beat], ['Miss', res.miss]].map(([n, g]) => { const x = g as typeof res.beat; return <tr key={n as string}><td className={n === 'Beat' ? 'up' : 'down'}>{n as string}</td><td className="num">{x.n}</td><td className={`num ${dir(x.d1)}`}>{x.d1 == null ? '-' : fmtPct(x.d1 * 100, 1)}</td><td className={`num ${dir(x.d5)}`}>{x.d5 == null ? '-' : fmtPct(x.d5 * 100, 1)}</td><td className={`num ${dir(x.d20)}`}>{x.d20 == null ? '-' : fmtPct(x.d20 * 100, 1)}</td></tr>; })}</tbody>
          </table>
          <table className="grid-table">
            <thead><tr><th>Reported</th><th className="num">Surprise</th><th className="num">1d</th><th className="num">5d</th><th className="num">20d</th></tr></thead>
            <tbody>{res.rows.map((r) => <tr key={r.period}><td>{r.reported}</td><td className={`num ${dir(r.surprisePercent)}`}>{fmtPct(r.surprisePercent, 1)}</td><td className={`num ${dir(r.d1)}`}>{r.d1 == null ? '-' : fmtPct(r.d1 * 100, 1)}</td><td className={`num ${dir(r.d5)}`}>{r.d5 == null ? '-' : fmtPct(r.d5 * 100, 1)}</td><td className={`num ${dir(r.d20)}`}>{r.d20 == null ? '-' : fmtPct(r.d20 * 100, 1)}</td></tr>)}</tbody>
          </table>
        </>
      )}
      <div className="disclaimer">Returns from the close before each report. Very small sample (the free tier gives a few quarters), so this describes the past and proves nothing. Not market-adjusted. {MODEL}</div>
    </>
  );
}

// ---------- OWN ----------
function Own({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData(`own:${sym}`, async () => {
    const [p, ins, funds] = await Promise.all([profile(sym), fh.insiders(sym).catch(() => null), allFundsLatest(FUNDS)]);
    const key = normName(p.data.name);
    const holders = Object.entries(funds).map(([cik, f]) => {
      const total = f.holdings.reduce((s, h) => s + h.value, 0) || 1;
      const h = f.holdings.filter((x) => !x.putCall && normName(x.issuer) === key);
      const value = h.reduce((s, x) => s + x.value, 0);
      return value ? { fund: FUNDS.find((x) => x.cik === Number(cik))!, value, weight: value / total, quarter: f.quarter } : null;
    }).filter((x): x is NonNullable<typeof x> => x != null).sort((a, b) => b.value - a.value);
    return { data: { name: p.data.name, filings: p.data.filings.filter((f) => /13D|13G/.test(f.form)).slice(0, 15), insiders: ins?.data.data.slice(0, 20) ?? [], holders }, fetchedAt: p.fetchedAt, fromCache: false };
  }, { source: 'SEC, Finnhub' });
  const d = st.data;
  return (
    <>
      <DataStatus state={st} />
      {d && (
        <>
          <h4 className="accent" style={{ fontSize: 12, margin: '4px 0' }}>TRACKED SUPERINVESTORS HOLDING {d.name.toUpperCase()}</h4>
          {d.holders.length ? (
            <table className="grid-table"><tbody>{d.holders.map((h) => <tr key={h.fund.cik}><td>{h.fund.manager}</td><td className="muted">{h.fund.name}</td><td className="num">${fmtBig(h.value)}</td><td className="num">{fmt(h.weight * 100, 2)}% of fund</td><td className="muted">{h.quarter}</td></tr>)}</tbody></table>
          ) : <p className="muted">None of the {FUNDS.length} tracked funds report this stock (name match).</p>}
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 4px' }}>5%+ OWNERSHIP FILINGS</h4>
          <table className="grid-table"><tbody>{d.filings.map((f) => <tr key={f.accession}><td>{f.filed}</td><td className="accent">{f.form}</td><td><a href={f.url} target="_blank" rel="noreferrer noopener">Open</a></td></tr>)}</tbody></table>
          <h4 className="accent" style={{ fontSize: 12, margin: '8px 0 4px' }}>RECENT INSIDER TRANSACTIONS <button className="link-btn" onClick={() => run(`${sym} INS`)}>(all)</button></h4>
          <table className="grid-table"><tbody>{d.insiders.map((t, i) => <tr key={i}><td>{t.transactionDate}</td><td>{t.name}</td><td className={t.transactionCode === 'P' ? 'up' : t.transactionCode === 'S' ? 'down' : 'muted'}>{t.transactionCode}</td><td className={`num ${dir(t.change)}`}>{fmtBig(t.change)}</td></tr>)}</tbody></table>
        </>
      )}
      <div className="disclaimer">13F holders matched by company name; 13F data is up to 45 days old. Codes: P buy, S sell, others are awards or exercises.</div>
    </>
  );
}

// ---------- EVTS: events timeline ----------
function Evts({ sym }: { sym: string }) {
  const st = useData(`evts:${sym}`, async () => {
    const [p, e, d, ins] = await Promise.all([profile(sym), fh.earningsSurprises(sym).catch(() => null), tickerDividends(sym).catch(() => null), fh.insiders(sym).catch(() => null)]);
    const ev: { date: string; kind: string; text: string; url?: string; tone?: 'up' | 'down' }[] = [];
    for (const f of p.data.filings.slice(0, 120)) {
      if (/^(10-K|10-Q|20-F|S-1|DEF 14A|25|SC 13D)/.test(f.form) || (f.form === '8-K' && f.items)) ev.push({ date: f.filed, kind: f.form, text: f.form === '8-K' ? `Items ${f.items}` : f.description || f.form, url: f.url });
    }
    for (const x of e?.data ?? []) ev.push({ date: x.period, kind: 'EPS', text: `Quarter end: EPS ${fmt(x.actual)} vs ${fmt(x.estimate)} est`, tone: (x.surprise ?? 0) >= 0 ? 'up' : 'down' });
    for (const x of d?.data.slice(0, 12) ?? []) ev.push({ date: x.ex_dividend_date, kind: 'DIV', text: `Ex-dividend $${fmt(x.cash_amount, 4)}` });
    for (const x of ins?.data.data.filter((t) => t.transactionCode === 'P' || t.transactionCode === 'S').slice(0, 25) ?? []) ev.push({ date: x.transactionDate, kind: x.transactionCode === 'P' ? 'BUY' : 'SELL', text: `${x.name} ${fmtBig(Math.abs(x.change))} shares`, tone: x.transactionCode === 'P' ? 'up' : 'down' });
    return { data: ev.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 150), fetchedAt: p.fetchedAt, fromCache: false };
  }, { source: 'SEC, Finnhub, Massive' });
  return (
    <>
      <DataStatus state={st} />
      <table className="grid-table"><tbody>{(st.data ?? []).map((x, i) => <tr key={i}><td>{x.date}</td><td className={x.tone ?? 'accent'}>{x.kind}</td><td>{x.url ? <a href={x.url} target="_blank" rel="noreferrer noopener">{x.text}</a> : x.text}</td></tr>)}</tbody></table>
      <div className="disclaimer">Filings from SEC, earnings from Finnhub, dividends from Massive, open-market insider trades from Finnhub.</div>
    </>
  );
}

// ---------- MGMT ----------
function Mgmt({ sym }: { sym: string }) {
  const st = useData(`mgmt:${sym}`, async () => {
    const p = await profile(sym);
    const f4 = p.data.filings.filter((f) => /^[34]$/.test(f.form)).slice(0, 40);
    const docs = await Promise.allSettled(f4.map((f) => up<string>('secwww', `/Archives/edgar/data/${p.data.cik}/${f.accession.replace(/-/g, '')}/${f.primaryDoc.split('/').pop()}`, undefined, { text: true, maxAgeMs: 30 * 86_400_000, priority: 2 })));
    const people = new Map<string, { roles: Set<string>; last: string }>();
    docs.forEach((r, i) => {
      if (r.status !== 'fulfilled') return;
      const x = r.value.data;
      for (const m of x.matchAll(/<reportingOwner>([\s\S]*?)<\/reportingOwner>/g)) {
        const b = m[1]!;
        const name = /<rptOwnerName>\s*([^<]+)/.exec(b)?.[1]?.trim();
        if (!name) continue;
        const e = people.get(name) ?? { roles: new Set<string>(), last: '' };
        if (/<isDirector>\s*(1|true)/i.test(b)) e.roles.add('Director');
        const t = /<officerTitle>\s*([^<]+)/.exec(b)?.[1]?.trim();
        if (t) e.roles.add(t);
        if (/<isTenPercentOwner>\s*(1|true)/i.test(b)) e.roles.add('10% owner');
        e.last = e.last > f4[i]!.filed ? e.last : f4[i]!.filed;
        people.set(name, e);
      }
    });
    return { data: [...people.entries()].map(([name, e]) => ({ name, roles: [...e.roles].join(', ') || 'Other', last: e.last })).sort((a, b) => b.last.localeCompare(a.last)), fetchedAt: p.fetchedAt, fromCache: false };
  }, { source: 'SEC Forms 3 and 4' });
  return (
    <>
      <DataStatus state={st} />
      <table className="grid-table">
        <thead><tr><th>Name</th><th>Role (as filed)</th><th>Latest Form 3/4</th></tr></thead>
        <tbody>{(st.data ?? []).map((p) => <tr key={p.name}><td>{p.name}</td><td>{p.roles}</td><td className="muted">{p.last}</td></tr>)}</tbody>
      </table>
      <div className="disclaimer">Built from the last 40 insider ownership filings, so it lists people who filed recently. For the full board and pay, see the latest DEF 14A proxy in CF.</div>
    </>
  );
}

// ---------- ANR and EE (LIMITED) ----------
function Anr({ sym }: { sym: string }) {
  const st = useData(`anr:${sym}`, () => fh.recommendations(sym), { source: 'Finnhub' });
  const rows = st.data ?? [];
  return (
    <>
      <DataStatus state={st} keyName="Finnhub" empty={rows.length === 0} />
      <table className="grid-table">
        <thead><tr><th>Month</th><th className="num up">Strong buy</th><th className="num up">Buy</th><th className="num">Hold</th><th className="num down">Sell</th><th className="num down">Strong sell</th><th>Mix</th></tr></thead>
        <tbody>
          {rows.slice(0, 12).map((r) => {
            const tot = r.strongBuy + r.buy + r.hold + r.sell + r.strongSell || 1;
            return (
              <tr key={r.period}>
                <td>{r.period}</td><td className="num">{r.strongBuy}</td><td className="num">{r.buy}</td><td className="num">{r.hold}</td><td className="num">{r.sell}</td><td className="num">{r.strongSell}</td>
                <td><div style={{ display: 'flex', width: 140, height: 10 }}>{[[r.strongBuy + r.buy, 'var(--up)'], [r.hold, 'var(--text-dim)'], [r.sell + r.strongSell, 'var(--down)']].map(([n, c], i) => <div key={i} style={{ width: `${((n as number) / tot) * 100}%`, background: c as string }} />)}</div></td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="disclaimer">LIMITED: monthly recommendation counts from Finnhub&apos;s free tier. Price targets and individual broker notes need paid data. Analyst ratings lean positive by design.</div>
    </>
  );
}

function Ee({ sym }: { sym: string }) {
  const st = useData(`ee:${sym}`, async () => {
    const cal = await fh.earningsCalendar(90);
    return { ...cal, data: cal.data.earningsCalendar.filter((r) => r.symbol === sym) };
  }, { source: 'Finnhub' });
  return (
    <>
      <DataStatus state={st} keyName="Finnhub" />
      {(st.data ?? []).length === 0 && st.data && <p className="muted">No scheduled report in the next 90 days in Finnhub&apos;s free calendar.</p>}
      <table className="grid-table"><tbody>{(st.data ?? []).map((r) => <tr key={r.date}><td>{r.date}</td><td>{r.hour === 'bmo' ? 'Before open' : r.hour === 'amc' ? 'After close' : ''}</td><td>EPS est {fmt(r.epsEstimate)}</td><td>Revenue est ${fmtBig(r.revenueEstimate)}</td></tr>)}</tbody></table>
      <div className="disclaimer">LIMITED: next-quarter consensus from Finnhub&apos;s free earnings calendar. Full multi-year estimates and revision history need paid data; a daily snapshot job will build revision history from its first run forward (no back history).</div>
    </>
  );
}

export default function EquityTools({ code, security, run }: PanelProps) {
  const sym = (security ?? 'AAPL').toUpperCase();
  const body = (() => {
    switch (code) {
      case 'DCF': return <Dcf sym={sym} />;
      case 'DIL': return <Dil sym={sym} />;
      case 'RV': return <Rv sym={sym} run={run} />;
      case 'ESH': return <Esh sym={sym} />;
      case 'PEAD': return <Pead sym={sym} />;
      case 'OWN': return <Own sym={sym} run={run} />;
      case 'EVTS': return <Evts sym={sym} />;
      case 'MGMT': return <Mgmt sym={sym} />;
      case 'ANR': return <Anr sym={sym} />;
      case 'EE': return <Ee sym={sym} />;
      default: return null;
    }
  })();
  return (
    <div>
      <div className="toolbar"><strong className="accent">{sym}</strong></div>
      {body}
    </div>
  );
}

export { filingUrl };
