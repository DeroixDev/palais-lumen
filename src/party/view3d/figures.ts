// Our own cast: chunky beans with one look feature each (cap, bunny ears, antenna, horns),
// one merged mesh plus an inverted-hull outline. Squash and stretch when hopping and landing.

import type { Feat } from '../types';
import { lerp, tween, wrapA } from '../util';
import { Batch, CAPS, CONE, CYL, CYL8, HEMI, OUT, SMILE, SPH, THREE, VC, markShared } from './kit';

export interface FigLook { color: string; acc: string; feat: Feat }

export const BODY_GEO = new THREE.LatheGeometry(
  ([[0, 0], [0.42, 0.02], [0.66, 0.14], [0.77, 0.42], [0.78, 0.78], [0.72, 1.08], [0.58, 1.34], [0.34, 1.52], [0, 1.58]] as const).map(([x, y]) => new THREE.Vector2(x, y)),
  22,
);
markShared(BODY_GEO);

const cache = new Map<string, THREE.BufferGeometry>();
export function figureGeometry(p: FigLook) {
  const key = `${p.feat}|${p.color}|${p.acc}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const b = new Batch(), D = '#1a0b33';
  b.addM(BODY_GEO, p.color, new THREE.Matrix4());
  b.add(SPH, '#ffffff', -0.3, 1.3, 0.5, 0, 0, 0, 0.12, 0.07, 0.06);
  for (const s of [-1, 1]) {
    b.add(SPH, D, s * 0.25, 1.04, 0.6, 0, 0, 0, 0.235, 0.295, 0.13);
    b.add(SPH, '#ffffff', s * 0.25, 1.04, 0.63, 0, 0, 0, 0.2, 0.26, 0.12);
    b.add(SPH, D, s * 0.23, 1.01, 0.725, 0, 0, 0, 0.1, 0.14, 0.06);
    b.add(SPH, '#ffffff', s * 0.2, 1.09, 0.775, 0, 0, 0, 0.036, 0.036, 0.02);
    b.add(SPH, '#ff7eb6', s * 0.47, 0.8, 0.6, 0, s * 0.6, 0, 0.12, 0.07, 0.05);
    b.add(SPH, '#2a1446', s * 0.3, 0.07, 0.3, 0, 0, 0, 0.26, 0.15, 0.34);
    b.add(SPH, p.color, s * 0.8, 0.62, 0.04, 0, 0, s * 0.4, 0.17, 0.2, 0.17);
  }
  b.add(SMILE, D, 0, 0.83, 0.76, -0.25, 0, Math.PI, 0.085, 0.085, 0.085);
  const a = p.acc;
  if (p.feat === 'cap') {
    b.add(HEMI, a, 0, 1.2, 0, 0, 0, 0, 0.67, 0.5, 0.67);
    b.add(CYL, a, 0, 1.24, 0.55, -0.12, 0, 0, 0.4, 0.05, 0.3);
    b.add(SPH, '#ffffff', 0, 1.7, 0, 0, 0, 0, 0.08);
    b.add(SPH, '#ffffff', 0, 1.45, 0.55, -0.5, 0, 0, 0.14, 0.14, 0.05);
  } else if (p.feat === 'ears') {
    for (const s of [-1, 1]) { b.add(CAPS, p.color, s * 0.3, 1.78, -0.05, 0, 0, -s * 0.25, 0.14, 0.2, 0.12); b.add(CAPS, a, s * 0.31, 1.8, 0.04, 0, 0, -s * 0.25, 0.07, 0.14, 0.05); }
  } else if (p.feat === 'ant') {
    b.add(CYL8, D, 0.07, 1.78, 0, 0, 0, -0.22, 0.035, 0.5, 0.035);
    b.add(SPH, a, 0.14, 2.05, 0, 0, 0, 0, 0.15);
    b.add(SPH, '#ffffff', 0.1, 2.1, 0.1, 0, 0, 0, 0.04);
  } else if (p.feat === 'horns') {
    for (const s of [-1, 1]) b.add(CONE, a, s * 0.32, 1.62, 0, 0, 0, -s * 0.38, 0.13, 0.44, 0.13);
  }
  const g = b.geometry();
  markShared(g);
  cache.set(key, g);
  return g;
}

export interface Fig {
  look: FigLook;
  root: THREE.Group;
  hop: THREE.Group;
  sq: THREE.Group;
  yaw: number;
  yawT: number;
  busy: boolean;
  tok: number;
  phase: number;
  idle: boolean;
}

export function makeFigure(p: FigLook, scale = 1): Fig {
  const root = new THREE.Group(), hop = new THREE.Group(), sq = new THREE.Group();
  root.add(hop);
  hop.add(sq);
  const m = new THREE.Mesh(figureGeometry(p), VC);
  m.castShadow = true;
  sq.add(m);
  const o = new THREE.Mesh(BODY_GEO, OUT);
  o.scale.set(1.08, 1.05, 1.08);
  o.position.y = -0.03;
  sq.add(o);
  root.scale.setScalar(scale);
  return { look: p, root, hop, sq, yaw: 0, yawT: 0, busy: false, tok: 0, phase: Math.random() * 6, idle: true };
}

export function updateFigure(f: Fig, dt: number, t: number) {
  f.yaw += wrapA(f.yawT - f.yaw) * (1 - Math.exp(-dt * 12));
  f.root.rotation.y = f.yaw;
  if (!f.busy && f.idle) { const s = Math.sin(t * 3.4 + f.phase) * 0.03; f.sq.scale.set(1 + s, 1 - s, 1 + s); }
}

export function squashLand(f: Fig, amt = 0.22) {
  const tok = ++f.tok;
  f.busy = true;
  return tween(0.3, (k) => {
    if (f.tok !== tok) return;
    const a = amt * Math.exp(-6 * k) * Math.cos(k * 11);
    f.sq.scale.set(1 + a, 1 - a, 1 + a);
  }).then(() => { if (f.tok === tok) f.busy = false; });
}

const _from = new THREE.Vector3();
export async function hopFig(f: Fig, to: THREE.Vector3, dur = 0.28, h = 0.95) {
  _from.copy(f.root.position);
  const fx = _from.x, fy = _from.y, fz = _from.z;
  const dx = to.x - fx, dz = to.z - fz;
  if (dx * dx + dz * dz > 0.01) f.yawT = Math.atan2(dx, dz);
  const tok = ++f.tok;
  f.busy = true;
  await tween(0.05, (k) => f.sq.scale.set(1 + 0.16 * k, 1 - 0.18 * k, 1 + 0.16 * k));
  const tx = to.x, ty = to.y, tz = to.z;
  await tween(dur, (k) => {
    f.root.position.set(lerp(fx, tx, k), lerp(fy, ty, k), lerp(fz, tz, k));
    f.hop.position.y = 4 * h * k * (1 - k);
    const s = Math.sin(k * Math.PI);
    if (f.tok === tok) f.sq.scale.set(1 - 0.1 * s, 1 + 0.16 * s, 1 - 0.1 * s);
  });
  f.hop.position.y = 0;
  void squashLand(f, 0.18);
}

export function faceCam(f: Fig, cam: THREE.Camera) {
  f.yawT = Math.atan2(cam.position.x - f.root.position.x, cam.position.z - f.root.position.z);
}

/** Winners jump, the others slump (end of a minigame). */
export function celebrate(figs: Fig[], winners: boolean[], t: number, cam: THREE.Camera) {
  figs.forEach((f, i) => {
    if (!f.root.visible) return;
    f.yawT = Math.atan2(cam.position.x - f.root.position.x, cam.position.z - f.root.position.z);
    if (winners[i]) { const k = Math.abs(Math.sin(t * 6 + f.phase)); f.hop.position.y = k * 1.1; f.sq.scale.set(1 - k * 0.08, 1 + k * 0.14, 1 - k * 0.08); f.busy = true; }
    else { f.hop.position.y = 0; f.sq.scale.set(1.08, 0.86, 1.08); f.busy = true; }
  });
}
