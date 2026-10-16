// Small view and bot helpers for the timing and puzzle minigames (stoppuhr, neonmemory,
// taktziehen, doppelgaenger, torwand, stapelkran): seven-segment displays, pooled sparks and
// shock rings, persistent DOM tags, camera fitting and a seeded Gauss. Nothing here allocates
// per frame: pools are made once in view(), frame() only writes into them.

import { BOX, FONT, THREE, ctex } from '../view3d/kit';
import { VH, VW, addLabel, removeLabel, type Label } from '../view3d/stage';
import type { Fig } from '../view3d/figures';
import { NO_INPUT, type MgInput } from './types';

/** Seeded normal-ish random number (mean 0, sd ~1). */
export const gaussR = (rng: () => number) => (rng() + rng() + rng() - 1.5) / 0.5;

/** One reusable input object per player slot: bots return it without allocating. */
export function botPool(n = 4) {
  const pool: MgInput[] = Array.from({ length: n }, () => ({ ...NO_INPUT }));
  return (i: number) => { const o = pool[i]; o.x = 0; o.y = 0; o.a = false; o.b = false; o.aP = false; o.bP = false; o.lP = false; o.rP = false; return o; };
}

/** Camera distance so that a box of w × h (world units, facing the camera) fits the view. */
export function fitDist(cam: THREE.PerspectiveCamera, w: number, h: number) {
  const t = Math.tan((cam.fov * Math.PI) / 360), aspect = VW / VH;
  return Math.max(h / 2 / t, w / 2 / (t * aspect));
}
export const portrait = () => VW / VH < 0.9;

/** Puts figures back to neutral after a celebration. */
export function unCele(figs: Fig[]) { figs.forEach((f) => { f.busy = false; f.tok = 0; f.hop.position.y = 0; f.sq.scale.set(1, 1, 1); f.root.rotation.set(0, f.root.rotation.y, 0); }); }

