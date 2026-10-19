// TNKR: tanker map (section 14). Live via the proxy relay, or the stored snapshot labeled
// "snapshot, not live". MapLibre with Natural Earth land, no tile server, no third-party tiles.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Map as MlMap, GeoJSONSource } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { feature } from 'topojson-client';
import { category, CHOKEPOINTS, type Category, type Packed } from '../../shared/ais';
import { connectAis, flagOf, portwatch, snapshot, type AisFrame, type StaticInfo, type ViewMsg } from '../data/adapters/ais';
import { latest } from '../data/adapters/fred';
import { useData } from '../data/useData';
import { fmt, timeNY } from '../lib/format';
import { usePanelMeta } from '../shell/panelMeta';
import type { PanelProps } from '../shell/types';
import { lowPower, webgl2Available } from '../three/gl';

type ViewKind = ViewMsg['view'];
interface Ship { p: Packed; s?: StaticInfo; trail: [number, number][] }

const COLORS: Record<Category, string> = { tanker: '#f2a446', lng_lpg: '#4af6c3', cargo: '#4d94ff', other: '#8c8c8c' };
const LABELS: Record<Category, string> = { tanker: 'Tankers (AIS 80-89)', lng_lpg: 'LNG/LPG (name heuristic)', cargo: 'Cargo (AIS 70-79)', other: 'Other' };

function arrowImage(): ImageData {
  const c = document.createElement('canvas');
  c.width = c.height = 24;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(12, 2);
  g.lineTo(20, 21);
  g.lineTo(12, 16);
  g.lineTo(4, 21);
  g.closePath();
  g.fill();
  return g.getImageData(0, 0, 24, 24);
}

