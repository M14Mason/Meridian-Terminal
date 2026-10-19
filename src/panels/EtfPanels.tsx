// ETFH fund holdings (with overlap) and TMAP holdings treemap, from SEC N-PORT.
import { useEffect, useMemo, useRef, useState } from 'react';
import { heatColor, squarify } from '../../shared/heat';
import { ASSET_CAT, overlap } from '../../shared/nport';
import { quotes } from '../data/adapters/alpaca';
import { etfHoldings, type EtfHoldings } from '../data/adapters/etf';
import { useData } from '../data/useData';
import { dir, downloadCsv, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';

const SRC = 'SEC Form N-PORT';

function Breakdown({ rows, title }: { rows: [string, number][]; title: string }) {
  return (
    <table className="grid-table" style={{ flex: 1, minWidth: 180 }}>
      <thead><tr><th>{title}</th><th className="num">Weight</th></tr></thead>
      <tbody>{rows.slice(0, 8).map(([k, v]) => <tr key={k}><td>{k}</td><td className="num">{fmt(v, 2)}%</td></tr>)}</tbody>
    </table>
  );
}

function Etfh({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData(`etfh:${sym}`, () => etfHoldings(sym), { source: SRC, everyMs: 12 * 3600_000 });
  const [other, setOther] = useState('');
  const [cmp, setCmp] = useState('');
  const ov = useData(cmp ? `etfh:${cmp}` : null, () => etfHoldings(cmp), { source: SRC });
  const d = st.data;
  const groups = useMemo(() => {
    if (!d) return null;
    const by = (f: (h: EtfHoldings['holdings'][number]) => string) => {
      const m = new Map<string, number>();
      d.holdings.forEach((h) => m.set(f(h) || 'n/a', (m.get(f(h) || 'n/a') ?? 0) + h.pct));
      return [...m].sort((a, b) => b[1] - a[1]);
    };
    return { cat: by((h) => ASSET_CAT[h.cat] ?? h.cat), country: by((h) => h.country) };
  }, [d]);
  const o = useMemo(() => (d && ov.data ? overlap(d.holdings, ov.data.holdings) : null), [d, ov.data]);
  const top10 = d ? d.holdings.slice(0, 10).reduce((a, h) => a + h.pct, 0) : 0;
  return (
    <>
      <DataStatus state={st} />
      {d && (
        <>
          <p>
            <strong className="accent">{d.symbol}</strong> holdings as of <strong>{d.period}</strong> (filed {d.filed}). Net assets {fmtBig(d.netAssets)}
            {d.prev && <> vs {fmtBig(d.prev.netAssets)} at {d.prev.period} (<span className={dir(d.netAssets - d.prev.netAssets)}>{fmtPct((d.netAssets / d.prev.netAssets - 1) * 100, 1)}</span>, flows plus performance)</>}. {d.holdings.length} positions, top 10 = {fmt(top10, 1)}%.{' '}
            <a href={d.url} target="_blank" rel="noreferrer noopener">Filing</a>
          </p>
          {groups && <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'flex-start' }}><Breakdown rows={groups.cat} title="Asset type" /><Breakdown rows={groups.country} title="Country" /></div>}
          <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setCmp(other.trim().toUpperCase()); }}>
            <span className="muted">Overlap with</span><input value={other} onChange={(e) => setOther(e.target.value)} placeholder="QQQ" style={{ width: 70 }} /><button type="submit">COMPARE</button>
            <button type="button" onClick={() => downloadCsv(`${d.symbol}-holdings.csv`, [['name', 'ticker', 'cusip', 'weight_pct', 'value_usd', 'type', 'country'], ...d.holdings.map((h, i) => [h.name, d.tickers[i] ?? '', h.cusip, h.pct, h.value, h.cat, h.country])])}>CSV</button>
          </form>
          {cmp && <DataStatus state={ov} />}
          {o && <p>Weight overlap {d.symbol} / {cmp}: <strong className="accent">{fmt(o.pct, 1)}%</strong> across {o.common.length} common holdings. Top shared: {o.common.slice(0, 6).map((c) => c.name).join(', ')}.</p>}
          <table className="grid-table">
            <thead><tr><th>#</th><th>Holding</th><th>Ticker</th><th className="num">Weight</th><th className="num">Value</th><th>Type</th></tr></thead>
            <tbody>{d.holdings.slice(0, 200).map((h, i) => { const t = d.tickers[i]; return <tr key={`${h.cusip}${i}`}><td>{i + 1}</td><td>{h.name}</td><td>{t ? <button className="link-btn" onClick={() => run(`${t} DES`)}>{t}</button> : '-'}</td><td className="num">{fmt(h.pct, 2)}%</td><td className="num">{fmtBig(h.value)}</td><td className="muted">{h.cat}</td></tr>; })}</tbody>
          </table>
        </>
      )}
      <div className="disclaimer">Source: SEC Form N-PORT, quarter-end holdings made public about 60 days later, so they can be months old. Tickers are matched from names and can be wrong. Unit investment trusts such as SPY and DIA do not file N-PORT; IVV and VOO track the same index.</div>
    </>
  );
}

