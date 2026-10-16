// Detail kit for the boards: instanced props (one draw call per kind, tinted per instance),
// curb studs along the paths, a shoreline foam ring, a ground texture with tile variation, and
// ambient life (birds, boats, cars, strollers) that moves on fixed loops.
// The board's shadow map is baked once, so static props may cast shadows for free; everything
// that moves all the time here does NOT cast. Nothing allocates per frame, and the ambient life
// sleeps (hidden, no updates) when the quality governor turns the effects off.

import type { BEdge, BNode } from './types';
import { Batch, BOX, CONE, CYL8, THREE, ctex, groundAniso, toon } from '../view3d/kit';
import { quality } from '../view3d/quality';
import { TAU } from '../util';
import { BULB, CYL6, LEAF, type P2 } from './bauteile';

const _d = new THREE.Object3D();
const _c = new THREE.Color();

export interface Item { x: number; z: number; y?: number; ry?: number; s?: number; sx?: number; sy?: number; sz?: number; c?: string }

/** Many copies of one (vertex-coloured, white-based) part: one draw call, tinted per instance. */
export function instanced(sc: THREE.Scene, geo: THREE.BufferGeometry, items: Item[], o: { mat?: THREE.Material; cast?: boolean; recv?: boolean } = {}) {
  const im = new THREE.InstancedMesh(geo, o.mat ?? VCT, Math.max(1, items.length));
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    _d.position.set(it.x, it.y ?? 0, it.z);
    _d.rotation.set(0, it.ry ?? 0, 0);
    _d.scale.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1));
    _d.updateMatrix();
    im.setMatrixAt(i, _d.matrix);
    im.setColorAt(i, _c.set(it.c ?? '#ffffff'));
  });
  im.count = items.length;
  im.castShadow = o.cast ?? true;
  im.receiveShadow = o.recv ?? true;
  im.computeBoundingSphere();
  sc.add(im);
  return im;
}
/** Vertex colours × instance colour (toon). */
export const VCT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: (toon('#ffffff') as THREE.MeshToonMaterial).gradientMap });

