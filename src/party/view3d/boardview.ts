// The 3D board: spaces (instanced per type), path ribbons, star, dice blocks, junction arrows,
// the active ring, the Kumpel orb, coin and spark particles, trap flags and the figures, plus
// the camera (follow / junction / point / overview).
// Landmarks and gimmicks come from the board's decor (boards/<id>/view.ts).
// Performance: the shadow map covers the whole island and is BAKED: it is drawn once and again
// only when something that casts a shadow moved (a gimmick turning, the lift, falling crates).
// Things that move all the time (figures, star, dice, wheels, boats …) don't cast; the figures
// get soft blob shadows instead. The board renders at most 60 frames a second.

import type { BoardDef, BoardGraph, BNode, SpaceType } from '../boards/types';
import type { GameState } from '../engine/state';
import { BUDDIES, type BuddyId } from '../engine/tables';
import { SP } from '../spaces';
import type { Seat } from '../types';
import { E, TAU, clamp, lerp, rand, reduced, tween, wait } from '../util';
import { faceCam, hopFig, makeFigure, squashLand, updateFigure, type Fig } from './figures';
import {
  BOX, Batch, COIN_GEO, COIN_MAT, CONE, CYL8, FONT, GLOW, GRAD, OUT, SPH, SPH_LO, STAR_EX, STAR_GEO, THREE, VC, VC_EMI,
  addLights, ctex, fixShadow, toon, type Lights,
} from './kit';
import { quality } from './quality';
import { curbs, tickLife } from '../boards/details';
import { VH, VW, addLabel, clearLabels, removeLabel, type Label, type View } from './stage';

export const SPACE_Y = 0.54;

/** What a board's decor gets to build with. */
export interface BoardKit {
  scene: THREE.Scene;
  graph: BoardGraph;
  lights: Lights;
  /** True when (x, z) keeps rN from every space and rE from every path. */
  clearOfPath(x: number, z: number, rN: number, rE: number): boolean;
  /** Point the camera at a spot for a moment (gimmicks). */
  look(x: number, z: number): void;
  follow(): void;
}
export interface BoardDecor {
  update(dt: number, t: number): void;
  /** Set the gimmick meshes straight to the board state (no animation). */
  apply(bs: Record<string, unknown>): void;
  /** Animate a gimmick event (camera, sound, meshes). */
  play(name: string, data: Record<string, unknown> | undefined): Promise<void>;
  /** Where the camera looks in the overview, and how wide the island is. */
  overview: { x: number; z: number; w: number; d: number };
}

