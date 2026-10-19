// Screener universe: SEC tickers (NYSE and Nasdaq) + SEC XBRL frames + Massive end-of-day prices.
import { buildRow, type Fund, type Row } from '../../../shared/screener';
import { up, type Fetched } from '../client';
import { tickers } from './sec';

const DAY = 86_400_000;

async function frame(tax: string, tag: string, unit: string, period: string): Promise<Map<number, number>> {
  try {
    const r = await up<{ data: { cik: number; val: number }[] }>('sec', `/api/xbrl/frames/${tax}/${tag}/${unit}/${period}.json`, undefined, { maxAgeMs: DAY, priority: 2 });
    return new Map(r.data.data.map((d) => [d.cik, d.val]));
  } catch {
    return new Map();
  }
}

/** First non-empty value per company across tags (preferred tag first). */
const merge = (maps: Map<number, number>[]) => {
  const out = new Map<number, number>();
  for (const m of maps) for (const [k, v] of m) if (!out.has(k)) out.set(k, v);
  return out;
};

async function yearFunds(y: number) {
  const CY = `CY${y}`;
  const PY = `CY${y - 1}`;
  const I = `CY${y}Q4I`;
  const [rev1, rev2, revP1, revP2, ni, niP, op, ocf, capex, eq, assets, liab, ltd] = await Promise.all([
    frame('us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', CY),
    frame('us-gaap', 'Revenues', 'USD', CY),
    frame('us-gaap', 'RevenueFromContractWithCustomerExcludingAssessedTax', 'USD', PY),
    frame('us-gaap', 'Revenues', 'USD', PY),
    frame('us-gaap', 'NetIncomeLoss', 'USD', CY),
    frame('us-gaap', 'NetIncomeLoss', 'USD', PY),
    frame('us-gaap', 'OperatingIncomeLoss', 'USD', CY),
    frame('us-gaap', 'NetCashProvidedByUsedInOperatingActivities', 'USD', CY),
    frame('us-gaap', 'PaymentsToAcquirePropertyPlantAndEquipment', 'USD', CY),
    frame('us-gaap', 'StockholdersEquity', 'USD', I),
    frame('us-gaap', 'Assets', 'USD', I),
    frame('us-gaap', 'Liabilities', 'USD', I),
    frame('us-gaap', 'LongTermDebtNoncurrent', 'USD', I),
  ]);
  return { rev: merge([rev1, rev2]), revP: merge([revP1, revP2]), ni, niP, op, ocf, capex, eq, assets, liab, ltd };
}

async function latestShares(): Promise<Map<number, number>> {
  const now = new Date();
  const maps: Map<number, number>[] = [];
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1;
  for (let k = 0; k < 4; k++) {
    maps.push(await frame('dei', 'EntityCommonStockSharesOutstanding', 'shares', `CY${y}Q${q}I`));
    q--;
    if (q === 0) {
      q = 4;
      y--;
    }
  }
  return merge(maps);
}

async function prices(): Promise<{ date: string; map: Map<string, { c: number; v: number }> }> {
  for (let back = 1; back <= 7; back++) {
    const d = new Date(Date.now() - back * DAY);
    if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
    const date = d.toISOString().slice(0, 10);
    const r = await up<{ results?: { T: string; c: number; v: number }[]; resultsCount?: number }>('massive', `/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: 'true' }, { maxAgeMs: 6 * 3600_000, priority: 2 });
    if (r.data.results?.length) return { date, map: new Map(r.data.results.map((x) => [x.T, { c: x.c, v: x.v }])) };
  }
  throw new Error('No end-of-day prices found for the last week');
}

export async function screenerUniverse(): Promise<Fetched<{ rows: Row[]; priceDate: string; year: number }>> {
  const y = new Date().getUTCFullYear() - 1;
  const [list, cur, prev, shares, px] = await Promise.all([tickers(), yearFunds(y), yearFunds(y - 1), latestShares(), prices()]);
  const pick = <K extends keyof typeof cur>(k: K, cik: number) => cur[k].get(cik) ?? prev[k].get(cik);
  const rows: Row[] = [];
  for (const t of list) {
    if (!/^(NYSE|Nasdaq)$/.test(t.exchange)) continue;
    const useCur = cur.ni.has(t.cik) || cur.rev.has(t.cik);
    const f: Fund = {
      year: useCur ? String(y) : prev.ni.has(t.cik) ? String(y - 1) : undefined,
      revenue: pick('rev', t.cik),
      revenuePrev: useCur ? cur.revP.get(t.cik) : prev.revP.get(t.cik),
      netIncome: pick('ni', t.cik),
      netIncomePrev: useCur ? cur.niP.get(t.cik) : prev.niP.get(t.cik),
      opIncome: pick('op', t.cik),
      ocf: pick('ocf', t.cik),
      capex: pick('capex', t.cik),
      equity: pick('eq', t.cik),
      assets: pick('assets', t.cik),
      liabilities: pick('liab', t.cik),
      ltDebt: pick('ltd', t.cik),
      shares: shares.get(t.cik),
    };
    rows.push(buildRow(t, f, px.map.get(t.ticker) ?? px.map.get(t.ticker.replace('-', '.'))));
  }
  return { data: { rows, priceDate: px.date, year: y }, fetchedAt: Date.now(), fromCache: false };
}
