// Alert rules and evaluation (BUILD_PROMPT 18), shared by the proxy (cron, while no device is open) and the app.
// Pure and tested. Rules live in the synced "alerts" collection; settings in the record "_settings".

export type RuleType = 'price_above' | 'price_below' | 'pct_move' | 'line_cross' | 'volume_spike' | 'rsi_above' | 'rsi_below' | 'news' | 'filing' | 'earnings' | 'macro';
export interface Point { t: number; p: number }
export interface Rule {
  type: RuleType;
  sym?: string;
  value?: number; // price level, percent, RSI level, or volume multiple
  keyword?: string; // news keyword or macro release name
  forms?: string; // filing forms, comma separated (blank = any)
  line?: { a: Point; b: Point }; // chart line (horizontal when a.p === b.p)
  cooldownMin?: number;
  enabled: boolean;
  email: boolean;
  note?: string;
}
export interface AlertSettings { quietStart: number | null; quietEnd: number | null; email: boolean; sound: boolean; tz: string }
export const DEFAULT_SETTINGS: AlertSettings = { quietStart: null, quietEnd: null, email: true, sound: false, tz: 'America/New_York' };
export interface Fired { id: string; rule: string; type: RuleType | 'system'; sym?: string; at: number; title: string; detail: string; emailed?: boolean }

export const RULE_LABEL: Record<RuleType, string> = {
  price_above: 'Price above', price_below: 'Price below', pct_move: 'Day move of at least ±%', line_cross: 'Crosses chart line',
  volume_spike: 'Volume above x times average', rsi_above: 'RSI(14) above', rsi_below: 'RSI(14) below', news: 'News keyword',
  filing: 'New SEC filing', earnings: 'Earnings tomorrow', macro: 'Macro release today',
};

/** Price on a chart line at time t (linear through the two anchor points; horizontal if they are equal). */
export function lineAt(l: { a: Point; b: Point }, t: number): number {
  if (l.b.t === l.a.t) return l.a.p;
  return l.a.p + ((l.b.p - l.a.p) * (t - l.a.t)) / (l.b.t - l.a.t);
}

export interface Quote { price: number; prevClose: number | null; volume: number | null; avgVolume?: number | null; rsi?: number | null; t: number }

/**
 * Price-type rules. `prev` is the price seen at the previous evaluation (needed for crossings).
 * Returns a message when the rule fires now, else null.
 */
export function checkQuote(r: Rule, q: Quote, prev: number | null): string | null {
  const v = r.value ?? NaN;
  switch (r.type) {
    case 'price_above': return q.price >= v && (prev == null || prev < v) ? `${r.sym} at ${q.price.toFixed(2)}, above ${v}` : null;
    case 'price_below': return q.price <= v && (prev == null || prev > v) ? `${r.sym} at ${q.price.toFixed(2)}, below ${v}` : null;
    case 'pct_move': {
      if (!q.prevClose) return null;
      const ch = (q.price / q.prevClose - 1) * 100;
      return Math.abs(ch) >= v ? `${r.sym} ${ch >= 0 ? '+' : ''}${ch.toFixed(2)}% today` : null;
    }
    case 'line_cross': {
      if (!r.line || prev == null) return null;
      const lv = lineAt(r.line, q.t);
      const before = prev - lv, now = q.price - lv;
      return before !== 0 && Math.sign(before) !== Math.sign(now) ? `${r.sym} crossed your chart line (${lv.toFixed(2)}) ${now > 0 ? 'upward' : 'downward'}, now ${q.price.toFixed(2)}` : null;
    }
    case 'volume_spike': return q.volume != null && q.avgVolume ? (q.volume / q.avgVolume >= v ? `${r.sym} volume ${(q.volume / q.avgVolume).toFixed(1)}x its average` : null) : null;
    case 'rsi_above': return q.rsi != null && q.rsi >= v ? `${r.sym} RSI(14) ${q.rsi.toFixed(1)}, above ${v}` : null;
    case 'rsi_below': return q.rsi != null && q.rsi <= v ? `${r.sym} RSI(14) ${q.rsi.toFixed(1)}, below ${v}` : null;
    default: return null;
  }
}

export const matchesKeyword = (text: string, kw: string) => kw.trim().length > 1 && text.toLowerCase().includes(kw.trim().toLowerCase());

/** Minutes since midnight in a time zone. */
function minutesIn(tz: string, at: number): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(at));
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
}

/** Quiet hours suppress email and sound (the alert is still logged). Handles windows that cross midnight. */
export function inQuietHours(s: AlertSettings, at: number): boolean {
  if (s.quietStart == null || s.quietEnd == null || s.quietStart === s.quietEnd) return false;
  const m = minutesIn(s.tz, at);
  return s.quietStart < s.quietEnd ? m >= s.quietStart && m < s.quietEnd : m >= s.quietStart || m < s.quietEnd;
}

/** Cooldown: a rule fires at most once per cooldown window (default 4 hours; daily rules once per day). */
export function coolingDown(r: Rule, lastFired: number | null, at: number): boolean {
  if (lastFired == null) return false;
  const daily = r.type === 'earnings' || r.type === 'macro' || r.type === 'pct_move';
  const mins = r.cooldownMin ?? (daily ? 20 * 60 : 240);
  return at - lastFired < mins * 60_000;
}

/** Basic validation of a rule from the synced collection. */
export function validRule(x: unknown): x is Rule {
  const r = x as Rule;
  if (!r || typeof r !== 'object' || !(r.type in RULE_LABEL) || typeof r.enabled !== 'boolean') return false;
  const needsSym = !['macro', 'news'].includes(r.type);
  if (needsSym && !(typeof r.sym === 'string' && /^[A-Z][A-Z0-9.]{0,9}$/.test(r.sym))) return false;
  if (['price_above', 'price_below', 'pct_move', 'volume_spike', 'rsi_above', 'rsi_below'].includes(r.type) && !(typeof r.value === 'number' && Number.isFinite(r.value))) return false;
  if (r.type === 'line_cross' && !(r.line && Number.isFinite(r.line.a?.p) && Number.isFinite(r.line.b?.p))) return false;
  if ((r.type === 'news' || r.type === 'macro') && !(typeof r.keyword === 'string' && r.keyword.trim().length > 1)) return false;
  return true;
}
