// EIA Open Data v2. Free key. Series ids from EIA's weekly petroleum, gas storage and spot tables.
import { up, type Fetched } from '../client';

export interface EiaRow { period: string; value: number; series?: string; 'series-description'?: string; respondent?: string; fueltype?: string; type?: string }

/** Rows from a v2 route filtered by facets, newest first. */
export async function eia(route: string, opts: { frequency: string; facets: Record<string, string[]>; length?: number; start?: string }): Promise<Fetched<EiaRow[]>> {
  const params: Record<string, string | number | string[]> = {
    frequency: opts.frequency,
    'data[0]': 'value',
    'sort[0][column]': 'period',
    'sort[0][direction]': 'desc',
    length: opts.length ?? 5000,
  };
  if (opts.start) params.start = opts.start;
  for (const [k, v] of Object.entries(opts.facets)) params[`facets[${k}][]`] = v;
  const r = await up<{ response: { data: (Omit<EiaRow, 'value'> & { value: string | number | null })[] } }>('eia', `/v2/${route}/data/`, params, { maxAgeMs: 30 * 60_000 });
  return { ...r, data: (r.data.response?.data ?? []).filter((d) => d.value != null).map((d) => ({ ...d, value: Number(d.value) })) };
}

export const bySeries = (rows: EiaRow[], id: string) => rows.filter((r) => r.series === id).sort((a, b) => a.period.localeCompare(b.period));
