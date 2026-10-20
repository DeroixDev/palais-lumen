// Life and reactions on the boards (shared by every board): pigeons that fly up when a figure
// hops past, spectators at the star who cheer when someone buys it, coins lying around that pop
// when a figure passes, bushes that wobble, lanterns that switch on as a figure walks by, and
// passers-by with shopping bags (geometry for loopers). Plus distance detail: props registered as
// "near" are hidden in the overview (tiny there, and they would only shimmer).
//
// How it hangs together: BoardView reports every hop (lifeHop), a bought star (lifeCheer) and
// where the star sits (lifeStar); each reactor of the scene answers. Everything here sleeps
// (hidden, no updates) when the quality governor turns the effects off, nothing casts a shadow
// (the board's shadow map is baked) and nothing allocates per frame. Matrices are only written
// while something moves.

import { BOX, Batch, COIN_MAT, CYL8, THREE } from '../view3d/kit';
import { glow, glowEmi } from '../view3d/shaderfx';
import { quality } from '../view3d/quality';
import { TAU, clamp } from '../util';
import { BULB, LEAF, type P2 } from './bauteile';
import { VCT, type Item } from './details';

const _d = new THREE.Object3D();
const _c = new THREE.Color();

/** Camera height under which the near detail shows (follow ≈ 21, point ≈ 25, overview ≥ 50). */
export const NEAR_Y = 38;

export interface Reactor {
  /** Meshes this reactor owns (hidden when the effects are off, or far away for `near`). */
  meshes: THREE.Object3D[];
  /** Only shown close up (follow / point camera). */
  near?: boolean;
  /** Not an effect: stays even when the governor turns the effects off (static props). */
  keep?: boolean;
  hop?(x: number, z: number, t: number): void;
  cheer?(x: number, z: number, t: number): void;
  star?(x: number, z: number): void;
  tick?(dt: number, t: number): void;
}
/**
 * What the board view adds to every board (boards change it in their decor with lifeConfig):
 * painted marks on plain path ribbons, litter along the paths, pigeon groups, coins lying
 * around and spectators at the star. Colours default to a city park.
 */
export interface LifeConfig {
  marks: boolean;
  litter: boolean;
  /** Litter per path piece. */
  litterPer: number;
  leaves?: string[];
  confetti?: string[];
  puddles: number;
  puddleC?: string;
  /** Pigeon groups (0 = none, e.g. indoors) and their colours. */
  pigeons: number;
  pigeonC?: string[];
  coins: number;
  spectators: number;
  fanC?: string[];
}
const DEFAULTS: LifeConfig = { marks: true, litter: true, litterPer: 4, puddles: 8, pigeons: 9, coins: 18, spectators: 6 };
interface Ctx { list: Reactor[]; t: number; near: boolean; fx: boolean; spot: ((x: number, z: number) => boolean) | null; cfg: LifeConfig; flat: Batch }
const ctxs = new WeakMap<THREE.Scene, Ctx>();
const ctx = (sc: THREE.Scene) => { let c = ctxs.get(sc); if (!c) ctxs.set(sc, (c = { list: [], t: 0, near: true, fx: true, spot: null, cfg: { ...DEFAULTS }, flat: new Batch() })); return c; };
/** Flat detail lying on the ground or on paths (markings, litter, puddles) of a scene: one Batch
 *  that the board view turns into ONE near-only mesh at the end (feinkram.sharedDetail). */
export const flatBatch = (sc: THREE.Scene) => ctx(sc).flat;
/** A board tunes the shared life and litter (call it in decor(); the board view builds after). */
export function lifeConfig(sc: THREE.Scene, c: Partial<LifeConfig>) { Object.assign(ctx(sc).cfg, c); }
export const lifeConfigOf = (sc: THREE.Scene) => ctx(sc).cfg;
export const spotFilterOf = (sc: THREE.Scene) => ctx(sc).spot;

export function addReactor(sc: THREE.Scene, r: Reactor) {
  for (const m of r.meshes) { m.castShadow = false; }
  ctx(sc).list.push(r);
  return r;
}
/** Static detail that only shows close up (litter, leaves, decals); not an effect. */
export function nearOnly(sc: THREE.Scene, ...meshes: THREE.Object3D[]) { addReactor(sc, { meshes, near: true, keep: true }); }
/** The board tells where spectators may stand (free of its buildings and landmarks). */
export function setSpotFilter(sc: THREE.Scene, fn: (x: number, z: number) => boolean) { ctx(sc).spot = fn; }