// ---------- prop geometries (built once, white parts take the instance tint) ----------
/** A three-sided blade (grass, weeds): 4 triangles. */
const BLADE = new THREE.ConeGeometry(1, 1, 3, 1, true);
const geoCache = new Map<string, THREE.BufferGeometry>();
function once(key: string, make: (b: Batch) => void) {
  let g = geoCache.get(key);
  if (!g) { const b = new Batch(); make(b); g = b.geometry(); geoCache.set(key, g); }
  return g;
}
export const PROPS = {
  /** Bench: tinted seat and back, dark legs. */
  bench: () => once('bench', (b) => {
    b.add(BOX, '#ffffff', 0, 0.42, 0, 0, 0, 0, 1.5, 0.08, 0.45); b.add(BOX, '#ffffff', 0, 0.72, -0.2, -0.15, 0, 0, 1.5, 0.32, 0.06);
    for (const s of [-0.62, 0.62]) b.add(BOX, '#2a2440', s, 0.2, 0, 0, 0, 0, 0.08, 0.42, 0.42);
  }),
  /** Round bush (tinted). */
  bush: () => once('bush', (b) => { b.add(LEAF, '#ffffff', 0, 0.35, 0, 0, 0, 0, 0.6, 0.45, 0.6); b.add(LEAF, '#e8ffe8', 0.32, 0.3, 0.12, 0, 0, 0, 0.36, 0.3, 0.36); b.add(LEAF, '#f0fff0', -0.28, 0.28, -0.1, 0, 0, 0, 0.34, 0.28, 0.34); }),
  /** Flower bed: dark box, tinted blooms. */
  flowers: () => once('flowers', (b) => {
    b.add(BOX, '#6a4a3a', 0, 0.12, 0, 0, 0, 0, 1.6, 0.24, 0.7);
    for (let k = 0; k < 7; k++) b.add(BULB, k % 2 ? '#ffffff' : '#fff0f6', -0.6 + k * 0.2, 0.32, (k % 3) * 0.18 - 0.18, 0, 0, 0, 0.13);
    for (let k = 0; k < 4; k++) b.add(LEAF, '#3fb86a', -0.5 + k * 0.33, 0.26, 0.1, 0, k, 0, 0.18, 0.08, 0.14);
  }),
  /** Fire hydrant / bollard (tinted). */
  hydrant: () => once('hydrant', (b) => { b.add(CYL8, '#ffffff', 0, 0.3, 0, 0, 0, 0, 0.16, 0.6, 0.16); b.add(BULB, '#ffffff', 0, 0.62, 0, 0, 0, 0, 0.16); b.add(CYL8, '#ffffff', 0, 0.4, 0, 0, 0, Math.PI / 2, 0.07, 0.42, 0.07); }),
  /** Street sign: pole and a tinted plate. */
  sign: () => once('sign', (b) => { b.add(CYL8, '#3a3550', 0, 0.8, 0, 0, 0, 0, 0.05, 1.6, 0.05); b.add(BOX, '#ffffff', 0, 1.5, 0.04, 0, 0, 0, 0.6, 0.6, 0.05); b.add(BOX, '#1a0b33', 0, 1.5, 0.07, 0, 0, Math.PI / 4, 0.3, 0.3, 0.02); }),
  /** Rooftop clutter: AC box, vent, antenna. */
  roofAC: () => once('roofAC', (b) => {
    b.add(BOX, '#ffffff', 0, 0.25, 0, 0, 0, 0, 0.9, 0.5, 0.7); b.add(CYL8, '#555066', 0, 0.52, 0, 0, 0, 0, 0.28, 0.05, 0.28);
    b.add(CYL8, '#dcd6ea', 0.7, 0.3, 0.2, 0, 0, 0, 0.12, 0.6, 0.12); b.add(CONE, '#dcd6ea', 0.7, 0.66, 0.2, 0, 0, 0, 0.18, 0.14, 0.18);
  }),
  roofTank: () => once('roofTank', (b) => {
    for (const [x, z] of [[-0.35, -0.35], [0.35, -0.35], [-0.35, 0.35], [0.35, 0.35]]) b.add(CYL8, '#5a4a3a', x, 0.3, z, 0, 0, 0, 0.05, 0.6, 0.05);
    b.add(CYL8, '#ffffff', 0, 0.95, 0, 0, 0, 0, 0.55, 0.75, 0.55); b.add(CONE, '#ffffff', 0, 1.5, 0, 0, 0, 0, 0.6, 0.35, 0.6);
  }),
  antenna: () => once('antenna', (b) => { b.add(CYL8, '#d8d0ee', 0, 0.9, 0, 0, 0, 0, 0.04, 1.8, 0.04); b.add(BOX, '#d8d0ee', 0, 1.4, 0, 0, 0, 0, 0.6, 0.04, 0.04); b.add(BULB, '#ff3d6e', 0, 1.85, 0, 0, 0, 0, 0.07); }),
  /** Awning over a shop door: tinted cloth with white stripes, unit width (scale x). */
  awning: () => once('awning', (b) => {
    for (let k = 0; k < 6; k++) b.add(BOX, k % 2 ? '#ffffff' : '#fff7fb', -0.5 + (k + 0.5) / 6, 0, 0, -0.45, 0, 0, 1 / 6, 0.05, 0.7);
    b.add(BOX, '#2a2440', 0, -0.32, 0.31, 0, 0, 0, 1.0, 0.04, 0.04);
  }),
  /** A shop door with a little lit sign above (front face at +z). */
  door: () => once('door', (b) => { b.add(BOX, '#3a2a5a', 0, 0.55, 0, 0, 0, 0, 0.8, 1.1, 0.06); b.add(BOX, '#ffffff', 0, 1.3, 0.02, 0, 0, 0, 1.1, 0.3, 0.06); }),
  /** Balcony strip (front face at +z), unit width. */
  balcony: () => once('balcony', (b) => { b.add(BOX, '#ffffff', 0, 0, 0.2, 0, 0, 0, 1, 0.06, 0.4); b.add(BOX, '#ffffff', 0, 0.22, 0.39, 0, 0, 0, 1, 0.04, 0.03); for (let k = 0; k < 5; k++) b.add(BOX, '#ffffff', -0.4 + k * 0.2, 0.11, 0.39, 0, 0, 0, 0.03, 0.22, 0.03); }),
  /** Planter with a clipped ball tree (tinted pot). */
  planter: () => once('planter', (b) => { b.add(BOX, '#ffffff', 0, 0.25, 0, 0, 0, 0, 0.6, 0.5, 0.6); b.add(CYL8, '#6b4a2e', 0, 0.75, 0, 0, 0, 0, 0.05, 0.6, 0.05); b.add(LEAF, '#2f9e5e', 0, 1.15, 0, 0, 0, 0, 0.4, 0.38, 0.4); }),
  /** Velvet rope stanchion pair (brass posts, tinted rope). */
  rope: () => once('rope', (b) => {
    for (const s of [-0.6, 0.6]) { b.add(CYL8, '#d9a94a', s, 0.45, 0, 0, 0, 0, 0.05, 0.9, 0.05); b.add(BULB, '#f2cf74', s, 0.92, 0, 0, 0, 0, 0.07); b.add(CYL8, '#d9a94a', s, 0.02, 0, 0, 0, 0, 0.16, 0.04, 0.16); }
    for (let k = 0; k < 6; k++) { const x = -0.5 + k * 0.2; b.add(CYL6, '#ffffff', x, 0.78 - Math.sin(((k + 0.5) / 6) * Math.PI) * 0.12, 0, 0, 0, Math.PI / 2, 0.025, 0.22, 0.025); }
  }),
  /** Bistro table with two chairs (tinted cloth). */
  bistro: () => once('bistro', (b) => {
    b.add(CYL8, '#ffffff', 0, 0.72, 0, 0, 0, 0, 0.45, 0.04, 0.45); b.add(CYL8, '#d9a94a', 0, 0.36, 0, 0, 0, 0, 0.04, 0.72, 0.04);
    for (const s of [-1, 1]) { b.add(BOX, '#d9a94a', s * 0.6, 0.42, 0, 0, 0, 0, 0.36, 0.04, 0.36); b.add(BOX, '#d9a94a', s * 0.76, 0.66, 0, 0, 0, 0, 0.04, 0.44, 0.36); }
  }),
  /** Traffic cone. */
  cone: () => once('tcone', (b) => { b.add(BOX, '#2a2a30', 0, 0.03, 0, 0, 0, 0, 0.42, 0.06, 0.42); b.add(CONE, '#ffffff', 0, 0.36, 0, 0, 0, 0, 0.17, 0.62, 0.17); b.add(CYL8, '#f4f4f4', 0, 0.36, 0, 0, 0, 0, 0.12, 0.08, 0.12); }),
  /** Tire stack. */
  tires: () => once('tires', (b) => { for (let k = 0; k < 3; k++) b.add(CYL8, '#1d1f24', 0, 0.15 + k * 0.27, 0, 0, k, 0, 0.42, 0.25, 0.42); b.add(CYL8, '#ffffff', 0, 0.82, 0, 0, 0, 0, 0.2, 0.02, 0.2); }),
  /** Pallet with sacks (tinted sacks). */
  sacks: () => once('sacks', (b) => { b.add(BOX, '#a9824e', 0, 0.07, 0, 0, 0, 0, 1.3, 0.14, 1.0); for (let k = 0; k < 4; k++) b.add(LEAF, '#ffffff', -0.3 + (k % 2) * 0.6, 0.3 + Math.floor(k / 2) * 0.28, (k % 2) * 0.1 - 0.05, 0, 0, 0, 0.32, 0.16, 0.42); }),
  /** Oil drum, tinted. */
  drum: () => once('drum', (b) => { b.add(CYL8, '#ffffff', 0, 0.55, 0, 0, 0, 0, 0.38, 1.1, 0.38); for (const y of [0.3, 0.8]) b.add(CYL8, '#2a2a30', 0, y, 0, 0, 0, 0, 0.4, 0.06, 0.4); }),
  /** Small tuft of grass/weeds (tinted). */
  tuft: () => once('tuft', (b) => { for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; b.add(BLADE, '#ffffff', Math.cos(a) * 0.1, 0.14, Math.sin(a) * 0.1, Math.cos(a) * 0.4, 0, Math.sin(a) * 0.4, 0.06, 0.3, 0.06); } }),
};

