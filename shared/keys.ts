// API key names the owner may save through Settings > Keys (6.5). Anything else is rejected.
// A Worker secret with the same name (set via `wrangler secret put`) takes priority.

export interface KeySpec {
  name: string;
  label: string;
  help: string;
}

export const KEY_SPECS: readonly KeySpec[] = [
  { name: 'ALPACA_KEY_ID', label: 'Alpaca key ID', help: 'Use the PAPER account key. Market data is identical.' },
  { name: 'ALPACA_SECRET_KEY', label: 'Alpaca secret key', help: 'Paper account secret.' },
  { name: 'ANTHROPIC_API_KEY', label: 'Anthropic API key', help: 'Used only by the proxy for AI features.' },
  { name: 'FINNHUB_API_KEY', label: 'Finnhub', help: 'Free tier.' },
  { name: 'MASSIVE_API_KEY', label: 'Massive (Polygon)', help: 'Free Stocks Basic.' },
  { name: 'FRED_API_KEY', label: 'FRED', help: 'St. Louis Fed.' },
  { name: 'EIA_API_KEY', label: 'EIA', help: 'US Energy Information Administration.' },
  { name: 'AISSTREAM_API_KEY', label: 'AISStream', help: 'Tanker map.' },
  { name: 'COINGECKO_API_KEY', label: 'CoinGecko (optional)', help: 'Demo key, optional.' },
  { name: 'MARKETAUX_API_KEY', label: 'Marketaux (optional)', help: 'Backup news.' },
  { name: 'USDA_NASS_API_KEY', label: 'USDA NASS (optional)', help: 'Crop reports.' },
  { name: 'PATENTSVIEW_API_KEY', label: 'PatentsView (optional)', help: 'Patent tracker.' },
];

export const KEY_NAMES: ReadonlySet<string> = new Set(KEY_SPECS.map((k) => k.name));

export interface KeyMeta {
  name: string;
  /** "app" = saved through Settings, "dashboard" = Worker secret, "none" = not set. */
  source: 'app' | 'dashboard' | 'none';
  last4: string | null;
  updatedAt: number | null;
}