/** A figure landed on (x, z). */
export function lifeHop(sc: THREE.Scene, x: number, z: number) { const c = ctxs.get(sc); if (c?.fx) for (const r of c.list) r.hop?.(x, z, c.t); }
/** Someone bought the star at (x, z). */
export function lifeCheer(sc: THREE.Scene, x: number, z: number) { const c = ctxs.get(sc); if (c) for (const r of c.list) r.cheer?.(x, z, c.t); }
/** The star now sits at (x, z). */
export function lifeStar(sc: THREE.Scene, x: number, z: number) { const c = ctxs.get(sc); if (c) for (const r of c.list) r.star?.(x, z); }

/** Every frame from the board view: visibility (effects, distance) and the reactors' ticks. */
export function tickLeben(sc: THREE.Scene, dt: number, t: number, camY: number) {
  const c = ctxs.get(sc);
  if (!c) return;
  c.t = t;
  c.fx = quality.fx;
  c.near = camY < NEAR_Y;
  for (const r of c.list) {
    const on = (r.keep || c.fx) && (!r.near || c.near);
    for (let i = 0; i < r.meshes.length; i++) if (r.meshes[i].visible !== on) r.meshes[i].visible = on;
    if (on) r.tick?.(dt, t);
  }
}

function dyn(geo: THREE.BufferGeometry, mat: THREE.Material, n: number) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.castShadow = false;
  im.receiveShadow = false;
  im.frustumCulled = false;
  im.count = n;
  return im;
}
const geoCache = new Map<string, THREE.BufferGeometry>();
function once(key: string, make: (b: Batch) => void) {
  let g = geoCache.get(key);
  if (!g) { const b = new Batch(); make(b); g = b.geometry(); geoCache.set(key, g); }
  return g;
}

