// 3D supply chain network (10.3, 15.10): nodes on a force layout, edges with direction particles,
// click to select and fly the camera. Uses the shared WebGL guardrails; callers show a table fallback.
import { useEffect, useRef, useState } from 'react';
import { forceLayout } from '../../shared/supply';
import { acquireContext, disposeTree, fpsGovernor, lowPower, releaseContext, webgl2Available } from './gl';

export interface GNode { id: string; role: 'root' | 'supplier' | 'customer' | 'partner' | 'other'; size: number; impact?: number }
export interface GLink { from: string; to: string; w: number }

const COLORS: Record<GNode['role'], string> = { root: '#f2a446', supplier: '#4aa3ff', customer: '#4af6c3', partner: '#b07cff', other: '#8a8a8a' };

export function SupplyGraph({ nodes, links, selected, onSelect, height = 380 }: { nodes: GNode[]; links: GLink[]; selected: string | null; onSelect: (id: string) => void; height?: number }) {
  const box = useRef<HTMLDivElement>(null);
  const sel = useRef<(id: string | null) => void>(() => undefined);
  const [msg, setMsg] = useState<string | null>(null);
  const supported = webgl2Available();

  useEffect(() => {
    if (!supported || !nodes.length) return;
    let cleanup = () => undefined;
    let dead = false;
    void (async () => {
      const THREE = await import('three');
      const { OrbitControls } = await import('three/addons/controls/OrbitControls.js');
      if (dead) return;
      if (!acquireContext()) { setMsg('Too many 3D views open; showing the table.'); return; }
      const el = box.current!;
      const w = el.clientWidth || 600;
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(2, devicePixelRatio));
      renderer.setSize(w, height);
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(50, w / height, 0.1, 200);
      camera.position.set(0, 0, 9);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      const pos = forceLayout(nodes.map((n) => n.id), links.map((l) => [l.from, l.to]), Math.min(400, 80 + nodes.length * 3));
      // Normalize the layout to a radius of about 3 and frame it with the camera.
      const rMax = Math.max(0.5, ...[...pos.values()].map((p) => Math.hypot(...p)));
      for (const [k, p] of pos) pos.set(k, [(p[0] / rMax) * 3, (p[1] / rMax) * 3, (p[2] / rMax) * 3]);
      camera.position.set(0, 0, 7.5);

      // Nodes
      const meshes = new Map<string, InstanceType<typeof THREE.Mesh>>();
      const sphere = new THREE.SphereGeometry(1, 16, 12);
      for (const n of nodes) {
        const c = n.impact != null && n.impact > 0.001 && n.role !== 'root' ? new THREE.Color('#3a3a3a').lerp(new THREE.Color('#ff433d'), Math.min(1, n.impact * 4 + 0.15)) : new THREE.Color(COLORS[n.role]);
        const m = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ color: c }));
        const r = 0.12 + Math.min(0.25, 0.04 * Math.sqrt(n.size)) + (n.role === 'root' ? 0.12 : 0);
        m.scale.setScalar(r);
        m.position.set(...pos.get(n.id)!);
        m.userData.id = n.id;
        scene.add(m);
        meshes.set(n.id, m);
      }
      // Labels (canvas sprites) for up to 80 nodes.
      const labels: InstanceType<typeof THREE.Sprite>[] = [];
      if (nodes.length <= 80) {
        for (const n of nodes) {
          const cv = document.createElement('canvas');
          const text = n.id.length > 26 ? `${n.id.slice(0, 25)}…` : n.id;
          cv.width = 256; cv.height = 40;
          const g = cv.getContext('2d')!;
          g.font = '22px "IBM Plex Mono", monospace';
          g.fillStyle = n.role === 'root' ? '#f2a446' : '#e8e8e8';
          g.fillText(text, 4, 28);
          const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, depthWrite: false }));
          sp.scale.set(2.2, 0.34, 1);
          const p = pos.get(n.id)!;
          sp.position.set(p[0], p[1] + 0.38, p[2]);
          scene.add(sp);
          labels.push(sp);
        }
      }
      // Edges
      const segs: number[] = [];
      for (const l of links) { const a = pos.get(l.from), b = pos.get(l.to); if (a && b) segs.push(...a, ...b); }
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
      scene.add(new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0x5a6a85, transparent: true, opacity: 0.6 })));
      // Particles flowing supplier -> customer (off in Low power mode).
      const flows = lowPower() ? [] : links.filter((l) => pos.get(l.from) && pos.get(l.to)).slice(0, 400);
      const pg = new THREE.BufferGeometry();
      const pp = new Float32Array(flows.length * 3);
      pg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
      const pts = new THREE.Points(pg, new THREE.PointsMaterial({ color: 0xf2a446, size: 0.07 }));
      scene.add(pts);

      // Selection and camera fly.
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffffff }));
      ring.visible = false;
      scene.add(ring);
      let flyTo: InstanceType<typeof THREE.Vector3> | null = null;
      sel.current = (id) => {
        const m = id ? meshes.get(id) : null;
        ring.visible = Boolean(m);
        if (m) { ring.position.copy(m.position); ring.scale.setScalar(m.scale.x * 1.6); flyTo = m.position.clone(); }
      };
      sel.current(selected);
      const ray = new THREE.Raycaster();
      const onClick = (e: MouseEvent) => {
        const r = renderer.domElement.getBoundingClientRect();
        ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
        const hit = ray.intersectObjects([...meshes.values()])[0];
        if (hit) onSelect(hit.object.userData.id as string);
      };
      renderer.domElement.addEventListener('click', onClick);
      const stopGov = fpsGovernor(renderer, () => { pts.visible = false; });

      let raf = 0;
      let t = 0;
      const loop = () => {
        t += 0.006;
        flows.forEach((l, i) => {
          const a = pos.get(l.from)!, b = pos.get(l.to)!;
          const f = (t + i * 0.137) % 1;
          pp.set([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f], i * 3);
        });
        pg.attributes.position!.needsUpdate = true;
        if (flyTo) { controls.target.lerp(flyTo, 0.08); if (controls.target.distanceTo(flyTo) < 0.01) flyTo = null; }
        ring.lookAt(camera.position);
        controls.update();
        renderer.render(scene, camera);
        raf = requestAnimationFrame(loop);
      };
      loop();
      const onLost = (e: Event) => { e.preventDefault(); setMsg('3D view lost its graphics context; showing the table.'); };
      renderer.domElement.addEventListener('webglcontextlost', onLost);
      cleanup = () => {
        cancelAnimationFrame(raf);
        stopGov();
        renderer.domElement.removeEventListener('click', onClick);
        controls.dispose();
        labels.forEach((s) => s.material.map?.dispose());
        disposeTree(scene);
        renderer.dispose();
        renderer.domElement.remove();
        releaseContext();
      };
    })();
    return () => { dead = true; cleanup(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, supported, height]);

  useEffect(() => { sel.current(selected); }, [selected]);

  if (!supported) return <p className="muted">3D view needs WebGL 2; the table below has the same data.</p>;
  return (
    <div>
      {msg && <p className="muted">{msg}</p>}
      <div ref={box} className="supply-graph" style={{ height, minHeight: 240 }} aria-label="3D supply chain network. The table below lists the same relationships." role="img" />
    </div>
  );
}
