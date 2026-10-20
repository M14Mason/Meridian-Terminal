// Macro heatmap definitions (13.1, 13.2). Every series ID was checked on fred.stlouisfed.org on 2026-10-18.
import type { Good } from '../../shared/heat';

export interface UsMetric {
  id: string; // FRED series
  label: string;
  units?: 'pc1' | 'chg';
  unit: string;
  good: Good;
  freq: 'D' | 'W' | 'M' | 'Q';
  note?: string;
  /**
   * Days after the period START (the date FRED stamps) before the value counts as late. Only for series whose
   * publication lag is longer than the frequency default allows (see STALE_DAYS in HeatPanel).
   */
  maxAge?: number;
}

export const US_METRICS: { group: string; rows: UsMetric[] }[] = [
  {
    group: 'Growth',
    rows: [
      { id: 'A191RL1Q225SBEA', label: 'Real GDP growth (SAAR)', unit: '%', good: 'high', freq: 'Q' },
      { id: 'GDPNOW', label: 'GDPNow nowcast', unit: '%', good: 'high', freq: 'Q', note: 'Atlanta Fed model estimate of current quarter', maxAge: 135 },
      { id: 'INDPRO', label: 'Industrial production YoY', units: 'pc1', unit: '%', good: 'high', freq: 'M' },
      { id: 'RSAFS', label: 'Retail sales YoY', units: 'pc1', unit: '%', good: 'high', freq: 'M' },
      { id: 'UMCSENT', label: 'Consumer sentiment (UMich)', unit: 'idx', good: 'high', freq: 'M', note: 'FRED posts UMich about a month after release (licensing), so it trails the news by one reading', maxAge: 110 },
    ],
  },
  {
    group: 'Labor',
    rows: [
      { id: 'UNRATE', label: 'Unemployment rate', unit: '%', good: 'low', freq: 'M' },
      { id: 'PAYEMS', label: 'Payrolls monthly change', units: 'chg', unit: 'k', good: 'high', freq: 'M' },
      { id: 'ICSA', label: 'Initial jobless claims', unit: '', good: 'low', freq: 'W' },
      { id: 'JTSJOL', label: 'Job openings (JOLTS)', unit: 'k', good: 'high', freq: 'M', note: 'Published about 5 weeks after the month ends', maxAge: 130 },
    ],
  },
  {
    group: 'Inflation',
    rows: [
      { id: 'CPIAUCSL', label: 'CPI YoY', units: 'pc1', unit: '%', good: 'low', freq: 'M' },
      { id: 'CPILFESL', label: 'Core CPI YoY', units: 'pc1', unit: '%', good: 'low', freq: 'M' },
      { id: 'PCEPILFE', label: 'Core PCE YoY', units: 'pc1', unit: '%', good: 'low', freq: 'M', maxAge: 100 },
      { id: 'T10YIE', label: '10y breakeven inflation', unit: '%', good: 'neutral', freq: 'D' },
    ],
  },
  {
    group: 'Rates and credit',
    rows: [
      { id: 'DFF', label: 'Fed funds (effective)', unit: '%', good: 'neutral', freq: 'D' },
      { id: 'DGS2', label: '2y Treasury', unit: '%', good: 'neutral', freq: 'D' },
      { id: 'DGS10', label: '10y Treasury', unit: '%', good: 'neutral', freq: 'D' },
      { id: 'T10Y2Y', label: '10y minus 2y spread', unit: 'pp', good: 'high', freq: 'D', note: 'Negative = inverted curve' },
      { id: 'DFII10', label: '10y real yield (TIPS)', unit: '%', good: 'neutral', freq: 'D' },
      { id: 'BAMLH0A0HYM2', label: 'High yield spread', unit: 'pp', good: 'low', freq: 'D' },
      { id: 'BAMLC0A0CM', label: 'Investment grade spread', unit: 'pp', good: 'low', freq: 'D' },
      { id: 'MORTGAGE30US', label: '30y mortgage rate', unit: '%', good: 'low', freq: 'W' },
    ],
  },
  {
    group: 'Housing and energy',
    rows: [
      { id: 'HOUST', label: 'Housing starts', unit: 'k', good: 'high', freq: 'M' },
      { id: 'CSUSHPINSA', label: 'Home prices YoY (Case-Shiller)', units: 'pc1', unit: '%', good: 'neutral', freq: 'M', note: 'Published about two months after the month ends', maxAge: 130 },
      { id: 'DCOILWTICO', label: 'WTI crude', unit: '$', good: 'neutral', freq: 'D' },
    ],
  },
];