function Tmap({ sym, run }: { sym: string; run: PanelProps['run'] }) {
  const st = useData(`etfh:${sym}`, () => etfHoldings(sym), { source: SRC, everyMs: 12 * 3600_000 });
  const top = useMemo(() => (st.data ? st.data.holdings.map((h, i) => ({ h, t: st.data!.tickers[i] })).filter((x) => x.h.pct > 0).slice(0, 100) : []), [st.data]);
  const syms = useMemo(() => [...new Set(top.map((x) => x.t).filter((t): t is string => Boolean(t)))], [top]);
  const q = useData(syms.length ? `tmap:q:${sym}` : null, () => quotes(syms), { source: 'Alpaca quotes', everyMs: 60_000 });
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = Math.max(260, Math.round(w * 0.6));
  const rects = squarify(top.map((x) => ({ value: x.h.pct, data: x })), { x: 0, y: 0, w, h });
  return (
    <div>
      <DataStatus state={st} />
      {st.data && <p className="muted">{sym}: top {top.length} holdings by weight as of {st.data.period}, colored by today&apos;s change.</p>}
      <div ref={box}>
        <svg width={w} height={h} role="img" aria-label={`${sym} holdings treemap`}>
          {rects.map((r) => {
            const t = r.data.t;
            const ch = t ? q.data?.[t]?.changePct ?? null : null;
            const label = t ?? r.data.h.name;
            return (
              <g key={`${r.data.h.cusip}${label}`} style={{ cursor: t ? 'pointer' : 'default' }} onClick={() => t && run(`${t} DES`)}>
                <rect x={r.x} y={r.y} width={r.w} height={r.h} fill={ch == null ? '#2a2a2a' : heatColor(Math.max(-1, Math.min(1, ch / 4)))} stroke="#000" strokeWidth={1} />
                <title>{`${r.data.h.name}${t ? ` (${t})` : ''}: ${fmt(r.data.h.pct, 2)}% weight${ch != null ? `, ${fmtPct(ch)} today` : ''}`}</title>
                {r.w > 34 && r.h > 22 && (
                  <>
                    <text x={r.x + 3} y={r.y + 13} fill="#f0f0f0" fontSize={11}>{label.slice(0, Math.max(3, Math.floor(r.w / 7)))}</text>
                    {r.h > 34 && <text x={r.x + 3} y={r.y + 26} fill="#f0f0f0" fontSize={10} opacity={0.85}>{ch == null ? `${fmt(r.data.h.pct, 1)}%` : fmtPct(ch)}</text>}
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div className="disclaimer">Weights from the latest public N-PORT filing (quarter end), not today&apos;s weights. Grey = no matched ticker or no quote. Color saturates at plus or minus 4%.</div>
    </div>
  );
}

export default function EtfPanels({ code, security, run }: PanelProps) {
  const sym = (security ?? 'IVV').toUpperCase();
  return <div>{code === 'TMAP' ? <Tmap sym={sym} run={run} /> : <Etfh sym={sym} run={run} />}</div>;
}
