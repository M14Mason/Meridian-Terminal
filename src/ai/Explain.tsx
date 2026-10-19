// AI on every panel (16.4, learn mode 119). ANALYZE (Sonnet) reads the panel's raw datasets, code-computed
// technicals and, for a ticker, key fundamentals; EXPLAIN (Haiku) just describes what the panel shows.
// Both send only data the app already has; the model never fetches anything itself.
import { useState } from 'react';
import { estimateUsd } from '../../shared/ai';
import { dataDigest, findBars, techDigest } from '../../shared/digest';
import { bars as alpacaBars, startFor } from '../data/adapters/alpaca';
import * as fh from '../data/adapters/finnhub';
import type { PanelData, PanelMeta } from '../shell/panelMeta';
import { AiBlock, List } from './AiBlock';
import { askAi, type AiReply } from './client';

interface Ex { summary: string; points: string[]; watch: string }
interface An {
  takeaway: string; stance: string; summary: string;
  signals: { what: string; read: 'bullish' | 'bearish' | 'neutral'; why: string }[];
  implications: string[]; risks: string[]; watch: string[]; confidence: string; gaps: string;
}
type Mode = 'analyze' | 'explain';

const FUNDAMENTALS: [string, string][] = [
  ['peTTM', 'P/E (TTM)'], ['forwardPE', 'Forward P/E'], ['psTTM', 'P/S (TTM)'], ['pbQuarterly', 'P/B'], ['epsGrowthTTMYoy', 'EPS growth TTM YoY %'],
  ['revenueGrowthTTMYoy', 'Revenue growth TTM YoY %'], ['revenueGrowth5Y', 'Revenue growth 5Y %'], ['grossMarginTTM', 'Gross margin %'], ['operatingMarginTTM', 'Operating margin %'],
  ['netProfitMarginTTM', 'Net margin %'], ['roeTTM', 'ROE %'], ['roiTTM', 'ROI %'], ['totalDebt/totalEquityQuarterly', 'Debt/equity'], ['currentRatioQuarterly', 'Current ratio'],
  ['fcfMargin', 'FCF margin %'], ['dividendYieldIndicatedAnnual', 'Dividend yield %'], ['beta', 'Beta'], ['marketCapitalization', 'Market cap ($M)'], ['52WeekHigh', '52w high'], ['52WeekLow', '52w low'],
];

/** Ticker context for ANALYZE: daily technicals (unless the panel already has bars) and Finnhub fundamentals. */
async function tickerContext(sym: string, panelHasBars: boolean): Promise<string> {
  if (!/^[A-Z][A-Z.]{0,6}$/.test(sym)) return '';
  const [b, m] = await Promise.all([panelHasBars ? null : alpacaBars(sym, '1Day', startFor(420)).catch(() => null), fh.metrics(sym).catch(() => null)]);
  const out: string[] = [];
  if (b && b.data.length > 30) out.push(techDigest(b.data, `${sym} DAILY BARS (Alpaca IEX)`));
  const mm = m?.data.metric ?? {};
  const f = FUNDAMENTALS.filter(([k]) => mm[k] != null).map(([k, l]) => `${l}: ${typeof mm[k] === 'number' ? Math.round((mm[k] as number) * 100) / 100 : mm[k]}`);
  if (f.length) out.push(`${sym} FUNDAMENTALS (Finnhub, TTM unless noted): ${f.join('; ')}`);
  return out.join('\n');
}

const readCls = (r: string) => (r === 'bullish' ? 'up' : r === 'bearish' ? 'down' : 'muted');

