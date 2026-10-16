// Small shared helpers for Unser Party Spiel: timing (with the test speed-up), maths, easing, RNG.

const QS = new URLSearchParams(location.search);

/** Test speed-up: `?fast` runs every pause and tween at a fraction of its length (e.g. ?fast=0.1). */
export const SPEED = QS.has('fast') ? Math.max(0.02, Number(QS.get('fast')) || 0.15) : 1;
/** `?test`: the headless software renderer is slow, so frames may catch up with bigger steps. */
export const TEST = QS.has('test');
export const MAXDT = TEST ? 0.35 : 0.05;
/** `?auto`: this browser's seat is played by a bot (tests), cards and results click themselves. */
export const AUTO = QS.has('auto');

const RMQ = matchMedia('(prefers-reduced-motion: reduce)');
export let reduced = RMQ.matches;
RMQ.addEventListener?.('change', (e) => { reduced = e.matches; });

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** A pause in the show: shortened by ?fast and by reduced motion. */
export const wait = (ms: number) => sleep(reduced ? Math.min(ms, 160) * Math.min(1, SPEED * 3) : ms * SPEED);

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const TAU = Math.PI * 2;
export const wrapA = (a: number) => { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; };
export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const pickR = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 0.5;
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export const E = {
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t: number) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
};

/** Seeded RNG (mulberry32). Returns a function giving [0, 1). */
export function mulberry(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const newSeed = () => (Math.random() * 2 ** 31) | 0;

// ---------- tweens, driven by the render loop ----------
interface Tw { t: number; dur: number; fn: (k: number) => void; ez?: (t: number) => number; res: () => void }
const tweens: Tw[] = [];
export function tween(dur: number, fn: (k: number) => void, ez?: (t: number) => number): Promise<void> {
  dur = reduced ? Math.min(dur, 0.12) : dur * SPEED;
  return new Promise((res) => {
    if (dur <= 0.001) { fn(1); res(); return; }
    fn(ez ? ez(0) : 0);
    tweens.push({ t: 0, dur, fn, ez, res });
  });
}
export function tickTweens(dt: number) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const w = tweens[i];
    w.t += dt;
    const k = Math.min(1, w.t / w.dur);
    w.fn(w.ez ? w.ez(k) : k);
    if (k >= 1) { tweens.splice(i, 1); w.res(); }
  }
}

/** Ids for players and rooms. */
export function newId() {
  const a = new Uint32Array(2);
  crypto.getRandomValues(a);
  return a[0].toString(36) + a[1].toString(36);
}

export const $ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => r.querySelector<T>(s)!;
export const $$ = <T extends HTMLElement = HTMLElement>(s: string, r: ParentNode = document) => [...r.querySelectorAll<T>(s)];
