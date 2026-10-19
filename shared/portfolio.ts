// Portfolio snapshot (BUILD_PROMPT 17): one normalized shape whether it came from the proxy's Robinhood MCP
// client or the owner-run fallback. Read only; never contains credentials.

export interface Position { symbol: string; type: 'equity' | 'option' | 'crypto'; qty: number; avgCost: number | null; price: number | null; value: number | null; name?: string | null; account?: string | null }
export interface AccountSummary { id: string; type: string; value: number | null; cash: number | null }
export interface Snapshot { at: number; source: 'mcp' | 'fallback'; accounts: AccountSummary[]; positions: Position[]; notes: string[] }

const num = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v.replace(/[$,]/g, '')))) return Number(v.replace(/[$,]/g, ''));
  if (v && typeof v === 'object' && 'amount' in (v as Record<string, unknown>)) return num((v as Record<string, unknown>).amount);
  return null;
};
const pick = (o: Record<string, unknown>, keys: string[]) => { for (const k of keys) if (o[k] != null) return o[k]; return undefined; };

/** Masks account numbers to the last 4 characters (17.7). */
export const maskId = (id: unknown) => { const s = String(id ?? ''); return s.length > 4 ? `••••${s.slice(-4)}` : s; };

/** Walks any JSON and collects objects that look like positions (a symbol plus a quantity). */
export function findPositions(json: unknown, type: Position['type'], account: string | null = null): Position[] {
  const out: Position[] = [];
  const walk = (x: unknown, acct: string | null) => {
    if (Array.isArray(x)) { x.forEach((y) => walk(y, acct)); return; }
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    const a = (pick(o, ['account_number', 'account_id', 'accountNumber']) as string | undefined) ?? acct;
    const sym = pick(o, ['symbol', 'ticker', 'chain_symbol', 'currency_code', 'asset_symbol']);
    const qty = num(pick(o, ['quantity', 'shares', 'qty', 'quantity_held']));
    if (typeof sym === 'string' && sym && qty != null && qty !== 0) {
      const avg = num(pick(o, ['average_buy_price', 'average_cost', 'avg_cost', 'average_price', 'cost_basis_per_share']));
      const price = num(pick(o, ['last_trade_price', 'price', 'mark_price', 'current_price']));
      const value = num(pick(o, ['market_value', 'equity', 'value'])) ?? (price != null ? price * qty * (type === 'option' ? 100 : 1) : null);
      out.push({ symbol: sym.toUpperCase(), type, qty, avgCost: avg, price, value, name: (pick(o, ['name', 'simple_name', 'description']) as string | undefined) ?? null, account: a ? maskId(a) : null });
      return;
    }
    for (const v of Object.values(o)) walk(v, a);
  };
  walk(json, account);
  return out;
}

export function findAccounts(json: unknown): AccountSummary[] {
  const out: AccountSummary[] = [];
  const walk = (x: unknown) => {
    if (Array.isArray(x)) { x.forEach(walk); return; }
    if (!x || typeof x !== 'object') return;
    const o = x as Record<string, unknown>;
    const id = pick(o, ['account_number', 'account_id', 'accountNumber']);
    if (id != null && (pick(o, ['type', 'account_type', 'brokerage_account_type']) != null || pick(o, ['portfolio_value', 'equity', 'cash']) != null)) {
      out.push({ id: maskId(id), type: String(pick(o, ['type', 'account_type', 'brokerage_account_type']) ?? 'account'), value: num(pick(o, ['portfolio_value', 'equity', 'total_value', 'market_value'])), cash: num(pick(o, ['cash', 'buying_power', 'cash_balance'])) });
      return;
    }
    Object.values(o).forEach(walk);
  };
  walk(json);
  return out;
}

/** MCP tool results: content[] text blocks holding JSON, or structuredContent. */
export function toolJson(result: unknown): unknown {
  const r = result as { structuredContent?: unknown; content?: { type: string; text?: string }[] };
  if (r?.structuredContent) return r.structuredContent;
  const texts = (r?.content ?? []).filter((c) => c.type === 'text' && c.text).map((c) => c.text!);
  const parsed = texts.map((t) => { try { return JSON.parse(t); } catch { return null; } }).filter((x) => x != null);
  return parsed.length === 1 ? parsed[0] : parsed;
}

/** Validates a fallback snapshot posted by the owner-run script. */
export function validSnapshot(x: unknown): x is Snapshot {
  const s = x as Snapshot;
  return Boolean(s) && typeof s.at === 'number' && Array.isArray(s.positions) && s.positions.length <= 2000 && s.positions.every((p) => typeof p.symbol === 'string' && typeof p.qty === 'number' && ['equity', 'option', 'crypto'].includes(p.type)) && Array.isArray(s.accounts) && s.accounts.every((a) => typeof a.id === 'string' && !/\d{5,}/.test(a.id));
}

/** Stale = no successful refresh within 26 hours on a weekday, or 74 hours over a weekend. */
export function isStale(at: number, now: number): boolean {
  const day = new Date(now).getUTCDay();
  const limit = day === 1 || day === 0 || day === 6 ? 74 : 26;
  return now - at > limit * 3600_000;
}
