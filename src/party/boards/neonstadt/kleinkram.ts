// Neonstadt close up: the small things that make the city look lived in.
// - Houses: gutters and downpipes, gable roofs with tiles on the low houses, shop signs that
//   light up at dusk, posters and graffiti on the walls, washing lines between neighbours,
//   rooftop gardens with fairy lights.
// - Street life: a promenade road along the south shore with taxis, cars and a bus that come
//   out of one tunnel and drive into the other, a sidewalk with a bus stop, traffic lights at
//   two crossings, hydrants and letterboxes.
// - Places: a snack stand with steam, a newspaper kiosk at every shop, an arcade with machines in
//   front, the harbour with a wooden pier, crates, nets, buoys and gulls on the bollards.
// Static parts go into the board's merged batches or into instanced/atlas meshes; the moving
// parts (vehicles, buoys, gulls, traffic lights) are leben.ts reactors that sleep with the
// effects step of the quality governor.

import type { BoardKit } from '../../view3d/boardview';
import { BOX, Batch, CONE, CYL, CYL8, GRAD, THREE, toon } from '../../view3d/kit';
import type { AirArea } from '../../view3d/fx3d';
import { TAU, pickR, rand } from '../../util';
import { BULB, LEAF, type P2 } from '../bauteile';
import { PROPS, instanced, type Item } from '../details';
import { WIRE, addColored, atlasQuads, atlasTex, bake, bulbMat, decalMat, fairyString, freeYaw, litMat, posterCell, roofTex, signCell, tagCell, washingLine, type Quad } from '../feinkram';
import { GEO, addReactor, convoy, flatBatch, nearOnly } from '../leben';

export interface Bld { x: number; z: number; w: number; d: number; h: number; gable?: boolean; roof?: string; garden?: boolean }
export interface NeonCtx {
  kit: BoardKit;
  /** The board's static batch (lit, casts into the baked shadow map) and its glow batch. */
  st: Batch;
  gl: Batch;
  air: AirArea[];
  blds: Bld[];
  /** Free spot (not water, not a building, not a path/space or landmark) — and reserves it. */
  claim(x: number, z: number, r: number, rN?: number, rE?: number): boolean;
  inIsland(x: number, z: number, m: number): boolean;
}

/** The promenade road along the south shore (z) and how far it runs (|x| < ROAD_X). */
export const ROAD = { z0: 19.95, z1: 22.6, lane: 21.9, walk: 20.55, x: 29.4 };
export const onStreet = (x: number, z: number, m = 0) => Math.abs(x) < ROAD.x + 1.2 + m && z > ROAD.z0 - m;

const _d = new THREE.Object3D();
const _c = new THREE.Color();

