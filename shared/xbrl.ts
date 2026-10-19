// SEC XBRL company facts to financial statements (FA). Uses the SEC "frame" field, which assigns
// each fact to one calendar period and removes duplicates across filings.
// Annual flows: frame CY2023. Quarterly flows: CY2023Q2. Balance sheet instants: CY2023Q4I.

export interface Fact { end: string; val: number; fy: number; fp: string; form: string; filed: string; frame?: string; start?: string }
export type Facts = Record<string, Record<string, { label: string; units: Record<string, Fact[]> }>>;

export type Mode = 'annual' | 'quarterly';
export type Kind = 'flow' | 'instant';

export interface LineDef {
  label: string;
  tags: string[];
  kind: Kind;
  unit?: 'USD' | 'USD/shares' | 'shares';
}

export const STATEMENTS: Record<'income' | 'balance' | 'cashflow', LineDef[]> = {
  income: [
    { label: 'Revenue', tags: ['RevenueFromContractWithCustomerExcludingAssessedTax', 'Revenues', 'SalesRevenueNet', 'RevenueFromContractWithCustomerIncludingAssessedTax'], kind: 'flow' },
    { label: 'Cost of revenue', tags: ['CostOfGoodsAndServicesSold', 'CostOfRevenue', 'CostOfGoodsSold'], kind: 'flow' },
    { label: 'Gross profit', tags: ['GrossProfit'], kind: 'flow' },
    { label: 'R&D', tags: ['ResearchAndDevelopmentExpense'], kind: 'flow' },
    { label: 'SG&A', tags: ['SellingGeneralAndAdministrativeExpense'], kind: 'flow' },
    { label: 'Operating income', tags: ['OperatingIncomeLoss'], kind: 'flow' },
    { label: 'Net income', tags: ['NetIncomeLoss', 'ProfitLoss'], kind: 'flow' },
    { label: 'EPS diluted', tags: ['EarningsPerShareDiluted'], kind: 'flow', unit: 'USD/shares' },
    { label: 'Diluted shares', tags: ['WeightedAverageNumberOfDilutedSharesOutstanding'], kind: 'flow', unit: 'shares' },
  ],
  balance: [
    { label: 'Cash and equivalents', tags: ['CashAndCashEquivalentsAtCarryingValue', 'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents'], kind: 'instant' },
    { label: 'Current assets', tags: ['AssetsCurrent'], kind: 'instant' },
    { label: 'Total assets', tags: ['Assets'], kind: 'instant' },
    { label: 'Current liabilities', tags: ['LiabilitiesCurrent'], kind: 'instant' },
    { label: 'Long-term debt', tags: ['LongTermDebtNoncurrent', 'LongTermDebt'], kind: 'instant' },
    { label: 'Total liabilities', tags: ['Liabilities'], kind: 'instant' },
    { label: 'Shareholders equity', tags: ['StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest'], kind: 'instant' },
  ],
  cashflow: [
    { label: 'Operating cash flow', tags: ['NetCashProvidedByUsedInOperatingActivities'], kind: 'flow' },
    { label: 'Capital expenditure', tags: ['PaymentsToAcquirePropertyPlantAndEquipment'], kind: 'flow' },
    { label: 'Buybacks', tags: ['PaymentsForRepurchaseOfCommonStock'], kind: 'flow' },
    { label: 'Dividends paid', tags: ['PaymentsOfDividends', 'PaymentsOfDividendsCommonStock'], kind: 'flow' },
    { label: 'Stock-based comp', tags: ['ShareBasedCompensation'], kind: 'flow' },
  ],
};

function frameRe(mode: Mode, kind: Kind): RegExp {
  if (kind === 'instant') return mode === 'annual' ? /^CY(\d{4})Q4I$/ : /^CY(\d{4}Q[1-4])I$/;
  return mode === 'annual' ? /^CY(\d{4})$/ : /^CY(\d{4}Q[1-4])$/;
}

/** Values by period label (e.g. "2023" or "2023Q2"). The first tag with data for a period wins. */
export function extract(facts: Facts, def: LineDef, mode: Mode): Map<string, { val: number; tag: string; filed: string; form: string }> {
  const out = new Map<string, { val: number; tag: string; filed: string; form: string }>();
  const re = frameRe(mode, def.kind);
  const gaap = facts['us-gaap'] ?? {};
  for (const tag of def.tags) {
    const list = gaap[tag]?.units?.[def.unit ?? 'USD'] ?? [];
    for (const f of list) {
      const m = f.frame ? re.exec(f.frame) : null;
      if (!m || out.has(m[1]!)) continue;
      out.set(m[1]!, { val: f.val, tag, filed: f.filed, form: f.form });
    }
  }
  return out;
}

export interface Statement {
  periods: string[];
  rows: { label: string; values: (number | null)[]; tag: string | null }[];
}

export function buildStatement(facts: Facts, which: keyof typeof STATEMENTS, mode: Mode, maxPeriods = 8): Statement {
  const defs = STATEMENTS[which];
  const series = defs.map((d) => extract(facts, d, mode));
  const periods = [...new Set(series.flatMap((s) => [...s.keys()]))].sort().slice(-maxPeriods);
  const rows = defs.map((d, i) => ({
    label: d.label,
    values: periods.map((p) => series[i]!.get(p)?.val ?? null),
    tag: [...series[i]!.values()][0]?.tag ?? null,
  }));
  if (which === 'cashflow') {
    const ocf = rows[0]!.values;
    const capex = rows[1]!.values;
    rows.splice(2, 0, { label: 'Free cash flow', values: periods.map((_, i) => (ocf[i] != null && capex[i] != null ? ocf[i]! - capex[i]! : null)), tag: 'computed: OCF minus capex' });
  }
  return { periods, rows };
}
