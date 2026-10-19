// Equity screener (EQS) on SEC XBRL frames plus end-of-day prices. Pure logic, tested.

export interface Fund {
  revenue?: number; revenuePrev?: number; netIncome?: number; netIncomePrev?: number; opIncome?: number;
  ocf?: number; capex?: number; equity?: number; assets?: number; liabilities?: number; ltDebt?: number; shares?: number; year?: string;
}

export interface Row {
  ticker: string; name: string; exchange: string; cik: number; price: number | null; volume: number | null;
  mcap: number | null; pe: number | null; ps: number | null; pb: number | null; netMargin: number | null; opMargin: number | null;
  roe: number | null; de: number | null; revGrowth: number | null; epsGrowth: number | null; fcfYield: number | null; revenue: number | null; year: string | null;
}

const div = (a?: number | null, b?: number | null) => (a != null && b != null && b !== 0 && Number.isFinite(a) && Number.isFinite(b) ? a / b : null);

export function buildRow(t: { ticker: string; name: string; exchange: string; cik: number }, f: Fund | undefined, px: { c: number; v: number } | undefined): Row {
  const price = px?.c ?? null;
  const mcap = price != null && f?.shares ? price * f.shares : null;
  const posEq = f?.equity != null && f.equity > 0 ? f.equity : null;
  const fcf = f?.ocf != null && f.capex != null ? f.ocf - f.capex : null;
  return {
    ticker: t.ticker, name: t.name, exchange: t.exchange, cik: t.cik, price, volume: px?.v ?? null,
    mcap,
    pe: f?.netIncome != null && f.netIncome > 0 ? div(mcap, f.netIncome) : null,
    ps: div(mcap, f?.revenue),
    pb: div(mcap, posEq),
    netMargin: div(f?.netIncome, f?.revenue),
    opMargin: div(f?.opIncome, f?.revenue),
    roe: div(f?.netIncome, posEq),
    de: div(f?.ltDebt ?? 0, posEq),
    revGrowth: f?.revenue != null && f.revenuePrev ? f.revenue / f.revenuePrev - 1 : null,
    epsGrowth: f?.netIncome != null && f.netIncomePrev != null && f.netIncomePrev > 0 ? f.netIncome / f.netIncomePrev - 1 : null,
    fcfYield: div(fcf, mcap),
    revenue: f?.revenue ?? null,
    year: f?.year ?? null,
  };
}

export type FieldKey = Exclude<keyof Row, 'ticker' | 'name' | 'exchange' | 'cik' | 'year'>;
export const FIELDS: { key: FieldKey; label: string; kind: 'money' | 'ratio' | 'pct' | 'num' }[] = [
  { key: 'mcap', label: 'Market cap', kind: 'money' },
  { key: 'price', label: 'Price', kind: 'num' },
  { key: 'pe', label: 'P/E', kind: 'ratio' },
  { key: 'ps', label: 'P/S', kind: 'ratio' },
  { key: 'pb', label: 'P/B', kind: 'ratio' },
  { key: 'fcfYield', label: 'FCF yield', kind: 'pct' },
  { key: 'netMargin', label: 'Net margin', kind: 'pct' },
  { key: 'opMargin', label: 'Operating margin', kind: 'pct' },
  { key: 'roe', label: 'ROE', kind: 'pct' },
  { key: 'de', label: 'Debt / equity', kind: 'ratio' },
  { key: 'revGrowth', label: 'Revenue growth', kind: 'pct' },
  { key: 'epsGrowth', label: 'Earnings growth', kind: 'pct' },
  { key: 'revenue', label: 'Revenue', kind: 'money' },
  { key: 'volume', label: 'Volume', kind: 'num' },
];

export interface Filter { field: FieldKey; op: '>' | '<'; value: number }

/** Percent fields are entered as percents (15 = 15%). */
export function passes(r: Row, f: Filter): boolean {
  const v = r[f.field];
  if (v == null) return false;
  const kind = FIELDS.find((x) => x.key === f.field)!.kind;
  const target = kind === 'pct' ? f.value / 100 : kind === 'money' ? f.value * 1e6 : f.value;
  return f.op === '>' ? v > target : v < target;
}

export function screen(rows: Row[], filters: Filter[], sort: FieldKey, desc = true, limit = 300): Row[] {
  return rows
    .filter((r) => filters.every((f) => passes(r, f)))
    .sort((a, b) => {
      const x = a[sort];
      const y = b[sort];
      if (x == null) return 1;
      if (y == null) return -1;
      return desc ? y - x : x - y;
    })
    .slice(0, limit);
}

export const PRESETS: { name: string; filters: Filter[]; sort: FieldKey; desc: boolean; note: string }[] = [
  { name: 'Value', filters: [{ field: 'mcap', op: '>', value: 2000 }, { field: 'pe', op: '<', value: 15 }, { field: 'pb', op: '<', value: 2 }, { field: 'roe', op: '>', value: 10 }], sort: 'pe', desc: false, note: 'Cheap on earnings and book, still profitable.' },
  { name: 'Quality', filters: [{ field: 'mcap', op: '>', value: 5000 }, { field: 'roe', op: '>', value: 20 }, { field: 'netMargin', op: '>', value: 15 }, { field: 'de', op: '<', value: 1 }], sort: 'roe', desc: true, note: 'High returns on equity, fat margins, modest debt.' },
  { name: 'Growth', filters: [{ field: 'mcap', op: '>', value: 1000 }, { field: 'revGrowth', op: '>', value: 25 }, { field: 'opMargin', op: '>', value: 0 }], sort: 'revGrowth', desc: true, note: 'Revenue up 25%+ and operating profitably.' },
  { name: 'Cash cows', filters: [{ field: 'mcap', op: '>', value: 2000 }, { field: 'fcfYield', op: '>', value: 8 }], sort: 'fcfYield', desc: true, note: 'Free cash flow at least 8% of market value.' },
  { name: 'Mega caps', filters: [{ field: 'mcap', op: '>', value: 200000 }], sort: 'mcap', desc: true, note: 'Companies worth $200B or more.' },
];
