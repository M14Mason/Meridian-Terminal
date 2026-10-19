// CoinGecko. Crypto scope is Bitcoin plus the sector heatmap only (owner removed items 100 to 106).
import { up, type Fetched } from '../client';

export const btcPrice = () => up<{ bitcoin: { usd: number; usd_24h_change: number; usd_market_cap: number; usd_24h_vol: number; last_updated_at: number } }>('coingecko', '/api/v3/simple/price', { ids: 'bitcoin', vs_currencies: 'usd', include_24hr_change: 'true', include_market_cap: 'true', include_24hr_vol: 'true', include_last_updated_at: 'true' });

export async function btcHistory(days = 365): Promise<Fetched<{ t: number; price: number }[]>> {
  const r = await up<{ prices: [number, number][] }>('coingecko', '/api/v3/coins/bitcoin/market_chart', { vs_currency: 'usd', days }, { maxAgeMs: 15 * 60_000 });
  return { ...r, data: r.data.prices.map(([t, price]) => ({ t, price })) };
}

export interface Category { id: string; name: string; market_cap: number | null; market_cap_change_24h: number | null; volume_24h: number | null; top_3_coins_id?: string[] }
export const categories = () => up<Category[]>('coingecko', '/api/v3/coins/categories', undefined, { maxAgeMs: 5 * 60_000 });