export function Explain({ getBody, getData, title, description, code, security, meta, onClose }: { getBody: () => HTMLElement | null; getData?: () => PanelData | null; title: string; description: string; code: string; security?: string; meta: PanelMeta | null; onClose: () => void }) {
  const [mode, setMode] = useState<Mode>('analyze');
  const [state, setState] = useState<{ ex?: AiReply<Ex>; an?: AiReply<An>; err?: string; busy: boolean }>({ busy: false });

  const screenText = (max: number) => {
    const el = getBody();
    // Panel text without this dialog's own text.
    const parts = el ? [...el.children].filter((c) => !c.classList.contains('explain')).map((c) => (c as HTMLElement).innerText) : [];
    return parts.join('\n').replace(/\n{3,}/g, '\n\n').slice(0, max);
  };
  const header = () => [
    `PANEL: ${code}${security ? ` for ${security}` : ''}: ${title}. ${description}`,
    meta ? `SOURCE: ${meta.source}${meta.note ? ` (${meta.note})` : ''}; data as of ${meta.fetchedAt ? new Date(meta.fetchedAt).toISOString() : 'unknown'}` : 'SOURCE: see panel text',
    `NOW: ${new Date().toISOString()}`,
  ].join('\n');

  const run = async (m: Mode, fresh = false) => {
    setState((s) => ({ ...s, busy: true, err: undefined }));
    try {
      if (m === 'explain') {
        const ex = await askAi<Ex>('explain', `${header()}\nVISIBLE CONTENT:\n${screenText(7500)}`, fresh);
        setState((s) => ({ ...s, ex, busy: false }));
        return;
      }
      const sets = [...(getData?.()?.values() ?? [])].map((d) => ({ source: d.source, data: d.data }));
      const hasBars = sets.some((d) => findBars(d.data).length > 0);
      const ctx = security ? await tickerContext(security.toUpperCase(), hasBars) : '';
      const input = [
        header(),
        ctx && `TICKER CONTEXT:\n${ctx}`,
        sets.length ? `PANEL DATASETS:\n${dataDigest(sets, 17000)}` : 'PANEL DATASETS: none reported (use the visible content).',
        `VISIBLE CONTENT:\n${screenText(6000)}`,
      ].filter(Boolean).join('\n\n').slice(0, 31500);
      const an = await askAi<An>('analyze', input, fresh);
      setState((s) => ({ ...s, an, busy: false }));
    } catch (e) {
      setState((s) => ({ ...s, err: e instanceof Error ? e.message : 'failed', busy: false }));
    }
  };

  const have = mode === 'analyze' ? state.an : state.ex;
  const cost = mode === 'analyze' ? estimateUsd('analyze', 24000) : estimateUsd('explain', 7500);
  const ex = state.ex?.result;
  const an = state.an?.result;
  return (
    <div className="explain" role="dialog" aria-label="AI on this panel">
      <div className="toolbar">
        <button aria-pressed={mode === 'analyze'} onClick={() => setMode('analyze')}>ANALYZE</button>
        <button aria-pressed={mode === 'explain'} onClick={() => setMode('explain')}>EXPLAIN</button>
        <strong className="accent">{code}{security ? ` ${security}` : ''}</strong>
        {!have && <button disabled={state.busy} onClick={() => void run(mode)}>{state.busy ? 'THINKING...' : `RUN (about $${cost < 0.01 ? cost.toFixed(3) : cost.toFixed(2)})`}</button>}
        {have && <button disabled={state.busy} onClick={() => void run(mode, true)}>{state.busy ? 'THINKING...' : 'REFRESH'}</button>}
        <button onClick={onClose} aria-label="Close AI box">×</button>
      </div>
      {state.err && <p className="down">{state.err}</p>}
      {mode === 'explain' && state.ex && ex && (
        <AiBlock reply={state.ex}>
          <p>{ex.summary}</p>
          <List title="WHAT STANDS OUT" items={ex.points} />
          <p><span className="accent">Watch:</span> {ex.watch}</p>
        </AiBlock>
      )}
      {mode === 'analyze' && state.an && an && (
        <AiBlock reply={state.an}>
          <p><span className={`badge ${readCls(an.stance)}`}>{an.stance.toUpperCase()}</span> <strong>{an.takeaway}</strong> <span className="muted">confidence {an.confidence}</span></p>
          <p>{an.summary}</p>
          <table className="grid-table"><tbody>{an.signals.map((s, i) => <tr key={i}><td className={readCls(s.read)} style={{ whiteSpace: 'nowrap' }}>{s.read === 'bullish' ? '▲' : s.read === 'bearish' ? '▼' : '•'} {s.read}</td><td style={{ whiteSpace: 'normal' }}><strong>{s.what}</strong> <span className="muted">{s.why}</span></td></tr>)}</tbody></table>
          <List title="WHAT IT COULD AFFECT" items={an.implications} />
          <List title="RISKS" items={an.risks} />
          <List title="WATCH" items={an.watch} />
          {an.gaps && <p className="muted">Data gaps: {an.gaps}</p>}
        </AiBlock>
      )}
      {!have && !state.err && (
        <p className="muted">
          {mode === 'analyze'
            ? `Claude Sonnet analyzes everything this panel loaded (raw data, code-computed RSI/MACD/moving averages when there are prices${security ? `, plus ${security} daily technicals and fundamentals` : ''}) and the screen text. Cached 30 minutes per input.`
            : 'Claude Haiku explains what this panel shows, from its visible text. Cached 6 hours.'}
        </p>
      )}
    </div>
  );
}
