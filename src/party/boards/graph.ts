// Turns a board's path pieces (control points + space pattern) into spaces and edges: the
// pieces are Catmull-Rom curves, sampled every `spacing` units, exactly like the Bildprobe.

import type { BEdge, BNode, BoardGraph, SpaceType } from './types';

export interface Segment {
  id: string;
  from: string;
  to: string;
  /** Name of the way when it starts at a junction. */
  route?: string;
  pts: [number, number][];
  /** Space types along the piece, repeated. */
  pat: string;
}

export function catmull(pts: [number, number][], per = 14): [number, number][] {
  const P = [pts[0], ...pts, pts[pts.length - 1]];
  const out: [number, number][] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (j: 0 | 1) => 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3);
      out.push([f(0), f(1)]);
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

export function resample(poly: [number, number][], spacing: number): [number, number][] {
  const L = [0];
  for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  const total = L[L.length - 1], n = Math.max(1, Math.round(total / spacing)), res: [number, number][] = [];
  let j = 0;
  for (let s = 0; s <= n; s++) {
    const d = (s * total) / n;
    while (j < poly.length - 2 && L[j + 1] < d) j++;
    const t = (d - L[j]) / (L[j + 1] - L[j] || 1);
    res.push([poly[j][0] + (poly[j + 1][0] - poly[j][0]) * t, poly[j][1] + (poly[j + 1][1] - poly[j][1]) * t]);
  }
  return res;
}

export interface GraphOptions {
  spacing?: number;
  /** Space type of each named waypoint. */
  named: Record<string, SpaceType>;
  start: string;
  /** Drop sampled spaces here (e.g. over water under a bridge). */
  skip?: (x: number, z: number) => boolean;
  /** Mark an edge (e.g. the drawbridge). */
  flag?: (a: BNode, b: BNode, seg: Segment) => string | undefined;
}

export function buildGraph(segs: Segment[], o: GraphOptions): BoardGraph {
  const nodes: BNode[] = [], edges: BEdge[] = [], named: Record<string, BNode> = {};
  const mk = (x: number, z: number, type: SpaceType, extra: Partial<BNode> = {}) => {
    const n: BNode = { id: nodes.length, x, z, type, next: [], ...extra };
    nodes.push(n);
    return n;
  };
  for (const s of segs) {
    const A = named[s.from] || (named[s.from] = mk(s.pts[0][0], s.pts[0][1], o.named[s.from] ?? 'P', { name: s.from }));
    const pts = resample(catmull(s.pts), o.spacing ?? 3.3);
    const interior = pts.slice(1, -1).filter(([x, z]) => !o.skip?.(x, z));
    const last = s.pts[s.pts.length - 1];
    const created = interior.map(([x, z], i) => mk(x, z, s.pat[i % s.pat.length] as SpaceType, { seg: s.id }));
    const Z = named[s.to] || (named[s.to] = mk(last[0], last[1], o.named[s.to] ?? 'P', { name: s.to }));
    const chain = [A, ...created, Z];
    for (let i = 0; i < chain.length - 1; i++) {
      chain[i].next.push(chain[i + 1].id);
      edges.push({ a: chain[i].id, b: chain[i + 1].id, seg: s.id, flag: o.flag?.(chain[i], chain[i + 1], s) });
    }
    if (s.route) {
      A.routes = A.routes || {};
      A.routes[chain[1].id] = { name: s.route, len: created.length + 1, seg: s.id };
    }
  }
  return { nodes, edges, start: named[o.start].id };
}

/** Forward distance (in steps) from a to b along the paths; Infinity if unreachable. */
export function forwardDist(g: BoardGraph, a: number, b: number, limit = 200): number {
  if (a === b) return 0;
  const dist = new Map<number, number>([[a, 0]]);
  const q = [a];
  while (q.length) {
    const n = q.shift()!;
    const d = dist.get(n)!;
    if (d >= limit) continue;
    for (const m of g.nodes[n].next) {
      if (dist.has(m)) continue;
      dist.set(m, d + 1);
      if (m === b) return d + 1;
      q.push(m);
    }
  }
  return Infinity;
}

/** The spaces on the shortest forward way from a to b (excluding a, including b). */
export function forwardPath(g: BoardGraph, a: number, b: number): number[] {
  const prev = new Map<number, number>([[a, -1]]);
  const q = [a];
  while (q.length) {
    const n = q.shift()!;
    if (n === b) break;
    for (const m of g.nodes[n].next) if (!prev.has(m)) { prev.set(m, n); q.push(m); }
  }
  if (!prev.has(b)) return [];
  const out: number[] = [];
  for (let n = b; n !== a; n = prev.get(n)!) out.unshift(n);
  return out;
}

export const edgeOf = (g: BoardGraph, a: number, b: number) => g.edges.find((e) => e.a === a && e.b === b);