// ---------- curb studs along the paths ----------
/** Little studs on both sides of each path edge (skipping the space discs), alternating colours. */
export function curbs(sc: THREE.Scene, nodes: BNode[], edges: BEdge[], off: number, colors: string[], step = 0.95, size = 0.13) {
  const items: Item[] = [];
  for (const e of edges) {
    const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz);
    if (L < 3) continue;
    const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
    const n = Math.floor((L - 3) / step);
    for (let k = 0; k <= n; k++) {
      const t = 1.5 + k * step + ((L - 3) - n * step) / 2;
      for (const s of [-1, 1]) items.push({ x: A.x + ux * t + nx * off * s, y: 0.06, z: A.z + uz * t + nz * off * s, s: size, sy: 0.9, c: colors[(k + (s > 0 ? 1 : 0)) % colors.length] });
    }
  }
  return instanced(sc, CURB, items, { cast: false });
}
const CURB = once('curb', (b) => b.add(CYL6, '#ffffff', 0, 0.5, 0, 0, 0, 0, 1, 1, 1));

// ---------- shoreline foam ----------
/** A soft white ring hugging the outline at water level; `tick` lets it breathe. */
export function foam(sc: THREE.Scene, pts: P2[], y: number, color = '#ffffff', width = 1.6) {
  const n = pts.length, P: number[] = [], A: number[] = [], I: number[] = [];
  let cx = 0, cz = 0;
  for (const [x, z] of pts) { cx += x / n; cz += z / n; }
  for (let i = 0; i < n; i++) {
    const [x, z] = pts[i], dx = x - cx, dz = z - cz, l = Math.hypot(dx, dz) || 1;
    P.push(x + (dx / l) * 0.3, y, z + (dz / l) * 0.3, x + (dx / l) * (0.3 + width), y, z + (dz / l) * (0.3 + width));
    A.push(0.75, 0);
    const a = i * 2, b = ((i + 1) % n) * 2;
    I.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('alpha', new THREE.Float32BufferAttribute(A, 1));
  g.setIndex(I);
  const mat = new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float alpha;\nvarying float vA;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvA = alpha;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vA;').replace('#include <opaque_fragment>', 'diffuseColor.a *= vA;\n#include <opaque_fragment>');
  };
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -1;
  sc.add(m);
  return { mesh: m, tick(t: number) { mat.opacity = 0.55 + Math.sin(t * 1.3) * 0.25; } };
}

