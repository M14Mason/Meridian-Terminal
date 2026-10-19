import { ALPACA_NOTE, quotes } from '../data/adapters/alpaca';
import { useData } from '../data/useData';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { QuoteTable } from './QuoteTable';

// WEI: world indices built on ETF proxies, labeled as proxies (3.3). Index names are descriptive only.
export const WEI_GROUPS: { region: string; rows: [string, string][] }[] = [
  { region: 'Americas', rows: [['SPY', 'US large cap'], ['QQQ', 'US Nasdaq-100 style'], ['DIA', 'US Dow style'], ['IWM', 'US small cap'], ['EWC', 'Canada'], ['EWZ', 'Brazil'], ['EWW', 'Mexico']] },
  { region: 'Europe', rows: [['VGK', 'Europe broad'], ['EWU', 'UK'], ['EWG', 'Germany'], ['EWQ', 'France'], ['EWI', 'Italy'], ['EWP', 'Spain']] },
  { region: 'Asia Pacific', rows: [['EWJ', 'Japan'], ['FXI', 'China large cap'], ['EWH', 'Hong Kong'], ['EWY', 'South Korea'], ['EWT', 'Taiwan'], ['INDA', 'India'], ['EWA', 'Australia']] },
  { region: 'Rates, credit, commodities', rows: [['TLT', 'US 20y+ Treasuries'], ['HYG', 'US high yield'], ['BKLN', 'Leveraged loans (proxy)'], ['GLD', 'Gold'], ['USO', 'Crude oil'], ['UUP', 'US dollar']] },
];

export default function WeiPanel({ run }: PanelProps) {
  const syms = WEI_GROUPS.flatMap((g) => g.rows.map((r) => r[0]));
  const labels = Object.fromEntries(WEI_GROUPS.flatMap((g) => g.rows));
  const state = useData('wei', () => quotes(syms), { everyMs: 20_000, source: 'Alpaca', note: `ETF proxies, ${ALPACA_NOTE}` });
  return (
    <div>
      <p className="label-proxy">ETF PROXIES. These are exchange-traded funds that track markets, not the official indices. Values are fund prices.</p>
      <DataStatus state={state} keyName="Alpaca" />
      {WEI_GROUPS.map((g) => (
        <section key={g.region}>
          <h3 className="accent" style={{ fontSize: 12, margin: '8px 0 2px' }}>
            {g.region.toUpperCase()}
          </h3>
          <QuoteTable symbols={g.rows.map((r) => r[0])} quotes={state.data} labels={labels} onPick={(s) => run(`${s} GP`)} />
        </section>
      ))}
    </div>
  );
}
