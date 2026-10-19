// GSAP is loaded lazily after first paint so it never blocks the shell (10.1, 10.4).
// All motion is skipped under prefers-reduced-motion or Low power mode.

type Gsap = typeof import('gsap').gsap;
let gsapP: Promise<Gsap> | null = null;
let lowPower = false;

export function setLowPower(v: boolean): void {
  lowPower = v;
}

export function motionAllowed(): boolean {
  if (lowPower) return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function gsap(): Promise<Gsap> {
  gsapP ??= import('gsap').then((m) => m.gsap);
  return gsapP;
}

export function animateIn(el: Element | null): void {
  if (!el || !motionAllowed()) return;
  void gsap().then((g) => g.fromTo(el, { opacity: 0, scale: 0.97 }, { opacity: 1, scale: 1, duration: 0.18, ease: 'power2.out', clearProps: 'transform,opacity' }));
}

export function flash(el: Element | null, color: string): void {
  if (!el || !motionAllowed()) return;
  void gsap().then((g) => g.fromTo(el, { backgroundColor: color }, { backgroundColor: 'transparent', duration: 0.8, ease: 'power1.out' }));
}

export function slideIn(el: Element | null, dir: 1 | -1): void {
  if (!el || !motionAllowed()) return;
  void gsap().then((g) => g.fromTo(el, { x: 24 * dir, opacity: 0.4 }, { x: 0, opacity: 1, duration: 0.2, ease: 'power2.out', clearProps: 'transform,opacity' }));
}

/** Auto low power: battery saver or a weak device. Manual setting overrides (10.4). */
export async function detectLowPower(): Promise<boolean> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<{ charging: boolean; level: number }>; deviceMemory?: number };
  if ((nav.deviceMemory ?? 8) <= 2 || (navigator.hardwareConcurrency ?? 8) <= 2) return true;
  try {
    const b = await nav.getBattery?.();
    if (b && !b.charging && b.level < 0.2) return true;
  } catch {
    // Battery API not available (Safari, Firefox).
  }
  return false;
}