// ---------- ground texture with tile variation ----------
/** A 8×8-tile ground texture (512 px) where every tile differs a little: shade, specks, cracks
 *  or a flourish, so the repeat is hard to see. `deco(g, x, y, s, k)` draws extra per tile. */
export function groundTex(o: { a: string; b: string; line: string; lineW?: number; speck?: string[]; vary?: number; deco?: (g: CanvasRenderingContext2D, x: number, y: number, s: number, k: number) => void }) {
  const N = 8, S = 64;
  const t = ctex(N * S, N * S, (g) => {
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      g.fillStyle = (i + j) % 2 ? o.b : o.a;
      g.fillRect(i * S, j * S, S, S);
      const v = (Math.random() - 0.5) * (o.vary ?? 0.08);
      g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
      g.fillRect(i * S, j * S, S, S);
      // soft inner bevel per tile
      g.fillStyle = 'rgba(255,255,255,.10)'; g.fillRect(i * S + 2, j * S + 2, S - 4, 3);
      g.fillStyle = 'rgba(0,0,0,.08)'; g.fillRect(i * S + 2, j * S + S - 5, S - 4, 3);
      o.deco?.(g, i * S, j * S, S, (i * 7 + j * 13) % 11);
    }
    g.strokeStyle = o.line; g.lineWidth = o.lineW ?? 3;
    for (let i = 0; i <= N; i++) { g.beginPath(); g.moveTo(i * S, 0); g.lineTo(i * S, N * S); g.stroke(); g.beginPath(); g.moveTo(0, i * S); g.lineTo(N * S, i * S); g.stroke(); }
    if (o.speck) for (let k = 0; k < 140; k++) { g.fillStyle = o.speck[k % o.speck.length]; g.beginPath(); g.arc(Math.random() * N * S, Math.random() * N * S, 1.2 + Math.random() * 2, 0, TAU); g.fill(); }
  }, true);
  t.anisotropy = groundAniso();
  return t;
}

