// EQS: equity screener across NYSE and Nasdaq (SEC XBRL frames + end-of-day prices).
import { useMemo, useState } from 'react';
import { FIELDS, PRESETS, screen, type FieldKey, type Filter, type Row } from '../../shared/screener';
import { screenerUniverse } from '../data/adapters/universe';
import { useData } from '../data/useData';
import { downloadCsv, fmt, fmtBig, fmtPct } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { sync, useCollection } from '../state/sync';

interface Saved { name: string; filters: Filter[]; sort: FieldKey; desc: boolean }

const show = (r: Row, k: FieldKey) => {
  const v = r[k];
  const kind = FIELDS.find((f) => f.key === k)!.kind;
  if (v == null) return '-';
  return kind === 'pct' ? fmtPct(v * 100, 1) : kind === 'money' ? fmtBig(v) : kind === 'ratio' ? fmt(v, 1) : k === 'volume' ? fmtBig(v) : fmt(v);
};

export default function ScreenerPanel({ run }: PanelProps) {
  const st = useData('eqs:universe', screenerUniverse, { source: 'SEC XBRL frames, Massive EOD', everyMs: 6 * 3600_000 });
  const [filters, setFilters] = useState<Filter[]>(PRESETS[0]!.filters);
  const [sort, setSort] = useState<FieldKey>(PRESETS[0]!.sort);
  const [desc, setDesc] = useState(PRESETS[0]!.desc);
  const [preset, setPreset] = useState(PRESETS[0]!.name);
  const saved = useCollection<Saved>('screens').filter((s) => s.id.startsWith('eqs:'));
  const rows = useMemo(() => (st.data ? screen(st.data.rows, filters, sort, desc) : []), [st.data, filters, sort, desc]);
  const cols: FieldKey[] = ['mcap', 'price', 'pe', 'ps', 'pb', 'fcfYield', 'netMargin', 'roe', 'de', 'revGrowth'];
  const load = (s: { name: string; filters: Filter[]; sort: FieldKey; desc: boolean }) => {
    setFilters(s.filters);
    setSort(s.sort);
    setDesc(s.desc);
    setPreset(s.name);
  };
  return (
    <div>
      <div className="toolbar">
        {PRESETS.map((p) => <button key={p.name} aria-pressed={preset === p.name} onClick={() => load(p)} title={p.note}>{p.name.toUpperCase()}</button>)}
        {saved.map((s) => <button key={s.id} aria-pressed={preset === s.value.name} onClick={() => load(s.value)}>★ {s.value.name}</button>)}
      </div>
      <div className="toolbar">
        {filters.map((f, i) => (
          <span key={i} className="row" style={{ gap: 2 }}>
            <select value={f.field} onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, field: e.target.value as FieldKey } : x)))}>{FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
            <select value={f.op} onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, op: e.target.value as '>' | '<' } : x)))}><option value=">">&gt;</option><option value="<">&lt;</option></select>
            <input type="number" value={f.value} onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, value: Number(e.target.value) } : x)))} style={{ width: 70 }} aria-label="Value" />
            <button className="link-btn down" onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))} aria-label="Remove filter">×</button>
          </span>
        ))}
        <button onClick={() => setFilters((fs) => [...fs, { field: 'mcap', op: '>', value: 1000 }])}>+ FILTER</button>
        <span className="muted">sort</span>
        <select value={sort} onChange={(e) => setSort(e.target.value as FieldKey)}>{FIELDS.map((x) => <option key={x.key} value={x.key}>{x.label}</option>)}</select>
        <button onClick={() => setDesc((d) => !d)}>{desc ? 'HIGH FIRST' : 'LOW FIRST'}</button>
        <button onClick={() => { const name = window.prompt('Save screen as:'); if (name?.trim()) void sync.put('screens', `eqs:${name.trim().slice(0, 30)}`, { name: name.trim().slice(0, 30), filters, sort, desc }); }}>SAVE</button>
        <button disabled={!rows.length} onClick={() => downloadCsv('screen.csv', [['ticker', 'name', ...cols], ...rows.map((r) => [r.ticker, r.name, ...cols.map((c) => r[c])])])}>CSV</button>
      </div>
      <p className="muted">Units: market cap and revenue in $ millions; percent fields in %. {st.data && `${rows.length} matches of ${st.data.rows.length} NYSE and Nasdaq listings. Prices ${st.data.priceDate}; fundamentals fiscal ${st.data.year} (or ${st.data.year - 1} when newer is not filed).`}</p>
      <DataStatus state={st} keyName="Massive" />
      <table className="grid-table">
        <thead><tr><th>Ticker</th><th>Name</th>{cols.map((c) => <th key={c} className="num" style={{ cursor: 'pointer' }} onClick={() => (sort === c ? setDesc((d) => !d) : setSort(c))}>{FIELDS.find((f) => f.key === c)!.label}{sort === c ? (desc ? ' ▼' : ' ▲') : ''}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.ticker} className="clickable" onClick={() => run(`${r.ticker} DES`)}>
              <td className="accent">{r.ticker}</td>
              <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</td>
              {cols.map((c) => <td key={c} className="num">{show(r, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="disclaimer">Fundamentals: SEC XBRL frames (calendar-aligned annual values, as filed; some companies tag lines differently and drop out). Market cap = end-of-day price x latest reported shares outstanding (multi-class companies can be off). Not financial advice.</div>
    </div>
  );
}
