import { describe, expect, it } from 'vitest';
import { unwrapAntimeridian, unwrapRing } from './geo';

describe('unwrapRing', () => {
  it('keeps a ring that crosses 180 degrees continuous', () => {
    const fiji = [[179, -16], [-179.5, -16.5], [-179.8, -17], [179.2, -17], [179, -16]];
    const r = unwrapRing(fiji);
    for (let i = 1; i < r.length; i++) expect(Math.abs(r[i]![0]! - r[i - 1]![0]!)).toBeLessThanOrEqual(180);
    expect(r[1]![0]).toBeCloseTo(180.5);
  });
  it('keeps rings that circle the globe unchanged', () => {
    const antarctica = [[-180, -84], [0, -70], [180, -84], [180, -90], [-180, -90], [-180, -84]];
    expect(unwrapRing(antarctica)).toEqual(antarctica);
  });
  it('leaves normal rings alone and handles feature collections', () => {
    const ring = [[10, 10], [20, 10], [20, 20], [10, 10]];
    expect(unwrapRing(ring)).toEqual(ring);
    const fc = { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'MultiPolygon', coordinates: [[[[170, 60], [-170, 61], [170, 60]]]] } }] };
    const out = unwrapAntimeridian(fc) as typeof fc;
    expect(out.features[0]!.geometry.coordinates[0]![0]![1]![0]).toBe(190);
  });
});
