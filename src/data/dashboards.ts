// FRED dashboard definitions (catalog 70 to 76, 84, partial-route real estate). IDs checked on FRED 2026-10-19.
export interface DashRow { id: string; label: string; units?: 'pc1' | 'chg'; scale?: number; unit: string; dp?: number; note?: string }
export interface Computed { label: string; unit: string; ids: string[]; f: (v: number[]) => number; note: string }
export interface Dash { title: string; groups: { name: string; rows: DashRow[] }[]; computed?: Computed[]; notes?: string }

export const DASHBOARDS: Record<string, Dash> = {
  LIQ: {
    title: 'Fed balance sheet and liquidity',
    groups: [
      { name: 'Fed', rows: [
        { id: 'WALCL', label: 'Fed total assets', scale: 1e-6, unit: '$T', dp: 3 },
        { id: 'WRESBAL', label: 'Bank reserves', scale: 1e-6, unit: '$T', dp: 3 },
        { id: 'RRPONTSYD', label: 'Overnight reverse repo', scale: 1e-3, unit: '$T', dp: 3 },
        { id: 'WTREGEN', label: 'Treasury General Account', scale: 1e-6, unit: '$T', dp: 3 },
        { id: 'M2SL', label: 'M2 money supply YoY', units: 'pc1', unit: '%' },
      ] },
    ],
    computed: [{ label: 'Net liquidity (assets - TGA - RRP)', unit: '$T', ids: ['WALCL', 'WTREGEN', 'RRPONTSYD'], f: ([a, t, r]) => (a! - t!) / 1e6 - r! / 1e3, note: 'A popular market rule of thumb, not an official measure.' }],
  },
  CPIB: {
    title: 'CPI breakdown (year over year)',
    groups: [
      { name: 'Headline and core', rows: [{ id: 'CPIAUCSL', label: 'All items', units: 'pc1', unit: '%' }, { id: 'CPILFESL', label: 'Core (ex food and energy)', units: 'pc1', unit: '%' }] },
      { name: 'Components', rows: [
        { id: 'CUSR0000SAH1', label: 'Shelter', units: 'pc1', unit: '%' },
        { id: 'CUSR0000SAS', label: 'Services', units: 'pc1', unit: '%' },
        { id: 'CUSR0000SACL1E', label: 'Core goods', units: 'pc1', unit: '%' },
        { id: 'CPIUFDSL', label: 'Food', units: 'pc1', unit: '%' },
        { id: 'CPIENGSL', label: 'Energy', units: 'pc1', unit: '%' },
        { id: 'CPIMEDSL', label: 'Medical care', units: 'pc1', unit: '%' },
        { id: 'CUSR0000SAT1', label: 'Transportation', units: 'pc1', unit: '%' },
        { id: 'CUSR0000SETA02', label: 'Used cars', units: 'pc1', unit: '%' },
      ] },
    ],
  },
  JOBS: {
    title: 'Jobs report drilldown',
    groups: [
      { name: 'Headline', rows: [
        { id: 'PAYEMS', label: 'Payrolls change', units: 'chg', unit: 'k', dp: 0 },
        { id: 'UNRATE', label: 'Unemployment rate', unit: '%' },
        { id: 'U6RATE', label: 'U-6 underemployment', unit: '%' },
        { id: 'CIVPART', label: 'Participation rate', unit: '%' },
        { id: 'CES0500000003', label: 'Average hourly earnings YoY', units: 'pc1', unit: '%' },
      ] },
      { name: 'Payrolls by sector (monthly change)', rows: [
        { id: 'USEHS', label: 'Education and health', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USLAH', label: 'Leisure and hospitality', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USPBS', label: 'Professional and business', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USGOVT', label: 'Government', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USCONS', label: 'Construction', units: 'chg', unit: 'k', dp: 0 },
        { id: 'MANEMP', label: 'Manufacturing', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USTRADE', label: 'Retail trade', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USINFO', label: 'Information', units: 'chg', unit: 'k', dp: 0 },
        { id: 'USFIRE', label: 'Financial activities', units: 'chg', unit: 'k', dp: 0 },
      ] },
      { name: 'Claims and turnover', rows: [
        { id: 'ICSA', label: 'Initial claims', scale: 1e-3, unit: 'k', dp: 0 },
        { id: 'CCSA', label: 'Continuing claims', scale: 1e-3, unit: 'k', dp: 0 },
        { id: 'JTSJOL', label: 'Job openings', unit: 'k', dp: 0 },
        { id: 'JTSQUR', label: 'Quits rate', unit: '%' },
      ] },
    ],
  },
  CRED: {
    title: 'Credit spreads (option-adjusted, percentage points)',
    groups: [
      { name: 'Investment grade', rows: [{ id: 'BAMLC0A0CM', label: 'All IG', unit: 'pp' }, { id: 'BAMLC0A1CAAA', label: 'AAA', unit: 'pp' }, { id: 'BAMLC0A4CBBB', label: 'BBB', unit: 'pp' }] },
      { name: 'High yield', rows: [{ id: 'BAMLH0A0HYM2', label: 'All HY', unit: 'pp' }, { id: 'BAMLH0A1HYBB', label: 'BB', unit: 'pp' }, { id: 'BAMLH0A3HYC', label: 'CCC and below', unit: 'pp' }] },
      { name: 'Emerging markets', rows: [{ id: 'BAMLEMCBPIOAS', label: 'EM corporate', unit: 'pp' }] },
    ],
    notes: 'ICE BofA indices via FRED. FRED shows only about the last 3 years of these series (license limit).',
  },
  RECS: {
    title: 'Recession dashboard',
    groups: [
      { name: 'Curve and model', rows: [
        { id: 'T10Y3M', label: '10y minus 3m (negative = inverted)', unit: 'pp' },
        { id: 'T10Y2Y', label: '10y minus 2y', unit: 'pp' },
        { id: 'SAHMREALTIME', label: 'Sahm rule (0.5+ signals recession)', unit: 'pp' },
        { id: 'RECPROUSM156N', label: 'Smoothed recession probability (Chauvet-Piger)', unit: '%' },
      ] },
      { name: 'Real economy', rows: [
        { id: 'ICSA', label: 'Initial claims', scale: 1e-3, unit: 'k', dp: 0 },
        { id: 'PERMIT', label: 'Building permits', unit: 'k', dp: 0 },
        { id: 'AWHMAN', label: 'Manufacturing weekly hours', unit: 'h' },
        { id: 'UMCSENT', label: 'Consumer sentiment', unit: 'idx' },
      ] },
      { name: 'Financial conditions', rows: [
        { id: 'NFCI', label: 'Chicago Fed NFCI (above 0 = tighter)', unit: 'idx' },
        { id: 'STLFSI4', label: 'St. Louis Fed stress index', unit: 'idx' },
        { id: 'BAMLH0A0HYM2', label: 'High yield spread', unit: 'pp' },
      ] },
    ],
    notes: 'These are signals with long, variable lags and false alarms, not a forecast. Model estimate. Not financial advice.',
  },
  MMKT: {
    title: 'Money market rates',
    groups: [{ name: 'Overnight and bills', rows: [
      { id: 'SOFR', label: 'SOFR', unit: '%' },
      { id: 'DFF', label: 'Effective fed funds', unit: '%' },
      { id: 'OBFR', label: 'Overnight bank funding', unit: '%' },
      { id: 'IORB', label: 'Interest on reserve balances', unit: '%' },
      { id: 'DTB4WK', label: '4-week T-bill', unit: '%' },
      { id: 'DTB3', label: '3-month T-bill', unit: '%' },
      { id: 'DTB6', label: '6-month T-bill', unit: '%' },
      { id: 'RPONTSYD', label: 'Fed repo operations', unit: '$B', dp: 1 },
      { id: 'RRPONTSYD', label: 'Overnight reverse repo', unit: '$B', dp: 1 },
    ] }],
  },
  RE: {
    title: 'Real estate and mortgages',
    groups: [
      { name: 'Prices', rows: [
        { id: 'CSUSHPINSA', label: 'Case-Shiller national YoY', units: 'pc1', unit: '%' },
        { id: 'USSTHPI', label: 'FHFA house price index YoY (quarterly)', units: 'pc1', unit: '%' },
        { id: 'MSPUS', label: 'Median sales price', scale: 1e-3, unit: '$k', dp: 0 },
        { id: 'COMREPUSQ159N', label: 'Commercial real estate prices YoY (BIS)', unit: '%' },
      ] },
      { name: 'Activity and credit', rows: [
        { id: 'MORTGAGE30US', label: '30y mortgage rate', unit: '%' },
        { id: 'HOUST', label: 'Housing starts', unit: 'k', dp: 0 },
        { id: 'PERMIT', label: 'Building permits', unit: 'k', dp: 0 },
        { id: 'EXHOSLUSM495S', label: 'Existing home sales', scale: 1e-6, unit: 'M', dp: 2 },
        { id: 'RHORUSQ156N', label: 'Homeownership rate', unit: '%' },
        { id: 'RRVRUSQ156N', label: 'Rental vacancy rate', unit: '%' },
      ] },
      { name: 'Consumer', rows: [
        { id: 'PSAVERT', label: 'Personal saving rate', unit: '%' },
        { id: 'TOTALSL', label: 'Consumer credit YoY', units: 'pc1', unit: '%' },
        { id: 'DRCCLACBS', label: 'Credit card delinquency rate', unit: '%' },
      ] },
    ],
  },
  REAL: {
    title: 'Real yields and breakevens',
    groups: [{ name: 'TIPS and inflation expectations', rows: [
      { id: 'DFII5', label: '5y real yield', unit: '%' },
      { id: 'DFII10', label: '10y real yield', unit: '%' },
      { id: 'T5YIE', label: '5y breakeven inflation', unit: '%' },
      { id: 'T10YIE', label: '10y breakeven inflation', unit: '%' },
      { id: 'T5YIFR', label: '5y5y forward inflation', unit: '%' },
      { id: 'DTWEXBGS', label: 'Broad dollar index', unit: 'idx' },
      { id: 'VIXCLS', label: 'VIX (equity volatility)', unit: 'idx' },
    ] }],
  },
};