// ---------------------------------------------------------------- geometry
/** Body and light parts in ONE geometry: the light parts carry aGlow = 1 and glow in VEHICLE. */
export function litGeo(body: THREE.BufferGeometry, lights: THREE.BufferGeometry) {
  const parts = [body, lights], P: number[] = [], N: number[] = [], C: number[] = [], G: number[] = [], I: number[] = [];
  let base = 0;
  parts.forEach((g, k) => {
    const p = g.attributes.position, n = g.attributes.normal, c = g.attributes.color;
    for (let i = 0; i < p.count; i++) { P.push(p.getX(i), p.getY(i), p.getZ(i)); N.push(n.getX(i), n.getY(i), n.getZ(i)); C.push(c ? c.getX(i) : 1, c ? c.getY(i) : 1, c ? c.getZ(i) : 1); G.push(k); }
    const ix = g.index!.array;
    for (let i = 0; i < ix.length; i++) I.push(ix[i] + base);
    base += p.count;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aGlow', new THREE.Float32BufferAttribute(G, 1));
  g.setIndex(I);
  g.computeBoundingSphere();
  return g;
}
/** Vehicles: tinted body (instance colour) and untinted head/tail lights that glow (more at night). */
const LIT_K = { value: 0.6 };
export const VEHICLE = glowEmi(VCT.clone(), 0.9);
VEHICLE.onBeforeCompile = (s) => {
  s.uniforms.uLitK = LIT_K;
  s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nattribute float aGlow;\nvarying vec3 vGlowC;').replace('#include <color_vertex>', '#include <color_vertex>\n\tvGlowC = color.rgb * aGlow;');
  s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uLitK;\nvarying vec3 vGlowC;')
    .replace('#include <color_fragment>', '#include <color_fragment>\n\tif ( dot( vGlowC, vec3( 1.0 ) ) > 0.001 ) diffuseColor.rgb = vGlowC;')
    .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n\ttotalEmissiveRadiance += vGlowC * uLitK;');
};
VEHICLE.customProgramCacheKey = () => 'vehicle';
/** How bright vehicle lights are (0.4 by day … 1.6 at night); boards pass their atmosphere glow. */
export const setVehicleGlow = (glow01: number) => { LIT_K.value = 0.4 + 1.2 * glow01; };
export const GEO = {
  /** A cheap coin (two 8-sided discs and the bar), face along z like kit.COIN_GEO. */
  coin: () => once('coin', (b) => {
    b.add(CYL8, '#e09a00', 0, 0, 0, Math.PI / 2, 0, 0, 0.42, 0.1, 0.42);
    b.add(CYL8, '#ffd84a', 0, 0, 0, Math.PI / 2, 0, 0, 0.33, 0.12, 0.33);
    b.add(BOX, '#fff2a6', 0, 0, 0, 0, 0, 0, 0.09, 0.34, 0.14);
  }),
  /** Head and tail lights of a car (front at +z); `roof` adds a taxi sign. */
  carLights: (roof = false, len = 0.88, y = 0.4, w = 0.3) => once(`carLights${roof}${len}`, (b) => {
    for (const s of [-w, w]) { b.add(BULB, '#fff6d0', s, y, len, 0, 0, 0, 0.075); b.add(BULB, '#ff2a4a', s, y + 0.02, -len, 0, 0, 0, 0.065); }
    if (roof) b.add(BOX, '#ffe680', 0, 0.86, -0.05, 0, 0, 0, 0.37, 0.13, 0.19);
  }),
  /** Pigeon (grey-blue, white parts take the tint): body, head, beak, tail, wings (unit wings at ±x). */
  pigeon: () => once('pigeon', (b) => {
    b.add(LEAF, '#ffffff', 0, 0.16, 0, 0, 0, 0, 0.13, 0.12, 0.2);
    b.add(LEAF, '#ffffff', 0, 0.29, 0.13, 0, 0, 0, 0.08);
    b.add(LEAF, '#7fd6b0', 0, 0.23, 0.1, 0, 0, 0, 0.085, 0.05, 0.06);
    b.add(BOX, '#ffb347', 0, 0.28, 0.23, 0, 0, 0, 0.03, 0.03, 0.07);
    b.add(BOX, '#1a0b33', 0, 0.31, 0.18, 0, 0, 0, 0.11, 0.025, 0.025);
    b.add(BOX, '#d8d8e8', 0, 0.17, -0.2, 0.25, 0, 0, 0.12, 0.03, 0.14);
    for (const s of [-1, 1]) b.add(BOX, '#e8e8f4', s * 0.12, 0.2, -0.02, 0, 0, s * 0.2, 0.06, 0.03, 0.2);
    b.add(BOX, '#ff8a5c', 0, 0.03, 0.02, 0, 0, 0, 0.1, 0.07, 0.02);
  }),
  /** Passer-by with two shopping bags (tinted coat). */
  shopper: () => once('shopper', (b) => {
    b.add(CYL8, '#ffffff', 0, 0.55, 0, 0, 0, 0, 0.2, 0.7, 0.16);
    b.add(LEAF, '#f2c7a0', 0, 1.05, 0, 0, 0, 0, 0.17, 0.18, 0.17);
    b.add(LEAF, '#4a2a1a', 0, 1.13, -0.03, 0, 0, 0, 0.18, 0.11, 0.18);
    for (const s of [-0.08, 0.08]) b.add(CYL8, '#2a2440', s, 0.12, 0, 0, 0, 0, 0.06, 0.26, 0.06);
    for (const s of [-1, 1]) b.add(CYL8, '#ffffff', s * 0.23, 0.6, 0, 0, 0, s * 0.12, 0.05, 0.42, 0.05);
    b.add(BOX, '#ff7ad0', 0.3, 0.3, 0, 0, 0, 0, 0.12, 0.26, 0.24); b.add(BOX, '#ffffff', 0.3, 0.45, 0, 0, 0, 0, 0.125, 0.03, 0.245);
    b.add(BOX, '#ffd23f', -0.3, 0.28, 0, 0, 0, 0, 0.11, 0.22, 0.2); b.add(BOX, '#3fdc7a', -0.3, 0.42, 0.06, 0, 0, 0, 0.04, 0.1, 0.04);
  }),
  /** A spectator's body (tinted shirt) and, separately, the arms that go up when they cheer. */
  fan: () => once('fan', (b) => {
    b.add(CYL8, '#ffffff', 0, 0.55, 0, 0, 0, 0, 0.21, 0.7, 0.17);
    b.add(LEAF, '#f2c7a0', 0, 1.06, 0, 0, 0, 0, 0.18, 0.19, 0.18);
    b.add(LEAF, '#ffffff', 0, 1.17, 0, 0, 0, 0, 0.19, 0.08, 0.19);
    b.add(CYL8, '#ffffff', 0, 1.2, 0.12, 0.3, 0, 0, 0.12, 0.03, 0.12);
    for (const s of [-0.08, 0.08]) b.add(CYL8, '#2a2440', s, 0.12, 0, 0, 0, 0, 0.065, 0.26, 0.065);
  }),
  /** Arms with pivot at the shoulders (y = 0), hanging down; a little flag in the right hand. */
  fanArms: () => once('fanArms', (b) => {
    for (const s of [-1, 1]) { b.add(CYL8, '#f2c7a0', s * 0.25, -0.2, 0, 0, 0, 0, 0.05, 0.42, 0.05); b.add(BULB, '#f2c7a0', s * 0.25, -0.42, 0, 0, 0, 0, 0.06); }
    b.add(CYL8, '#2a2440', 0.25, -0.62, 0.04, 0, 0, 0, 0.012, 0.42, 0.012);
    b.add(BOX, '#ffffff', 0.25, -0.76, 0.16, 0, 0, 0, 0.02, 0.16, 0.24);
  }),
  /** Taxi: yellow body (tint), roof sign, chequered stripe, glass, wheels, lights. Front at +z. */
  taxi: () => once('taxi', (b) => {
    b.add(BOX, '#ffffff', 0, 0.35, 0, 0, 0, 0, 0.9, 0.36, 1.75);
    b.add(BOX, '#ffffff', 0, 0.66, -0.1, 0, 0, 0, 0.8, 0.3, 0.95);
    b.add(BOX, '#9fe3ff', 0, 0.66, 0.38, 0, 0, 0, 0.72, 0.24, 0.02);
    b.add(BOX, '#9fe3ff', 0, 0.66, -0.58, 0, 0, 0, 0.72, 0.22, 0.02);
    for (const s of [-1, 1]) b.add(BOX, '#9fe3ff', s * 0.405, 0.66, -0.1, 0, 0, 0, 0.01, 0.2, 0.8);
    for (let k = 0; k < 8; k++) for (const s of [-1, 1]) b.add(BOX, k % 2 ? '#1a0b33' : '#ffffff', s * 0.455, 0.42, -0.7 + k * 0.2, 0, 0, 0, 0.01, 0.08, 0.2);
    b.add(BOX, '#fff6c8', 0, 0.86, -0.05, 0, 0, 0, 0.36, 0.12, 0.18); b.add(BOX, '#1a0b33', 0, 0.86, 0.045, 0, 0, 0, 0.26, 0.06, 0.01);
    for (const sx of [-0.45, 0.45]) for (const sz of [-0.55, 0.55]) b.add(CYL8, '#1d1f24', sx, 0.18, sz, 0, 0, Math.PI / 2, 0.18, 0.14, 0.18);
    for (const sx of [-0.3, 0.3]) { b.add(BULB, '#fff3c8', sx, 0.4, 0.88, 0, 0, 0, 0.07); b.add(BULB, '#ff3d6e', sx, 0.42, -0.88, 0, 0, 0, 0.06); }
  }),
  /** City bus: long tinted body, window band, destination sign, wheels. Front at +z. */
  bus: () => once('bus', (b) => {
    b.add(BOX, '#ffffff', 0, 0.75, 0, 0, 0, 0, 1.05, 1.15, 3.8);
    b.add(BOX, '#1a2a4a', 0, 0.95, 0.02, 0, 0, 0, 1.07, 0.42, 3.5);
    for (let k = 0; k < 6; k++) b.add(BOX, '#9fe3ff', 0, 0.97, -1.5 + k * 0.6, 0, 0, 0, 1.09, 0.34, 0.5);
    b.add(BOX, '#9fe3ff', 0, 0.9, 1.91, 0, 0, 0, 0.9, 0.55, 0.02);
    b.add(BOX, '#ffd23f', 0, 1.27, 1.91, 0, 0, 0, 0.7, 0.14, 0.03);
    b.add(BOX, '#ffffff', 0, 1.36, 0, 0, 0, 0, 0.95, 0.06, 3.6);
    b.add(BOX, '#2a2440', 0, 0.22, 0, 0, 0, 0, 1.06, 0.12, 3.82);
    for (const sx of [-0.5, 0.5]) for (const sz of [-1.25, 1.25]) b.add(CYL8, '#1d1f24', sx, 0.2, sz, 0, 0, Math.PI / 2, 0.2, 0.14, 0.2);
    for (const sx of [-0.35, 0.35]) { b.add(BULB, '#fff3c8', sx, 0.45, 1.91, 0, 0, 0, 0.08); b.add(BULB, '#ff3d6e', sx, 0.45, -1.91, 0, 0, 0, 0.07); }
  }),
};

// ---------------------------------------------------------------- pigeons
/** Little groups of pigeons pecking on the ground; they fly up when a figure lands close. */
export function pigeons(sc: THREE.Scene, spots: P2[], o: { per?: number; colors?: string[] } = {}) {
  const per = o.per ?? 3, cols = o.colors ?? ['#9aa4c0', '#b4bccf', '#8890aa', '#c8ccd8'];
  const B: { x: number; z: number; ry: number; ph: number; f: number; dx: number; dz: number; h: number }[] = [];
  for (const [x, z] of spots) for (let k = 0; k < per; k++) {
    const a = Math.random() * TAU, r = 0.25 + Math.random() * 0.45;
    B.push({ x: x + Math.cos(a) * r, z: z + Math.sin(a) * r, ry: Math.random() * TAU, ph: Math.random() * 10, f: -1, dx: 0, dz: 0, h: 3.5 + Math.random() * 2.5 });
  }
  const im = dyn(GEO.pigeon(), VCT, B.length);
  B.forEach((_, i) => im.setColorAt(i, _c.set(cols[i % cols.length])));
  sc.add(im);
  const FLY = 3.4;
  let flying = 0;
  const place = (t: number) => {
    for (let i = 0; i < B.length; i++) {
      const b = B[i];
      let x = b.x, y = 0, z = b.z, ry = b.ry, rx = 0, wing = 1;
      if (b.f >= 0) {
        const k = (t - b.f) / FLY;
        if (k >= 1) { b.f = -1; flying--; b.ry = Math.random() * TAU; ry = b.ry; }
        else {
          const s = Math.sin(k * Math.PI), out = k < 0.5 ? 1 : -1;
          x += b.dx * s * 5; z += b.dz * s * 5; y = s * b.h;
          ry = Math.atan2(b.dx * out, b.dz * out);
          rx = -0.35 * out;
          wing = 1 + Math.abs(Math.sin((t - b.f) * 22)) * 2.6;
        }
      } else {
        const p = Math.sin(t * 2.6 + b.ph);
        rx = p > 0.75 ? (p - 0.75) * 2.2 : 0;
        ry = b.ry + Math.sin(t * 0.4 + b.ph) * 0.5;
      }
      _d.position.set(x, y, z);
      _d.rotation.set(rx, ry, 0);
      _d.scale.set(wing > 1 ? 1 + (wing - 1) * 0.35 : 1, 1, 1);
      _d.updateMatrix();
      im.setMatrixAt(i, _d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  return addReactor(sc, {
    meshes: [im], near: true,
    hop(x, z, t) {
      for (const b of B) {
        if (b.f >= 0) continue;
        const dx = b.x - x, dz = b.z - z, d = Math.hypot(dx, dz);
        if (d > 3.4) continue;
        const a = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.9;
        b.dx = Math.cos(a); b.dz = Math.sin(a); b.f = t + Math.random() * 0.25; flying++;
      }
    },
    tick(_dt, t) { place(t); void flying; },
  });
}

// ---------------------------------------------------------------- spectators at the star
/** Body plus arms (lifted to the shoulders at y 0.8) with aArm marking the arm vertices. */
function fanGeo() {
  let g = geoCache.get('fanAll');
  if (!g) {
    g = litGeo(GEO.fan(), GEO.fanArms().clone().translate(0, 0.8, 0));
    g.setAttribute('aArm', g.attributes.aGlow);
    g.deleteAttribute('aGlow');
    geoCache.set('fanAll', g);
  }
  return g;
}
const FAN_MAT = (() => {
  const m = VCT.clone();
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aArm;\nattribute float aUp;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	if ( aArm > 0.5 ) {
	  float c = cos( aUp ), sn = sin( aUp ), y = transformed.y - 0.8, z = transformed.z;
	  transformed.y = 0.8 + y * c + z * sn; transformed.z = - y * sn + z * c;
	}`);
  };
  m.customProgramCacheKey = () => 'fan';
  return m;
})();
/** A little crowd around the star's space; they jump and wave when somebody buys the star. */
export function spectators(sc: THREE.Scene, clear: (x: number, z: number) => boolean, o: { n?: number; colors?: string[] } = {}) {
  const N = o.n ?? 6, cols = o.colors ?? ['#ff4fb0', '#35d4ff', '#ffd23f', '#b46bff', '#7dff8a', '#ff9a5c'];
  // body and arms in ONE mesh: the arm vertices (aArm = 1) turn about the shoulders by the
  // per-instance angle aUp in the vertex shader (one draw call for the whole crowd)
  const body = dyn(fanGeo(), FAN_MAT, N);
  const upA = new THREE.InstancedBufferAttribute(new Float32Array(N), 1);
  upA.setUsage(THREE.DynamicDrawUsage);
  body.geometry = body.geometry.clone();
  body.geometry.setAttribute('aUp', upA);
  for (let i = 0; i < N; i++) body.setColorAt(i, _c.set(cols[i % cols.length]));
  sc.add(body);
  const P = Array.from({ length: N }, (_, i) => ({ x: 0, z: 0, ry: 0, ph: i * 1.7, on: false }));
  let cheerT = -99, sx = 0, sz = 0, used = 0;
  const filter = () => ctx(sc).spot;
  const star = (x: number, z: number) => {
    sx = x; sz = z; used = 0;
    const f = filter();
    for (let ring = 0; ring < 2 && used < N; ring++) for (let k = 0; k < 14 && used < N; k++) {
      const a = (k / 14) * TAU + ring * 0.22, r = 2.55 + ring * 0.9;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!clear(px, pz) || (f && !f(px, pz)) || P.slice(0, used).some((q) => Math.hypot(q.x - px, q.z - pz) < 0.8)) continue;
      const q = P[used++];
      q.x = px; q.z = pz; q.ry = Math.atan2(x - px, z - pz); q.on = true;
    }
    for (let i = used; i < N; i++) P[i].on = false;
    body.count = used;
  };
  const place = (t: number) => {
    const ck = t - cheerT, cheering = ck >= 0 && ck < 3.2;
    for (let i = 0; i < used; i++) {
      const q = P[i];
      const jump = cheering ? Math.abs(Math.sin(ck * 7 + q.ph)) * 0.45 * (1 - ck / 3.2) : 0;
      const sway = Math.sin(t * 1.3 + q.ph) * 0.06;
      _d.position.set(q.x, jump, q.z); _d.rotation.set(0, q.ry + sway, sway * 0.5); _d.scale.setScalar(0.85); _d.updateMatrix();
      body.setMatrixAt(i, _d.matrix);
      const up = cheering ? 2.7 + Math.sin(ck * 9 + q.ph) * 0.35 : 0.15 + Math.max(0, Math.sin(t * 0.7 + q.ph * 3)) ** 12 * 2.4;
      upA.array[i] = up;
    }
    body.instanceMatrix.needsUpdate = upA.needsUpdate = true;
  };
  return addReactor(sc, {
    meshes: [body], near: true,
    star,
    cheer(x, z, t) { if (Math.hypot(x - sx, z - sz) < 9) cheerT = t; },
    tick(_dt, t) { if (used) place(t); },
  });
}

// ---------------------------------------------------------------- coins on the ground
/** Coins lying around beside the paths; they pop up spinning when a figure lands close. */
export function groundCoins(sc: THREE.Scene, spots: P2[]) {
  const C = spots.map(([x, z]) => ({ x, z, ry: Math.random() * TAU, tilt: 0.2 + Math.random() * 0.25, f: -9 }));
  const im = dyn(GEO.coin(), COIN_MAT, C.length);
  sc.add(im);
  let active = 1;
  const place = (t: number) => {
    active = 0;
    for (let i = 0; i < C.length; i++) {
      const c = C[i], k = (t - c.f) / 1.1;
      if (k >= 0 && k < 1) {
        active++;
        _d.position.set(c.x, 0.1 + Math.sin(k * Math.PI) * 1.3, c.z);
        _d.rotation.set(0, c.ry + k * 14, 0);
      } else {
        _d.position.set(c.x, 0.075, c.z);
        _d.rotation.set(Math.PI / 2 - c.tilt * 0.2, c.ry, 0);
      }
      _d.scale.setScalar(0.55);
      _d.updateMatrix();
      im.setMatrixAt(i, _d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  return addReactor(sc, {
    meshes: [im], near: true,
    hop(x, z, t) { for (const c of C) if (Math.hypot(c.x - x, c.z - z) < 2.6 && t - c.f > 1.2) { c.f = t + Math.random() * 0.2; active++; } },
    tick(_dt, t) { if (active) place(t); },
  });
}

// ---------------------------------------------------------------- wobbling bushes
/** Instanced bushes (or any plant) that wobble when a figure lands close. Static matrices, so they
 *  can cast into the baked shadow map; the wobble runs in the vertex shader. */
export function wobbly(sc: THREE.Scene, geo0: THREE.BufferGeometry, items: Item[], o: { r?: number; cast?: boolean } = {}) {
  const geo = geo0.clone();
  const wob = new Float32Array(Math.max(1, items.length)).fill(-99);
  const attr = new THREE.InstancedBufferAttribute(wob, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aWob', attr);
  const uT = { value: 0 };
  const mat = VCT.clone();
  mat.onBeforeCompile = (s) => {
    s.uniforms.uWobT = uT;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aWob;\nuniform float uWobT;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
	{ float age = uWobT - aWob;
	  if ( age > 0.0 && age < 1.8 ) {
	    float a = exp( - age * 2.6 ) * sin( age * 17.0 );
	    float h = max( position.y, 0.0 );
	    transformed.x += a * 0.22 * h; transformed.z += a * 0.12 * h;
	    transformed.y *= 1.0 - a * 0.12;
	  } }`);
  };
  mat.customProgramCacheKey = () => 'wobbly';
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, items.length));
  items.forEach((it, i) => {
    const s = it.s ?? 1;
    _d.position.set(it.x, it.y ?? 0, it.z); _d.rotation.set(0, it.ry ?? 0, 0); _d.scale.set(s * (it.sx ?? 1), s * (it.sy ?? 1), s * (it.sz ?? 1)); _d.updateMatrix();
    im.setMatrixAt(i, _d.matrix);
    im.setColorAt(i, _c.set(it.c ?? '#ffffff'));
  });
  im.count = items.length;
  im.castShadow = o.cast ?? true;
  im.receiveShadow = true;
  im.computeBoundingSphere();
  sc.add(im);
  const R = o.r ?? 2.8;
  // registered without the mesh: the bushes themselves are static decor, only the wobble reacts
  addReactor(sc, {
    meshes: [], keep: true,
    hop(x, z, t) {
      let hit = false;
      for (let i = 0; i < items.length; i++) { const it = items[i]; if (Math.hypot(it.x - x, it.z - z) < R + (it.s ?? 1) * 0.5) { wob[i] = t + Math.hypot(it.x - x, it.z - z) * 0.06; hit = true; } }
      if (hit) attr.needsUpdate = true;
    },
    tick(_dt, t) { uT.value = t; },
  });
  return im;
}

// ---------------------------------------------------------------- lanterns
/** Lantern heads that glow at night and switch on for a while when a figure passes by day. The
 *  colour per lantern only changes while it fades; `glowOf()` is the atmosphere's lamp level. */
export function lanterns(sc: THREE.Scene, pts: [number, number, number][], colors: string[], glowOf: () => number, o: { size?: number; r?: number; hold?: number } = {}) {
  const im = new THREE.InstancedMesh(BULB, glow(new THREE.MeshBasicMaterial({ color: '#ffffff' })), Math.max(1, pts.length));
  im.castShadow = false;
  im.count = pts.length;
  const size = o.size ?? 0.26, R = o.r ?? 4.2, hold = o.hold ?? 5;
  const on = colors.map((c) => new THREE.Color(c)), off = colors.map((c) => new THREE.Color(c).lerp(new THREE.Color('#e8e4f4'), 0.75).multiplyScalar(0.7));
  pts.forEach(([x, y, z], i) => { _d.position.set(x, y, z); _d.rotation.set(0, 0, 0); _d.scale.setScalar(size); _d.updateMatrix(); im.setMatrixAt(i, _d.matrix); });
  const lvl = new Float32Array(pts.length), until = new Float32Array(pts.length).fill(-1);
  const paint = (i: number) => im.setColorAt(i, _c.copy(off[i % off.length]).lerp(on[i % on.length], lvl[i]));
  for (let i = 0; i < pts.length; i++) paint(i);
  sc.add(im);
  let busy = true;
  addReactor(sc, {
    meshes: [], keep: true,
    hop(x, z, t) { for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0] - x, pts[i][2] - z) < R) { until[i] = t + hold + Math.random(); busy = true; } },
    tick(dt, t) {
      const g = glowOf();
      if (!busy && Math.abs(g - (lvl[0] ?? 0)) < 0.01) return;
      busy = false;
      let changed = false;
      for (let i = 0; i < pts.length; i++) {
        const goal = Math.max(g, until[i] > t ? 1 : 0);
        if (until[i] > t) busy = true;
        const d = goal - lvl[i];
        if (Math.abs(d) < 0.003) continue;
        // switching on flickers once, switching off fades
        lvl[i] = d > 0 ? clamp(lvl[i] + dt * 4 * (Math.sin(t * 40 + i) > -0.3 ? 1 : -0.6), 0, 1) : Math.max(goal, lvl[i] - dt * 0.8);
        paint(i);
        changed = true;
        busy = true;
      }
      if (changed && im.instanceColor) im.instanceColor.needsUpdate = true;
    },
  });
  return im;
}

