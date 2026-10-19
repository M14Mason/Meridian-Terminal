// Align several bar series on common dates (UTC day), for compare, beta and correlation.
import type { Bar } from './indicators';

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

export function alignCloses(series: Bar[][]): { dates: string[]; times: number[]; closes: number[][] } {
  if (!series.length) return { dates: [], times: [], closes: [] };
  const maps = series.map((s) => new Map(s.map((b) => [day(b.t), b])));
  const dates = [...maps[0]!.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return {
    dates,
    times: dates.map((d) => maps[0]!.get(d)!.t),
    closes: maps.map((m) => dates.map((d) => m.get(d)!.c)),
  };
}

/** Rebase to 100 at the first point. */
export const rebase = (x: number[]) => x.map((v) => (v / x[0]!) * 100);
