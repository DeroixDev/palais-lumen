/** Small seeded randomness + value noise for the procedural skin patterns. */

export type Rng = () => number;

/** mulberry32: fast, good enough, deterministic. */
export function rng(seed: number): Rng {
  let a = (seed | 0) ^ 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** String hash (FNV-1a) for turning ids into seeds. */
export function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** 2D value noise with a 256 lattice; smooth (quintic) interpolation. Returns 0..1. */
export class Noise {
  private perm = new Uint8Array(512);
  private vals = new Float32Array(256);
  constructor(seed: number) {
    const r = rng(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) { p[i] = i; this.vals[i] = r(); }
    for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }
  v(x: number, y: number): number {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const P = this.perm, V = this.vals;
    const a = V[P[P[X] + Y]], b = V[P[P[X + 1] + Y]];
    const c = V[P[P[X] + Y + 1]], d = V[P[P[X + 1] + Y + 1]];
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const w = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  }
  /** Fractal sum, 0..1 (roughly). */
  fbm(x: number, y: number, oct = 4, lac = 2, gain = 0.5): number {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      s += amp * this.v(x * f + i * 17.3, y * f - i * 9.1);
      norm += amp; amp *= gain; f *= lac;
    }
    return s / norm;
  }
  /** Ridged noise, 0..1, sharp crests: good for veins and marble. */
  ridge(x: number, y: number, oct = 4): number {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) {
      const n = 1 - Math.abs(this.v(x * f + i * 31.7, y * f + i * 5.3) * 2 - 1);
      s += amp * n * n; norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  }
}

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (e0: number, e1: number, x: number) => {
  const t = clamp((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
};

/** Parse '#rrggbb' / '#rgb' into [r,g,b] 0..255. */
export function hex(c: string): [number, number, number] {
  let s = c.replace('#', '');
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  const n = parseInt(s.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function rgb(c: [number, number, number], a = 1): string {
  return a >= 1 ? `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})` : `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
}
export function mix(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
/** Sample a palette (list of rgb) at t 0..1 with linear blending. */
export function ramp(pal: [number, number, number][], t: number): [number, number, number] {
  t = clamp(t) * (pal.length - 1);
  const i = Math.min(pal.length - 2, Math.floor(t));
  if (pal.length === 1) return pal[0];
  return mix(pal[i], pal[i + 1], t - i);
}
export function shade(c: string, f: number): string {
  const [r, g, b] = hex(c);
  if (f >= 0) return rgb(mix([r, g, b], [255, 255, 255], f));
  return rgb(mix([r, g, b], [0, 0, 0], -f));
}
