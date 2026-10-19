// Heatmap math (13.6): percentile coloring and a squarified treemap layout.

export type Good = 'high' | 'low' | 'neutral';

/** Fraction of `history` values at or below `v` (0..1). NaN when there is no history. */
export function percentile(v: number, history: number[]): number {
  const h = history.filter(Number.isFinite);
  if (!h.length || !Number.isFinite(v)) return NaN;
  let below = 0;
  for (const x of h) if (x <= v) below++;
  return below / h.length;
}

/** Signed score -1..1: positive = good for the economy or market, by the metric's direction. */
export function goodness(p: number, good: Good): number {
  if (!Number.isFinite(p)) return NaN;
  const centered = (p - 0.5) * 2;
  return good === 'high' ? centered : good === 'low' ? -centered : centered;
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const c = a.map((x, i) => Math.round(x + (b[i]! - x) * t));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

/**
 * Cell background for a score in -1..1. Good = green, bad = red, middle = near black, like a
 * terminal heatmap. Neutral metrics use blue (low) to orange (high) so color never implies good or bad.
 */
export function heatColor(score: number, neutral = false): string {
  if (!Number.isFinite(score)) return 'rgb(26,26,26)';
  const mid: [number, number, number] = [20, 20, 20];
  const s = Math.max(-1, Math.min(1, score));
  if (neutral) return s >= 0 ? mix(mid, [176, 96, 16], s) : mix(mid, [0, 72, 176], -s);
  return s >= 0 ? mix(mid, [0, 140, 100], s) : mix(mid, [180, 40, 36], -s);
}

export interface Rect { x: number; y: number; w: number; h: number }
export interface TreeItem<T> { value: number; data: T }

/** Squarified treemap (Bruls, Huizing, van Wijk). Returns rectangles in the same order as sorted input. */
export function squarify<T>(items: TreeItem<T>[], box: Rect): (Rect & { data: T; value: number })[] {
  const list = items.filter((i) => i.value > 0).sort((a, b) => b.value - a.value);
  const total = list.reduce((s, i) => s + i.value, 0);
  if (!total) return [];
  const scale = (box.w * box.h) / total;
  const out: (Rect & { data: T; value: number })[] = [];
  let rect = { ...box };
  let row: TreeItem<T>[] = [];

  const worst = (r: TreeItem<T>[], side: number) => {
    const areas = r.map((i) => i.value * scale);
    const s = areas.reduce((a, b) => a + b, 0);
    const max = Math.max(...areas);
    const min = Math.min(...areas);
    return Math.max((side * side * max) / (s * s), (s * s) / (side * side * min));
  };

  const layout = (r: TreeItem<T>[]) => {
    const s = r.reduce((a, i) => a + i.value * scale, 0);
    if (rect.w >= rect.h) {
      const w = s / rect.h;
      let y = rect.y;
      for (const i of r) {
        const h = (i.value * scale) / w;
        out.push({ x: rect.x, y, w, h, data: i.data, value: i.value });
        y += h;
      }
      rect = { x: rect.x + w, y: rect.y, w: rect.w - w, h: rect.h };
    } else {
      const h = s / rect.w;
      let x = rect.x;
      for (const i of r) {
        const w = (i.value * scale) / h;
        out.push({ x, y: rect.y, w, h, data: i.data, value: i.value });
        x += w;
      }
      rect = { x: rect.x, y: rect.y + h, w: rect.w, h: rect.h - h };
    }
  };

  for (const item of list) {
    const side = Math.min(rect.w, rect.h);
    if (!row.length || worst([...row, item], side) <= worst(row, side)) row.push(item);
    else {
      layout(row);
      row = [item];
    }
  }
  if (row.length) layout(row);
  return out;
}