export const G7 = [
  { cc: 'US', iso3: 'USA', name: 'United States', policy: 'DFF' },
  { cc: 'CA', iso3: 'CAN', name: 'Canada', policy: 'IRSTCB01CAM156N' },
  { cc: 'GB', iso3: 'GBR', name: 'United Kingdom', policy: 'IUDSOIA' },
  { cc: 'DE', iso3: 'DEU', name: 'Germany', policy: 'ECBDFR' },
  { cc: 'FR', iso3: 'FRA', name: 'France', policy: 'ECBDFR' },
  { cc: 'IT', iso3: 'ITA', name: 'Italy', policy: 'ECBDFR' },
  { cc: 'JP', iso3: 'JPN', name: 'Japan', policy: 'IRSTCI01JPM156N' },
] as const;

/** FRED international (OECD Main Economic Indicators) series per G7 country. */
export const G7_METRICS: { key: string; label: string; good: Good; series: (cc: string, policy: string) => string; unit: string }[] = [
  { key: 'unemp', label: 'Unemployment', good: 'low', unit: '%', series: (cc) => `LRHUTTTT${cc}M156S` },
  { key: 'cpi', label: 'CPI YoY', good: 'low', unit: '%', series: (cc) => `CPALTT01${cc}M659N` },
  { key: 'y10', label: '10y government yield', good: 'neutral', unit: '%', series: (cc) => `IRLTLT01${cc}M156N` },
  { key: 'policy', label: 'Policy rate', good: 'neutral', unit: '%', series: (_cc, p) => p },
];

/** Major economies for the global scope (World Bank, annual). ISO numeric ids match Natural Earth. */
export const GLOBAL_COUNTRIES: [iso3: string, num: string, name: string][] = [
  ['USA', '840', 'United States'], ['CHN', '156', 'China'], ['JPN', '392', 'Japan'], ['DEU', '276', 'Germany'], ['IND', '356', 'India'],
  ['GBR', '826', 'United Kingdom'], ['FRA', '250', 'France'], ['ITA', '380', 'Italy'], ['BRA', '076', 'Brazil'], ['CAN', '124', 'Canada'],
  ['RUS', '643', 'Russia'], ['KOR', '410', 'South Korea'], ['AUS', '036', 'Australia'], ['MEX', '484', 'Mexico'], ['ESP', '724', 'Spain'],
  ['IDN', '360', 'Indonesia'], ['NLD', '528', 'Netherlands'], ['SAU', '682', 'Saudi Arabia'], ['TUR', '792', 'Turkiye'], ['CHE', '756', 'Switzerland'],
  ['POL', '616', 'Poland'], ['ARG', '032', 'Argentina'], ['SWE', '752', 'Sweden'], ['BEL', '056', 'Belgium'], ['THA', '764', 'Thailand'],
  ['ZAF', '710', 'South Africa'], ['EGY', '818', 'Egypt'], ['NGA', '566', 'Nigeria'], ['ISR', '376', 'Israel'], ['ARE', '784', 'UAE'],
  ['SGP', '702', 'Singapore'], ['MYS', '458', 'Malaysia'], ['PHL', '608', 'Philippines'], ['VNM', '704', 'Vietnam'], ['CHL', '152', 'Chile'],
  ['COL', '170', 'Colombia'], ['NOR', '578', 'Norway'], ['IRL', '372', 'Ireland'], ['DNK', '208', 'Denmark'], ['AUT', '040', 'Austria'],
  ['PAK', '586', 'Pakistan'], ['BGD', '050', 'Bangladesh'], ['PER', '604', 'Peru'], ['NZL', '554', 'New Zealand'], ['KAZ', '398', 'Kazakhstan'],
];

export const GLOBAL_METRICS: { id: string; label: string; good: Good; unit: string }[] = [
  { id: 'NY.GDP.MKTP.KD.ZG', label: 'GDP growth', good: 'high', unit: '%' },
  { id: 'FP.CPI.TOTL.ZG', label: 'Inflation (CPI)', good: 'low', unit: '%' },
  { id: 'SL.UEM.TOTL.ZS', label: 'Unemployment', good: 'low', unit: '%' },
  { id: 'BN.CAB.XOKA.GD.ZS', label: 'Current account', good: 'high', unit: '% GDP' },
  { id: 'NE.TRD.GNFS.ZS', label: 'Trade', good: 'neutral', unit: '% GDP' },
  { id: 'GC.DOD.TOTL.GD.ZS', label: 'Government debt', good: 'low', unit: '% GDP' },
];
