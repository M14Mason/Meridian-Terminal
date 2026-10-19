// Natural Earth countries (public domain, via world-atlas 110m TopoJSON, ISC) painted onto an
// equirectangular canvas. The same canvas is the globe texture and the flat 2D map.
import { feature } from 'topojson-client';
import type { FeatureCollection, MultiPolygon, Polygon, Position } from 'geojson';

export interface Country { id: string; name: string; rings: Position[][] }

let cache: Promise<Country[]> | null = null;
export function loadCountries(): Promise<Country[]> {
  cache ??= import('world-atlas/countries-110m.json').then((m) => {
    const topo = (m as unknown as { default: Parameters<typeof feature>[0] }).default;
    const fc = feature(topo, (topo as unknown as { objects: { countries: Parameters<typeof feature>[1] } }).objects.countries) as unknown as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
    return fc.features.map((f) => ({
      id: String(f.id ?? ''),
      name: f.properties?.name ?? '',
      rings: f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat(),
    }));
  });
  return cache;
}

/** Draws every country. `fill` returns a CSS color. Rings crossing the antimeridian are unwrapped. */
export function paint(ctx: CanvasRenderingContext2D, countries: Country[], fill: (c: Country, i: number) => string, stroke: string | null) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const X = (lon: number) => ((lon + 180) / 360) * W;
  const Y = (lat: number) => ((90 - lat) / 180) * H;
  countries.forEach((c, ci) => {
    ctx.fillStyle = fill(c, ci);
    for (const ring of c.rings) {
      for (const shift of [0, -W, W]) {
        ctx.beginPath();
        let prev = ring[0]![0]!;
        let off = 0;
        ring.forEach(([lon, lat], i) => {
          if (i > 0 && Math.abs(lon! - prev) > 180) off += lon! < prev ? W : -W;
          prev = lon!;
          const x = X(lon!) + off + shift;
          const y = Y(lat!);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fill();
        if (stroke) {
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 0.6;
          ctx.stroke();
        }
      }
    }
  });
}

/** Picking canvas: each country filled with a unique color that encodes its index. */
export function pickCanvas(countries: Country[], W: number, H: number): { lookup: (u: number, v: number) => Country | null } {
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = false;
  const color = (i: number) => `rgb(${(i + 1) & 255},${((i + 1) >> 8) & 255},0)`;
  paint(ctx, countries, (_c, i) => color(i), null);
  return {
    lookup(u, v) {
      const x = Math.floor(Math.min(0.9999, Math.max(0, u)) * W);
      const y = Math.floor(Math.min(0.9999, Math.max(0, v)) * H);
      const d = ctx.getImageData(x, y, 1, 1).data;
      const i = d[0]! + (d[1]! << 8) - 1;
      return i >= 0 && i < countries.length && d[3] === 255 ? countries[i]! : null;
    },
  };
}
