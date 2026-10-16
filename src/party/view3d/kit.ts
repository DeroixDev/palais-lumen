// Shared 3D toolkit: one renderer for every scene, toon materials (cached and shared), the Batch
// helper that merges static parts into one draw call, canvas textures drawn at 2x with
// anisotropic filtering, shared geometry, and lights with a tight shadow frustum.

import * as THREE from 'three';
import { TAU } from '../util';

export { THREE };

let renderer: THREE.WebGLRenderer | null = null;
let maxAniso = 4, maxAnisoAll = 4;

/** Creates the one renderer (antialias on). Throws when WebGL is missing. */
export function createRenderer(canvas: HTMLCanvasElement) {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  maxAnisoAll = renderer.capabilities.getMaxAnisotropy() || 1;
  maxAniso = Math.min(8, maxAnisoAll);
  return renderer;
}
export const getRenderer = () => renderer!;
/** Anisotropy for big ground textures seen at a flat angle (up to 16). */
export const groundAniso = () => Math.min(16, maxAnisoAll);

// ---------- materials ----------
export const GRAD = new THREE.DataTexture(new Uint8Array([105, 185, 255]), 3, 1, THREE.RedFormat);
GRAD.minFilter = GRAD.magFilter = THREE.NearestFilter;
GRAD.needsUpdate = true;

const matCache = new Map<string, THREE.MeshToonMaterial>();
/** A shared toon material per colour (+ options). */
export function toon(color: string, o: THREE.MeshToonMaterialParameters = {}) {
  const k = color + JSON.stringify(o);
  let m = matCache.get(k);
  if (!m) { m = new THREE.MeshToonMaterial({ color, gradientMap: GRAD, ...o }); matCache.set(k, m); }
  return m;
}
export const VC = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD });
export const VC_EMI = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, emissive: '#4a3200' });
export const GLOW = new THREE.MeshBasicMaterial({ vertexColors: true });
export const OUT = new THREE.MeshBasicMaterial({ color: '#1a0b33', side: THREE.BackSide });
export const COIN_MAT = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, emissive: '#3a2a00' });

// ---------- canvas textures (drawn at 2x for crisp text and icons) ----------
export const FONT = '"Archivo", "Arial Narrow", Impact, sans-serif';
export function ctex(w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = false, scale = 2) {
  const c = document.createElement('canvas');
  c.width = w * scale;
  c.height = h * scale;
  const g = c.getContext('2d')!;
  g.scale(scale, scale);
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
export const skyTex = (stops: string[]) => ctex(4, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  stops.forEach((c, i) => gr.addColorStop(i / (stops.length - 1), c));
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
}, false, 1);

// ---------- shared geometry ----------
export const SPH = new THREE.SphereGeometry(1, 18, 12);
export const SPH_LO = new THREE.SphereGeometry(1, 10, 7);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 24);
export const CYL8 = new THREE.CylinderGeometry(1, 1, 1, 8);
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CONE = new THREE.ConeGeometry(1, 1, 16);
export const CAPS = new THREE.CapsuleGeometry(1, 2, 4, 10);
export const HEMI = new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI / 2);
export const SMILE = new THREE.TorusGeometry(1, 0.3, 6, 14, Math.PI);
export const TAPER = new THREE.CylinderGeometry(1, 0.3, 1, 20);
export const TOR = new THREE.TorusGeometry(1, 0.08, 6, 48);
export const TOR_THIN = new THREE.TorusGeometry(1, 0.022, 6, 72);

// ---------- Batch: many static parts → one vertex-coloured mesh (one draw call) ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const _c = new THREE.Color(), _n3 = new THREE.Matrix3(), _vv = new THREE.Vector3();
export const UP = new THREE.Vector3(0, 1, 0);

export class Batch {
  P: number[] = [];
  N: number[] = [];
  C: number[] = [];
  I: number[] = [];
  n = 0;
  add(geo: THREE.BufferGeometry, color: string, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
    _m4.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz));
    return this.addM(geo, color, _m4);
  }
  addM(geo: THREE.BufferGeometry, color: string, m: THREE.Matrix4) {
    const pos = geo.attributes.position, nor = geo.attributes.normal;
    _n3.getNormalMatrix(m);
    _c.set(color);
    for (let i = 0; i < pos.count; i++) {
      _vv.fromBufferAttribute(pos as THREE.BufferAttribute, i).applyMatrix4(m);
      this.P.push(_vv.x, _vv.y, _vv.z);
      _vv.fromBufferAttribute(nor as THREE.BufferAttribute, i).applyMatrix3(_n3).normalize();
      this.N.push(_vv.x, _vv.y, _vv.z);
      this.C.push(_c.r, _c.g, _c.b);
    }
    if (geo.index) { const ix = geo.index.array; for (let i = 0; i < ix.length; i++) this.I.push(ix[i] + this.n); }
    else for (let i = 0; i < pos.count; i++) this.I.push(i + this.n);
    this.n += pos.count;
    return this;
  }
  beam(a: [number, number, number], b: [number, number, number], r: number, color: string, geo: THREE.BufferGeometry = CYL8) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), len = d.length();
    _q.setFromUnitVectors(UP, d.normalize());
    const m = new THREE.Matrix4().compose(A.add(B).multiplyScalar(0.5), _q, new THREE.Vector3(r, len, r));
    return this.addM(geo, color, m);
  }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.C, 3));
    g.setIndex(this.I);
    g.computeBoundingSphere();
    return g;
  }
  mesh(mat: THREE.Material = VC, cast = true, recv = true) {
    const m = new THREE.Mesh(this.geometry(), mat);
    m.castShadow = cast;
    m.receiveShadow = recv;
    return m;
  }
}