// ---------------------------------------------------------------- walking routes
/** The board's main loop (from the start along the first way at every junction), as points
 *  shifted `off` to the side of the path (+ right of the walking direction). */
export function pathLoop(nodes: { x: number; z: number; next: number[] }[], start: number, off: number, pick: (from: number, options: number[]) => number = (_f, o) => o[0]) {
  const out: P2[] = [];
  let id = start, guard = 0;
  do {
    const n = nodes[id], nx = nodes[pick(id, n.next)];
    const dx = nx.x - n.x, dz = nx.z - n.z, l = Math.hypot(dx, dz) || 1;
    out.push([n.x - (dz / l) * off, n.z + (dx / l) * off], [(n.x + nx.x) / 2 - (dz / l) * off, (n.z + nx.z) / 2 + (dx / l) * off]);
    id = pick(id, n.next);
  } while (id !== start && ++guard < 400);
  return out;
}

/** Vehicles along a 3D route (closed), evenly spaced: a part of the route may run under the
 *  island (y below 0) so they drive into a tunnel and come back out at the other end. */
export function convoy(sc: THREE.Scene, geo: THREE.BufferGeometry, route: [number, number, number][], n: number, o: { speed?: number; colors?: string[]; scale?: number; offset?: number; lights?: THREE.BufferGeometry; glowOf?: () => number } = {}) {
  const L: number[] = [0];
  for (let i = 1; i <= route.length; i++) { const a = route[i - 1], b = route[i % route.length]; L.push(L[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])); }
  const total = L[L.length - 1];
  // head and tail lights (and a taxi's roof sign) glow: merged into the body geometry
  const im = dyn(o.lights ? litGeo(geo, o.lights) : geo, o.lights ? VEHICLE : VCT, n);
  for (let i = 0; i < n; i++) im.setColorAt(i, _c.set(o.colors?.[i % o.colors.length] ?? '#ffffff'));
  sc.add(im);
  const sp = o.speed ?? 3, s0 = o.scale ?? 1, off = (o.offset ?? 0) * total;
  const place = (t: number) => {
    for (let i = 0; i < n; i++) {
      let s = (off + (i / n) * total + t * sp) % total;
      if (s < 0) s += total;
      let k = 1;
      while (k < L.length - 1 && L[k] < s) k++;
      const a = route[k - 1], b = route[k % route.length], f = (s - L[k - 1]) / (L[k] - L[k - 1] || 1);
      _d.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
      _d.rotation.set(0, Math.atan2(b[0] - a[0], b[2] - a[2]), 0);
      _d.scale.setScalar(s0);
      _d.updateMatrix();
      im.setMatrixAt(i, _d.matrix);
    }
    im.instanceMatrix.needsUpdate = true;
  };
  place(0);
  addReactor(sc, { meshes: [im], tick: (_dt, t) => { if (o.glowOf) setVehicleGlow(o.glowOf()); place(t); } });
  return im;
}