// ---------- ambient life ----------
export interface Mover { mesh: THREE.InstancedMesh; tick(dt: number, t: number): void }
/** Ambient movers per scene (a WeakMap, so an old board's movers go with its scene). */
const life = new WeakMap<THREE.Scene, Mover[]>();
const register = (sc: THREE.Scene, m: Mover) => { let l = life.get(sc); if (!l) life.set(sc, (l = [])); l.push(m); };

/** Things that travel along a closed loop (boats, cars, strollers), evenly spaced. */
export function loopers(sc: THREE.Scene, geo: THREE.BufferGeometry, loop: P2[], n: number, o: { y?: number; speed?: number; colors?: string[]; scale?: number; bob?: number; dir?: 1 | -1; mat?: THREE.Material }) {
  const segs: number[] = [0];
  for (let i = 1; i <= loop.length; i++) { const [ax, az] = loop[i - 1], [bx, bz] = loop[i % loop.length]; segs.push(segs[i - 1] + Math.hypot(bx - ax, bz - az)); }
  const total = segs[segs.length - 1];
  const im = new THREE.InstancedMesh(geo, o.mat ?? VCT, n);
  im.castShadow = false;
  im.receiveShadow = false;
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < n; i++) im.setColorAt(i, _c.set(o.colors?.[i % o.colors.length] ?? '#ffffff'));
  sc.add(im);
  const speed = (o.speed ?? 2) * (o.dir ?? 1), y = o.y ?? 0, sc0 = o.scale ?? 1, bob = o.bob ?? 0;
  const phase = Array.from({ length: n }, (_, i) => (i / n) * total + Math.random() * (total / n) * 0.4);
  const at = (s: number) => {
    s = ((s % total) + total) % total;
    let i = 1;
    while (i < segs.length - 1 && segs[i] < s) i++;
    const k = (s - segs[i - 1]) / (segs[i] - segs[i - 1] || 1), [ax, az] = loop[i - 1], [bx, bz] = loop[i % loop.length];
    _d.position.set(ax + (bx - ax) * k, 0, az + (bz - az) * k);
    _d.rotation.set(0, Math.atan2(bx - ax, bz - az) + (speed < 0 ? Math.PI : 0), 0);
  };
  const mv: Mover = {
    mesh: im,
    tick(_dt, t) {
      for (let i = 0; i < n; i++) {
        at(phase[i] + t * speed);
        _d.position.y = y + (bob ? Math.abs(Math.sin(t * 7 + i * 1.7)) * bob : 0);
        _d.scale.setScalar(sc0);
        _d.updateMatrix();
        im.setMatrixAt(i, _d.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
  mv.tick(0, 0);
  register(sc, mv);
  return mv;
}

/** A flock of birds circling (V shapes that flap by squashing). */
export function flock(sc: THREE.Scene, n: number, cx: number, cz: number, r: number, y: number, color = '#2a2440') {
  const im = new THREE.InstancedMesh(BIRD, toon(color), n);
  im.castShadow = false;
  im.frustumCulled = false;
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sc.add(im);
  const ph = Array.from({ length: n }, () => Math.random() * TAU), rr = Array.from({ length: n }, () => r * (0.75 + Math.random() * 0.5)), hh = Array.from({ length: n }, () => y + Math.random() * 4);
  const mv: Mover = {
    mesh: im,
    tick(_dt, t) {
      for (let i = 0; i < n; i++) {
        const a = ph[i] + t * (0.22 + (i % 3) * 0.04) * (i % 4 === 0 ? -1 : 1);
        _d.position.set(cx + Math.cos(a) * rr[i], hh[i] + Math.sin(t * 0.7 + i) * 0.8, cz + Math.sin(a) * rr[i]);
        _d.rotation.set(0, -a + (i % 4 === 0 ? Math.PI : 0), Math.sin(t * 0.5 + i) * 0.2);
        const f = 0.35 + Math.abs(Math.sin(t * 9 + ph[i] * 3)) * 0.9;
        _d.scale.set(1, f, 1);
        _d.updateMatrix();
        im.setMatrixAt(i, _d.matrix);
      }
      im.instanceMatrix.needsUpdate = true;
    },
  };
  mv.tick(0, 0);
  register(sc, mv);
  return mv;
}
const BIRD = once('bird', (b) => {
  for (const s of [-1, 1]) b.add(BOX, '#ffffff', s * 0.32, 0.12, 0, 0, 0, s * 0.45, 0.62, 0.05, 0.22);
  b.add(LEAF, '#ffffff', 0, 0, 0, 0, 0, 0, 0.12, 0.1, 0.26);
});
/** A simple person silhouette (tinted body, skin-ish head). */
export const PERSON = once('person', (b) => {
  b.add(CYL8, '#ffffff', 0, 0.55, 0, 0, 0, 0, 0.2, 0.7, 0.16);
  b.add(LEAF, '#f2c7a0', 0, 1.05, 0, 0, 0, 0, 0.17, 0.18, 0.17);
  for (const s of [-0.08, 0.08]) b.add(CYL8, '#2a2440', s, 0.12, 0, 0, 0, 0, 0.06, 0.26, 0.06);
});
/** A tiny boat (tinted hull, white cabin). */
export const BOAT = once('boat', (b) => {
  b.add(LEAF, '#ffffff', 0, 0, 0, 0, 0, 0, 0.7, 0.32, 1.5);
  b.add(BOX, '#ffffff', 0, 0.3, -0.2, 0, 0, 0, 0.7, 0.4, 0.8);
  b.add(BOX, '#9fe3ff', 0, 0.36, 0.21, 0, 0, 0, 0.6, 0.2, 0.02);
});
/** A tiny car (tinted body, dark wheels, glass). */
export const CAR = once('car', (b) => {
  b.add(BOX, '#ffffff', 0, 0.35, 0, 0, 0, 0, 0.9, 0.36, 1.7);
  b.add(BOX, '#ffffff', 0, 0.66, -0.1, 0, 0, 0, 0.8, 0.3, 0.9);
  b.add(BOX, '#9fe3ff', 0, 0.66, 0.36, 0, 0, 0, 0.72, 0.24, 0.02);
  for (const sx of [-0.45, 0.45]) for (const sz of [-0.55, 0.55]) b.add(CYL8, '#1d1f24', sx, 0.18, sz, 0, 0, Math.PI / 2, 0.18, 0.14, 0.18);
  for (const sx of [-0.3, 0.3]) b.add(BULB, '#fff3c8', sx, 0.4, 0.86, 0, 0, 0, 0.07);
});

/** Ticks every ambient mover in `sc` (or hides them all when the effects are off). */
export function tickLife(sc: THREE.Scene, dt: number, t: number) {
  const on = quality.fx, list = life.get(sc);
  if (!list) return;
  for (const m of list) {
    if (m.mesh.visible !== on) m.mesh.visible = on;
    if (on) m.tick(dt, t);
  }
}
