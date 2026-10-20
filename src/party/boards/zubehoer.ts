// Accessories for Palais Lumen and CS-Bunker (the small things that make a board look lived in):
// - Prefabs: small multi-coloured parts built once (a lit part and an optional glowing part).
// - Cells: static detail merged per 16-unit square of the board, so each square is one draw call
//   (plus one for its lamps) and is culled on its own. Fine detail (cards, tools, cups) sits in
//   cells that only draw while the camera is near (distance LOD; the overview skips them); big
//   detail (statues, cars, sandbags) draws always and casts into the baked shadow map.
// - Blinkers: lamps that flicker or flash (one instanced mesh, recoloured in place).
// Everything here builds once and nothing allocates per frame. Moving parts sleep with the
// effects step of the quality governor (quality.fx).

import { Batch, GLOW, THREE, VC } from '../view3d/kit';
import { quality } from '../view3d/quality';
import { glow } from '../view3d/shaderfx';
import { BULB } from './bauteile';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _v = new THREE.Vector3(), _n = new THREE.Vector3(), _n3 = new THREE.Matrix3(), _c = new THREE.Color();

/** A small part built once: its lit geometry and (optional) glowing geometry, both vertex-coloured. */
export interface Prefab { st: THREE.BufferGeometry; gl: THREE.BufferGeometry | null }
export function prefab(make: (st: Batch, gl: Batch) => void): Prefab {
  const st = new Batch(), gl = new Batch();
  make(st, gl);
  return { st: st.geometry(), gl: gl.n ? gl.geometry() : null };
}

/** Appends a vertex-coloured geometry to a Batch (colours × tint), transformed by `m`. */
function append(b: Batch, g: THREE.BufferGeometry, m: THREE.Matrix4, tint: THREE.Color | null) {
  const P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color;
  _n3.getNormalMatrix(m);
  for (let i = 0; i < P.count; i++) {
    _v.fromBufferAttribute(P as THREE.BufferAttribute, i).applyMatrix4(m);
    b.P.push(_v.x, _v.y, _v.z);
    _n.fromBufferAttribute(N as THREE.BufferAttribute, i).applyMatrix3(_n3).normalize();
    b.N.push(_n.x, _n.y, _n.z);
    const r = C ? C.getX(i) : 1, gg = C ? C.getY(i) : 1, bb = C ? C.getZ(i) : 1;
    if (tint) b.C.push(r * tint.r, gg * tint.g, bb * tint.b); else b.C.push(r, gg, bb);
  }
  const ix = g.index!.array;
  for (let i = 0; i < ix.length; i++) b.I.push(ix[i] + b.n);
  b.n += P.count;
}

/** White parts of a prefab take the tint; coloured parts are multiplied by it (keep them light). */
const isWhite = (t?: string) => !t || t === '#ffffff';

/**
 * Static detail merged per square cell. `near`: the cell only draws while the camera is closer
 * than this to the cell centre (Infinity: always; those cast shadows).
 */
export class Cells {
  private cells = new Map<number, { st: Batch; gl: Batch; cx: number; cz: number }>();
  constructor(private size = 16, private near = Infinity) {}
  private cell(x: number, z: number) {
    const i = Math.floor(x / this.size), j = Math.floor(z / this.size), k = (i + 512) * 1024 + (j + 512);
    let c = this.cells.get(k);
    if (!c) { c = { st: new Batch(), gl: new Batch(), cx: (i + 0.5) * this.size, cz: (j + 0.5) * this.size }; this.cells.set(k, c); }
    return c;
  }
  /** One part (like Batch.add, world coordinates). */
  add(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const c = this.cell(x, z);
    c.st.add(geo, color, x - c.cx, y, z - c.cz, rx, ry, rz, sx, sy, sz);
  }
  /** A glowing part (lamps, screens, embers). */
  glow(geo: THREE.BufferGeometry, color: string, x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    const c = this.cell(x, z);
    c.gl.add(geo, color, x - c.cx, y, z - c.cz, rx, ry, rz, sx, sy, sz);
  }
  /** A rod between two points (cell picked by the first point). */
  beam(a: [number, number, number], b: [number, number, number], r: number, color: string) {
    const c = this.cell(a[0], a[2]);
    c.st.beam([a[0] - c.cx, a[1], a[2] - c.cz], [b[0] - c.cx, b[1], b[2] - c.cz], r, color);
  }
  /** A prefab at x, y, z turned by ry, scaled by s (number or [sx, sy, sz]), optionally tinted. */
  put(p: Prefab, x: number, y: number, z: number, ry = 0, s: number | [number, number, number] = 1, tint?: string) {
    const c = this.cell(x, z);
    const [sx, sy, sz] = typeof s === 'number' ? [s, s, s] : s;
    _m.compose(_p.set(x - c.cx, y, z - c.cz), _q.setFromEuler(_e.set(0, ry, 0)), _s.set(sx, sy, sz));
    const t = isWhite(tint) ? null : _c.set(tint!);
    append(c.st, p.st, _m, t);
    if (p.gl) append(c.gl, p.gl, _m, null);
  }
  /** Builds the cell meshes into the scene. */
  finish(sc: THREE.Scene, mat: THREE.Material = VC, glowMat: THREE.Material = GLOW) {
    const far = Number.isFinite(this.near);
    let n = 0;
    for (const c of this.cells.values()) {
      const g = new THREE.Group();
      if (c.st.n) { const m = c.st.mesh(mat, !far, true); g.add(m); n++; }
      if (c.gl.n) { g.add(c.gl.mesh(glowMat, false, false)); n++; }
      if (!g.children.length) continue;
      if (far) {
        const lod = new THREE.LOD();
        lod.position.set(c.cx, 0, c.cz);
        lod.addLevel(g, 0, 0.08);
        lod.addLevel(new THREE.Object3D(), this.near, 0.08);
        sc.add(lod);
      } else { g.position.set(c.cx, 0, c.cz); sc.add(g); }
    }
    this.cells.clear();
    return n;
  }
}

