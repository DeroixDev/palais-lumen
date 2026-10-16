// Small view helpers for the minigames Eisschubsen, Bonbon-Rodeln, Münzschmiede,
// Scheinwerfer, Farbflut and Blechkoloss: a pooled spark/confetti burst (one InstancedMesh,
// no allocations per frame), a running animation for figures, and a cheap ripple pool.
// Only cosmetic view state lives here; the simulation never touches it.

import type { Fig } from '../view3d/figures';
import { THREE, markShared } from '../view3d/kit';

/** Spark shape: an octahedron (8 triangles), so big pools stay cheap. */
export const SPARK_GEO = new THREE.OctahedronGeometry(1, 0);
markShared(SPARK_GEO);

const colCache = new Map<string, THREE.Color>();
/** A shared THREE.Color per hex string (no allocations in hot paths). */
export function col(hex: string) {
  let c = colCache.get(hex);
  if (!c) { c = new THREE.Color(hex); colCache.set(hex, c); }
  return c;
}

/** A pool of small glowing bits that burst out and fall (sparks, splashes, confetti). */
export class Sparks {
  mesh: THREE.InstancedMesh;
  private px: Float32Array; private py: Float32Array; private pz: Float32Array;
  private vx: Float32Array; private vy: Float32Array; private vz: Float32Array;
  private life: Float32Array; private max: Float32Array; private size: Float32Array;
  private cur = 0;
  private alive = 0;
  private d = new THREE.Object3D();
  constructor(scene: THREE.Scene, public n = 96, geo: THREE.BufferGeometry = SPARK_GEO, public grav = 16) {
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const f = () => new Float32Array(n);
    this.px = f(); this.py = f(); this.pz = f(); this.vx = f(); this.vy = f(); this.vz = f(); this.life = f(); this.max = f(); this.size = f();
    this.d.scale.setScalar(0);
    this.d.updateMatrix();
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, this.d.matrix); this.mesh.setColorAt(i, col('#ffffff')); }
    this.mesh.visible = false;
    scene.add(this.mesh);
  }
  /** Bursts `count` bits from a point. */
  emit(x: number, y: number, z: number, count: number, color: string, spd = 5, up = 4, size = 0.16, life = 0.6) {
    const c = col(color);
    for (let k = 0; k < count; k++) {
      const i = this.cur;
      this.cur = (this.cur + 1) % this.n;
      const a = Math.random() * Math.PI * 2, r = (0.35 + Math.random() * 0.65) * spd;
      this.px[i] = x; this.py[i] = y; this.pz[i] = z;
      this.vx[i] = Math.cos(a) * r; this.vz[i] = Math.sin(a) * r; this.vy[i] = up * (0.5 + Math.random());
      this.max[i] = this.life[i] = life * (0.7 + Math.random() * 0.6);
      this.size[i] = size * (0.7 + Math.random() * 0.6);
      this.mesh.setColorAt(i, c);
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alive = this.n;
    this.mesh.visible = true;
  }
  /** One directed bit (trails, sprays). */
  shoot(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: string, size = 0.14, life = 0.45) {
    const i = this.cur;
    this.cur = (this.cur + 1) % this.n;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.vx[i] = vx; this.vy[i] = vy; this.vz[i] = vz;
    this.max[i] = this.life[i] = life; this.size[i] = size;
    this.mesh.setColorAt(i, col(color));
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.alive = this.n;
    this.mesh.visible = true;
  }
  update(dt: number) {
    if (!this.alive) return;
    let live = 0;
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) { d.scale.setScalar(0); d.updateMatrix(); this.mesh.setMatrixAt(i, d.matrix); continue; }
      live++;
      this.vy[i] -= this.grav * dt;
      this.px[i] += this.vx[i] * dt; this.py[i] += this.vy[i] * dt; this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.05) { this.py[i] = 0.05; this.vy[i] *= -0.35; this.vx[i] *= 0.7; this.vz[i] *= 0.7; }
      d.position.set(this.px[i], this.py[i], this.pz[i]);
      d.scale.setScalar(this.size[i] * Math.min(1, (this.life[i] / this.max[i]) * 2.2));
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!live) { this.alive = 0; this.mesh.visible = false; }
  }
}

/** Expanding flat rings on the floor (splashes, shock waves): a fixed pool of meshes. */
export class Ripples {
  private list: { m: THREE.Mesh; mat: THREE.MeshBasicMaterial; t: number; dur: number; r0: number; r1: number }[];
  constructor(scene: THREE.Scene, n = 6, geo: THREE.BufferGeometry = new THREE.RingGeometry(0.82, 1, 40).rotateX(-Math.PI / 2)) {
    this.list = Array.from({ length: n }, () => {
      const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false });
      const m = new THREE.Mesh(geo, mat);
      m.visible = false;
      scene.add(m);
      return { m, mat, t: 0, dur: 1, r0: 0.5, r1: 2 };
    });
  }
  spawn(x: number, y: number, z: number, color: string, r0 = 0.5, r1 = 2.6, dur = 0.6) {
    let best = this.list[0];
    for (const r of this.list) if (r.t <= 0) { best = r; break; }
    best.t = best.dur = dur; best.r0 = r0; best.r1 = r1;
    best.mat.color.copy(col(color));
    best.m.position.set(x, y, z);
    best.m.visible = true;
  }
  update(dt: number) {
    for (const r of this.list) {
      if (r.t <= 0) continue;
      r.t -= dt;
      const k = 1 - Math.max(0, r.t) / r.dur;
      r.m.scale.setScalar(r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)));
      r.mat.opacity = 0.85 * (1 - k);
      if (r.t <= 0) r.m.visible = false;
    }
  }
}

/** Running bob for a figure moving with velocity (vx, vz); `ph` keeps the step phase per figure. */
export function runFig(f: Fig, vx: number, vz: number, dt: number, ph: Float32Array, i: number, turn = true) {
  const speed = Math.hypot(vx, vz);
  if (speed > 0.6) {
    if (turn) f.yawT = Math.atan2(vx, vz);
    ph[i] += dt * Math.min(speed, 9) * 2.2;
    f.hop.position.y = Math.abs(Math.sin(ph[i])) * 0.22;
    const q = Math.sin(ph[i] * 2) * 0.05;
    if (!f.busy) f.sq.scale.set(1 - q, 1 + q, 1 - q);
    f.idle = false;
  } else { f.hop.position.y *= 0.8; f.idle = true; }
}

/** Resets figures after the celebration (same as the existing minigames do). */
export function uncelebrate(figs: Fig[]) {
  for (const f of figs) { f.busy = false; f.tok = 0; f.hop.position.y = 0; f.sq.scale.set(1, 1, 1); f.root.rotation.set(0, 0, 0); f.root.visible = true; }
}

/** Normalises a stick input to length ≤ 1 and scales it. Writes into `out`. */
export function stick(x: number, y: number, out: { x: number; y: number }, scale = 1) {
  const l = Math.hypot(x, y);
  if (l > 1) { x /= l; y /= l; }
  out.x = x * scale; out.y = y * scale;
  return out;
}

/** Index list of winners → title text. */
export function winTitle(names: string[], none = 'Niemand gewinnt') {
  return names.length === 1 ? `${names[0]} gewinnt!` : names.length ? `${names.join(' und ')} gewinnen!` : none;
}
