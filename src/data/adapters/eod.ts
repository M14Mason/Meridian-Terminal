// End-of-day snapshots of every US stock (Massive grouped daily), one call per day, cached for good.
// Free tier is 5 calls a minute, so the first load of 60 days takes about 12 minutes; later days add 1 call.
import type { Day } from '../../../shared/breadth';
import { up } from '../client';

const DAY = 86_400_000;
type Raw = { results?: { T: string; c: number; v: number; h: number; l: number }[] };

let progress = { done: 0, want: 0 };
const listeners = new Set<() => void>();
export const eodProgress = () => progress;
export function onEodProgress(f: () => void) {
  listeners.add(f);
  return () => void listeners.delete(f);
}
const tell = (p: typeof progress) => {
  progress = p;
  listeners.forEach((f) => f());
};

async function grouped(date: string, recent: boolean): Promise<Day | null> {
  // Past days never change: keep a month. The newest day refreshes every 6 hours.
  const r = await up<Raw>('massive', `/v2/aggs/grouped/locale/us/market/stocks/${date}`, { adjusted: 'true' }, { maxAgeMs: recent ? 6 * 3600_000 : 30 * DAY, priority: 2 });
  const rows = r.data.results ?? [];
  if (!rows.length) return null;
  return { date, bars: new Map(rows.map((x) => [x.T, { c: x.c, v: x.v, h: x.h, l: x.l }])) };
}

const inflight = new Map<number, Promise<Day[]>>();

/** The last `n` trading days, oldest first. Weekends skipped; holidays come back empty and are skipped. */
export function eodHistory(n: number): Promise<Day[]> {
  const hit = inflight.get(n);
  if (hit) return hit;
  const p = (async () => {
    const out: Day[] = [];
    tell({ done: 0, want: n });
    for (let back = 1; out.length < n && back < n * 1.6 + 10; back++) {
      const d = new Date(Date.now() - back * DAY);
      if (d.getUTCDay() === 0 || d.getUTCDay() === 6) continue;
      const day = await grouped(d.toISOString().slice(0, 10), back <= 4);
      if (day) {
        out.push(day);
        tell({ done: out.length, want: n });
      }
    }
    return out.reverse();
  })().finally(() => setTimeout(() => inflight.delete(n), 60_000));
  inflight.set(n, p);
  return p;
}