export function neonKleinkram(c: NeonCtx) {
  const { kit, st, blds } = c, sc = kit.scene, atmo = kit.atmo, nodes = kit.graph.nodes;

  // ---------------------------------------------------------------- atlases
  const SIGNS = ['CAFÉ', 'PIZZA', 'BÄCKER', 'BAR', 'HOTEL', 'KINO', 'KIOSK', 'SNACKS', 'BÜCHER', 'FRISEUR', 'EIS', 'BUS'];
  const SIGNC = ['#ffe680', '#ff7ad0', '#ffb84a', '#8ff3ff', '#c8a8ff', '#ff5f6e', '#7dff8a', '#ffd23f', '#9fe3ff', '#ff9ad0', '#b8f02a', '#ffffff'];
  const signCells = SIGNS.map((s, i) => signCell(s, SIGNC[i], SIGNC[(i + 3) % SIGNC.length]));
  // arcade: the wide marquee (two cells) and three screens
  const screen = (bg: string, fg: string, kind: number) => (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = fg;
    if (kind === 0) { for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) g.fillRect(14 + i * 17, 8 + j * 10, 9, 6); g.fillRect(56, 50, 14, 6); }
    else if (kind === 1) { g.beginPath(); g.arc(40, 32, 14, 0.5, TAU - 0.5); g.lineTo(40, 32); g.fill(); for (let i = 0; i < 4; i++) { g.beginPath(); g.arc(70 + i * 14, 32, 3, 0, TAU); g.fill(); } }
    else { g.fillRect(10, 44, 108, 6); g.fillRect(30, 30, 12, 14); g.fillRect(80, 22, 16, 22); g.fillStyle = '#ffffff'; g.fillRect(56, 12, 6, 6); }
    g.fillStyle = 'rgba(255,255,255,.12)'; for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  };
  const cells = [...signCells, signCell('ARCADE', '#8ff3ff', '#ff4fb0'), screen('#1a0b4a', '#7dff8a', 0), screen('#0b1a4a', '#ffe14a', 1), screen('#2a0b3a', '#ff7ad0', 2)];
  const SIGN_TEX = atlasTex(cells, 4, 4, 128, 64);
  const signQ: Quad[] = [];
  const S_ARC = 12, S_SCREEN = 13;
  // posters (rows 0–1, one cell each) and graffiti tags (rows 2–5, two cells wide) share one atlas
  const tagDraw = ['NEON', 'WOW!', 'YO', 'KIKI', 'LOL', 'BOOM', 'PARTY', 'ZACK'].map((s, i) => tagCell(s, ['#ff4fb0', '#35e6ff', '#ffd23f', '#b8f02a', '#b46bff', '#ff9a5c', '#7dff8a', '#ff5f6e'][i], ['#ffffff', '#1a0b4a', '#ff4fb0', '#5b2bd6', '#ffd23f', '#1a0b4a', '#ff4fb0', '#ffffff'][i]));
  const half = (draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, right: boolean) => (g: CanvasRenderingContext2D, w: number, h: number) => { g.translate(right ? -w : 0, 0); draw(g, w * 2, h); };
  const wall = atlasTex([
    posterCell('KONZERT', '#5b2bd6', '#ffd23f', 'note'), posterCell('PARTY!', '#ff4fb0', '#fff3a6', 'star'), posterCell('ZIRKUS', '#ff5f3a', '#ffffff', 'ball'), posterCell('NEONNACHT', '#1a0b4a', '#35e6ff', 'star'),
    posterCell('FLOHMARKT', '#2fa07a', '#ffe680', 'heart'), posterCell('KARAOKE', '#b46bff', '#ffffff', 'note'), posterCell('DISCO', '#0a5ad6', '#ff7ad0', 'ball'), posterCell('THEATER', '#9a1239', '#ffd23f', 'mask'),
    ...tagDraw.flatMap((d) => [half(d, false), half(d, true)]),
  ], 4, 6, 128, 160);
  const posterQ: Quad[] = [], tagQ: Quad[] = [];

  // ---------------------------------------------------------------- houses
  {
    const pipes: Item[] = [], gables: Item[] = [];
    blds.forEach((b, i) => {
      const fz = b.z + b.d / 2;
      // gutter under the eave and a downpipe at a front corner
      pipes.push({ x: b.x, y: b.h - 0.08, z: fz + 0.12, sx: b.w + 0.3, sy: 0.1, sz: 0.14, c: '#d6d0e6' });
      const px = b.x + (i % 2 ? 1 : -1) * (b.w / 2 - 0.1);
      pipes.push({ x: px, y: b.h / 2, z: fz + 0.07, sx: 0.09, sy: b.h, sz: 0.09, c: '#c8c0dc' });
      if (b.gable) gables.push({ x: b.x, y: b.h + 0.3, z: b.z, sx: b.w + 0.45, sy: Math.min(1.6, b.d * 0.42), sz: b.d + 0.45, c: b.roof });
      // shop signs sticking out of the façade (both faces), lit at dusk
      if (b.h > 2.6 && i % 3 !== 2) {
        const sx = b.x + (i % 2 ? -1 : 1) * (b.w / 2 - 0.25);
        signQ.push({ x: sx, y: 2.55, z: fz + 0.42, ry: Math.PI / 2, w: 0.8, h: 0.4, cell: (i * 5) % 11 });
        signQ.push({ x: sx, y: 2.55, z: fz + 0.42, ry: -Math.PI / 2, w: 0.8, h: 0.4, cell: (i * 5) % 11 });
        st.add(BOX, '#2a1258', sx, 2.82, fz + 0.25, 0, 0, 0, 0.04, 0.04, 0.5);
      }
      // posters and graffiti on the side walls near the ground (the side that faces a gap)
      for (const s of [-1, 1]) {
        const wx = b.x + s * (b.w / 2 + 0.015);
        if (blds.some((o) => o !== b && Math.abs(o.z - b.z) < (o.d + b.d) / 2 && Math.abs(o.x - (b.x + s * (b.w + o.w) / 4)) < o.w / 2 + 0.6)) continue;
        if ((i + (s > 0 ? 1 : 0)) % 3 === 0) tagQ.push({ x: wx, y: 0.62, z: b.z + rand(-0.2, 0.2) * b.d, ry: s * Math.PI / 2, w: Math.min(1.7, b.d * 0.7), h: Math.min(0.85, b.d * 0.35), cell: 8 + ((i * 3 + (s > 0 ? 1 : 0)) % 8) * 2, span: 2 });
        else if ((i + (s > 0 ? 1 : 0)) % 3 === 1) {
          const n = 1 + (i % 2);
          for (let k = 0; k < n; k++) posterQ.push({ x: wx, y: 1.05 + (k % 2) * 0.12, z: b.z + (k - (n - 1) / 2) * 0.62, ry: s * Math.PI / 2, w: 0.5, h: 0.62, cell: (i * 7 + k) % 8, tilt: 0 });
        }
      }
      // a poster next to the door of every fourth house
      if (i % 4 === 1) posterQ.push({ x: b.x + b.w * 0.18 + 0.55, y: 1.0, z: fz + 0.015, ry: 0, w: 0.46, h: 0.58, cell: (i * 3) % 8 });
    });
    bake(st, BOX, pipes);
    if (gables.length) {
      const tex = roofTex();
      tex.repeat.set(3, 2);
      const m = instanced(sc, GABLE, gables, { mat: new THREE.MeshToonMaterial({ map: tex, gradientMap: GRAD }), cast: true, ao: 0 });
      m.receiveShadow = true;
      // a chimney on some gable roofs
      gables.forEach((g, k) => { if (k % 2) st.add(BOX, '#b46b5a', g.x + (g.sx ?? 1) * 0.25, (g.y ?? 0) + (g.sy ?? 1) * 0.6, g.z - 0.3, 0, 0, 0, 0.32, (g.sy ?? 1) * 0.9, 0.32); });
    }
  }

  // washing lines across the gaps between neighbours
  let lines = 0;
  for (const a of blds) for (const b of blds) {
    if (lines >= 10 || b.x <= a.x || Math.abs(a.z - b.z) > 1.2) continue;
    const gap = b.x - b.w / 2 - (a.x + a.w / 2);
    if (gap < 0.8 || gap > 3.6) continue;
    const y = Math.min(a.h, b.h) - 0.9;
    if (y < 2.4) continue;
    const z = Math.min(a.z + a.d / 2, b.z + b.d / 2) - 0.35;
    washingLine(st, [a.x + a.w / 2, y, z], [b.x - b.w / 2, y + rand(-0.2, 0.2), z]);
    lines++;
    if (y > 5) washingLine(st, [a.x + a.w / 2, y - 2.1, z - 0.4], [b.x - b.w / 2, y - 2.1, z - 0.4]);
  }

  // rooftop gardens with fairy lights
  const wire = st, bulbs = new Batch();
  for (const b of blds.filter((x) => x.garden)) {
    const top = b.h + 0.3, hw = b.w / 2 - 0.2, hd = b.d / 2 - 0.2;
    st.add(BOX, '#c79a6a', b.x, top + 0.04, b.z, 0, 0, 0, b.w * 0.86, 0.08, b.d * 0.86);
    for (let k = 0; k < 5; k++) st.add(BOX, '#a87a4e', b.x, top + 0.085, b.z - hd * 0.8 + (k * hd * 1.6) / 4, 0, 0, 0, b.w * 0.84, 0.01, 0.03);
    for (const s of [-1, 1]) {
      st.add(BOX, '#8a5a3a', b.x + s * (hw - 0.15), top + 0.2, b.z, 0, 0, 0, 0.32, 0.32, b.d * 0.7);
      for (let k = 0; k < 3; k++) st.add(LEAF, pickR(['#3fd27a', '#7be05a', '#2fc4a0']), b.x + s * (hw - 0.15), top + 0.45, b.z - b.d * 0.25 + k * b.d * 0.25, 0, k, 0, 0.22, 0.2, 0.22);
      st.add(BULB, pickR(['#ff5fae', '#ffd23f']), b.x + s * (hw - 0.15), top + 0.6, b.z + 0.1, 0, 0, 0, 0.07);
    }
    st.add(CYL8, '#ffffff', b.x + 0.2, top + 0.6, b.z + 0.2, 0, 0, 0, 0.03, 1.2, 0.03); st.add(CONE, pickR(['#ff7ad0', '#35d4ff', '#ffd23f']), b.x + 0.2, top + 1.3, b.z + 0.2, 0, 0, 0, 0.75, 0.3, 0.75);
    st.add(BOX, '#ffffff', b.x - 0.35, top + 0.25, b.z + 0.45, 0, 0.3, 0, 0.35, 0.05, 0.35); st.add(BOX, '#ffffff', b.x - 0.35, top + 0.4, b.z + 0.3, 0.3, 0.3, 0, 0.35, 0.3, 0.04);
    const cs: [number, number][] = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    for (const [x, z] of cs) st.add(CYL8, '#2a2440', b.x + x, top + 0.65, b.z + z, 0, 0, 0, 0.025, 1.3, 0.025);
    for (let k = 0; k < 4; k++) { const [ax, az] = cs[k], [bx, bz] = cs[(k + 1) % 4]; fairyString(wire, bulbs, [b.x + ax, top + 1.28, b.z + az], [b.x + bx, top + 1.28, b.z + bz], { n: 7, sag: 0.28 }); }
    fairyString(wire, bulbs, [b.x + cs[0][0], top + 1.28, b.z + cs[0][1]], [b.x + cs[2][0], top + 1.28, b.z + cs[2][1]], { n: 9, sag: 0.4 });
  }

  // ---------------------------------------------------------------- the promenade road
  const R = ROAD;
  {
    st.add(BOX, '#4a4566', 0, 0.03, R.lane, 0, 0, 0, R.x * 2 + 1.6, 0.06, 1.55);
    const marks: Item[] = [];
    for (let x = -R.x; x < R.x; x += 1.6) marks.push({ x, y: 0.062, z: R.lane, sx: 0.8, sy: 0.01, sz: 0.07, c: '#ffffff' });
    for (const s of [-1, 1]) marks.push({ x: 0, y: 0.062, z: R.lane + s * 0.68, sx: R.x * 2, sy: 0.01, sz: 0.05, c: s < 0 ? '#ffffff' : '#ffd23f' });
    // crossings
    for (const cx of [-12, 12]) for (let k = 0; k < 6; k++) marks.push({ x: cx - 1 + k * 0.4, y: 0.064, z: R.lane, sx: 0.22, sy: 0.012, sz: 1.3, c: '#ffffff' });
    bake(flatBatch(sc), BOX, marks);
    // sidewalk with a kerb
    st.add(BOX, '#e8dff2', 0, 0.05, (R.z0 + R.lane - 0.78) / 2, 0, 0, 0, R.x * 2 + 1.6, 0.1, R.lane - 0.78 - R.z0);
    st.add(BOX, '#b8aed0', 0, 0.08, R.lane - 0.8, 0, 0, 0, R.x * 2 + 1.6, 0.14, 0.12);
    for (let x = -R.x; x < R.x; x += 2.2) st.add(BOX, '#d4cae6', x, 0.101, (R.z0 + R.lane - 0.78) / 2, 0, 0, 0, 0.03, 0.005, R.lane - 0.8 - R.z0);
    // tunnel portals at both ends (the vehicles come out of the west one and go into the east one)
    for (const s of [-1, 1]) {
      const x = s * (R.x + 1.1);
      st.add(BOX, '#8e6be0', x, 1.05, R.lane - 0.12, 0, 0, 0, 1.7, 2.1, 2.05);
      st.add(BOX, '#ff4fb0', x, 2.2, R.lane - 0.12, 0, 0, 0, 1.85, 0.22, 2.2);
      st.add(BOX, '#1a0b33', x - s * 0.86, 0.75, R.lane, 0, 0, 0, 0.02, 1.4, 1.35);
      st.add(CYL, '#1a0b33', x - s * 0.86, 1.45, R.lane, Math.PI / 2, 0, Math.PI / 2, 0.68, 0.02, 0.68);
      for (let k = 0; k < 5; k++) c.gl.add(BULB, k % 2 ? '#ffd23f' : '#ff4fb0', x - s * 0.88, 0.3 + k * 0.42, R.lane - 0.8, 0, 0, 0, 0.06);
    }
    // traffic: taxis, cars and a bus, one lane west → east, back under the island
    const T: [number, number, number][] = [[-R.x - 1.4, -2.2, R.lane], [-R.x - 0.6, 0.06, R.lane], [R.x + 0.6, 0.06, R.lane], [R.x + 1.4, -2.2, R.lane]];
    const route: [number, number, number][] = [...T, [R.x + 1.4, -2.6, R.lane - 0.4], [-R.x - 1.4, -2.6, R.lane - 0.4]];
    const glowOf = () => atmo.live.glow;
    convoy(sc, GEO.taxi(), route, 4, { speed: 2.6, colors: ['#ffd23f', '#35d4ff', '#ffe14a', '#b8f02a'], offset: 0, lights: GEO.carLights(true), glowOf });
    convoy(sc, GEO.bus(), route, 1, { speed: 2.6, colors: ['#ff4fb0'], offset: 1 / 8, lights: GEO.carLights(false, 1.92, 0.45, 0.35), glowOf });
    // bus stop with a shelter and a lit sign
    const bx = -20, bz = R.z0 + 0.35;
    st.add(BOX, '#2a1258', bx, 1.1, bz - 0.05, 0, 0, 0, 1.9, 0.08, 0.7); st.add(BOX, '#9fe3ff', bx, 0.65, bz - 0.38, 0, 0, 0, 1.8, 1.1, 0.03);
    for (const s of [-1, 1]) st.add(CYL8, '#2a1258', bx + s * 0.9, 0.55, bz + 0.25, 0, 0, 0, 0.04, 1.1, 0.04);
    st.add(BOX, '#ff7ad0', bx, 0.38, bz - 0.2, 0, 0, 0, 1.4, 0.06, 0.32);
    st.add(CYL8, '#2a1258', bx + 1.3, 0.9, bz + 0.5, 0, 0, 0, 0.04, 1.8, 0.04);
    signQ.push({ x: bx + 1.3, y: 1.75, z: bz + 0.53, ry: 0, w: 0.55, h: 0.28, cell: 11 });
    // traffic lights at the crossings (cycle red / yellow / green; colours change a few times a minute)
    const heads: [number, number, number][] = [];
    for (const cx of [-12, 12]) {
      const z = R.lane - 0.95;
      st.add(CYL8, '#2a2440', cx - 1.3, 1.1, z, 0, 0, 0, 0.06, 2.2, 0.06); st.add(BOX, '#2a2440', cx - 1.3, 2.05, z + 0.12, 0, 0, 0, 0.26, 0.74, 0.18);
      for (let k = 0; k < 3; k++) heads.push([cx - 1.3, 2.3 - k * 0.24, z + 0.22]);
    }
    // west crossing shows red, east green (lit bulbs glow; the others are dark glass)
    heads.forEach(([x, y, z], i) => {
      const lit = (i < 3 && i % 3 === 0) || (i >= 3 && i % 3 === 2);
      if (lit) c.gl.add(BULB, ['#ff3d3d', '#ffd23f', '#3dff7a'][i % 3], x, y, z, 0, 0, 0, 0.085);
      else st.add(BULB, '#3a3450', x, y, z, 0, 0, 0, 0.085);
    });
    // hydrants and letterboxes on the sidewalk, plus a few elsewhere
    const hyd: Item[] = [], post: Item[] = [], bins: Item[] = [];
    for (const x of [-25, -6, 6, 24]) hyd.push({ x, z: R.lane - 1.1, c: '#ff3d3d' });
    for (const x of [-15.5, 9]) post.push({ x, z: R.z0 + 0.35, ry: 0, c: '#ffd23f' });
    for (const x of [-27, 3, 27]) bins.push({ x, z: R.z0 + 0.3, c: pickR(['#35d4ff', '#7dff8a', '#ff7ad0']) });
    for (let k = 0; k < 40 && post.length < 6; k++) {
      const b = pickR(blds), x = b.x + rand(-0.6, 0.6) * b.w, z = b.z + b.d / 2 + 0.7;
      if (c.claim(x, z, 0.8, 1.6, 1.0)) post.push({ x, z, ry: 0, c: '#ffd23f' });
    }
    bake(st, PROPS.hydrant(), hyd, { sc, ao: 0.5 });
    bake(st, LETTERBOX, post, { sc, ao: 0.5 });
    bake(st, BIN, bins, { sc, ao: 0.4 });
  }

  // ---------------------------------------------------------------- snack stand with steam
  const spotNear = (tx: number, tz: number, r: number, rN = 2.2, rE = 1.6): P2 | null => {
    for (let k = 0; k < 220; k++) {
      const a = Math.random() * TAU, d = Math.random() * (2 + k * 0.05);
      const x = tx + Math.cos(a) * d, z = tz + Math.sin(a) * d;
      if (c.claim(x, z, r, rN, rE)) return [x, z];
    }
    return null;
  };
  {
    const p = spotNear(7.5, 12.5, 1.9);
    if (p) {
      const [x, z] = p, m = new THREE.Matrix4().makeTranslation(x, 0, z), b = new Batch();
      b.add(BOX, '#ffffff', 0, 0.55, 0, 0, 0, 0, 1.9, 0.9, 1.0);
      for (let k = 0; k < 6; k++) b.add(BOX, k % 2 ? '#ffffff' : '#ff5f3a', -0.8 + k * 0.32, 0.55, 0.505, 0, 0, 0, 0.3, 0.88, 0.02);
      b.add(BOX, '#b0a8c8', 0, 1.02, 0.1, 0, 0, 0, 2.0, 0.06, 1.2);
      b.add(BOX, '#2a2440', -0.45, 1.1, 0, 0, 0, 0, 0.8, 0.1, 0.55);
      for (let k = 0; k < 4; k++) b.add(CYL8, '#c86a4a', -0.7 + k * 0.17, 1.18, 0, 0, 0, Math.PI / 2, 0.045, 0.45, 0.045);
      b.add(CYL8, '#e8e4f4', 0.5, 1.25, 0, 0, 0, 0, 0.22, 0.4, 0.22); b.add(CYL8, '#9a92b4', 0.5, 1.47, 0, 0, 0, 0, 0.24, 0.04, 0.24);
      b.add(CYL8, '#ffd23f', 0.85, 1.12, 0.35, 0, 0, 0, 0.06, 0.16, 0.06); b.add(CYL8, '#ff3d3d', 0.95, 1.12, 0.35, 0, 0, 0, 0.06, 0.16, 0.06);
      for (const s of [-1, 1]) b.add(CYL8, '#2a1258', s * 0.95, 1.5, -0.45, 0, 0, 0, 0.04, 1.0, 0.04);
      for (let k = 0; k < 7; k++) b.add(BOX, k % 2 ? '#ffffff' : '#ff5f3a', -0.9 + k * 0.3, 2.0, 0.05, -0.32, 0, 0, 0.3, 0.04, 1.3);
      for (const s of [-1, 1]) b.add(CYL8, '#1d1f24', s * 0.75, 0.15, 0.52, 0, 0, Math.PI / 2, 0.15, 0.08, 0.15);
      addColored(st, b.geometry(), m);
      signQ.push({ x, y: 2.35, z: z + 0.62, ry: 0, w: 1.2, h: 0.5, cell: 7, tilt: -0.25 });
      c.air.push({ kind: 'smoke', x: x - 0.45, z, r: 0.18, n: 7, y0: 1.25, size: 0.55 });
      c.air.push({ kind: 'smoke', x: x + 0.5, z, r: 0.12, n: 5, y0: 1.5, size: 0.45 });
      const tables: Item[] = [];
      for (const [dx, dz] of [[-1.8, 1.6], [1.6, 1.8]] as const) if (c.claim(x + dx, z + dz, 0.9, 1.6, 1.1)) tables.push({ x: x + dx, z: z + dz, ry: rand(0, 1), c: pickR(['#ff7ad0', '#35d4ff', '#ffffff']) });
      bake(st, PROPS.bistro(), tables, { sc, ao: 0.5 });
    }
  }

  // ---------------------------------------------------------------- arcade
  {
    let best: Bld | null = null, bd = 1e9;
    for (const b of blds) {
      if (b.h < 2.9 || b.w < 2.5) continue;
      const fz = b.z + b.d / 2;
      if (!c.inIsland(b.x, fz + 1.3, 0.5) || onStreet(b.x, fz + 1.3, 0.5) || !kit.clearOfPath(b.x, fz + 1.0, 1.8, 1.2)) continue;
      const d = Math.hypot(b.x - 6, fz - 4);
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      const b = best, fz = b.z + b.d / 2;
      signQ.push({ x: b.x, y: 2.45, z: fz + 0.04, ry: 0, w: Math.min(2.4, b.w * 0.85), h: 0.6, cell: S_ARC });
      const cab = new Batch();
      cab.add(BOX, '#ffffff', 0, 0.62, 0, 0, 0, 0, 0.55, 1.24, 0.5); cab.add(BOX, '#1a0b33', 0, 0.85, 0.2, -0.3, 0, 0, 0.45, 0.4, 0.2);
      cab.add(BOX, '#ffffff', 0, 0.55, 0.3, 0.35, 0, 0, 0.55, 0.06, 0.25); cab.add(CYL8, '#ff3d3d', -0.1, 0.62, 0.33, 0, 0, 0, 0.03, 0.12, 0.03); cab.add(BULB, '#ff3d3d', -0.1, 0.7, 0.33, 0, 0, 0, 0.045);
      cab.add(CYL8, '#35d4ff', 0.1, 0.6, 0.35, 0, 0, 0, 0.035, 0.03, 0.035); cab.add(CYL8, '#ffd23f', 0.18, 0.6, 0.31, 0, 0, 0, 0.035, 0.03, 0.035);
      cab.add(BOX, '#1a0b33', 0, 1.3, 0.05, 0, 0, 0, 0.55, 0.16, 0.42);
      const cg = cab.geometry(), items: Item[] = [];
      const n = Math.min(3, Math.floor(b.w / 0.75));
      for (let k = 0; k < n; k++) {
        const x = b.x + (k - (n - 1) / 2) * 0.72, z = fz + 0.42;
        items.push({ x, z, c: ['#ff4fb0', '#35d4ff', '#b8f02a'][k % 3] });
        signQ.push({ x, y: 0.98, z: z + 0.33, ry: 0, w: 0.4, h: 0.26, cell: S_SCREEN + (k % 3), tilt: -0.3 });
      }
      bake(st, cg, items, { sc, ao: 0.5 });
      c.gl.add(BOX, '#ff4fb0', b.x, 2.1, fz + 0.06, 0, 0, 0, Math.min(2.6, b.w * 0.9), 0.06, 0.06);
    }
  }

  // ---------------------------------------------------------------- newspaper kiosk at every shop
  for (const n of nodes.filter((x) => x.type === 'S')) {
    // opposite the stall that sits on the space itself (feinkram.spaceProps uses freeYaw too)
    const sy = freeYaw(nodes, kit.graph.edges, n.id);
    let kx = n.x, kz = n.z;
    for (const a of [sy + Math.PI, sy + Math.PI / 2, sy - Math.PI / 2]) {
      kx = n.x + Math.sin(a) * 2.9; kz = n.z + Math.cos(a) * 2.9;
      if (c.inIsland(kx, kz, 1) && !onStreet(kx, kz, 1) && !(kx < -6 && Math.abs(kz) < 2.9) && kit.clearOfPath(kx, kz, 2.2, 1.4)) break;
    }
    const yaw = Math.atan2(n.x - kx, n.z - kz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(kx, 0, kz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    const kb = new Batch();
    kb.add(BOX, '#ffffff', 0, 0.75, -0.1, 0, 0, 0, 2.2, 1.5, 1.3); kb.add(BOX, '#35d4ff', 0, 1.62, -0.1, 0, 0, 0, 2.35, 0.24, 1.45);
    kb.add(BOX, '#9fe3ff', 0, 1.05, 0.56, 0, 0, 0, 1.3, 0.6, 0.02); kb.add(BOX, '#1a0b33', 0, 0.72, 0.62, 0, 0, 0, 1.5, 0.08, 0.16);
    kb.add(LEAF, '#f2c7a0', 0.2, 1.0, 0.42, 0, 0, 0, 0.16); kb.add(BOX, '#ff7ad0', 0.2, 0.82, 0.42, 0, 0, 0, 0.3, 0.2, 0.18);
    // newspaper racks: slanted shelves with stacks and magazines
    for (const s of [-1, 1]) {
      const x = s * 0.82;
      kb.add(BOX, '#2a2440', x, 0.45, 0.78, -0.5, 0, 0, 0.5, 0.05, 0.5);
      for (let k = 0; k < 3; k++) {
        kb.add(BOX, '#f4f4f0', x - 0.16 + k * 0.16, 0.5, 0.74 + k * 0.02, -0.5, 0, 0, 0.14, 0.03, 0.2);
        kb.add(BOX, pickR(['#ff3d3d', '#35d4ff', '#ffd23f', '#1a0b33']), x - 0.16 + k * 0.16, 0.53, 0.68 + k * 0.02, -0.5, 0, 0, 0.12, 0.012, 0.05);
      }
      for (let k = 0; k < 4; k++) kb.add(BOX, pickR(['#ff7ad0', '#b8f02a', '#ffd23f', '#35d4ff', '#b46bff']), x - 0.18 + k * 0.12, 0.95, 0.66, -0.15, 0, 0, 0.1, 0.24, 0.015);
      kb.add(BOX, '#2a2440', x, 0.95, 0.64, 0, 0, 0, 0.52, 0.02, 0.04);
    }
    kb.add(BOX, '#ffffff', -1.25, 0.32, 0.2, 0, 0, 0, 0.25, 0.64, 0.25);
    for (let k = 0; k < 4; k++) kb.add(BOX, pickR(['#ff3d3d', '#ffd23f', '#35d4ff']), -1.25, 0.15 + k * 0.15, 0.33, 0, 0, 0, 0.2, 0.1, 0.01);
    addColored(st, kb.geometry(), m);
    const sp = new THREE.Vector3(0, 1.62, 0.64).applyMatrix4(m);
    signQ.push({ x: sp.x, y: sp.y, z: sp.z, ry: yaw, w: 1.1, h: 0.22, cell: 6 });
  }

  // ---------------------------------------------------------------- harbour
  {
    const PX0 = -43.6, PX1 = -36.4, PZ = 9;
    // wooden pier deck (planks texture) on the old pier
    for (let x = PX0 + 0.13; x < PX1; x += 0.27) st.add(BOX, pickR(['#c79a6a', '#bd8f5e', '#d2a676']), x, -0.42, PZ + rand(-0.04, 0.04), 0, rand(-0.02, 0.02), 0, 0.24, 0.12, 1.7);
    for (const s of [-1, 1]) st.add(BOX, '#6a4428', (PX0 + PX1) / 2, -0.47, PZ + s * 0.6, 0, 0, 0, PX1 - PX0, 0.1, 0.12);
    // bollards along both edges, gulls on some of them
    const gullSpots: [number, number, number][] = [];
    for (let x = PX0 + 0.4; x < PX1; x += 1.45) for (const s of [-1, 1]) {
      st.add(CYL8, '#2a2440', x, -0.2, PZ + s * 0.72, 0, 0, 0, 0.12, 0.34, 0.12); st.add(CYL8, '#2a2440', x, -0.02, PZ + s * 0.72, 0, 0, 0, 0.16, 0.06, 0.16);
      if ((Math.round(x * 3) + s) % 3 === 0) gullSpots.push([x, 0.02, PZ + s * 0.72]);
    }
    // a rope from a bollard to the moored boat, a life ring on a post, a little net rack
    st.beam([PX0 + 0.4, -0.05, PZ + 0.72], [-42, -0.7, 12], 0.025, '#e8d8b8');
    st.add(CYL8, '#ffffff', PX1 - 0.5, 0.3, PZ - 0.72, 0, 0, 0, 0.05, 1.3, 0.05);
    st.add(RING, '#ff3d3d', PX1 - 0.5, 0.75, PZ - 0.66, 0, 0, 0, 0.28, 0.28, 0.28);
    for (let k = 0; k < 4; k++) st.add(BOX, '#ffffff', PX1 - 0.5 + Math.cos((k * TAU) / 4 + 0.78) * 0.28, 0.75 + Math.sin((k * TAU) / 4 + 0.78) * 0.28, PZ - 0.62, 0, 0, (k * TAU) / 4 + 0.78, 0.1, 0.14, 0.06);
    // crates, barrels and nets on the quay
    const crates: Item[] = [], barrels: Item[] = [];
    const netQ: Quad[] = [];
    const quay: P2[] = [[-35.3, 6.4], [-35.4, 11.6], [-34.6, 13.3], [-35.2, 4.6]];
    quay.forEach(([x, z], k) => {
      if (!c.claim(x, z, 1.0, 1.6, 1.1)) return;
      if (k % 2 === 0) {
        crates.push({ x, z, ry: rand(-0.2, 0.2), s: 0.7, c: '#c8925a' }, { x: x + 0.15, y: 0.7, z: z + 0.1, ry: rand(-0.4, 0.4), s: 0.62, c: '#d8a46a' }, { x: x - 0.1, z: z + 0.78, ry: rand(-0.3, 0.3), s: 0.6, c: '#b8824a' });
        netQ.push({ x: x + 0.05, y: 0.98, z: z + 0.15, ry: 0.2, w: 0.9, h: 0.9, cell: 0, tilt: -Math.PI / 2 + 0.25 });
      } else {
        barrels.push({ x, z, c: pickR(['#35d4ff', '#ff5f3a']) }, { x: x + 0.6, z: z + 0.3, c: pickR(['#35d4ff', '#ffd23f']) });
      }
    });
    // net rack (two poles, a net hanging between them) beside the pier
    if (c.claim(-35.6, 9.9, 0.9, 1.6, 1.1)) {
      for (const s of [-1, 1]) st.add(CYL8, '#8a5a3a', -35.6, 0.75, 9.9 + s * 0.8, 0, 0, 0, 0.05, 1.5, 0.05);
      st.add(CYL8, '#8a5a3a', -35.6, 1.48, 9.9, Math.PI / 2, 0, 0, 0.04, 1.7, 0.04);
      netQ.push({ x: -35.6, y: 0.85, z: 9.9, ry: Math.PI / 2, w: 1.5, h: 1.25, cell: 0 });
      netQ.push({ x: -35.62, y: 0.85, z: 9.9, ry: -Math.PI / 2, w: 1.5, h: 1.25, cell: 0 });
      st.add(LEAF, '#ff9a5c', -35.55, 0.5, 10.25, 0, 0, 0, 0.12); st.add(LEAF, '#ffffff', -35.55, 0.7, 9.6, 0, 0, 0, 0.11);
    }
    bake(st, CRATE, crates, { sc, ao: 0.5 });
    bake(st, PROPS.drum(), barrels.map((b) => ({ ...b, s: 0.7 })), { sc, ao: 0.5 });
    // nets: a mesh of thin cords (diagonal grid) on each net quad
    for (const q of netQ) {
      const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(q.tilt ?? 0, q.ry, 0, 'YXZ')).setPosition(q.x, q.y, q.z);
      const P = (u: number, v: number) => new THREE.Vector3((u - 0.5) * q.w, (v - 0.5) * q.h, 0).applyMatrix4(m).toArray() as [number, number, number];
      for (let k = 0; k <= 6; k++) { const t = k / 6; st.beam(P(t, 0), P(0, t), 0.012, '#2f6a5a', WIRE); st.beam(P(1 - t, 0), P(1, t), 0.012, '#2f6a5a', WIRE); if (k) { st.beam(P(t, 1), P(1, 1 - t), 0.012, '#2f6a5a', WIRE); st.beam(P(1 - t, 1), P(0, 1 - t), 0.012, '#2f6a5a', WIRE); } }
    }
    // buoys bobbing around the harbour, gulls sitting on the bollards (they look around)
    const buoys: [number, number][] = [[-45.5, 6.5], [-46.5, 11.5], [-44, 14.5], [-41, 4.6], [-48.5, 9]];
    const bm = new THREE.InstancedMesh(BUOY, toon('#ffffff', { vertexColors: true }), buoys.length);
    bm.castShadow = false;
    bm.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    buoys.forEach((_, i) => bm.setColorAt(i, _c.set(i % 2 ? '#ff3d3d' : '#ffd23f')));
    sc.add(bm);
    gullSpots.forEach(([x, y, z]) => addColored(st, GULL, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rand(0, TAU), 0)), new THREE.Vector3(1, 1, 1))));
    const bob = (t: number) => {
      for (let i = 0; i < buoys.length; i++) {
        _d.position.set(buoys[i][0], -1.3 + Math.sin(t * 1.4 + i * 2.1) * 0.13, buoys[i][1]);
        _d.rotation.set(Math.sin(t * 1.1 + i) * 0.15, i, Math.cos(t * 1.3 + i) * 0.15); _d.scale.setScalar(1); _d.updateMatrix();
        bm.setMatrixAt(i, _d.matrix);
      }
      bm.instanceMatrix.needsUpdate = true;
    };
    // real bounds (so the harbour buoys are culled when the camera looks elsewhere)
    bob(0); bm.computeBoundingSphere(); bm.boundingSphere!.radius += 0.6;
    addReactor(sc, { meshes: [bm], near: true, tick: (_dt, t) => bob(t) });
    // two more gulls on the lighthouse rail
    st.add(LEAF, '#ffffff', -33.9, 8.85, -20.0, 0, 0, 0, 0.1, 0.1, 0.18);
  }

  // ---------------------------------------------------------------- the atlas meshes
  if (signQ.length) sc.add(new THREE.Mesh(atlasQuads(signQ, 4, 4), litMat(SIGN_TEX, atmo, 0.4, 1.35, { side: THREE.DoubleSide })));
  if (posterQ.length + tagQ.length) { const m = new THREE.Mesh(atlasQuads([...posterQ, ...tagQ], 4, 6), decalMat(wall)); m.receiveShadow = true; sc.add(m); nearOnly(sc, m); }
  if (bulbs.n) sc.add(bulbs.mesh(bulbMat(atmo, 0.45, 1.8), false, false));
}

