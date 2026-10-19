// Country choropleth as a WebGL globe or a flat 2D map (13.4). The flat map is also the fallback
// when WebGL 2 is missing, too many 3D views are open, or Low power mode is on (10.4).
import { useEffect, useRef, useState } from 'react';
import { acquireContext, disposeTree, fpsGovernor, lowPower, releaseContext, webgl2Available } from './gl';
import { loadCountries, paint, pickCanvas, type Country } from './worldMap';

interface Props {
  mode: 'globe' | 'flat';
  /** CSS color for a country by ISO numeric id, or null for "no data". */
  colorOf: (id: string) => string | null;
  /** Tooltip text for a country. */
  labelOf: (c: Country) => string;
  /** Changes when colors change, so the texture repaints. */
  version: string;
}

const TEX_W = 2048;
const TEX_H = 1024;

export function CountryMap({ mode, colorOf, labelOf, version }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [countries, setCountries] = useState<Country[] | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const [fallback, setFallback] = useState<string | null>(null);
  const texCanvas = useRef<HTMLCanvasElement | null>(null);
  const repaint = useRef<() => void>(() => undefined);
  const picker = useRef<ReturnType<typeof pickCanvas> | null>(null);
  const labelRef = useRef(labelOf);
  useEffect(() => {
    labelRef.current = labelOf;
  });

  useEffect(() => {
    void loadCountries().then(setCountries);
  }, []);

  // Paint the shared equirectangular texture.
  useEffect(() => {
    if (!countries) return;
    texCanvas.current ??= Object.assign(document.createElement('canvas'), { width: TEX_W, height: TEX_H });
    const ctx = texCanvas.current.getContext('2d')!;
    ctx.fillStyle = '#05080c';
    ctx.fillRect(0, 0, TEX_W, TEX_H);
    paint(ctx, countries, (c) => colorOf(c.id) ?? '#2a2a2a', 'rgba(0,0,0,0.9)');
    picker.current ??= pickCanvas(countries, TEX_W, TEX_H);
    repaint.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries, version]);

  const wantGlobe = mode === 'globe' && webgl2Available() && !lowPower() && fallback === null;

  // Flat map: draw the texture into a 2D canvas.
  useEffect(() => {
    if (!countries || wantGlobe) return;
    const el = box.current!;
    const cv = document.createElement('canvas');
    cv.style.width = '100%';
    cv.style.height = '100%';
    cv.setAttribute('role', 'img');
    cv.setAttribute('aria-label', 'World map colored by the selected metric');
    el.appendChild(cv);
    const draw = () => {
      const w = el.clientWidth;
      const h = Math.max(160, Math.round(w / 2));
      cv.width = w * devicePixelRatio;
      cv.height = h * devicePixelRatio;
      cv.style.height = `${h}px`;
      cv.getContext('2d')!.drawImage(texCanvas.current!, 0, 0, cv.width, cv.height);
    };
    repaint.current = draw;
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    const move = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const c = picker.current?.lookup((e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      setTip(c ? { x: e.clientX - r.left, y: e.clientY - r.top, text: labelRef.current(c) } : null);
    };
    cv.addEventListener('pointermove', move);
    cv.addEventListener('pointerleave', () => setTip(null));
    return () => {
      ro.disconnect();
      cv.remove();
      repaint.current = () => undefined;
    };
  }, [countries, wantGlobe]);

  // Globe: Three.js sphere with the texture, orbit controls, slow auto rotation.
  useEffect(() => {
    if (!countries || !wantGlobe) return;
    let disposed = false;
    let cleanup = () => undefined;
    void (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      if (disposed) return;
      if (!acquireContext()) {
        setFallback('Too many 3D views open; showing the flat map.');
        return;
      }
      const el = box.current!;
      const w = el.clientWidth;
      const h = Math.max(240, Math.min(520, w * 0.7));
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      renderer.setSize(w, h);
      el.appendChild(renderer.domElement);
      renderer.domElement.setAttribute('aria-label', 'Interactive globe colored by the selected metric. Drag to rotate.');
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(35, w / h, 0.1, 100);
      camera.position.set(0, 0.6, 4.2);
      const tex = new THREE.CanvasTexture(texCanvas.current!);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      const globe = new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), new THREE.MeshBasicMaterial({ map: tex }));
      scene.add(globe);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.minDistance = 1.6;
      controls.maxDistance = 8;
      controls.autoRotate = true;
      controls.autoRotateSpeed = 0.4;
      controls.enableDamping = true;
      repaint.current = () => {
        tex.needsUpdate = true;
      };
      const govern = fpsGovernor(renderer, () => {
        controls.autoRotate = false;
      });
      const ray = new THREE.Raycaster();
      const ndc = new THREE.Vector2();
      const move = (e: PointerEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        ray.setFromCamera(ndc, camera);
        const hit = ray.intersectObject(globe)[0];
        const c = hit?.uv ? picker.current?.lookup(hit.uv.x, 1 - hit.uv.y) : null;
        setTip(c ? { x: e.clientX - r.left, y: e.clientY - r.top, text: labelRef.current(c) } : null);
      };
      renderer.domElement.addEventListener('pointermove', move);
      renderer.domElement.addEventListener('pointerleave', () => setTip(null));
      renderer.domElement.addEventListener('webglcontextlost', (e) => e.preventDefault());
      let raf = 0;
      const loop = () => {
        controls.update();
        renderer.render(scene, camera);
        govern();
        raf = requestAnimationFrame(loop);
      };
      loop();
      const ro = new ResizeObserver(() => {
        const nw = el.clientWidth;
        const nh = Math.max(240, Math.min(520, nw * 0.7));
        renderer.setSize(nw, nh);
        camera.aspect = nw / nh;
        camera.updateProjectionMatrix();
      });
      ro.observe(el);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        controls.dispose();
        disposeTree(scene);
        renderer.dispose();
        renderer.domElement.remove();
        repaint.current = () => undefined;
        releaseContext();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [countries, wantGlobe]);

  return (
    <div style={{ position: 'relative' }}>
      {mode === 'globe' && !wantGlobe && <div className="muted">Flat map shown (Low power mode, reduced motion or no WebGL 2).</div>}
      {fallback && <div className="muted">{fallback}</div>}
      <div ref={box} style={{ width: '100%', touchAction: 'none' }} />
      {!countries && <div className="skeleton" />}
      {tip && (
        <div className="map-tip" style={{ left: tip.x + 12, top: tip.y + 12 }}>
          {tip.text}
        </div>
      )}
    </div>
  );
}
