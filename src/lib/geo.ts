// Map geometry helpers.

type Ring = number[][];
type Geom = { type: string; coordinates: unknown };

/**
 * Land shapes that cross the 180° line (Fiji, far-east Russia) jump from +180 to -180 longitude, which MapLibre
 * draws as a stripe across the whole world. Unwrapping each ring (shifting points by 360° so consecutive
 * points never jump more than 180°) keeps the outline continuous; MapLibre handles longitudes past ±180.
 */
export function unwrapRing(ring: Ring): Ring {
  const out: Ring = [];
  let prev: number | null = null;
  for (const p of ring) {
    let lon = p[0]!;
    if (prev != null) {
      while (lon - prev > 180) lon -= 360;
      while (lon - prev < -180) lon += 360;
    }
    out.push([lon, p[1]!]);
    prev = lon;
  }
  // A ring that circles the whole globe (Antarctica) would no longer close after unwrapping; keep it as is.
  return Math.abs(out[0]![0]! - out.at(-1)![0]!) > 1 ? ring : out;
}

function unwrapGeom(g: Geom): Geom {
  if (g.type === 'Polygon') return { ...g, coordinates: (g.coordinates as Ring[]).map(unwrapRing) };
  if (g.type === 'MultiPolygon') return { ...g, coordinates: (g.coordinates as Ring[][]).map((poly) => poly.map(unwrapRing)) };
  return g;
}

/** Applies unwrapRing to every polygon in a GeoJSON Feature or FeatureCollection. */
export function unwrapAntimeridian<T>(geo: T): T {
  const g = geo as unknown as { type: string; features?: { geometry: Geom }[]; geometry?: Geom };
  if (g.type === 'FeatureCollection') return { ...g, features: g.features!.map((f) => ({ ...f, geometry: unwrapGeom(f.geometry) })) } as unknown as T;
  if (g.type === 'Feature') return { ...g, geometry: unwrapGeom(g.geometry!) } as unknown as T;
  return unwrapGeom(g as unknown as Geom) as unknown as T;
}
