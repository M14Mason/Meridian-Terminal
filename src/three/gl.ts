// WebGL guardrails (10.4): capability check, a cap on live contexts (phones allow few),
// low power detection and an FPS governor. All 3D panels go through here.
import type { WebGLRenderer } from 'three';

let webgl2: boolean | null = null;
export function webgl2Available(): boolean {
  if (webgl2 !== null) return webgl2;
  try {
    webgl2 = Boolean(document.createElement('canvas').getContext('webgl2'));
  } catch {
    webgl2 = false;
  }
  return webgl2;
}

const MAX_CONTEXTS = /iPhone|iPad|Android/.test(navigator.userAgent) ? 2 : 4;
let live = 0;

/** Returns false when too many 3D views are open; the caller shows its 2D fallback. */
export function acquireContext(): boolean {
  if (live >= MAX_CONTEXTS) return false;
  live++;
  return true;
}
export function releaseContext(): void {
  live = Math.max(0, live - 1);
}

export function lowPower(): boolean {
  return document.documentElement.dataset.lowpower === '1' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
}

/**
 * Watches frame times. Under the floor (30 fps on phones, 50 on desktop) for 2 s, it drops the
 * pixel ratio to 1, then tells the caller to turn off auto motion.
 */
export function fpsGovernor(renderer: WebGLRenderer, onDegrade: () => void) {
  const floor = /iPhone|Android/.test(navigator.userAgent) ? 30 : 50;
  let last = performance.now();
  let slow = 0;
  let stage = 0;
  return () => {
    const now = performance.now();
    const fps = 1000 / Math.max(1, now - last);
    last = now;
    slow = fps < floor ? slow + (now - last + 16) : 0;
    if (slow > 2000 && stage < 2) {
      slow = 0;
      stage++;
      if (stage === 1) renderer.setPixelRatio(1);
      else onDegrade();
    }
  };
}

/** Disposes every geometry, material and texture under an object (10.4: dispose on unmount). */
export function disposeTree(obj: { traverse: (fn: (o: unknown) => void) => void }): void {
  obj.traverse((o) => {
    const m = o as { geometry?: { dispose(): void }; material?: { dispose(): void; map?: { dispose(): void } } | { dispose(): void }[] };
    m.geometry?.dispose();
    const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
    for (const mat of mats) {
      (mat as { map?: { dispose(): void } }).map?.dispose();
      mat.dispose();
    }
  });
}