export function starShape(R = 1, r = 0.5) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r : R;
    const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
    if (i) s.lineTo(x, y); else s.moveTo(x, y);
  }
  s.closePath();
  return s;
}
export const STAR_EX = new THREE.ExtrudeGeometry(starShape(), { depth: 0.3, bevelEnabled: true, bevelThickness: 0.12, bevelSize: 0.1, bevelSegments: 2 });
STAR_EX.center();
export const STAR_GEO = (() => {
  const b = new Batch();
  b.add(STAR_EX, '#ffd23f');
  for (const s of [-1, 1]) b.add(SPH, '#1a0b33', s * 0.2, 0.06, 0.29, 0, 0, 0, 0.075, 0.13, 0.04);
  b.add(SPH, '#ff8fc0', -0.36, -0.12, 0.28, 0, 0, 0, 0.09, 0.05, 0.02);
  b.add(SPH, '#ff8fc0', 0.36, -0.12, 0.28, 0, 0, 0, 0.09, 0.05, 0.02);
  return b.geometry();
})();
export const COIN_GEO = (() => {
  const b = new Batch();
  b.add(CYL, '#e09a00', 0, 0, 0, Math.PI / 2, 0, 0, 0.42, 0.1, 0.42);
  b.add(CYL, '#ffd84a', 0, 0, 0, Math.PI / 2, 0, 0, 0.33, 0.12, 0.33);
  b.add(BOX, '#fff2a6', 0, 0, 0, 0, 0, 0, 0.09, 0.34, 0.14);
  return b.geometry();
})();

// ---------- lights ----------
export interface Lights {
  hemi: THREE.HemisphereLight;
  sun: THREE.DirectionalLight;
  /** Shadow map size at the best quality (the governor scales it). */
  baseSize: number;
  /** Half width of the shadow frustum; the sun follows `focus` so the frustum stays tight. */
  half: number;
  offset: THREE.Vector3;
}
const lightsAll = new Set<Lights>();
export const allLights = () => lightsAll;

export function addLights(scene: THREE.Scene, half: number, size: number, pos: [number, number, number] = [-28, 55, 30], int = 2.3): Lights {
  const hemi = new THREE.HemisphereLight('#fff3fb', '#6b4ad0', 1.55);
  const sun = new THREE.DirectionalLight('#fff0d8', int);
  sun.position.set(...pos);
  sun.castShadow = true;
  sun.shadow.mapSize.set(size, size);
  const c = sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.near = 1; c.far = 200;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(hemi, sun, sun.target);
  const L: Lights = { hemi, sun, baseSize: size, half, offset: new THREE.Vector3(...pos) };
  lightsAll.add(L);
  return L;
}

/** Moves the sun so its tight shadow frustum is centred on `focus`, snapped to whole texels (no shimmer). */
export function focusShadow(L: Lights, focus: THREE.Vector3, half: number) {
  const c = L.sun.shadow.camera;
  if (c.right !== half) { c.left = -half; c.right = half; c.top = half; c.bottom = -half; c.updateProjectionMatrix(); }
  const texel = (half * 2) / L.sun.shadow.mapSize.x;
  const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
  L.sun.target.position.set(fx, 0, fz);
  L.sun.position.set(fx + L.offset.x, L.offset.y, fz + L.offset.z);
  L.sun.target.updateMatrixWorld();
}

/**
 * A fixed shadow frustum over the whole island (centre cx/cz, half width `half`): the board
 * draws its shadow map once (baked) instead of every frame, so it must cover everything.
 */
export function fixShadow(L: Lights, cx: number, cz: number, half: number) {
  const c = L.sun.shadow.camera;
  c.left = -half; c.right = half; c.top = half; c.bottom = -half;
  c.near = 1; c.far = L.offset.length() + half * 2;
  c.updateProjectionMatrix();
  L.half = half;
  L.sun.target.position.set(cx, 0, cz);
  L.sun.position.set(cx + L.offset.x, L.offset.y, cz + L.offset.z);
  L.sun.target.updateMatrixWorld();
  L.sun.updateMatrixWorld();
}

/** Releases a scene's GPU resources (geometry and non-shared materials/textures). */
export function disposeScene(scene: THREE.Scene, keep: Set<unknown> = new Set()) {
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry && !keep.has(m.geometry) && !SHARED_GEO.has(m.geometry)) m.geometry.dispose();
  });
  for (const L of [...lightsAll]) if (L.sun.parent === scene) { L.sun.shadow.map?.dispose(); lightsAll.delete(L); }
}
const SHARED_GEO = new Set<THREE.BufferGeometry>([SPH, SPH_LO, CYL, CYL8, BOX, CONE, CAPS, HEMI, SMILE, TAPER, TOR, TOR_THIN, STAR_EX, STAR_GEO, COIN_GEO]);
export const markShared = (g: THREE.BufferGeometry) => SHARED_GEO.add(g);