// ---------- space textures ----------
const texCache = new Map<string, THREE.Texture>();
function spaceTex(key: SpaceType) {
  const hit = texCache.get(key);
  if (hit) return hit;
  const t = SP[key], D = '#1a0b33';
  const tex = ctex(128, 128, (g) => {
    g.fillStyle = t.c;
    g.fillRect(0, 0, 128, 128);
    if (key === 'G') ['#ff3d9a', '#ffe14a', '#2fe6ff', '#b8f02a'].forEach((c, i) => { g.strokeStyle = c; g.lineWidth = 7; g.beginPath(); g.arc(64, 64, 58 - i * 7, 0, TAU); g.stroke(); });
    if (key === 'R') { g.strokeStyle = '#ff3d9a'; g.lineWidth = 6; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 22, 0); g.lineTo(i * 22 + 60, 128); g.stroke(); } }
    const gr = g.createRadialGradient(50, 46, 6, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 128, 128);
    // bevel: a dark outer lip and a bright inner ring
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(0,0,0,.22)';
    g.beginPath(); g.arc(64, 64, 61, 0, TAU); g.stroke();
    g.lineWidth = 5;
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.beginPath(); g.arc(64, 64, 53, 0, TAU); g.stroke();
    g.lineWidth = 1.5;
    g.strokeStyle = 'rgba(0,0,0,.25)';
    g.beginPath(); g.arc(64, 64, 50, 0, TAU); g.stroke();
    g.translate(64, 64);
    g.lineJoin = 'round';
    g.lineWidth = 6;
    g.strokeStyle = D;
    g.fillStyle = '#fff';
    const txt = (s: string, size: number, fill: string, stroke: string | null, dy = 4) => {
      g.font = `italic 900 ${size}px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (stroke) { g.lineWidth = 9; g.strokeStyle = stroke; g.strokeText(s, 0, dy); }
      g.fillStyle = fill; g.fillText(s, 0, dy);
    };
    const poly = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.stroke(); g.fill(); };
    const a = 12, b = 34;
    switch (t.icon) {
      case 'plus': poly([[-a, -b], [a, -b], [a, -a], [b, -a], [b, a], [a, a], [a, b], [-a, b], [-a, a], [-b, a], [-b, -a], [-a, -a]]); break;
      case 'minus': poly([[-b, -a], [b, -a], [b, a], [-b, a]]); break;
      case 'bang': txt('!', 96, D, null, 6); break;
      case 'q': txt('?', 90, '#fff', D, 6); break;
      case 'vs': txt('VS', 60, '#fff', D, 4); break;
      case 'start': txt('START', 34, D, null, 3); break;
      case 'bag':
        poly([[-28, -12], [28, -12], [33, 32], [-33, 32]]);
        g.beginPath(); g.lineWidth = 7; g.arc(0, -12, 14, Math.PI, 0); g.stroke();
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(0, 10, 10, 0, TAU); g.fill(); g.lineWidth = 4; g.stroke();
        break;
      case 'buddy':
        g.beginPath(); g.arc(0, 2, 32, 0, TAU); g.lineWidth = 6; g.stroke(); g.fill();
        g.fillStyle = D; g.beginPath(); g.ellipse(-11, -3, 5, 8, 0, 0, TAU); g.ellipse(11, -3, 5, 8, 0, 0, TAU); g.fill();
        g.lineWidth = 5; g.beginPath(); g.arc(0, 8, 11, 0.2, Math.PI - 0.2); g.stroke();
        break;
      case 'bande':
        g.lineWidth = 9; g.strokeStyle = D;
        g.beginPath(); g.arc(-12, 0, 18, 0, TAU); g.stroke(); g.beginPath(); g.arc(12, 0, 18, 0, TAU); g.stroke();
        g.lineWidth = 5; g.strokeStyle = '#fff';
        g.beginPath(); g.arc(-12, 0, 18, 0, TAU); g.stroke(); g.beginPath(); g.arc(12, 0, 18, 0, TAU); g.stroke();
        break;
      case 'rival':
        g.fillStyle = '#ff3d9a';
        poly([[6, -38], [-20, 6], [-2, 6], [-10, 38], [22, -8], [4, -8], [14, -38]]);
        break;
      case 'spin':
        g.lineWidth = 8; g.strokeStyle = D;
        g.beginPath(); g.arc(0, 0, 24, -2.6, 0.6); g.stroke();
        g.beginPath(); g.arc(0, 0, 24, 0.55, 3.7); g.stroke();
        g.fillStyle = D;
        poly([[24, 14], [34, -2], [12, 0]]);
        poly([[-24, -14], [-34, 2], [-12, 0]]);
        break;
    }
  }, false, 4);
  texCache.set(key, tex);
  return tex;
}

// ---------- dice ----------
const DCOL = ['#ff3d9a', '#2b9dff', '#ffd23f', '#3fdc7a', '#b46bff', '#ff8a2e'];
/** Number on each box face (+x, -x, +y, -y, +z, -z). */
const FACES = { w6: [3, 4, 5, 2, 1, 6], half: [3, 1, 2, 2, 1, 3] } as const;
const FACE_E: [number, number, number][] = [[0, -Math.PI / 2, 0], [0, Math.PI / 2, 0], [Math.PI / 2, 0, 0], [-Math.PI / 2, 0, 0], [0, 0, 0], [0, Math.PI, 0]];
const dieMatCache = new Map<string, THREE.Material[]>();
function dieMats(kind: 'w6' | 'half') {
  const hit = dieMatCache.get(kind);
  if (hit) return hit;
  const mats = FACES[kind].map((n, i) => new THREE.MeshToonMaterial({
    gradientMap: GRAD,
    map: ctex(128, 128, (g) => {
      g.fillStyle = DCOL[i]; g.fillRect(0, 0, 128, 128);
      g.fillStyle = 'rgba(255,255,255,.18)';
      for (let k = -4; k < 8; k++) { g.beginPath(); g.moveTo(k * 26, 0); g.lineTo(k * 26 + 12, 0); g.lineTo(k * 26 + 140, 128); g.lineTo(k * 26 + 128, 128); g.fill(); }
      g.strokeStyle = '#ffffff'; g.lineWidth = 8; g.strokeRect(10, 10, 108, 108);
      g.font = `italic 900 84px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 10; g.strokeStyle = '#1a0b33'; g.strokeText(String(n), 64, 70); g.fillStyle = '#ffffff'; g.fillText(String(n), 64, 70);
    }),
  }));
  dieMatCache.set(kind, mats);
  return mats;
}

interface Die { grp: THREE.Group; cube: THREE.Group; mesh: THREE.Mesh; spin: boolean; bump: number; off: number; owner: number }

// ---------- buddy orbs ----------
function buddyGeo(kind: BuddyId) {
  const b = new Batch(), D = '#1a0b33', c = BUDDIES[kind].color;
  if (kind === 'lumi') { b.add(SPH, c, 0, 0, 0, 0, 0, 0, 0.34); for (const s of [-1, 1]) b.add(SPH, '#ffd0f0', s * 0.38, 0.08, -0.05, 0, 0, s * 0.6, 0.22, 0.08, 0.14); }
  else if (kind === 'pips') { b.add(SPH, c, 0, 0, 0, 0, 0, 0, 0.36, 0.3, 0.36); b.add(SPH, '#ffffff', -0.12, 0.14, 0.2, 0, 0, 0, 0.08); }
  else if (kind === 'klecks') { b.add(SPH, c, 0, -0.05, 0, 0, 0, 0, 0.34); b.add(CONE, c, 0, 0.32, 0, 0, 0, 0, 0.2, 0.36, 0.2); }
  else if (kind === 'bolle') { for (const [x, y, r] of [[-0.25, 0, 0.26], [0.25, 0, 0.26], [0, 0.12, 0.32]] as const) b.add(SPH, c, x, y, 0, 0, 0, 0, r); }
  else if (kind === 'funz') { b.add(SPH, c, 0, 0, 0, 0, 0, 0, 0.3); b.add(CYL8, D, 0, 0.36, 0, 0, 0, 0, 0.16, 0.26, 0.16); b.add(CYL8, D, 0, 0.24, 0, 0, 0, 0, 0.26, 0.04, 0.26); }
  else { b.add(SPH, c, 0, 0, 0, 0, 0, 0, 0.36); for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; b.add(SPH_LO, '#ffd0f0', Math.cos(a) * 0.34, Math.sin(a) * 0.34, 0, 0, 0, 0, 0.1); } }
  for (const s of [-1, 1]) b.add(SPH, D, s * 0.11, 0.05, 0.29, 0, 0, 0, 0.05, 0.08, 0.03);
  return b.geometry();
}