/**
 * Lamps that blink: flicker (corridor lamps with a bad contact) or flash (camera flashes).
 * One instanced glowing mesh; `tick` recolours/rescales in place.
 */
export class Blinkers {
  mesh: THREE.InstancedMesh;
  private base: THREE.Color[] = [];
  private dim: THREE.Color[] = [];
  private kind: Uint8Array;
  private timer: Float32Array;
  private on: Float32Array;
  private pos: Float32Array;
  private size: Float32Array;
  private d = new THREE.Object3D();
  private still = false;
  constructor(sc: THREE.Scene, items: { x: number; y: number; z: number; c: string; s: number; flash?: boolean; flicker?: boolean }[], geo: THREE.BufferGeometry = BULB) {
    const n = Math.max(1, items.length);
    this.mesh = new THREE.InstancedMesh(geo, glow(new THREE.MeshBasicMaterial({ color: '#ffffff' })), n);
    this.mesh.count = items.length;
    this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.kind = new Uint8Array(n); this.timer = new Float32Array(n); this.on = new Float32Array(n);
    this.pos = new Float32Array(n * 3); this.size = new Float32Array(n);
    items.forEach((it, i) => {
      this.kind[i] = it.flash ? 2 : it.flicker ? 1 : 0;
      this.base.push(new THREE.Color(it.c));
      this.dim.push(new THREE.Color(it.c).multiplyScalar(0.12));
      this.pos[i * 3] = it.x; this.pos[i * 3 + 1] = it.y; this.pos[i * 3 + 2] = it.z; this.size[i] = it.s;
      this.timer[i] = Math.random() * 3;
      this.place(i, it.flash ? 0 : 1);
      this.mesh.setColorAt(i, this.base[i]);
    });
    this.mesh.computeBoundingSphere();
    this.mesh.frustumCulled = items.every((it) => !it.flash);
    sc.add(this.mesh);
  }
  private place(i: number, k: number) {
    const d = this.d;
    d.position.set(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    d.scale.setScalar(this.size[i] * k);
    d.updateMatrix();
    this.mesh.setMatrixAt(i, d.matrix);
  }
  /** `rate`: camera flashes per second per photographer (0: none). Sleeps with quality.fx. */
  tick(dt: number, rate: number) {
    const n = this.mesh.count;
    if (!quality.fx) {
      if (!this.still) {
        this.still = true;
        for (let i = 0; i < n; i++) { this.mesh.setColorAt(i, this.base[i]); this.place(i, this.kind[i] === 2 ? 0 : 1); }
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
      }
      return;
    }
    this.still = false;
    let col = false, mat = false;
    for (let i = 0; i < n; i++) {
      const k = this.kind[i];
      if (k === 0) continue;
      this.timer[i] -= dt;
      if (k === 1) {
        // a bad contact: mostly on, now and then a burst of short drop-outs
        if (this.timer[i] <= 0) {
          this.on[i] = this.on[i] > 0 ? 0 : 1;
          this.timer[i] = this.on[i] > 0 ? (Math.random() < 0.3 ? 0.04 + Math.random() * 0.08 : 0.8 + Math.random() * 3.5) : 0.03 + Math.random() * 0.09;
          this.mesh.setColorAt(i, this.on[i] > 0 ? this.base[i] : this.dim[i]);
          col = true;
        }
      } else {
        if (this.on[i] > 0) {
          this.on[i] = Math.max(0, this.on[i] - dt * 9);
          this.place(i, this.on[i] * (1.4 - this.on[i] * 0.4));
          mat = true;
        } else if (rate > 0 && this.timer[i] <= 0) {
          this.on[i] = 1;
          this.timer[i] = (0.3 + Math.random() * 1.6) / rate;
          this.place(i, 1);
          mat = true;
        }
      }
    }
    if (col && this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    if (mat) this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** A canvas-textured decal (oil puddles, stains) as one instanced mesh lying on the ground. */
export function decals(sc: THREE.Scene, tex: THREE.Texture, items: { x: number; z: number; ry: number; w: number; d: number; y?: number }[], o: { opacity?: number; color?: string } = {}) {
  const mat = new THREE.MeshBasicMaterial({ map: tex, color: o.color ?? '#ffffff', transparent: true, opacity: o.opacity ?? 1, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // colour only: leave the bloom mask (alpha channel of the target) alone
  mat.blending = THREE.CustomBlending;
  mat.blendSrc = THREE.SrcAlphaFactor; mat.blendDst = THREE.OneMinusSrcAlphaFactor;
  mat.blendSrcAlpha = THREE.ZeroFactor; mat.blendDstAlpha = THREE.OneFactor;
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, Math.max(1, items.length));
  const d = new THREE.Object3D();
  items.forEach((it, i) => { d.position.set(it.x, it.y ?? 0.03, it.z); d.rotation.set(0, it.ry, 0); d.scale.set(it.w, 1, it.d); d.updateMatrix(); im.setMatrixAt(i, d.matrix); });
  im.count = items.length;
  im.renderOrder = -1;
  im.computeBoundingSphere();
  sc.add(im);
  return im;
}

/** Turns local offsets of a thing at (x, z) facing `yaw` into world x, z (three's Y rotation). */
export function local(x: number, z: number, yaw: number) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
}
