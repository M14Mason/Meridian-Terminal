// ECB reference rates via Frankfurter. Daily around 16:00 CET. Indicative only, not executable (19).
import { up, type Fetched } from '../client';

export interface FxSeries { dates: string[]; rates: Record<string, Record<string, number>> }

/** Last ~10 calendar days of USD-based rates, so we can show the daily change. */
export async function recent(symbols: string[]): Promise<Fetched<FxSeries>> {
  const start = new Date(Date.now() - 12 * 86_400_000).toISOString().slice(0, 10);
  const r = await up<{ rates: Record<string, Record<string, number>> }>('frankfurter', `/v1/${start}..`, { base: 'USD', symbols: symbols.filter((s) => s !== 'USD').join(',') }, { maxAgeMs: 3600_000 });
  const dates = Object.keys(r.data.rates).sort();
  return { ...r, data: { dates, rates: r.data.rates } };
}
