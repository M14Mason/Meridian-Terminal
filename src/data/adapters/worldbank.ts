// World Bank Indicators API. Free, no key. Mostly annual data, often a year or more old (13.3).
import { up, type Fetched } from '../client';

export interface WbValue { iso3: string; value: number; year: string }

export async function latest(indicator: string, iso3: string[]): Promise<Fetched<Record<string, WbValue>>> {
  const r = await up<[unknown, { countryiso3code: string; date: string; value: number | null }[] | null]>(
    'worldbank',
    `/v2/country/${iso3.join(';')}/indicator/${indicator}`,
    { format: 'json', mrnev: 1, per_page: 400 },
    { maxAgeMs: 24 * 3600_000, priority: 2 },
  );
  const out: Record<string, WbValue> = {};
  for (const row of r.data[1] ?? []) if (row.value != null) out[row.countryiso3code] = { iso3: row.countryiso3code, value: row.value, year: row.date };
  return { ...r, data: out };
}