export default function TankerPanel(_: PanelProps) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MlMap | null>(null);
  const ships = useRef(new Map<number, Ship>());
  const [view, setView] = useState<ViewKind>('tankers');
  const [layers, setLayers] = useState<Record<Category, boolean>>({ tanker: true, lng_lpg: true, cargo: true, other: false });
  const [trails, setTrails] = useState(false);
  const [frame, setFrame] = useState<AisFrame | null>(null);
  const [conn, setConn] = useState<'connecting' | 'open' | 'closed'>('connecting');
  const [snap, setSnap] = useState<{ at: number } | null>(null);
  const [selected, setSelectedId] = useState<number | null>(null);
  const [sel, setSel] = useState<Ship | null>(null);
  const [counts, setCounts] = useState<Record<Category, number>>({ tanker: 0, lng_lpg: 0, cargo: 0, other: 0 });
  const selectedRef = useRef<number | null>(null);
  const setSelected = (id: number | null) => {
    selectedRef.current = id;
    setSelectedId(id);
    setSel(id == null ? null : { ...ships.current.get(id)! });
  };
  const [tick, setTick] = useState(0);
  const relay = useRef<ReturnType<typeof connectAis> | null>(null);
  const viewRef = useRef<ViewKind>('tankers');
  const supported = webgl2Available();

  const pw = useData('tnkr:portwatch', () => portwatch(45), { everyMs: 6 * 3600_000 });
  const wti = useData('tnkr:wti', () => latest('DCOILWTICO'), { everyMs: 3600_000 });
  const brent = useData('tnkr:brent', () => latest('DCOILBRENTEU'), { everyMs: 3600_000 });

  const live = frame?.status === 'live' && conn === 'open';
  usePanelMeta({ fetchedAt: live ? frame!.at : snap?.at ?? null, source: live ? 'AISStream relay' : 'AIS snapshot', note: live ? 'live, lags minutes' : 'snapshot, not live' });

  // Apply a relay frame or snapshot to the local vessel store.
  const ingest = (vessels: Packed[], statics: Record<string, StaticInfo> | undefined, full: boolean) => {
    const m = ships.current;
    if (full) m.clear();
    for (const p of vessels) {
      const prev = m.get(p[0]);
      const trail = prev?.trail ?? [];
      if (!prev || prev.p[1] !== p[1] || prev.p[2] !== p[2]) trail.push([p[2], p[1]]);
      if (trail.length > 30) trail.shift();
      m.set(p[0], { p, s: statics?.[p[0]] ?? prev?.s, trail });
    }
    // Drop vessels silent for 6 hours.
    const cutoff = Date.now() / 1000 - 6 * 3600;
    for (const [k, v] of m) if (v.p[7] < cutoff) m.delete(k);
    const c: Record<Category, number> = { tanker: 0, lng_lpg: 0, cargo: 0, other: 0 };
    for (const v of m.values()) c[category({ type: v.p[6], name: v.s?.n })]++;
    setCounts(c);
    if (selectedRef.current != null) {
      const s = m.get(selectedRef.current);
      setSel(s ? { ...s } : null);
    }
    setTick((t) => t + 1);
  };

  // Live relay connection.
  useEffect(() => {
    relay.current = connectAis({ view: 'tankers' }, (f) => {
      setFrame(f);
      // Only a live relay replaces what is shown; otherwise keep the stored snapshot.
      if (f.status === 'live') ingest(f.vessels, f.statics, f.type === 'full');
    }, setConn);
    void snapshot().then((s) => {
      if (s.at && ships.current.size === 0) {
        setSnap({ at: s.at });
        ingest(s.vessels ?? [], s.statics, true);
      }
    }, () => undefined);
    return () => relay.current?.close();
  }, []);

  // Map setup.
  useEffect(() => {
    if (!supported || !box.current) return;
    let disposed = false;
    void (async () => {
      const ml = await import('maplibre-gl');
      // MapLibre 6 runs its parsing in a module worker that the bundler must build (no CDN, CSP worker-src 'self').
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
          sources: { land: { type: 'geojson', data: landGeo as never } },
          layers: [
            { id: 'sea', type: 'background', paint: { 'background-color': '#05080c' } },
            { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#22272e' } },
            { id: 'coast', type: 'line', source: 'land', paint: { 'line-color': '#4a4f57', 'line-width': 0.7 } },
          ],
        },
        center: [55, 22],
        zoom: 1.6,
        attributionControl: { customAttribution: 'Land: Natural Earth. Ships: AISStream. Transits: IMF PortWatch.' },
        renderWorldCopies: true,
        dragRotate: true,
        pitchWithRotate: true,
        fadeDuration: lowPower() ? 0 : 300,
      });
      map.current = m;
      m.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
      m.on('load', () => {
        m.addImage('arrow', arrowImage(), { sdf: true });
        m.addSource('zones', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: CHOKEPOINTS.map((z) => ({
              type: 'Feature',
              properties: { id: z.id, name: z.name },
              geometry: { type: 'Polygon', coordinates: [[[z.box[1], z.box[0]], [z.box[3], z.box[0]], [z.box[3], z.box[2]], [z.box[1], z.box[2]], [z.box[1], z.box[0]]]] },
            })),
          },
        });
        m.addLayer({ id: 'zones', type: 'fill', source: 'zones', paint: { 'fill-color': '#f2a446', 'fill-opacity': 0.18 } });
        m.addLayer({ id: 'zones-line', type: 'line', source: 'zones', paint: { 'line-color': '#f2a446', 'line-width': 1.2 } });
        m.addSource('trails', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'trails', type: 'line', source: 'trails', paint: { 'line-color': ['get', 'color'], 'line-width': 1, 'line-opacity': 0.5 } });
        m.addSource('ships', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
        m.addLayer({ id: 'dots', type: 'circle', source: 'ships', filter: ['==', ['get', 'hdg'], -1], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 1, 2.2, 6, 4], 'circle-color': ['get', 'color'] } });
        m.addLayer({
          id: 'arrows',
          type: 'symbol',
          source: 'ships',
          filter: ['!=', ['get', 'hdg'], -1],
          layout: { 'icon-image': 'arrow', 'icon-size': ['interpolate', ['linear'], ['zoom'], 1, 0.45, 6, 0.8], 'icon-rotate': ['get', 'hdg'], 'icon-rotation-alignment': 'map', 'icon-allow-overlap': true },
          paint: { 'icon-color': ['get', 'color'] },
        });
        for (const id of ['arrows', 'dots']) {
          m.on('click', id, (e) => {
            const f = e.features?.[0];
            if (f) setSelected(Number(f.properties?.mmsi));
          });
          m.on('mouseenter', id, () => (m.getCanvas().style.cursor = 'pointer'));
          m.on('mouseleave', id, () => (m.getCanvas().style.cursor = ''));
        }
        setTick((t) => t + 1);
      });
      // In "all ships" view the relay only sends the visible area (14.4c).
      m.on('moveend', () => {
        if (viewRef.current !== 'all') return;
        const b = m.getBounds();
        relay.current?.setView({ view: 'all', bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] });
      });
      new ResizeObserver(() => m.resize()).observe(box.current!);
    })();
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
    };
  }, [supported]);

  useEffect(() => {
    viewRef.current = view;
    const m = map.current;
    if (view === 'all' && m) {
      const b = m.getBounds();
      relay.current?.setView({ view: 'all', bbox: [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()] });
    } else relay.current?.setView({ view });
  }, [view]);

  // Push vessel data into the map.
  useEffect(() => {
    const m = map.current;
    const src = m?.getSource('ships') as GeoJSONSource | undefined;
    if (!m || !src) return;
    const feats = [];
    const tfeats = [];
    for (const v of ships.current.values()) {
      const cat = category({ type: v.p[6], name: v.s?.n });
      if (!layers[cat]) continue;
      if (view !== 'all' && cat !== 'tanker' && cat !== 'lng_lpg') continue;
      const hdg = v.p[5] ?? v.p[4] ?? -1;
      feats.push({ type: 'Feature' as const, properties: { mmsi: v.p[0], color: COLORS[cat], hdg }, geometry: { type: 'Point' as const, coordinates: [v.p[2], v.p[1]] } });
      if ((trails || v.p[0] === selected) && v.trail.length > 1) tfeats.push({ type: 'Feature' as const, properties: { color: COLORS[cat] }, geometry: { type: 'LineString' as const, coordinates: v.trail } });
    }
    src.setData({ type: 'FeatureCollection', features: feats });
    (m.getSource('trails') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: tfeats });
  }, [tick, layers, trails, view, selected]);

  const pwByName = useMemo(() => {
    const out: Record<string, { last: number; lastDate: string; avg7: number; prev7: number }> = {};
    const rows = pw.data ?? [];
    for (const z of CHOKEPOINTS) {
      const r = rows.filter((x) => x.portname === z.portwatch).sort((a, b) => b.date.localeCompare(a.date));
      if (!r.length) continue;
      const avg = (xs: typeof r) => xs.reduce((s, x) => s + x.n_tanker, 0) / (xs.length || 1);
      out[z.id] = { last: r[0]!.n_tanker, lastDate: String(r[0]!.date).slice(0, 10), avg7: avg(r.slice(0, 7)), prev7: avg(r.slice(7, 14)) };
    }
    return out;
  }, [pw.data]);

  const why = frame?.status === 'no-key' ? 'relay has no AISStream key' : frame?.status === 'error' ? 'relay error' : conn !== 'open' ? 'relay unreachable' : 'relay starting';
  const statusText = live ? 'LIVE' : snap ? `SNAPSHOT ${timeNY(snap.at).slice(0, 5)} NY, NOT LIVE (${why})` : frame?.status === 'no-key' ? 'NO AISSTREAM KEY' : conn === 'connecting' || frame?.status === 'connecting' ? 'CONNECTING' : 'OFFLINE';

  return (
    <div className="panel-fill tnkr">
      <div className="toolbar">
        {(['tankers', 'chokepoints', 'all'] as ViewKind[]).map((v) => (
          <button key={v} aria-pressed={view === v} onClick={() => setView(v)}>{v === 'all' ? 'ALL SHIPS (VISIBLE AREA)' : v.toUpperCase()}</button>
        ))}
        <span className={live ? 'up' : 'down'} style={{ fontWeight: 600 }}>{statusText}</span>
        {frame && <span className="muted">{frame.msgs.toLocaleString()} msgs{frame.compression === false ? ', uncompressed: may be throttled' : ''}</span>}
        {(wti.data || brent.data) && (
          <span className="muted">
            WTI <span style={{ color: 'var(--value)' }}>{fmt(wti.data?.value)}</span> ({wti.data?.date}) · Brent <span style={{ color: 'var(--value)' }}>{fmt(brent.data?.value)}</span>
          </span>
        )}
      </div>
      <div className="toolbar">
        {(Object.keys(LABELS) as Category[]).filter((c) => view === 'all' || c === 'tanker' || c === 'lng_lpg').map((c) => (
          <label key={c} className="toggle" style={{ minHeight: 20 }}>
            <input type="checkbox" checked={layers[c]} onChange={(e) => setLayers((l) => ({ ...l, [c]: e.target.checked }))} />
            <span style={{ color: COLORS[c] }}>■</span> {LABELS[c]} ({counts[c]})
          </label>
        ))}
        <label className="toggle" style={{ minHeight: 20 }}><input type="checkbox" checked={trails} onChange={(e) => setTrails(e.target.checked)} /> Trails</label>
      </div>
      <div className="tnkr__body grow">
        {supported ? <div ref={box} className="tnkr__map" /> : <div className="state">The map needs WebGL 2. Chokepoint tables below still work.</div>}
        <aside className="tnkr__side">
          {sel ? (
            <section>
              <h4 className="accent">{sel.s?.n || 'Unknown name'} <button className="link-btn" onClick={() => setSelected(null)}>close</button></h4>
              <dl className="kv">
                <dt>MMSI</dt><dd>{sel.p[0]}</dd>
                <dt>IMO</dt><dd>{sel.s?.i || '-'}</dd>
                <dt>Call sign</dt><dd>{sel.s?.cs || '-'}</dd>
                <dt>Flag (MMSI)</dt><dd>{flagOf(sel.p[0])}</dd>
                <dt>Type</dt><dd>{LABELS[category({ type: sel.p[6], name: sel.s?.n })]} (code {sel.p[6] || '?'})</dd>
                <dt>Destination</dt><dd>{sel.s?.d || '-'} <span className="muted">(as broadcast)</span></dd>
                <dt>Speed</dt><dd>{sel.p[3] != null ? `${sel.p[3]} kn` : '-'}</dd>
                <dt>Course / heading</dt><dd>{sel.p[4] ?? '-'} / {sel.p[5] ?? '-'}</dd>
                <dt>Draught</dt><dd>{sel.s?.dr ? `${sel.s.dr} m` : '-'}</dd>
                <dt>Last seen</dt><dd>{timeNY(sel.p[7] * 1000)} NY</dd>
              </dl>
            </section>
          ) : null}
          <section>
            <h4 className="accent">CHOKEPOINTS</h4>
            <table className="grid-table">
              <thead><tr><th>Zone</th><th className="num" title="Distinct tankers seen by the relay in 24 h, only while the map was open">Live 24h</th><th className="num" title="IMF PortWatch daily tanker transits, latest day">PortWatch</th><th className="num" title="7-day average vs prior 7 days">7d trend</th></tr></thead>
              <tbody>
                {CHOKEPOINTS.map((z) => {
                  const p = pwByName[z.id];
                  const trend = p && p.prev7 ? (p.avg7 / p.prev7 - 1) * 100 : null;
                  return (
                    <tr key={z.id} className="clickable" onClick={() => map.current?.flyTo({ center: [(z.box[1] + z.box[3]) / 2, (z.box[0] + z.box[2]) / 2], zoom: 7, essential: true })}>
                      <td>{z.name}</td>
                      <td className="num">{frame?.zones?.[z.id] ?? '-'}</td>
                      <td className="num" title={p ? `as of ${p.lastDate}` : 'not covered'}>{p ? p.last : '-'}</td>
                      <td className={`num ${trend == null ? '' : trend >= 0 ? 'up' : 'down'}`}>{trend == null ? '-' : `${trend >= 0 ? '+' : ''}${trend.toFixed(0)}%`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
          {frame && frame.dark.length > 0 && (
            <section>
              <h4 className="down">DARK SHIP ALERTS</h4>
              <table className="grid-table">
                <tbody>
                  {frame.dark.map((d) => (
                    <tr key={d.mmsi} className="clickable" onClick={() => { setSelected(d.mmsi); map.current?.flyTo({ center: [d.lon, d.lat], zoom: 7 }); }}>
                      <td>{d.name || d.mmsi}</td><td className="muted">{d.zone}</td><td className="num down">{d.silentMin}m silent</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}
          <p className="disclaimer">
            Limits: AIS destinations are typed in by crews and often wrong. Cargo is not broadcast, and AIS type codes cannot tell crude from products. Coverage thins far offshore. Free data lags by minutes. Ships can switch AIS off, which is what the dark-ship list watches for (gap over 60 minutes inside a chokepoint, counted only while the relay has been running at least an hour). PortWatch transits are official IMF estimates and lag about a week. Live 24h counts only cover time the map was open.
          </p>
        </aside>
      </div>
    </div>
  );
}
