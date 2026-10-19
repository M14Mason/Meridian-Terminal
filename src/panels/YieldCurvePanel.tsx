import { useEffect, useMemo, useRef, useState } from 'react';
import { series } from '../data/adapters/fred';
import type { Fetched } from '../data/client';
import { useData } from '../data/useData';
import { fmt } from '../lib/format';
import { DataStatus } from '../shell/DataStatus';
import type { PanelProps } from '../shell/types';
import { acquireContext, disposeTree, lowPower, releaseContext, webgl2Available } from '../three/gl';

// YCRV: US Treasury curve (item 69) with animated history and a 3D surface (10.3).
const TENORS: [string, string][] = [['DGS1MO', '1M'], ['DGS3MO', '3M'], ['DGS6MO', '6M'], ['DGS1', '1Y'], ['DGS2', '2Y'], ['DGS3', '3Y'], ['DGS5', '5Y'], ['DGS7', '7Y'], ['DGS10', '10Y'], ['DGS20', '20Y'], ['DGS30', '30Y']];

interface Curve { dates: string[]; y: number[][] } // y[dateIndex][tenorIndex]

async function loadCurves(years: number): Promise<Fetched<Curve>> {
  const start = new Date(Date.now() - years * 365.25 * 86_400_000).toISOString().slice(0, 10);
  const all = await Promise.all(TENORS.map(([id]) => series(id, start, { frequency: 'w' })));
  const maps = all.map((r) => new Map(r.data.map((o) => [o.date, o.value])));
  const dates = [...maps[0]!.keys()].filter((d) => maps.every((m) => m.has(d))).sort();
  return { data: { dates, y: dates.map((d) => maps.map((m) => m.get(d)!)) }, fetchedAt: Math.min(...all.map((r) => r.fetchedAt)), fromCache: false };
}

function Surface({ curve }: { curve: Curve }) {
  const box = useRef<HTMLDivElement>(null);
  const unsupported = !webgl2Available() || lowPower();
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    if (unsupported) return;
    let cleanup = () => undefined;
    let dead = false;
    void (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      if (dead) return;
      if (!acquireContext()) {
        setMsg('Too many 3D views open.');
        return;
      }
      const el = box.current!;
      const w = el.clientWidth;
      const h = Math.max(260, Math.round(w * 0.55));
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
      camera.position.set(2.2, 1.6, 2.4);
      const nx = TENORS.length;
      const nz = curve.dates.length;
      const max = Math.max(...curve.y.flat());
      const min = Math.min(...curve.y.flat());
      const geo = new THREE.PlaneGeometry(2, 2, nx - 1, nz - 1);
      const pos = geo.attributes.position!;
      const colors = new Float32Array(pos.count * 3);
      const lo = new THREE.Color('#0068ff');
      const hi = new THREE.Color('#f2a446');
      for (let iz = 0; iz < nz; iz++) {
        for (let ix = 0; ix < nx; ix++) {
          const k = iz * nx + ix;
          const v = curve.y[iz]![ix]!;
          const t = (v - min) / (max - min || 1);
          pos.setXYZ(k, ix / (nx - 1) * 2 - 1, t * 0.9, iz / (nz - 1) * 2 - 1);
          const c = lo.clone().lerp(hi, t);
          colors.set([c.r, c.g, c.b], k * 3);
        }
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide })));
      scene.add(new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.25 })));
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.target.set(0, 0.3, 0);
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      cleanup = () => {
        cancelAnimationFrame(raf);
        controls.dispose();
        disposeTree(scene);
        renderer.dispose();
        renderer.domElement.remove();
        releaseContext();
      };
    })();
    return () => {
      dead = true;
      cleanup();
    };
  }, [curve, unsupported]);
  const note = unsupported ? '3D surface needs WebGL 2 and is off in Low power mode.' : msg;
  return (
    <div>
      {note ? <p className="muted">{note}</p> : <p className="muted">X: tenor 1M to 30Y. Depth: time, oldest at back. Height and color: yield. Drag to rotate.</p>}
      <div ref={box} />
    </div>
  );
}