// ---------- seven-segment display (one instanced mesh) ----------
//  aaa
// f   b
//  ggg
// e   c
//  ddd   + dot
const DIG: Record<string, number> = { '0': 0x3f, '1': 0x06, '2': 0x5b, '3': 0x4f, '4': 0x66, '5': 0x6d, '6': 0x7d, '7': 0x07, '8': 0x7f, '9': 0x6f, '-': 0x40, ' ': 0, '?': 0x53, '_': 0x08 };
export class Seg {
  mesh: THREE.InstancedMesh;
  private shown = '';
  private colS = '';
  private on = new THREE.Color();
  private off = new THREE.Color();
  constructor(public digits: number, size: number, on: string, off = '#2a1a4a') {
    this.on.set(on);
    this.off.set(off);
    this.mesh = new THREE.InstancedMesh(BOX, new THREE.MeshBasicMaterial({ color: '#ffffff' }), digits * 8);
    const d = new THREE.Object3D(), w = size * 0.62, h = size, th = size * 0.13, gap = size * 0.86;
    const segs: [number, number, number, number][] = [
      [0, h / 2, w, th], [w / 2, h / 4, th, h / 2], [w / 2, -h / 4, th, h / 2], [0, -h / 2, w, th], [-w / 2, -h / 4, th, h / 2], [-w / 2, h / 4, th, h / 2], [0, 0, w, th], [w / 2 + th * 1.6, -h / 2, th * 1.3, th * 1.3],
    ];
    const x0 = (-(digits - 1) * gap) / 2;
    for (let k = 0; k < digits; k++) for (let s = 0; s < 8; s++) {
      const [x, y, sx, sy] = segs[s];
      d.position.set(x0 + k * gap + x, y, 0);
      d.scale.set(sx, sy, th * 0.6);
      d.updateMatrix();
      this.mesh.setMatrixAt(k * 8 + s, d.matrix);
      this.mesh.setColorAt(k * 8 + s, this.off);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  /** Text of digits; a '.' lights the dot of the digit before it. */
  set(txt: string, col?: string) {
    if (col && col !== this.colS) { this.colS = col; this.on.set(col); this.shown = ''; }
    if (txt === this.shown) return;
    this.shown = txt;
    let k = 0;
    const bits: number[] = SEGBUF;
    bits.fill(0);
    for (let i = 0; i < txt.length && k < this.digits; i++) {
      const c = txt[i];
      if (c === '.' || c === ',') { if (k > 0) bits[k - 1] |= 0x80; continue; }
      bits[k++] = DIG[c] ?? 0;
    }
    this.paint(bits);
  }
  /** A number with `dec` decimals and leading zeros (no strings, no allocation). */
  num(v: number, dec: number, col?: string) {
    if (col && col !== this.colS) { this.colS = col; this.on.set(col); this.shown = ''; }
    let total = Math.round(Math.max(0, v) * Math.pow(10, dec));
    if (this.shown === '#' && this.lastNum === total) return;
    this.shown = '#';
    this.lastNum = total;
    const bits = SEGBUF;
    for (let q = this.digits - 1; q >= 0; q--) { bits[q] = DIG0[total % 10]; total = Math.floor(total / 10); }
    if (dec > 0) bits[this.digits - 1 - dec] |= 0x80;
    this.paint(bits);
  }
  private lastNum = -1;
  private paint(bits: number[]) {
    for (let q = 0; q < this.digits; q++) for (let s = 0; s < 8; s++) this.mesh.setColorAt(q * 8 + s, bits[q] & (1 << s) ? this.on : this.off);
    this.mesh.instanceColor!.needsUpdate = true;
  }
}
const SEGBUF: number[] = new Array(16).fill(0);
const DIG0 = [0x3f, 0x06, 0x5b, 0x4f, 0x66, 0x6d, 0x7d, 0x07, 0x7f, 0x6f];

// ---------- sparks: pooled little cubes with gravity ----------
export class Sparks {
  mesh: THREE.InstancedMesh;
  private p: Float32Array;
  private v: Float32Array;
  private life: Float32Array;
  private next = 0;
  private alive = 0;
  private d = new THREE.Object3D();
  private c = new THREE.Color();
  constructor(scene: THREE.Scene, public n = 120, public size = 0.18, geo: THREE.BufferGeometry = BOX) {
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff' }), n);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.p = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3);
    this.life = new Float32Array(n);
    this.d.scale.setScalar(0);
    this.d.updateMatrix();
    for (let i = 0; i < n; i++) { this.mesh.setMatrixAt(i, this.d.matrix); this.mesh.setColorAt(i, this.c.set('#ffffff')); }
    scene.add(this.mesh);
  }
  emit(x: number, y: number, z: number, col: string, count = 14, speed = 5, up = 5) {
    this.c.set(col);
    for (let k = 0; k < count; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.n;
      const a = Math.random() * Math.PI * 2, r = (0.4 + Math.random() * 0.6) * speed;
      this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
      this.v[i * 3] = Math.cos(a) * r; this.v[i * 3 + 1] = up * (0.5 + Math.random()); this.v[i * 3 + 2] = Math.sin(a) * r;
      this.life[i] = 0.7 + Math.random() * 0.5;
      this.mesh.setColorAt(i, this.c);
    }
    this.alive = this.n;
    this.mesh.instanceColor!.needsUpdate = true;
  }
  update(dt: number) {
    if (!this.alive) return;
    let any = 0;
    const d = this.d;
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const j = i * 3;
      this.v[j + 1] -= 16 * dt;
      this.p[j] += this.v[j] * dt; this.p[j + 1] += this.v[j + 1] * dt; this.p[j + 2] += this.v[j + 2] * dt;
      if (this.p[j + 1] < 0.05) { this.p[j + 1] = 0.05; this.v[j + 1] *= -0.4; this.v[j] *= 0.7; this.v[j + 2] *= 0.7; }
      d.position.set(this.p[j], this.p[j + 1], this.p[j + 2]);
      d.rotation.set(this.life[i] * 9, this.life[i] * 7, 0);
      d.scale.setScalar(this.life[i] > 0 ? this.size * Math.min(1, this.life[i] * 2.5) : 0);
      d.updateMatrix();
      this.mesh.setMatrixAt(i, d.matrix);
      any++;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (!any) this.alive = 0;
  }
}

// ---------- shock rings: a few flat rings that grow and fade ----------
export class Rings {
  private items: { m: THREE.Mesh; t: number; s: number }[] = [];
  constructor(scene: THREE.Scene, n = 4, vertical = false) {
    const geo = new THREE.RingGeometry(0.8, 1, 40);
    if (!vertical) geo.rotateX(-Math.PI / 2);
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      m.visible = false;
      scene.add(m);
      this.items.push({ m, t: 0, s: 1 });
    }
  }
  emit(x: number, y: number, z: number, col: string, size = 2.5) {
    let best = this.items[0];
    for (const it of this.items) if (it.t < best.t) best = it;
    best.t = 1;
    best.s = size;
    best.m.position.set(x, y, z);
    (best.m.material as THREE.MeshBasicMaterial).color.set(col);
    best.m.visible = true;
  }
  update(dt: number) {
    for (const it of this.items) {
      if (it.t <= 0) continue;
      it.t -= dt * 2.2;
      const k = 1 - Math.max(0, it.t);
      it.m.scale.setScalar(0.3 + k * it.s);
      (it.m.material as THREE.MeshBasicMaterial).opacity = Math.max(0, it.t);
      if (it.t <= 0) it.m.visible = false;
    }
  }
}

// ---------- persistent DOM tag that follows a 3D point ----------
// Labels of a minigame scene are cleared when the minigame opens and closes, so a tag recreates
// its label when needed. Text and colour only touch the DOM when they change.
export class Tag {
  private L: Label | null = null;
  private txt = '';
  private col = '';
  private pos = new THREE.Vector3();
  constructor(private scene: THREE.Scene, private cls = 'name3') {}
  set(txt: string, x: number, y: number, z: number, col = '') {
    if (!txt) { this.hide(); return; }
    if (!this.L || !this.L.el.isConnected) {
      this.L = addLabel(this.cls, '', (v) => v.copy(this.pos), this.scene);
      this.txt = ''; this.col = '';
    }
    this.pos.set(x, y, z);
    if (txt !== this.txt) { this.L.inner.textContent = txt; this.txt = txt; }
    if (col !== this.col) { this.col = col; this.L.inner.style.setProperty('--pc', col || 'var(--paper)'); }
  }
  hide() { if (this.L) { removeLabel(this.L); this.L = null; } this.txt = ''; }
}

/** A flat sign with big display text (canvas texture). */
export function signMesh(text: string, w: number, h: number, fg = '#dcff1f', bg = '#1a0b33', border = fg) {
  const px = 120, W = Math.round((w / h) * px);
  const tex = ctex(W, px, (g) => {
    if (bg) { g.fillStyle = bg; g.fillRect(0, 0, W, px); }
    if (border) { g.strokeStyle = border; g.lineWidth = 8; g.strokeRect(5, 5, W - 10, px - 10); }
    g.font = `italic 900 ${Math.round(px * 0.62)}px ${FONT}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineWidth = 8;
    g.strokeStyle = '#1a0b33';
    g.strokeText(text, W / 2, px * 0.55);
    g.fillStyle = fg;
    g.fillText(text, W / 2, px * 0.55);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: !bg }));
}

/** Formats seconds like "4,87". */
export const sec2 = (v: number) => v.toFixed(2).replace('.', ',');

/** Four-way press for this step: 0 up (A / ↑ / W), 1 right, 2 down (B or ↓ / S edge), 3 left; -1 none. */
export function dir4(inp: MgInput, prevY: number): number {
  if (inp.aP) return 0;
  if (inp.rP) return 1;
  if (inp.bP || (inp.y > 0.5 && prevY <= 0.5)) return 2;
  if (inp.lP) return 3;
  return -1;
}
/** Bot input for a four-way press. */
export function press4(o: MgInput, dir: number) {
  if (dir === 0) o.aP = true; else if (dir === 1) o.rP = true; else if (dir === 2) o.bP = true; else o.lP = true;
  return o;
}
export const TOUCH4 = { joy: false, buttons: [{ key: 'l' as const, label: '◀', small: true }, { key: 'a' as const, label: '▲', small: true }, { key: 'b' as const, label: '▼', small: true }, { key: 'r' as const, label: '▶', small: true }] };

/** Verb form for a result title: the default player name "Du" takes the second person. */
export const verb = (name: string, er: string, du: string) => (name === 'Du' ? du : er);
/** The accusative of a player name ("Du" → "dich"). */
export const akk = (name: string) => (name === 'Du' ? 'dich' : name);
