// FRED adapter (St. Louis Fed). Free key. About 120 requests/min.
import { isFredFomc, parseFomcCalendar, type FomcMeeting } from '../../../shared/fomc';
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
/** FOMC meetings from the Fed's own calendar page. */
export async function fomcMeetings(): Promise<Fetched<FomcMeeting[]>> {
  const r = await up<string>('fed', '/monetarypolicy/fomccalendars.htm', undefined, { text: true, maxAgeMs: 6 * 3600_000 });
  return { ...r, data: parseFomcCalendar(r.data) };
}

/**
 * Upcoming release dates. FRED's own "FOMC Press Release" entries are dropped (FRED updates that series almost
 * daily, so it showed a Fed decision nearly every day); real FOMC statement dates come from federalreserve.gov.
 */
export async function releaseCalendar(days = 21): Promise<Fetched<ReleaseDate[]>> {
  const nyToday = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const end = new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const [r, fomc] = await Promise.all([
    up<{ release_dates: ReleaseDate[] }>('fred', '/fred/releases/dates', {
      realtime_start: nyToday,
      realtime_end: end,
      include_release_dates_with_no_data: 'true',
      sort_order: 'asc',
      limit: 1000,
    }),
    fomcMeetings().catch(() => null),
  ]);
  const rows = (r.data.release_dates ?? []).filter((x) => !isFredFomc(x.release_name));
  for (const m of fomc?.data ?? []) {
    if (m.statement >= nyToday && m.statement <= end) rows.push({ release_id: -1, release_name: `FOMC statement 2:00 PM ET / 11:00 AM PT, press conference 2:30 PM ET${m.sep ? ', with projections (dot plot)' : ''} (federalreserve.gov)`, date: m.statement });
  }
  return { ...r, data: rows.sort((a, b) => a.date.localeCompare(b.date)) };
}