export default function YieldCurvePanel(_: PanelProps) {
  const [years, setYears] = useState(5);
  const [mode, setMode] = useState<'2d' | '3d'>('2d');
  const state = useData(`ycrv:${years}`, () => loadCurves(years), { source: 'FRED (Treasury)', note: 'weekly avg', everyMs: 3600_000 });
  const curve = state.data;
  const [idx, setIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const n = curve?.dates.length ?? 0;
  const at = idx ?? n - 1;

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => setIdx((i) => {
      const next = (i ?? 0) + 1;
      if (next >= n - 1) setPlaying(false);
      return Math.min(next, n - 1);
    }), lowPower() ? 400 : 120);
    return () => clearInterval(id);
  }, [playing, n]);

  const W = 520;
  const H = 240;
  const P = 34;
  const all = useMemo(() => curve?.y.flat() ?? [], [curve]);
  const lo = Math.floor(Math.min(...all, 0));
  const hi = Math.ceil(Math.max(...all, 1));
  const X = (i: number) => P + (i / (TENORS.length - 1)) * (W - P * 1.5);
  const Y = (v: number) => H - P + -((v - lo) / (hi - lo)) * (H - P * 1.6);
  const path = (ys: number[]) => ys.map((v, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join('');
  const yearAgo = curve ? Math.max(0, at - 52) : 0;
  const cur = curve?.y[at];
  const inv = cur ? cur[8]! - cur[4]! : null;

  return (
    <div>
      <div className="toolbar">
        {[1, 2, 5, 10, 20].map((y) => <button key={y} aria-pressed={years === y} onClick={() => { setYears(y); setIdx(null); }}>{y}Y</button>)}
        <button aria-pressed={mode === '2d'} onClick={() => setMode('2d')}>CURVE</button>
        <button aria-pressed={mode === '3d'} onClick={() => setMode('3d')}>3D SURFACE</button>
      </div>
      <DataStatus state={state} keyName="FRED" />
      {curve && mode === '2d' && cur && (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: 720 }} role="img" aria-label={`Treasury yield curve on ${curve.dates[at]}`}>
            {Array.from({ length: hi - lo + 1 }, (_, k) => lo + k).map((v) => (
              <g key={v}>
                <line x1={P} x2={W - P / 2} y1={Y(v)} y2={Y(v)} stroke="var(--hairline)" />
                <text x={4} y={Y(v) + 4} fill="var(--text-dim)" fontSize={10}>{v}%</text>
              </g>
            ))}
            {TENORS.map(([, l], i) => <text key={l} x={X(i)} y={H - 8} fill="var(--text)" fontSize={10} textAnchor="middle">{l}</text>)}
            <path d={path(curve.y[yearAgo]!)} fill="none" stroke="var(--text-dim)" strokeDasharray="4 3" strokeWidth={1.5} />
            {at !== n - 1 && <path d={path(curve.y[n - 1]!)} fill="none" stroke="var(--value)" strokeOpacity={0.35} strokeWidth={1.5} />}
            <path d={path(cur)} fill="none" stroke="var(--text)" strokeWidth={2.5} />
            {cur.map((v, i) => <circle key={i} cx={X(i)} cy={Y(v)} r={3} fill="var(--text)" />)}
          </svg>
          <div className="toolbar">
            <button onClick={() => { if (at >= n - 1) setIdx(0); setPlaying((p) => !p); }}>{playing ? 'PAUSE' : 'PLAY HISTORY'}</button>
            <input type="range" min={0} max={n - 1} value={at} onChange={(e) => { setPlaying(false); setIdx(Number(e.target.value)); }} style={{ flex: 1, minWidth: 140 }} aria-label="Curve date" />
            <span className="accent">{curve.dates[at]}</span>
          </div>
          <table className="grid-table">
            <thead><tr>{TENORS.map(([, l]) => <th key={l} className="num">{l}</th>)}</tr></thead>
            <tbody>
              <tr>{cur.map((v, i) => <td key={i} className="num">{fmt(v)}</td>)}</tr>
              <tr className="muted">{curve.y[yearAgo]!.map((v, i) => <td key={i} className="num">{fmt(v)}</td>)}</tr>
            </tbody>
          </table>
          <p>
            10y minus 2y: <span className={inv != null && inv < 0 ? 'down' : 'up'}>{fmt(inv)} pp</span>
            {inv != null && inv < 0 ? ' (inverted)' : ''}. Orange: selected week. Dashed: one year earlier. Faint white: latest.
          </p>
        </>
      )}
      {curve && mode === '3d' && <Surface curve={curve} />}
      <div className="disclaimer">Source: FRED, US Treasury constant-maturity yields, weekly averages.</div>
    </div>
  );
}
