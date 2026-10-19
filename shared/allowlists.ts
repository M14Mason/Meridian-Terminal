// Upstream allowlists (BUILD_PROMPT 2.4, 6.5.1, 6.7). Block by default.
// Tests in allowlists.test.ts assert that every trading path and tool stays blocked.

// ---------- Alpaca: market data and news only ----------

/** The only Alpaca host the proxy may call. Trading hosts (api., paper-api.) are never allowed. */
export const ALPACA_DATA_HOST = 'data.alpaca.markets';

const SYM = '[A-Za-z0-9.\\-]{1,12}';
const ALPACA_PATHS: RegExp[] = [
  // Multi-symbol stock endpoints
  /^\/v2\/stocks\/(bars|quotes|trades|snapshots|auctions)$/,
  /^\/v2\/stocks\/(bars|quotes|trades)\/latest$/,
  // Single-symbol stock endpoints
  new RegExp(`^/v2/stocks/${SYM}/(bars|quotes|trades|snapshot|auctions)$`),
  new RegExp(`^/v2/stocks/${SYM}/(bars|quotes|trades)/latest$`),
  /^\/v2\/stocks\/meta\/(conditions\/[a-z]+|exchanges)$/,
  // News and screeners
  /^\/v1beta1\/news$/,
  /^\/v1beta1\/screener\/stocks\/(most-actives|movers)$/,
  // Options market data (delayed/indicative on free; personal use)
  /^\/v1beta1\/options\/(bars|trades|quotes|snapshots)(\/latest)?$/,
  new RegExp(`^/v1beta1/options/snapshots/${SYM}$`),
  // Crypto (Bitcoin only, enforced by symbol check below)
  /^\/v1beta3\/crypto\/us\/(bars|quotes|trades|snapshots)$/,
  /^\/v1beta3\/crypto\/us\/latest\/(bars|quotes|trades)$/,
];

/** Crypto scope is Bitcoin only (section 11, owner removed 100 to 106). */
const CRYPTO_SYMBOLS = new Set(['BTC/USD', 'BTC/USDT', 'BTC/USDC']);

export function isAlpacaRequestAllowed(method: string, url: URL): boolean {
  if (method !== 'GET') return false;
  if (url.protocol !== 'https:' || url.hostname !== ALPACA_DATA_HOST || url.port !== '') return false;
  if (url.username || url.password) return false;
  const path = url.pathname;
  if (!ALPACA_PATHS.some((re) => re.test(path))) return false;
  if (path.startsWith('/v1beta3/crypto/')) {
    const syms = (url.searchParams.get('symbols') ?? '').split(',').filter(Boolean);
    if (syms.length === 0 || !syms.every((s) => CRYPTO_SYMBOLS.has(s.toUpperCase()))) return false;
  }
  return true;
}

// ---------- Robinhood MCP: read tools only ----------

/**
 * Explicit READ allowlist. Names taken from the official Robinhood Trading MCP tool list
 * as observed on 2026-10-18; re-verify at M10 (verify list item 4).
 */
export const ROBINHOOD_READ_TOOLS: ReadonlySet<string> = new Set([
  'get_accounts',
  'get_portfolio',
  'get_equity_positions',
  'get_option_positions',
  'get_crypto_positions',
  'get_equity_quotes',
  'get_option_quotes',
  'get_crypto_quotes',
  'get_index_quotes',
  'get_equity_orders',
  'get_option_orders',
  'get_crypto_orders',
  'get_advanced_orders',
  'get_equity_tax_lots',
  'get_realized_pnl',
  'get_pnl_trade_history',
  'get_watchlists',
  'get_watchlist_items',
  'get_equity_fundamentals',
  'get_equity_historicals',
  'get_earnings_calendar',
  'get_financials',
  'get_trade_approval_setting',
]);

/** Second line of defense: even an allowlisted name is rejected if it contains a mutating verb. */
const FORBIDDEN_VERBS =
  /(^|_)(place|cancel|exercise|create|update|add|remove|follow|unfollow|decline|approve|delete|set|review|preview|mark|submit|replace|transfer|deposit|withdraw|buy|sell)(_|$)/;

export function isRobinhoodToolAllowed(name: string): boolean {
  if (typeof name !== 'string' || name.length > 64) return false;
  if (!/^[a-z0-9_]+$/.test(name)) return false;
  if (FORBIDDEN_VERBS.test(name)) return false;
  return ROBINHOOD_READ_TOOLS.has(name);
}