const RIM_GEO = new THREE.TorusGeometry(1.1, 0.075, 3, 32);
const WHITE = new THREE.Color('#ffffff');
let blobT: THREE.Texture | null = null;
function blobTex() {
  return (blobT ??= ctex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.55, 'rgba(255,255,255,.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }, false, 1));
}

const CL: [number, number][] = [[-0.75, -0.55], [0.75, -0.55], [-0.75, 0.6], [0.75, 0.6]];
const _t1 = new THREE.Vector3(), _t2 = new THREE.Vector3(), _v = new THREE.Vector3();

export class BoardView implements View {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(40, 1, 0.5, 600);
  lights: Lights;
  decor: BoardDecor;
  g: BoardGraph;
  figs: Fig[] = [];
  seats: Seat[] = [];
  /** Live positions per player (node id), mirrored from the state. */
  nodeOf: number[] = [];
  turn = 0;
  mode: 'board' | 'hidden' = 'board';
  view = { mode: 'follow' as 'follow' | 'point' | 'overview', user: false, pt: new THREE.Vector3(), tgt: new THREE.Vector3(), pos: new THREE.Vector3(0, 90, 60), wide: 1 };
  private star = new THREE.Group();
  private starSpin = new THREE.Group();
  private halo: THREE.Mesh;
  private dice: Die[] = [];
  arrows: { g: THREE.Group; inner: THREE.Group; m: THREE.Mesh; to: number; blocked: boolean; hover: boolean }[] = [];
  private ring: THREE.Mesh;
  private buddy: THREE.Mesh;
  private buddyKind: BuddyId | null = null;
  buddyOwner: number | null = null;
  buddyAt: number | null = null;
  private parts: { m: THREE.Mesh; life: number; v: THREE.Vector3; home: THREE.Vector3 | null }[] = [];
  private sparks: { m: THREE.Mesh; life: number; v: THREE.Vector3 }[] = [];
  private flags: { m: THREE.Group; node: number }[] = [];
  private counter: Label | null = null;
  private routeLabels: Label[] = [];
  private dummy = new THREE.Object3D();
  /** Soft round shadows under the figures (one instanced mesh). */
  private blobs: THREE.InstancedMesh;
  /** Shadow casters and their last world matrix: the baked shadow map is redrawn when one moves. */
  private casters: { o: THREE.Object3D; m: Float64Array; vis: boolean; ver: number }[] = [];
  private shadowEpoch = -1;
  fpsCap = 60;

  constructor(public board: BoardDef) {
    this.g = board.graph;
    const sc = this.scene;
    this.lights = addLights(sc, 40, 4096);
    const nodes = this.g.nodes, edges = this.g.edges;
    const segDist = (px: number, pz: number, A: BNode, B: BNode) => {
      const dx = B.x - A.x, dz = B.z - A.z, l2 = dx * dx + dz * dz;
      const t = clamp(((px - A.x) * dx + (pz - A.z) * dz) / (l2 || 1), 0, 1);
      return Math.hypot(px - (A.x + dx * t), pz - (A.z + dz * t));
    };
    const kit: BoardKit = {
      scene: sc, graph: this.g, lights: this.lights,
      clearOfPath: (x, z, rN, rE) => nodes.every((n) => Math.hypot(n.x - x, n.z - z) > rN) && edges.every((e) => segDist(x, z, nodes[e.a], nodes[e.b]) > rE),
      look: (x, z) => { this.view.mode = 'point'; this.view.pt.set(x, 0, z); },
      follow: () => { this.view.mode = 'follow'; },
    };
    this.decor = board.decor(kit);
    {
      const ov = this.decor.overview;
      fixShadow(this.lights, ov.x, ov.z, Math.hypot(ov.w, ov.d) * 0.5 + 9);
    }

    // spaces: one instanced mesh per type (+ one for the dark bases)
    const dummy = this.dummy;
    const BASE_GEO = new THREE.CylinderGeometry(1.26, 1.36, 0.3, 40);
    const TOP_GEO = new THREE.CylinderGeometry(1.08, 1.08, 0.3, 40);
    const base = new THREE.InstancedMesh(BASE_GEO, toon('#2a1258'), nodes.length);
    nodes.forEach((n, i) => { dummy.position.set(n.x, 0.15, n.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); base.setMatrixAt(i, dummy.matrix); });
    base.receiveShadow = true;
    base.castShadow = true;
    sc.add(base);
    for (const key of Object.keys(SP) as SpaceType[]) {
      const list = nodes.filter((n) => n.type === key);
      if (!list.length) continue;
      const sideM = toon(SP[key].d), topM = new THREE.MeshToonMaterial({ map: spaceTex(key), gradientMap: GRAD });
      const im = new THREE.InstancedMesh(TOP_GEO, [sideM, topM, sideM], list.length);
      list.forEach((n, i) => { dummy.position.set(n.x, 0.39, n.z); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix); });
      im.receiveShadow = true;
      sc.add(im);
    }
    // bevel rims: a rounded lip around every space (one instanced mesh, tinted per type)
    const rim = new THREE.InstancedMesh(RIM_GEO, toon('#ffffff'), nodes.length);
    const _col = new THREE.Color();
    nodes.forEach((n, i) => {
      dummy.position.set(n.x, 0.535, n.z); dummy.rotation.set(-Math.PI / 2, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix(); rim.setMatrixAt(i, dummy.matrix);
      rim.setColorAt(i, _col.set(SP[n.type].d).lerp(WHITE, 0.25));
    });
    rim.receiveShadow = true;
    sc.add(rim);
    // path ribbons (bridges are drawn by the decor)
    const roadEdges = edges.filter((e) => !e.flag);
    const road = new THREE.InstancedMesh(BOX, toon('#fff1d6'), roadEdges.length);
    const roadB = new THREE.InstancedMesh(BOX, toon('#8e6be0'), roadEdges.length);
    const dots = new THREE.InstancedMesh(CYL8, toon('#ffffff'), roadEdges.length);
    roadEdges.forEach((e, i) => {
      const A = nodes[e.a], B = nodes[e.b], L = Math.hypot(B.x - A.x, B.z - A.z), yaw = Math.atan2(B.x - A.x, B.z - A.z);
      dummy.position.set((A.x + B.x) / 2, 0.05, (A.z + B.z) / 2); dummy.rotation.set(0, yaw, 0); dummy.scale.set(1.15, 0.1, L); dummy.updateMatrix(); road.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.02; dummy.scale.set(1.55, 0.06, L + 0.3); dummy.updateMatrix(); roadB.setMatrixAt(i, dummy.matrix);
      dummy.position.y = 0.12; dummy.scale.set(0.2, 0.06, 0.2); dummy.updateMatrix(); dots.setMatrixAt(i, dummy.matrix);
    });
    road.receiveShadow = roadB.receiveShadow = true;
    sc.add(road, roadB, dots);
    if (roadEdges.length) curbs(sc, nodes, roadEdges, 0.95, ['#ffffff', '#ff7ad0', '#ffffff', '#35d4ff']);

    // star
    const starMesh = new THREE.Mesh(STAR_GEO, VC_EMI);
    starMesh.scale.setScalar(1.15);
    starMesh.castShadow = false;
    const starOut = new THREE.Mesh(STAR_EX, OUT);
    starOut.scale.setScalar(1.15 * 1.08);
    this.starSpin.add(starMesh, starOut);
    this.starSpin.position.y = 2.7;
    this.star.add(this.starSpin);
    this.halo = new THREE.Mesh(new THREE.CircleGeometry(1.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffe14a', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.halo.position.y = SPACE_Y + 0.03;
    this.star.add(this.halo);
    sc.add(this.star);

    // dice (up to three)
    const dieGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2), dieOut = new THREE.BoxGeometry(1.32, 1.32, 1.32);
    for (let i = 0; i < 3; i++) {
      const grp = new THREE.Group(), cube = new THREE.Group();
      const m = new THREE.Mesh(dieGeo, dieMats('w6'));
      cube.add(m, new THREE.Mesh(dieOut, OUT));
      grp.add(cube);
      grp.visible = false;
      sc.add(grp);
      this.dice.push({ grp, cube, mesh: m, spin: true, bump: 0, off: 0, owner: 0 });
    }
    // junction arrows
    const ash = new THREE.Shape();
    ([[0, 1.1], [0.95, 0.05], [0.42, 0.05], [0.42, -0.9], [-0.42, -0.9], [-0.42, 0.05], [-0.95, 0.05]] as const).forEach(([x, y], i) => (i ? ash.lineTo(x, y) : ash.moveTo(x, y)));
    ash.closePath();
    const AGEO = new THREE.ExtrudeGeometry(ash, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 1 }).rotateX(-Math.PI / 2);
    const AOUT = AGEO.clone().scale(1.12, 1.3, 1.12);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group(), inner = new THREE.Group();
      const m = new THREE.Mesh(AGEO, toon('#dcff1f'));
      inner.add(m, new THREE.Mesh(AOUT, OUT));
      g.add(inner);
      g.visible = false;
      sc.add(g);
      this.arrows.push({ g, inner, m, to: -1, blocked: false, hover: false });
    }
    // active ring
    this.ring = new THREE.Mesh(new THREE.RingGeometry(1.15, 1.45, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.9, depthWrite: false }));
    this.ring.position.y = SPACE_Y + 0.04;
    sc.add(this.ring);
    // buddy
    this.buddy = new THREE.Mesh(buddyGeo('lumi'), GLOW);
    this.buddy.visible = false;
    sc.add(this.buddy);
    // particles
    for (let k = 0; k < 18; k++) { const m = new THREE.Mesh(COIN_GEO, COIN_MAT); m.visible = false; sc.add(m); this.parts.push({ m, life: 0, v: new THREE.Vector3(), home: null }); }
    for (let k = 0; k < 12; k++) { const m = new THREE.Mesh(STAR_GEO, VC_EMI); m.visible = false; sc.add(m); this.sparks.push({ m, life: 0, v: new THREE.Vector3() }); }
    // trap flags
    const fb = new Batch();
    fb.add(CYL8, '#2a1258', 0, 0.9, 0, 0, 0, 0, 0.05, 1.8, 0.05);
    fb.addM(new THREE.BoxGeometry(0.9, 0.55, 0.04), '#ff8a2e', new THREE.Matrix4().makeTranslation(0.45, 1.5, 0));
    const fgeo = fb.geometry();
    // blob shadows under the figures
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex(), transparent: true, depthWrite: false, color: '#1a0b33', opacity: 0.55 }), 4);
    this.blobs.count = 0;
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    this.blobs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    sc.add(this.blobs);
    for (let k = 0; k < 4; k++) { const grp = new THREE.Group(); const m = new THREE.Mesh(fgeo, VC); grp.add(m); grp.visible = false; sc.add(grp); this.flags.push({ m: grp, node: -1 }); }
  }

  /** Builds the figures for the seats. */
  setSeats(seats: Seat[]) {
    for (const f of this.figs) this.scene.remove(f.root);
    this.seats = seats;
    this.figs = seats.map((s) => { const f = makeFigure({ color: s.color, acc: s.acc, feat: s.feat }, 0.9); f.root.traverse((o) => { o.castShadow = false; }); this.scene.add(f.root); return f; });
    this.blobs.count = this.figs.length;
  }

  /** Puts everything where the state says, without animation (start, resume, a friend joining). */
  apply(st: GameState) {
    this.nodeOf = st.players.map((p) => p.node);
    this.figs.forEach((f, i) => { if (!f.busy) { f.root.position.copy(this.nodePos(this.nodeOf[i], i)); f.hop.position.y = 0; } });
    this.placeStar(st.star);
    this.starSpin.scale.setScalar(1);
    this.halo.visible = true;
    this.setBuddy(st.buddy?.kind ?? null, st.buddy?.owner ?? null, st.buddy?.at ?? null);
    this.setTraps(st.traps);
    this.turn = st.turn < st.players.length ? st.turn : 0;
    this.decor.apply(st.bs);
  }

  placeStar(node: number) { const n = this.g.nodes[node]; this.star.position.set(n.x, 0, n.z); this.starSpin.position.set(0, 2.7, 0); }

  setBuddy(kind: BuddyId | null, owner: number | null, at: number | null) {
    if (kind && kind !== this.buddyKind) { this.buddy.geometry = buddyGeo(kind); }
    this.buddyKind = kind;
    this.buddyOwner = owner;
    this.buddyAt = at;
  }

  setTraps(traps: Record<number, number>) {
    const list = Object.keys(traps).map(Number);
    this.flags.forEach((f, i) => {
      const node = list[i];
      f.node = node ?? -1;
      f.m.visible = node !== undefined;
      if (node !== undefined) { const n = this.g.nodes[node]; f.m.position.set(n.x + 0.9, SPACE_Y, n.z - 0.6); }
    });
  }

  nodePos(id: number, p?: number) {
    const n = this.g.nodes[id];
    const v = new THREE.Vector3(n.x, SPACE_Y, n.z);
    if (p !== undefined) {
      const here = this.nodeOf.map((x, i) => (x === id ? i : -1)).filter((i) => i >= 0);
      if (here.length > 1) { const k = here.indexOf(p); if (k >= 0) { v.x += CL[k % 4][0]; v.z += CL[k % 4][1]; } }
    }
    return v;
  }

  regroup(except = -1) {
    this.figs.forEach((f, i) => { if (i === except) return; void hopFig(f, this.nodePos(this.nodeOf[i], i), 0.2, 0.3); });
  }

  faceCam(p: number) { faceCam(this.figs[p], this.cam); }

  // ---------- movement ----------
  async hop(p: number, from: number, to: number, stepIdx: number) {
    const f = this.figs[p], A = this.g.nodes[from], B = this.g.nodes[to];
    const others = this.nodeOf.map((x, i) => (x === from && i !== p ? i : -1)).filter((i) => i >= 0);
    this.nodeOf[p] = to;
    const dist = Math.hypot(B.x - A.x, B.z - A.z), sub = Math.max(1, Math.round(dist / 3.3));
    for (let s = 1; s <= sub; s++) {
      const target = s === sub ? this.nodePos(to, p) : new THREE.Vector3(lerp(A.x, B.x, s / sub), 0.62, lerp(A.z, B.z, s / sub));
      await hopFig(f, target, 0.27, s === sub ? 0.95 : 0.7);
    }
    for (const q of others) void hopFig(this.figs[q], this.nodePos(this.nodeOf[q], q), 0.2, 0.3);
    void stepIdx;
  }

  teleport(p: number, node: number) { this.nodeOf[p] = node; }

  showCounter(p: number, n: number) {
    if (!this.counter) {
      const f = this.figs[p];
      this.counter = addLabel('cnt', '', (v) => v.copy(f.root.position).setY(f.root.position.y + f.hop.position.y + 2.75), this.scene);
    }
    this.counter.inner.style.setProperty('--pc', this.seats[p].color);
    this.counter.inner.textContent = String(n);
  }
  hideCounter() { removeLabel(this.counter); this.counter = null; }

  // ---------- dice ----------
  diceShow(p: number, count: number, kind: 'w6' | 'half' = 'w6') {
    this.dice.forEach((d, i) => {
      d.owner = p;
      d.grp.visible = i < count;
      d.mesh.material = dieMats(kind);
      d.spin = true;
      d.bump = 0;
      d.grp.scale.setScalar(1);
      d.off = count === 1 ? 0 : (i - (count - 1) / 2) * 1.6;
      d.cube.rotation.set(Math.random() * 6, Math.random() * 6, 0);
    });
  }
  diceHide() { for (const d of this.dice) d.grp.visible = false; }

  /** The figure jumps and hits the blocks; they show `nums` and burst. */
  async diceHit(p: number, nums: number[], kind: 'w6' | 'half' | 'joker') {
    const f = this.figs[p], count = nums.length;
    const faces = kind === 'half' ? FACES.half : FACES.w6;
    this.diceShow(p, count, kind === 'half' ? 'half' : 'w6');
    this.faceCam(p);
    await wait(reduced ? 50 : 220);
    f.busy = true;
    f.tok++;
    await tween(0.08, (k) => f.sq.scale.set(1 + 0.2 * k, 1 - 0.24 * k, 1 + 0.2 * k));
    await tween(0.2, (k) => { f.hop.position.y = 1.25 * k; f.sq.scale.set(1 - 0.12 * k, 1 + 0.2 * k, 1 - 0.12 * k); }, E.out);
    this.dice.slice(0, count).forEach((d, i) => {
      d.spin = false;
      const q0 = d.cube.quaternion.clone();
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(...FACE_E[Math.max(0, (faces as readonly number[]).indexOf(nums[i]))]));
      void tween(0.16, (k) => { d.cube.quaternion.slerpQuaternions(q0, q1, k); });
      void tween(0.35, (k) => { d.bump = Math.sin(k * Math.PI) * 0.7; });
    });
    await tween(0.22, (k) => { f.hop.position.y = 1.25 * (1 - k * k); f.sq.scale.set(1 - 0.12 * (1 - k), 1 + 0.2 * (1 - k), 1 - 0.12 * (1 - k)); });
    f.hop.position.y = 0;
    void squashLand(f, 0.25);
    await wait(320);
    this.dice.slice(0, count).forEach((d) => {
      void tween(0.25, (k) => d.grp.scale.setScalar(k < 0.4 ? 1 + k * 0.8 : 1.32 * (1 - (k - 0.4) / 0.6))).then(() => { d.grp.visible = false; });
      this.sparkBurst(d.grp.position, 6);
    });
  }

  // ---------- star ----------
  async starFly(p: number) {
    const f = this.figs[p];
    const from = this.star.position.clone(), to = f.root.position.clone().setY(f.root.position.y + 1.4);
    this.halo.visible = false;
    await tween(0.6, (k) => {
      this.starSpin.position.set(lerp(0, to.x - from.x, k), lerp(2.7, to.y, k) + Math.sin(k * Math.PI) * 2.5, lerp(0, to.z - from.z, k));
      this.starSpin.scale.setScalar(1 - k * 0.6);
    }, E.inOut);
    this.sparkBurst(to, 12);
    void squashLand(f, 0.3);
    this.starSpin.position.set(0, 2.7, 0);
    this.starSpin.scale.setScalar(1);
    this.halo.visible = true;
  }
  async starMove(node: number) {
    this.starSpin.scale.setScalar(0);
    this.halo.visible = false;
    this.placeStar(node);
    const n = this.g.nodes[node];
    this.view.mode = 'point';
    this.view.pt.set(n.x, 0, n.z);
    await wait(700);
    this.halo.visible = true;
    await tween(0.5, (k) => this.starSpin.scale.setScalar(k), E.back);
    await wait(500);
    this.view.mode = 'follow';
  }

  // ---------- particles ----------
  coinBurst(p: number, n: number) {
    const f = this.figs[p], base = f.root.position, gain = n > 0;
    let used = 0;
    for (const q of this.parts) {
      if (q.life > 0 || used >= Math.min(Math.abs(n), 10)) continue;
      used++;
      q.m.visible = true;
      q.life = gain ? 0.95 : 1.1;
      const a = Math.random() * TAU;
      if (gain) { q.m.position.set(base.x + Math.cos(a) * 0.8, base.y + 2.4 + Math.random(), base.z + Math.sin(a) * 0.8); q.v.set(Math.cos(a) * 1.5, 6 + Math.random() * 3, Math.sin(a) * 1.5); q.home = (q.home ?? new THREE.Vector3()).set(base.x, base.y + 1, base.z); }
      else { q.m.position.set(base.x, base.y + 1.2, base.z); q.v.set(Math.cos(a) * 4, 6 + Math.random() * 2, Math.sin(a) * 4); q.home = null; }
    }
  }
  sparkBurst(pos: THREE.Vector3, n = 12) {
    let used = 0;
    for (const q of this.sparks) {
      if (q.life > 0 || used >= n) continue;
      const a = (used / n) * TAU;
      used++;
      q.m.visible = true;
      q.life = 0.9;
      q.m.position.copy(pos);
      q.v.set(Math.cos(a) * 9, rand(-2, 6), Math.sin(a) * 9);
    }
  }

  // ---------- junction arrows ----------
  showArrows(node: number, opts: { to: number; name: string; len: number; blocked: string | null; key: boolean }[]) {
    const n = this.g.nodes[node];
    this.view.wide = 1.35;
    opts.forEach((o, i) => {
      const a = this.arrows[i], m = this.g.nodes[o.to];
      const dx = m.x - n.x, dz = m.z - n.z, l = Math.hypot(dx, dz);
      const off = !!o.blocked && !o.key;
      a.g.visible = true;
      a.g.position.set(n.x + (dx / l) * 2, 0.9, n.z + (dz / l) * 2);
      a.g.rotation.y = Math.atan2(-dx, -dz);
      a.m.material = toon(off ? '#7d6aa8' : '#dcff1f');
      a.to = o.to;
      a.blocked = off;
      a.hover = false;
      const lp = new THREE.Vector3(n.x + (dx / l) * 3.4, 1.6, n.z + (dz / l) * 3.4);
      this.routeLabels.push(addLabel('route3' + (off ? ' off' : ''), `${o.name}${off ? ' · gesperrt' : o.blocked ? ' · Schlüssel' : ` · ${o.len} Felder`}`, (v) => v.copy(lp), this.scene));
    });
  }
  hoverArrow(to: number) { for (const a of this.arrows) a.hover = a.g.visible && a.to === to; }
  hideArrows() {
    for (const a of this.arrows) { a.g.visible = false; a.to = -1; }
    this.routeLabels.forEach(removeLabel);
    this.routeLabels = [];
    this.view.wide = 1;
  }
  /** Screen x (-1..1) of each visible arrow, to order the buttons left to right. */
  arrowScreenX(to: number) {
    const a = this.arrows.find((x) => x.to === to);
    if (!a) return 0;
    return _v.copy(a.g.position).project(this.cam).x;
  }
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  pickArrow(clientX: number, clientY: number, rect: DOMRect): number | null {
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.cam);
    for (const a of this.arrows) {
      if (!a.g.visible || a.blocked) continue;
      if (this.ray.intersectObject(a.g, true).length) return a.to;
    }
    return null;
  }

  // ---------- baked shadows ----------
  /** True when the baked shadow map must be drawn again this frame. */
  shadowNeeded() {
    if (!this.casters.length) {
      this.scene.updateMatrixWorld();
      this.scene.traverse((o) => { if (o.castShadow) this.casters.push({ o, m: new Float64Array(o.matrixWorld.elements), vis: false, ver: -1 }); });
    }
    let dirty = this.shadowEpoch !== quality.shadowEpoch;
    this.shadowEpoch = quality.shadowEpoch;
    this.scene.updateMatrixWorld();
    for (const c of this.casters) {
      const o = c.o, e = o.matrixWorld.elements;
      let vis = o.visible;
      for (let p = o.parent; vis && p; p = p.parent) vis = p.visible;
      const ver = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).instanceMatrix.version : 0;
      if (vis !== c.vis || ver !== c.ver) { c.vis = vis; c.ver = ver; dirty = true; }
      if (!vis) continue;
      for (let i = 0; i < 16; i++) if (e[i] !== c.m[i]) { c.m.set(e); dirty = true; break; }
    }
    return dirty;
  }

  /** Materials that only appear later (other dice, blocked arrows): compiled with the scene. */
  warm() {
    const g = new THREE.BoxGeometry(0.01, 0.01, 0.01);
    return [new THREE.Mesh(g, dieMats('half')), new THREE.Mesh(g, dieMats('w6')), new THREE.Mesh(g, toon('#7d6aa8')), new THREE.Mesh(g, toon('#dcff1f'))].map((m) => { m.position.y = -50; return m; });
  }

  // ---------- frame ----------
  update(dt: number, t: number) {
    this.decor.update(dt, t);
    tickLife(this.scene, dt, t);
    this.starSpin.rotation.y = t * 1.6;
    if (this.halo.visible) { this.starSpin.position.y = 2.7 + Math.sin(t * 2.4) * 0.22; (this.halo.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(t * 3) * 0.15; }
    for (const f of this.figs) updateFigure(f, dt, t);
    const f = this.figs[this.turn];
    if (f) {
      this.ring.position.set(f.root.position.x, f.root.position.y + 0.04, f.root.position.z);
      (this.ring.material as THREE.MeshBasicMaterial).color.set(this.seats[this.turn].color);
      const rs = 1 + Math.sin(t * 5) * 0.06;
      this.ring.scale.set(rs, 1, rs);
    }
    for (const d of this.dice) {
      if (!d.grp.visible) continue;
      const fo = this.figs[d.owner];
      d.grp.position.set(fo.root.position.x + d.off, fo.root.position.y + 3.25 + Math.sin(t * 3) * 0.1 + d.bump, fo.root.position.z);
      d.grp.rotation.y = Math.atan2(this.cam.position.x - d.grp.position.x, this.cam.position.z - d.grp.position.z);
      if (d.spin) { d.cube.rotation.x += dt * 7.5; d.cube.rotation.y += dt * 9.5; }
    }
    for (const a of this.arrows) if (a.g.visible) { a.inner.position.z = -(0.15 + Math.sin(t * 6) * 0.15); a.inner.scale.setScalar(a.hover ? 1.18 : 1); }
    // buddy: circles its owner, or hovers over its Kumpel field
    const B = this.buddy;
    B.visible = this.buddyKind !== null && (this.buddyOwner !== null || this.buddyAt !== null);
    if (B.visible) {
      if (this.buddyOwner !== null && this.figs[this.buddyOwner]) {
        const fo = this.figs[this.buddyOwner].root.position;
        B.position.set(fo.x + Math.cos(t * 2.2), fo.y + 2.1 + Math.sin(t * 4.4) * 0.15, fo.z + Math.sin(t * 2.2));
      } else if (this.buddyAt !== null) {
        const n = this.g.nodes[this.buddyAt];
        B.position.set(n.x, 2.2 + Math.sin(t * 3) * 0.3, n.z);
      }
      B.rotation.y = t * 2;
    }
    for (const fl of this.flags) if (fl.m.visible) fl.m.rotation.y = Math.sin(t * 2 + fl.node) * 0.3;
    for (const q of this.parts) if (q.life > 0) {
      q.life -= dt;
      q.v.y -= 16 * dt;
      q.m.position.addScaledVector(q.v, dt);
      q.m.rotation.y += dt * 12;
      if (q.home && q.life < 0.35) q.m.position.lerp(q.home, 1 - Math.exp(-dt * 14));
      q.m.scale.setScalar(q.life < 0.2 ? Math.max(0, q.life / 0.2) : 1);
      if (q.life <= 0) q.m.visible = false;
    }
    for (const q of this.sparks) if (q.life > 0) {
      q.life -= dt;
      q.m.position.addScaledVector(q.v, dt);
      q.v.multiplyScalar(0.94);
      q.m.rotation.z += dt * 6;
      q.m.scale.setScalar(0.35 * Math.min(1, q.life * 2));
      if (q.life <= 0) q.m.visible = false;
    }
    // blob shadows follow the figures (smaller and lighter while hopping)
    this.figs.forEach((fg, i) => {
      const p = fg.root.position, h = fg.hop.position.y;
      let gy = 0.13;
      for (const n of this.g.nodes) if (Math.abs(n.x - p.x) < 1.25 && Math.abs(n.z - p.z) < 1.25) { gy = SPACE_Y + 0.02; break; }
      const s = (1.55 - Math.min(0.7, h * 0.35)) * (fg.root.visible ? 1 : 0);
      this.dummy.position.set(p.x, gy, p.z); this.dummy.rotation.set(0, 0, 0); this.dummy.scale.set(s, 1, s); this.dummy.updateMatrix();
      this.blobs.setMatrixAt(i, this.dummy.matrix);
    });
    this.blobs.instanceMatrix.needsUpdate = true;
    this.camera(dt, f);
  }

  private camera(dt: number, f: Fig | undefined) {
    const V = this.view, aspect = VW / VH, ov = this.decor.overview;
    let dist: number, elev = 0.9, az = -0.16;
    if (V.user || V.mode === 'overview' || !f) {
      _t1.set(ov.x, 0, ov.z);
      dist = clamp(Math.max((ov.w * 0.56) / (0.364 * aspect), (ov.d * 0.6) / 0.364), 62, 170);
      elev = 1.0;
      az = 0;
    } else if (V.mode === 'point') {
      _t1.copy(V.pt);
      dist = 30 * (aspect < 1 ? 1.5 : 1);
    } else {
      _t1.copy(f.root.position);
      _t1.y = 0;
      elev = 0.98;
      dist = 25 * V.wide * (aspect < 1 ? 1 + (1 - aspect) * 0.9 : 1);
    }
    _t2.set(Math.sin(az) * Math.cos(elev) * dist, Math.sin(elev) * dist, Math.cos(az) * Math.cos(elev) * dist).add(_t1);
    const k = reduced ? 1 : 1 - Math.exp(-dt * (V.mode === 'follow' && !V.user ? 3.4 : 2.4));
    V.tgt.lerp(_t1, k);
    V.pos.lerp(_t2, k);
    this.cam.position.copy(V.pos);
    this.cam.lookAt(V.tgt);
  }

  dispose() {
    clearLabels(this.scene);
    this.hideCounter();
  }
}

export { squashLand, faceCam };
