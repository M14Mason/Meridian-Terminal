// FRED adapter (St. Louis Fed). Free key. About 120 requests/min.
import { up, type Fetched } from '../client';

export interface Obs { date: string; value: number }

export async function series(id: string, start?: string, opts: { frequency?: string; units?: string } = {}): Promise<Fetched<Obs[]>> {
  const r = await up<{ observations: { date: string; value: string }[] }>(
    'fred',
    '/fred/series/observations',
    { series_id: id, observation_start: start, frequency: opts.frequency, units: opts.units },
    { maxAgeMs: 30 * 60_000 },
  );
  return { ...r, data: r.data.observations.filter((o) => o.value !== '.').map((o) => ({ date: o.date, value: Number(o.value) })) };
}

export async function latest(id: string): Promise<Fetched<Obs | null>> {
  const r = await series(id, new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10));
  return { ...r, data: r.data.at(-1) ?? null };
}

export interface ReleaseDate { release_id: number; release_name: string; date: string }
export async function releaseCalendar(days = 21): Promise<Fetched<ReleaseDate[]>> {
  const today = new Date().toISOString().slice(0, 10);
  const end = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const r = await up<{ release_dates: ReleaseDate[] }>('fred', '/fred/releases/dates', {
    realtime_start: today,
    realtime_end: end,
    include_release_dates_with_no_data: 'true',
    sort_order: 'asc',
    limit: 1000,
  });
  return { ...r, data: r.data.release_dates ?? [] };
}
