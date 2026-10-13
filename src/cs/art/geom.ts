/** Geometry helpers for building weapon outlines. All points in model-box units, y down. */
import type { WeaponPart } from '../contract';

export type Pt = [number, number];
/** A point with an optional corner radius. */
export type PtR = [number, number] | [number, number, number];

/** Polygon with rounded corners: each point may carry its own radius (3rd value), else `r`. */
export function shape(pts: PtR[], r = 0, steps = 4): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p = pts[i], a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const rad = p.length > 2 ? (p as number[])[2] : r;
    if (!rad) { out.push([p[0], p[1]]); continue; }
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const rr = Math.min(rad, da / 2, db / 2);
    if (rr < 0.01) { out.push([p[0], p[1]]); continue; }
    const s: Pt = [p[0] + (a[0] - p[0]) / da * rr, p[1] + (a[1] - p[1]) / da * rr];
    const e: Pt = [p[0] + (b[0] - p[0]) / db * rr, p[1] + (b[1] - p[1]) / db * rr];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps, u = 1 - t;
      out.push([u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]]);
    }
  }
  return out;
}

export function rect(x: number, y: number, w: number, h: number, r = 0): Pt[] {
  return shape([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], r);
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx, n = 28): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return out;
}

/** Closed Catmull-Rom spline through the points (smooth organic outlines: blades, gloves). */
export function spline(pts: Pt[], steps = 6): Pt[] {
  const n = pts.length;
  const out: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < steps; k++) {
      const t = k / steps, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/** Mixed outline: sharp corners at points flagged with 0 radius, spline-smooth elsewhere is overkill;
 *  use `shape` for machined parts and `spline` for organic ones. */

export function part(
  name: string,
  rings: Pt[] | Pt[][],
  material: WeaponPart['material'],
  depth: number,
  layer: number,
  z = 0,
): WeaponPart {
  const rs = (Array.isArray(rings[0]) && Array.isArray((rings as Pt[][])[0][0])) ? (rings as Pt[][]) : [rings as Pt[]];
  return { name, rings: rs.map((r) => r.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100] as [number, number])), material, depth, z, layer };
}

/** Mirror points horizontally inside a box of width w (for left-facing parts). */
export function flipX(pts: Pt[], w: number): Pt[] {
  return pts.map(([x, y]) => [w - x, y]);
}

export function translate(pts: Pt[], dx: number, dy: number): Pt[] {
  return pts.map(([x, y]) => [x + dx, y + dy]);
}

export function rotate(pts: Pt[], cx: number, cy: number, deg: number): Pt[] {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return pts.map(([x, y]) => [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c]);
}
