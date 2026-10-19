// SPLC map view: the company and its disclosed counterparties on a MapLibre globe (no tile server; Natural Earth
// land), arcs from suppliers to the company and from the company to customers, plus its facilities.
// Coordinates come from OpenStreetMap Nominatim (geocoded once, cached in the repo).
import { useEffect, useRef, useState } from 'react';
import { feature } from 'topojson-client';
import type { Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { lowPower, webgl2Available } from '../three/gl';

export interface Place { n: string; hq: [number, number] | null; f: [number, number, string][] }
export interface MapLink { id: string; role: 'supplier' | 'customer' | 'partner'; crit: boolean }

/** Great-circle points between two [lat, lon] pairs, as [lon, lat] for GeoJSON. */
function arc(a: [number, number], b: [number, number], n = 48): [number, number][] {
  const r = Math.PI / 180;
  const [la1, lo1, la2, lo2] = [a[0] * r, a[1] * r, b[0] * r, b[1] * r];
  const d = 2 * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
  if (d < 1e-6) return [[a[1], a[0]], [b[1], b[0]]];
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n;
    const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(la1) * Math.cos(lo1) + B * Math.cos(la2) * Math.cos(lo2);
    const y = A * Math.cos(la1) * Math.sin(lo1) + B * Math.cos(la2) * Math.sin(lo2);
    const z = A * Math.sin(la1) + B * Math.sin(la2);
    out.push([Math.atan2(y, x) / r, Math.atan2(z, Math.hypot(x, y)) / r]);
  }
  return out;
}

const COLOR = { supplier: '#4aa3ff', customer: '#4af6c3', partner: '#b07cff' };

export function SupplyMap({ root, places, links, onPick }: { root: string; places: Record<string, Place>; links: MapLink[]; onPick: (id: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const [ready, setReady] = useState(false);
  const supported = webgl2Available();
  const home = places[root]?.hq ?? null;

  useEffect(() => {
    if (!supported || !box.current) return;
    let disposed = false;
    void (async () => {
      const ml = await import('maplibre-gl');
      const { default: workerUrl } = await import('maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url');
      ml.setWorkerUrl(workerUrl);
      const land = await import('world-atlas/land-110m.json');
      if (disposed) return;
      const topo = (land as unknown as { default: Parameters<typeof feature>[0] }).default;
      const landGeo = feature(topo, (topo as unknown as { objects: { land: Parameters<typeof feature>[1] } }).objects.land);
      const m = new ml.Map({
        container: box.current!,
        style: {
          version: 8,
          projection: { type: 'globe' },
          sources: { land: { type: 'geojson', data: landGeo as never } },
          layers: [
            { id: 'sea', type: 'background', paint: { 'background-color': '#05080c' } },
            { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#22272e' } },
            { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#4a4f57', 'line-width': 0.7 } },
          ],
        } as never,
        center: [-30, 25],
        zoom: 1.2,
        attributionControl: { customAttribution: 'Land: Natural Earth. Places: © OpenStreetMap contributors (Nominatim). Relationships: SEC filings.' },
        fadeDuration: lowPower() ? 0 : 300,
      });
      map.current = m;
      m.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
      m.on('load', () => {
        m.addSource('arcs', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addSource('pts', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'arcs', type: 'line', source: 'arcs', paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'crit'], 2.6, 1.4], 'line-opacity': 0.85 } });
        m.addLayer({ id: 'pts', type: 'circle', source: 'pts', paint: { 'circle-color': ['get', 'color'], 'circle-radius': ['get', 'r'], 'circle-stroke-color': '#000', 'circle-stroke-width': 1 } });
        m.addLayer({ id: 'labels', type: 'symbol', source: 'pts', filter: ['==', ['get', 'kind'], 'hq'], layout: { 'text-field': ['get', 'label'], 'text-size': 11, 'text-offset': [0, 1.1], 'text-font': [] }, paint: { 'text-color': '#e8e8e8', 'text-halo-color': '#000', 'text-halo-width': 1 } });
        m.on('click', 'pts', (e) => { const id = e.features?.[0]?.properties?.id; if (typeof id === 'string') onPick(id); });
        setReady(true);
      });
    })();
    return () => { disposed = true; map.current?.remove(); map.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supported]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    const arcs: unknown[] = [];
    const pts: unknown[] = [];
    if (home) {
      pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [home[1], home[0]] }, properties: { id: root, kind: 'hq', label: root, color: '#f2a446', r: 8 } });
      for (const f of places[root]?.f ?? []) pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [f[1], f[0]] }, properties: { id: root, kind: 'fac', label: f[2], color: '#f2a446', r: 3.5 } });
    }
    for (const l of links) {
      const p = places[l.id]?.hq;
      if (!p) continue;
      const color = l.crit ? '#ff433d' : COLOR[l.role];
      pts.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [p[1], p[0]] }, properties: { id: l.id, kind: 'hq', label: l.id, color, r: 5 } });
      if (home) {
        const line = l.role === 'customer' ? arc(home, p) : arc(p, home);
        arcs.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: line }, properties: { color, crit: l.crit } });
      }
    }
    (m.getSource('arcs') as unknown as { setData: (d: unknown) => void }).setData({ type: 'FeatureCollection', features: arcs });
    (m.getSource('pts') as unknown as { setData: (d: unknown) => void }).setData({ type: 'FeatureCollection', features: pts });
    if (home) m.easeTo({ center: [home[1], home[0]], zoom: 1.6, duration: lowPower() ? 0 : 1200 });
  }, [ready, links, places, root, home]);

  if (!supported) return <p className="muted">The map needs WebGL 2; the chart and table show the same relationships.</p>;
  const missing = links.filter((l) => !places[l.id]?.hq).length;
  return (
    <div>
      <div ref={box} style={{ height: 420, minHeight: 280 }} role="img" aria-label="Globe of the company and its counterparties. The table lists the same data." />
      <p className="muted">
        <span style={{ color: '#f2a446' }}>●</span> {root} HQ and facilities <span style={{ color: COLOR.supplier }}>●</span> supplier <span style={{ color: COLOR.customer }}>●</span> customer <span style={{ color: COLOR.partner }}>●</span> partner <span style={{ color: '#ff433d' }}>●</span> critical.{' '}
        {!home && `${root} has no geocoded HQ yet. `}{missing > 0 && `${missing} counterparties are not on the map (unnamed, not extracted, or not geocoded).`}
      </p>
    </div>
  );
}