// ---------------------------------------------------------------- geometry
const geo = (make: (b: Batch) => void) => { const b = new Batch(); make(b); return b.geometry(); };
/** Gable roof prism: ridge along x, base 1 × 1 at y = 0, height 1; UVs run up each slope. */
const GABLE = (() => {
  const P = [-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, 0.5, 0, -0.5, -0.5, 0, -0.5, -0.5, 1, 0, 0.5, 1, 0, -0.5, 0, -0.5, -0.5, 0, 0.5, -0.5, 1, 0, 0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 1, 0];
  const U = [0, 0, 1, 0, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 0, 0.02, 0.02, 0.02, 0.01, 0.04, 0, 0.02, 0.02, 0.02, 0.01, 0.04];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7, 8, 9, 10, 11, 12, 13]);
  g.computeVertexNormals();
  return g;
})();
const LETTERBOX = geo((b) => {
  b.add(CYL8, '#2a2440', 0, 0.35, 0, 0, 0, 0, 0.05, 0.7, 0.05);
  b.add(BOX, '#ffffff', 0, 0.85, 0, 0, 0, 0, 0.42, 0.5, 0.3); b.add(CYL8, '#ffffff', 0, 1.1, 0, 0, 0, Math.PI / 2, 0.21, 0.42, 0.15);
  b.add(BOX, '#1a0b33', 0, 0.98, 0.155, 0, 0, 0, 0.26, 0.04, 0.01);
  b.add(CYL8, '#1a0b33', 0, 0.78, 0.155, Math.PI / 2, 0, 0, 0.08, 0.01, 0.08); b.add(CYL8, '#ffffff', 0, 0.78, 0.16, Math.PI / 2, 0, 0, 0.05, 0.01, 0.05);
});
const RING = new THREE.TorusGeometry(1, 0.26, 4, 12);
const BIN = geo((b) => { b.add(CYL8, '#2a2440', 0, 0.3, 0, 0, 0, 0, 0.04, 0.6, 0.04); b.add(CYL8, '#ffffff', 0, 0.62, 0.12, 0, 0, 0, 0.18, 0.45, 0.18); b.add(CYL8, '#1a0b33', 0, 0.85, 0.12, 0, 0, 0, 0.15, 0.02, 0.15); });
const CRATE = geo((b) => {
  b.add(BOX, '#ffffff', 0, 0.5, 0, 0, 0, 0, 1, 1, 1);
  for (const s of [-1, 1]) { b.add(BOX, '#8a5a3a', 0, 0.5, s * 0.505, 0, 0, Math.PI / 4, 1.3, 0.1, 0.02); b.add(BOX, '#8a5a3a', s * 0.505, 0.5, 0, Math.PI / 4, 0, 0, 0.02, 0.1, 1.3); }
  for (const y of [0.06, 0.94]) b.add(BOX, '#a8784a', 0, y, 0, 0, 0, 0, 1.04, 0.1, 1.04);
});
const BUOY = geo((b) => { b.add(CONE, '#ffffff', 0, 0.5, 0, 0, 0, 0, 0.35, 0.9, 0.35); b.add(CYL8, '#f4f4f4', 0, 0.35, 0, 0, 0, 0, 0.3, 0.14, 0.3); b.add(CYL8, '#2a2440', 0, 1.05, 0, 0, 0, 0, 0.03, 0.3, 0.03); b.add(BULB, '#fff3a6', 0, 1.22, 0, 0, 0, 0, 0.07); });
const GULL = geo((b) => {
  b.add(LEAF, '#ffffff', 0, 0.2, 0, 0, 0, 0, 0.13, 0.13, 0.26);
  b.add(LEAF, '#ffffff', 0, 0.36, 0.17, 0, 0, 0, 0.09);
  b.add(CONE, '#ffb347', 0, 0.35, 0.29, Math.PI / 2, 0, 0, 0.03, 0.1, 0.03);
  for (const s of [-1, 1]) { b.add(BOX, '#9aa4c0', s * 0.12, 0.25, -0.04, 0, 0, s * 0.2, 0.05, 0.08, 0.3); b.add(BULB, '#1a0b33', s * 0.05, 0.38, 0.22, 0, 0, 0, 0.018); }
  b.add(BOX, '#2a2440', 0, 0.24, -0.3, 0.2, 0, 0, 0.12, 0.04, 0.14);
  for (const s of [-1, 1]) b.add(CYL8, '#ffb347', s * 0.05, 0.05, 0, 0, 0, 0, 0.015, 0.12, 0.015);
});
