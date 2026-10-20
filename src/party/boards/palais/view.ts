// Palais Lumen in 3D: a night-blue marble terrace with brass trim and balustrade, red carpets
// with chase lights, the hotel façade at the back (stepped tower, lit windows, sunburst crown,
// "PALAIS LUMEN" and the Jackpot sign), the roulette wheel in the middle (turntable with the
// bridge, spinning number bowl, ball, jeton), the fountain, the Ballsaal pavilion with its
// swinging chandelier, the bar, the Wintergarten, card tables, slot machines, searchlights,
// lamps, palms, a vintage car and fireworks for the Jackpot-Gala.
// Static parts are merged (Batch) or instanced; the animated parts are a handful of meshes.
// Mood: a bright afternoon, a golden hour with long shadows, then the gala night: the hotel
// windows, chandelier, lamps and searchlights glow, the pool mirrors them.

import type { BEdge } from '../types';
import type { BoardDecor, BoardKit } from '../../view3d/boardview';
import {
  BOX, Batch, CONE, CYL, CYL8, FONT, GLOW, GRAD, HEMI, SPH, SPH_LO, THREE, TOR, VC, ctex, toon,
} from '../../view3d/kit';
import type { Mood } from '../../view3d/atmo';
import { aoAdd, coneMap, type AirArea } from '../../view3d/fx3d';
import { glow, glowEmi } from '../../view3d/shaderfx';
import { sfx } from '../../sfx';
import { floatText } from '../../view3d/stage';
import { E, TAU, lerp, rand, tween, wait } from '../../util';
import { BULB, LEAF, chaseLights, inOutline, plinth, ribbons, roundRect, signMesh, signTex, trim, type P2 } from '../bauteile';
import { POCKETS, RED, WHEEL } from './data';
import { BOAT, PERSON, PROPS, curbs, groundTex, instanced, loopers, type Item } from '../details';

const BRASS = '#d9a94a', BRASS_HI = '#f2cf74', NAVY = '#1b2552', NAVY_D = '#10173a', RED_C = '#a3203a', CREAM = '#f3e6c4', MAHO = '#4a2216';

const sm = (a: number, b: number, x: number) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** Afternoon (warm and clear), golden hour (deep gold, long shadows), gala night (navy, lit). */
const MOOD: Mood = {
  keys: [
    { hemi: '#fff4e4', ground: '#5a4a72', hemiI: 1.5, sun: '#ffe6c0', sunI: 2.3, sunPos: [-30, 55, 28], fog: '#cdb8c8', fogNear: 70, fogFar: 280,
      haze: '#f0dcc8', hazeD: 0.14, hazeTop: 1.2, zen: '#7ab0f0', hor: '#d8e6ff', shal: '#3f8ed0', deep: '#173f8a',
      glow: 0.12, bloom: 0.35, exposure: 1.02, contrast: 1.08, sat: 1.1, lift: '#0a0818', gain: '#fffaf0', vignette: 0.24 },
    { hemi: '#ffd9a8', ground: '#4a3060', hemiI: 1.3, sun: '#ffb45c', sunI: 2.4, sunPos: [-58, 22, 24], fog: '#e8a070', fogNear: 75, fogFar: 285,
      haze: '#ffc080', hazeD: 0.3, hazeTop: 2.0, zen: '#6a68c0', hor: '#ffc88a', shal: '#8a6aa8', deep: '#2a2a78',
      glow: 0.5, bloom: 0.7, exposure: 1.0, contrast: 1.1, sat: 1.14, lift: '#100818', gain: '#fff2dc', vignette: 0.3 },
    { hemi: '#c8d0ff', ground: '#2e2250', hemiI: 1.05, sun: '#c0ccff', sunI: 1.0, sunPos: [24, 58, 26], fog: '#141a44', fogNear: 85, fogFar: 300,
      haze: '#2c3478', hazeD: 0.38, hazeTop: 2.2, zen: '#0e1440', hor: '#2a3070', shal: '#1a2a70', deep: '#070c30',
      glow: 1, bloom: 1.1, exposure: 1.05, contrast: 1.08, sat: 1.12, lift: '#0a0a24', gain: '#f4f0ff', vignette: 0.36 },
  ],
  ao: [0.45, 1.0],
  air: (L) => [sm(0.3, 0.9, L.glow) * 0.9, 0.25 + 0.6 * sm(0.3, 1.2, L.tod) * (1 - L.night), 0.7, 0.55 + 0.45 * L.night],
};

/** A pennant on a pole (tinted flag). */
const FLAG = (() => {
  const b = new Batch();
  b.add(CYL8, '#d9a94a', 0, 1.4, 0, 0, 0, 0, 0.05, 2.8, 0.05);
  b.add(SPH_LO, '#f2cf74', 0, 2.85, 0, 0, 0, 0, 0.09);
  b.addM(new THREE.ConeGeometry(0.42, 1.3, 3).rotateZ(-Math.PI / 2), '#ffffff', new THREE.Matrix4().makeTranslation(0.66, 2.35, 0).multiply(new THREE.Matrix4().makeScale(1, 1, 0.12)));
  return b.geometry();
})();

export function palaisDecor(kit: BoardKit, ids: { we: BEdge; ns: BEdge }): BoardDecor {
  const sc = kit.scene, nodes = kit.graph.nodes, edges = kit.graph.edges;
  sc.fog = new THREE.Fog('#151b46', 120, 330);
  kit.atmo.setMood(MOOD);
  const air: AirArea[] = [];
  const dummy = new THREE.Object3D();
  const _c = new THREE.Color();

  // ---------- terrace (chamfered art-déco outline) ----------
  const OUTLINE: P2[] = roundRect(-37, 37, -25, 22.5, 5, 1);
  const floorTex = groundTex({
    a: NAVY, b: '#212d62', line: 'rgba(217,169,74,.6)', lineW: 2.5, vary: 0.07, speck: ['rgba(242,207,116,.35)', 'rgba(255,255,255,.18)'],
    deco: (g, x, y, S, k) => {
      const cx = x + S / 2, cy = y + S / 2;
      g.strokeStyle = 'rgba(242,207,116,.38)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(cx, cy - 18); g.lineTo(cx + 18, cy); g.lineTo(cx, cy + 18); g.lineTo(cx - 18, cy); g.closePath(); g.stroke();
      if (k % 3 === 0) { g.fillStyle = 'rgba(242,207,116,.3)'; g.beginPath(); g.moveTo(cx, cy - 7); g.lineTo(cx + 7, cy); g.lineTo(cx, cy + 7); g.lineTo(cx - 7, cy); g.closePath(); g.fill(); }
      // marble veins
      g.strokeStyle = 'rgba(160,175,240,.12)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x + 4, y + 10 + k * 3); g.bezierCurveTo(x + 20, y + 2 + k * 4, x + 40, y + 50 - k * 2, x + 60, y + 30 + k); g.stroke();
    },
  });
  floorTex.repeat.set(1 / 16, 1 / 16);
  plinth(sc, OUTLINE, new THREE.MeshToonMaterial({ map: floorTex, gradientMap: GRAD }), '#2a1f4a');
  trim(sc, OUTLINE, 0.08, 0.14, BRASS_HI);
  trim(sc, OUTLINE, -1.7, 0.12, '#ff5a6e', 1.012);

  // ---------- the pool around (waves, glitter, foam; the gala lights mirror in it) ----------
  kit.atmo.water({
    y: -1.25, shore: { c: [0, -1.25], b: [37.6, 24.35], r: 5.2 }, rim: '#ff5a6e',
    lights: [
      { p: [0, 9, -27], c: '#ffd88a', k: 10 }, { p: [0, 30, -30], c: '#ffd36b', k: 30 }, { p: [-33.2, 3, -20.2], c: '#fff3c8', k: 40 }, { p: [33.2, 3, -20.2], c: '#fff3c8', k: 40 },
      { p: [-3.9, 2.4, 21.2], c: '#ffd36b', k: 40 }, { p: [3.9, 2.4, 21.2], c: '#ffd36b', k: 40 }, { p: [21.5, 7, -3], c: '#fff6dc', k: 22 }, { p: [-6.8, 3.3, 8.6], c: '#ff9ab0', k: 30 },
    ],
  });

  // ---------- own carpets and chase lights ----------
  const carpet = edges.filter((e) => e.flag === 'carpet');
  ribbons(sc, nodes, carpet, { top: RED_C, border: BRASS, stud: '#ffe39a' });
  const chase = chaseLights(sc, nodes, carpet, 1.02, ['#ffd36b', '#fff3d0', '#ff5a6e']);
  curbs(sc, nodes, carpet, 0.78, [BRASS_HI, BRASS], 0.75, 0.09);

  // ---------- free spots ----------
  const ZONES: [number, number, number][] = [[WHEEL.x, WHEEL.z, 9.2], [-21, -4, 5.4], [21.5, -3, 6.2], [-6.8, 9.6, 4], [6.6, 10.2, 4], [0, 21, 4.5]];
  const free = (x: number, z: number, rN: number, rE: number, m = 1.5) => inOutline(OUTLINE, x, z, m) && kit.clearOfPath(x, z, rN, rE) && ZONES.every(([lx, lz, r]) => Math.hypot(lx - x, lz - z) > r);

  const st = new Batch(), gl = new Batch();

  // balustrade: brass posts with glowing caps along the edge
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.6));
    for (let k = 0; k < n; k++) {
      const x = lerp(ax, bx, k / n) * 0.985, z = lerp(az, bz, k / n) * 0.985;
      st.add(CYL8, BRASS, x, 0.45, z, 0, 0, 0, 0.12, 0.9, 0.12);
      st.add(BOX, NAVY_D, x, 0.06, z, 0, 0, 0, 0.42, 0.12, 0.42);
      if (k % 2 === 0) gl.add(BULB, '#ffe39a', x, 1.0, z, 0, 0, 0, 0.16);
    }
  }
  trim(sc, OUTLINE.map(([x, z]) => [x * 0.985, z * 0.985] as P2), 0.9, 0.06, BRASS);

  // sunburst inlay around the wheel (skips the four bridge axes)
  for (let k = 0; k < 32; k++) {
    const a = ((k + 0.5) / 32) * TAU;
    const off = Math.min(...[0, 0.5, 1, 1.5, 2].map((q) => Math.abs(a - q * Math.PI)));
    if (off < 0.32) continue;
    const r0 = 7.2, r1 = k % 2 ? 9.0 : 10.2, rm = (r0 + r1) / 2;
    st.add(BOX, k % 2 ? BRASS : BRASS_HI, WHEEL.x + Math.cos(a) * rm, 0.012, WHEEL.z + Math.sin(a) * rm, 0, -a, 0, r1 - r0, 0.02, 0.32);
  }

  // ---------- the roulette wheel ----------
  const W = WHEEL;
  st.add(CYL, MAHO, W.x, 0.08, W.z, 0, 0, 0, 6.9, 0.16, 6.9);
  st.add(TOR, BRASS_HI, W.x, 0.17, W.z, Math.PI / 2, 0, 0, 6.7, 6.7, 2.4);
  for (let k = 0; k < 36; k++) { const a = (k / 36) * TAU; gl.add(BULB, k % 2 ? '#ff5a6e' : '#fff3d0', W.x + Math.cos(a) * 6.75, 0.3, W.z + Math.sin(a) * 6.75, 0, 0, 0, 0.13); }
  // turntable: deck + bridge (rotates in quarter turns)
  const tb = new Batch();
  tb.add(CYL, '#5a2a18', 0, 0.12, 0, 0, 0, 0, 6.2, 0.1, 6.2);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU + Math.PI / 8; tb.add(BOX, BRASS, Math.cos(a) * 5.2, 0.18, Math.sin(a) * 5.2, 0, -a + Math.PI / 4, 0, 0.5, 0.04, 0.5); }
  // the bridge along local x (west–east at rotation 0)
  tb.add(BOX, RED_C, 0, 0.66, 0, 0, 0, 0, 8.2, 0.1, 1.2);
  tb.add(BOX, BRASS, 0, 0.6, 0, 0, 0, 0, 8.4, 0.04, 1.5);
  for (const s of [-1, 1]) {
    tb.add(BOX, BRASS_HI, 0, 1.15, s * 0.72, 0, 0, 0, 8.2, 0.08, 0.08);
    for (let k = -4; k <= 4; k++) tb.add(CYL8, BRASS, k * 1.0, 0.85, s * 0.72, 0, 0, 0, 0.05, 0.6, 0.05);
    tb.add(CYL8, BRASS, s * 2.2, 0.26, 0, 0, 0, 0, 0.18, 0.35, 0.18);
  }
  for (const s of [-1, 1]) { tb.add(BOX, BRASS, s * 4.15, 0.3, 0, 0, 0, 0, 0.4, 0.5, 1.6); }
  const turn = new THREE.Group();
  turn.position.set(W.x, 0, W.z);
  turn.add(tb.mesh());
  sc.add(turn);
  // spinning number bowl
  const ringTex = ctex(512, 512, (g) => {
    g.translate(256, 256);
    for (let k = 0; k < 37; k++) {
      const a0 = (k / 37) * TAU, a1 = ((k + 1) / 37) * TAU, n = POCKETS[k];
      g.fillStyle = n === 0 ? '#1f8a4c' : RED.has(n) ? '#c8102e' : '#16161c';
      g.beginPath(); g.arc(0, 0, 254, a0, a1); g.arc(0, 0, 150, a1, a0, true); g.closePath(); g.fill();
      g.strokeStyle = '#f2cf74'; g.lineWidth = 2; g.stroke();
      g.save(); g.rotate((a0 + a1) / 2); g.translate(222, 0); g.rotate(Math.PI / 2);
      g.font = `900 22px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff6dc'; g.fillText(String(n), 0, 0);
      g.restore();
    }
  });
  const bowl = new THREE.Group();
  bowl.position.set(W.x, 0, W.z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(2.45, 4.15, 74, 1), new THREE.MeshToonMaterial({ map: ringTex, gradientMap: GRAD }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.2;
  ring.receiveShadow = true;
  const hb = new Batch();
  hb.add(CONE, MAHO, 0, 0.3, 0, 0, 0, 0, 2.45, 0.22, 2.45);
  hb.add(CYL, BRASS, 0, 0.36, 0, 0, 0, 0, 0.5, 0.14, 0.5);
  for (let k = 0; k < 4; k++) hb.add(BOX, BRASS_HI, 0, 0.42, 0, 0, (k * Math.PI) / 4, 0, 1.7, 0.06, 0.12);
  hb.add(TOR, BRASS_HI, 0, 0.24, 0, Math.PI / 2, 0, 0, 4.25, 4.25, 2.2);
  bowl.add(ring, hb.mesh(VC, false));
  sc.add(bowl);
  const ball = new THREE.Mesh(SPH, toon('#fffdf4'));
  ball.scale.setScalar(0.25);
  sc.add(ball);
  // the jeton that hovers over the wheel while the ball rolls
  const jb = new Batch();
  jb.add(CYL, '#ffffff', 0, 0, 0, 0, 0, 0, 1, 0.22, 1);
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; jb.add(BOX, '#fff6dc', Math.cos(a) * 0.86, 0, Math.sin(a) * 0.86, 0, -a, 0, 0.26, 0.24, 0.2); }
  jb.add(CYL, '#f2cf74', 0, 0, 0, 0, 0, 0, 0.55, 0.24, 0.55);
  const jetonMat = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, color: '#c8102e' });
  const jeton = new THREE.Mesh(jb.geometry(), jetonMat);
  jeton.visible = false;
  sc.add(jeton);
  // lamps at the two bridge gates (west dock entry and north dock entry): green open, red closed
  const gateLamps = new THREE.InstancedMesh(SPH_LO, glow(new THREE.MeshBasicMaterial({ color: '#ffffff' })), 2);
  const gatePos: [number, number][] = [];
  for (const e of [ids.we, ids.ns]) {
    const A = nodes[e.a], dx = A.x - W.x, dz = A.z - W.z, l = Math.hypot(dx, dz);
    const px = A.x + (dx / l) * 0.2 + (-dz / l) * 2.1, pz = A.z + (dz / l) * 0.2 + (dx / l) * 2.1;
    st.add(CYL8, BRASS, px, 1.3, pz, 0, 0, 0, 0.09, 2.6, 0.09); st.add(CYL8, NAVY_D, px, 0.1, pz, 0, 0, 0, 0.3, 0.2, 0.3);
    gatePos.push([px, pz]);
  }
  gatePos.forEach(([x, z], i) => { dummy.position.set(x, 2.75, z); dummy.scale.setScalar(0.34); dummy.updateMatrix(); gateLamps.setMatrixAt(i, dummy.matrix); });
  sc.add(gateLamps);
  // giant jeton stacks on the diagonals
  ([[1, 1], [-1, 1], [1, -1], [-1, -1]] as const).forEach(([sx, sz], i) => {
    const x = W.x + sx * 6.4, z = W.z + sz * 6.4;
    if (!kit.clearOfPath(x, z, 2.2, 1.4)) return;
    const cols = [['#c8102e', '#16161c', '#1f8a4c'], ['#2b6cff', '#c8102e', '#f2cf74'], ['#16161c', '#f2cf74', '#c8102e'], ['#1f8a4c', '#2b6cff', '#16161c']][i];
    for (let k = 0; k < 5 + i; k++) st.add(CYL, cols[k % 3], x + Math.sin(k) * 0.06, 0.12 + k * 0.24, z, 0, 0, 0, 0.75, 0.22, 0.75);
  });

  // ---------- hotel façade at the back ----------
  const HZ = -31;
  st.add(BOX, NAVY_D, 0, -1.2, HZ + 0.5, 0, 0, 0, 52, 2.6, 10);
  st.add(BOX, BRASS, 0, 0.12, HZ + 5.4, 0, 0, 0, 52, 0.24, 0.3);
  const winTex = ctex(64, 128, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#8f8fb8'; for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) g.fillRect(6 + i * 20, 8 + j * 20, 12, 13); });
  const winEmi = ctex(64, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128); for (let i = 0; i < 3; i++) for (let j = 0; j < 6; j++) if (Math.random() < 0.62) { g.fillStyle = Math.random() < 0.8 ? '#ffd88a' : '#fff3d0'; g.fillRect(6 + i * 20, 8 + j * 20, 12, 13); } });
  const hotelMat = glowEmi(new THREE.MeshToonMaterial({ map: winTex, emissiveMap: winEmi, emissive: '#ffffff', emissiveIntensity: 1.0, gradientMap: GRAD }), 1.2);
  kit.atmo.emissive(hotelMat, 0.5, 1.35);
  const mods: { x: number; y: number; z: number; w: number; h: number; d: number; c: string }[] = [];
  const block = (cx: number, cz: number, w: number, d: number, y0: number, h: number, c: string) => {
    const nx = Math.max(1, Math.round(w / 3.6)), ny = Math.max(1, Math.round(h / 6));
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) mods.push({ x: cx - w / 2 + (w / nx) * (i + 0.5), y: y0 + (h / ny) * j, z: cz, w: w / nx, h: h / ny, d, c });
  };
  block(0, HZ, 44, 6, 0, 10, '#2c3770');
  block(-18, HZ - 0.5, 8, 7, 10, 6, '#33407e');
  block(18, HZ - 0.5, 8, 7, 10, 6, '#33407e');
  block(0, HZ - 0.5, 14, 7, 10, 8, '#33407e');
  block(0, HZ - 1, 9, 6, 18, 6, '#3a488c');
  block(0, HZ - 1.5, 5, 5, 24, 5, '#42509a');
  const BG = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const hotel = new THREE.InstancedMesh(BG, hotelMat, mods.length);
  mods.forEach((m, i) => { dummy.position.set(m.x, m.y, m.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(m.w, m.h, m.d); dummy.updateMatrix(); hotel.setMatrixAt(i, dummy.matrix); hotel.setColorAt(i, _c.set(m.c)); });
  hotel.castShadow = true;
  sc.add(hotel);
  aoAdd(sc, 0, HZ + 0.6, 50, 10.5, 0, 0.8);
  // chimneys on the wing roofs
  for (const sx of [-1, 1]) {
    st.add(BOX, '#6a5a8a', sx * 20, 17.0, HZ - 2, 0, 0, 0, 0.8, 2.0, 0.8); st.add(BOX, BRASS, sx * 20, 18.05, HZ - 2, 0, 0, 0, 1.0, 0.14, 1.0);
    air.push({ kind: 'smoke', x: sx * 20, z: HZ - 2, r: 0.1, n: 10, y0: 18.2, size: 1.6 });
  }
  // cornices, fins, crown and spire
  ([[0, 10, 44.6, 6.6], [-18, 16, 8.6, 7.6], [18, 16, 8.6, 7.6], [0, 18, 14.6, 7.6], [0, 24, 9.6, 6.6], [0, 29, 5.6, 5.6]] as const).forEach(([x, y, w, d], i) => {
    st.add(BOX, i % 2 ? BRASS_HI : BRASS, x, y + 0.15, HZ - (i > 0 ? 0.5 + (i > 3 ? (i - 3) * 0.5 : 0) : 0), 0, 0, 0, w, 0.3, d);
  });
  for (let k = -3; k <= 3; k++) st.add(BOX, BRASS, k * 1.25, 21, HZ + 2.05, 0, 0, 0, 0.18, 6.2, 0.2);
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) st.add(BOX, BRASS, s * (19.5 + k * 1.2 - 1.2), 13, HZ + 3.05, 0, 0, 0, 0.18, 5.6, 0.2);
  st.addM(new THREE.ConeGeometry(1.2, 5, 4), BRASS_HI, new THREE.Matrix4().makeTranslation(0, 31.7, HZ - 1.5));
  for (let k = 0; k < 9; k++) {
    const a = Math.PI * (k / 8);
    gl.beam([0, 29.3, HZ + 1.1], [Math.cos(a) * 4.6, 29.3 + Math.sin(a) * 4.6, HZ + 1.1], 0.09, k % 2 ? '#fff3d0' : '#ffd36b');
  }
  gl.add(SPH, '#ff5a6e', 0, 34.4, HZ - 1.5, 0, 0, 0, 0.45);
  // entrance canopy with bulbs
  st.add(BOX, BRASS, 0, 3.8, HZ + 4, 0, 0, 0, 9, 0.35, 2.6);
  for (let k = -4; k <= 4; k++) gl.add(BULB, '#fff3d0', k * 1.05, 3.55, HZ + 5.3, 0, 0, 0, 0.13);
  for (const s of [-1, 1]) st.add(CYL8, BRASS, s * 4.2, 1.9, HZ + 5, 0, 0, 0, 0.12, 3.8, 0.12);
  const titleTex = signTex('PALAIS LUMEN', { w: 768, h: 128, bg: '#0b1030', fg: '#ffe7a8', frame: BRASS_HI, glow: '#ffb84a', bulbs: '#fff3d0', size: 86 });
  sc.add(signMesh(titleTex, 17, 2.8, 0, 7.4, HZ + 3.06));
  // the Jackpot sign on the tower (redrawn when the Jackpot changes)
  const jpCanvas = document.createElement('canvas');
  jpCanvas.width = 512; jpCanvas.height = 192;
  const jpTex = new THREE.CanvasTexture(jpCanvas);
  jpTex.colorSpace = THREE.SRGBColorSpace;
  let jpShown = -1;
  const drawJackpot = (v: number, hot = false) => {
    if (v === jpShown && !hot) return;
    jpShown = v;
    const g = jpCanvas.getContext('2d')!;
    g.fillStyle = hot ? '#3a0d18' : '#0b1030'; g.fillRect(0, 0, 512, 192);
    g.strokeStyle = BRASS_HI; g.lineWidth = 10; g.strokeRect(10, 10, 492, 172);
    g.fillStyle = '#ff5a6e';
    for (let x = 26; x < 500; x += 28) { g.beginPath(); g.arc(x, 10, 5, 0, TAU); g.arc(x, 182, 5, 0, TAU); g.fill(); }
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `italic 900 46px ${FONT}`; g.fillStyle = '#ffe7a8'; g.fillText('JACKPOT', 256, 58);
    g.font = `italic 900 84px ${FONT}`; g.shadowColor = '#ffb84a'; g.shadowBlur = 18; g.fillStyle = '#fff6dc'; g.fillText(String(v), 256, 128); g.shadowBlur = 0;
    jpTex.needsUpdate = true;
  };
  drawJackpot(10);
  const jpSign = new THREE.Mesh(new THREE.PlaneGeometry(7.2, 2.7), new THREE.MeshBasicMaterial({ map: jpTex }));
  jpSign.position.set(0, 15, HZ + 3.06);
  sc.add(jpSign);

  // ---------- fountain (west court) ----------
  const FO = { x: -21, z: -4 };
  st.add(CYL, '#e6dcc8', FO.x, 0.3, FO.z, 0, 0, 0, 4.3, 0.6, 4.3);
  aoAdd(sc, FO.x, FO.z, 10.5, 10.5, 0, 0.6);
  st.add(CYL, '#2f5fc4', FO.x, 0.5, FO.z, 0, 0, 0, 3.9, 0.3, 3.9);
  st.add(TOR, BRASS_HI, FO.x, 0.62, FO.z, Math.PI / 2, 0, 0, 4.25, 4.25, 2);
  st.add(CYL, '#e6dcc8', FO.x, 1.2, FO.z, 0, 0, 0, 0.6, 1.6, 0.6);
  st.add(CYL, '#e6dcc8', FO.x, 2.1, FO.z, 0, 0, 0, 2.1, 0.3, 2.1);
  st.add(CYL, '#4f86e8', FO.x, 2.22, FO.z, 0, 0, 0, 1.9, 0.1, 1.9);
  st.add(CYL, '#e6dcc8', FO.x, 2.9, FO.z, 0, 0, 0, 0.35, 1.4, 0.35);
  st.add(CYL, '#e6dcc8', FO.x, 3.6, FO.z, 0, 0, 0, 1.1, 0.22, 1.1);
  st.add(SPH, BRASS_HI, FO.x, 4.2, FO.z, 0, 0, 0, 0.42);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; gl.add(BULB, '#9fe3ff', FO.x + Math.cos(a) * 3.2, 0.68, FO.z + Math.sin(a) * 3.2, 0, 0, 0, 0.16); }
  const jetsB = new Batch();
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; jetsB.beam([Math.cos(a) * 3.3, 0.6, Math.sin(a) * 3.3], [Math.cos(a) * 1.8, 2.6, Math.sin(a) * 1.8], 0.12, '#bff0ff', CONE); }
  jetsB.add(CONE, '#bff0ff', 0, 4.9, 0, 0, 0, 0, 0.3, 1.6, 0.3);
  jetsB.add(CYL, '#bff0ff', 0, 1.35, 0, 0, 0, 0, 2.0, 1.5, 2.0);
  const jets = new THREE.Mesh(jetsB.geometry(), new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0.42, depthWrite: false }));
  jets.position.set(FO.x, 0, FO.z);
  sc.add(jets);

  // ---------- Ballsaal pavilion with the chandelier (east court) ----------
  const BS = { x: 21.5, z: -3 };
  st.add(CYL, NAVY_D, BS.x, 0.06, BS.z, 0, 0, 0, 5.2, 0.12, 5.2);
  aoAdd(sc, BS.x, BS.z, 12, 12, 0, 0.45);
  kit.atmo.lampLights([[BS.x, 6.4, BS.z]], '#fff0c8', { r: 3.6, pool: 5.2, ground: 0.2, base: 0.9 });
  air.push({ kind: 'confetti', x: BS.x, z: BS.z, r: 6, n: 40, y0: 0.2, y1: 7 });
  for (let k = 0; k < 16; k++) st.addM(new THREE.CylinderGeometry(4.8, 4.8, 0.06, 2, 1, false, (k * TAU) / 16, TAU / 16), k % 2 ? CREAM : '#1e1e2a', new THREE.Matrix4().makeTranslation(BS.x, 0.14, BS.z));
  st.add(TOR, BRASS_HI, BS.x, 0.16, BS.z, Math.PI / 2, 0, 0, 5.0, 5.0, 2);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, x = BS.x + Math.cos(a) * 4.6, z = BS.z + Math.sin(a) * 4.6;
    st.add(CYL8, BRASS, x, 3.3, z, 0, 0, 0, 0.16, 6.6, 0.16);
    st.add(BOX, BRASS_HI, x, 0.3, z, 0, a, 0, 0.5, 0.6, 0.5);
    st.beam([x, 6.6, z], [BS.x, 10.2, BS.z], 0.08, BRASS);
    gl.add(BULB, '#fff3d0', x, 6.75, z, 0, 0, 0, 0.2);
  }
  st.add(TOR, BRASS_HI, BS.x, 6.6, BS.z, Math.PI / 2, 0, 0, 4.6, 4.6, 2.5);
  st.add(SPH, BRASS_HI, BS.x, 10.3, BS.z, 0, 0, 0, 0.35);
  const chand = new THREE.Group();
  chand.position.set(BS.x, 10.1, BS.z);
  const cb = new Batch(), cg = new Batch();
  cb.add(CYL8, BRASS, 0, -1.2, 0, 0, 0, 0, 0.05, 2.4, 0.05);
  cb.add(TOR, BRASS_HI, 0, -2.6, 0, Math.PI / 2, 0, 0, 1.6, 1.6, 2.4);
  cb.add(TOR, BRASS_HI, 0, -3.3, 0, Math.PI / 2, 0, 0, 1.0, 1.0, 2.4);
  cb.add(CONE, BRASS, 0, -3.6, 0, Math.PI, 0, 0, 0.6, 1.0, 0.6);
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU;
    cb.beam([0, -2.0, 0], [Math.cos(a) * 1.6, -2.6, Math.sin(a) * 1.6], 0.03, BRASS);
    cg.add(BULB, '#fff6dc', Math.cos(a) * 1.6, -2.35, Math.sin(a) * 1.6, 0, 0, 0, 0.16);
    cg.add(CONE, '#cfefff', Math.cos(a) * 1.6, -2.95, Math.sin(a) * 1.6, Math.PI, 0, 0, 0.1, 0.5, 0.1);
    if (k % 2 === 0) cg.add(CONE, '#cfefff', Math.cos(a) * 1.0, -3.65, Math.sin(a) * 1.0, Math.PI, 0, 0, 0.08, 0.45, 0.08);
  }
  chand.add(cb.mesh(VC, false), cg.mesh(GLOW, false, false));
  sc.add(chand);

  // ---------- Lumen-Bar (south west) ----------
  const BAR = { x: -6.8, z: 9.6 };
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * 0.15 + (k / 6) * Math.PI * 0.7, x = BAR.x + Math.cos(a) * 2.4, z = BAR.z + Math.sin(a) * 2.4;
    st.add(BOX, MAHO, x, 0.55, z, 0, -a + Math.PI / 2, 0, 1.15, 1.1, 0.6);
    st.add(BOX, BRASS_HI, x, 1.13, z, 0, -a + Math.PI / 2, 0, 1.2, 0.08, 0.75);
    const sx = BAR.x + Math.cos(a) * 3.3, sz = BAR.z + Math.sin(a) * 3.3;
    st.add(CYL8, BRASS, sx, 0.4, sz, 0, 0, 0, 0.06, 0.8, 0.06); st.add(CYL, RED_C, sx, 0.85, sz, 0, 0, 0, 0.32, 0.12, 0.32);
  }
  st.add(BOX, MAHO, BAR.x, 1.4, BAR.z - 1.3, 0, 0, 0, 4.6, 2.8, 0.5);
  aoAdd(sc, BAR.x, BAR.z, 8, 7, 0, 0.55);
  for (let r = 0; r < 2; r++) for (let k = 0; k < 9; k++) {
    gl.add(CYL8, ['#7dff8a', '#ffd36b', '#ff5a6e', '#9fe3ff'][(k + r) % 4], BAR.x - 2 + k * 0.5, 1.15 + r * 0.9, BAR.z - 1.0, 0, 0, 0, 0.1, 0.5, 0.1);
  }
  // champagne tower
  for (let lv = 0; lv < 4; lv++) for (let k = 0; k < 4 - lv; k++) gl.add(CONE, '#fff3b0', BAR.x - 0.6 + k * 0.4 + lv * 0.2, 1.4 + lv * 0.3, BAR.z + 0.2, Math.PI, 0, 0, 0.16, 0.3, 0.16);
  const barSign = signMesh(signTex('BAR', { w: 256, h: 96, fg: '#ff9ab0', frame: '#ff5a6e', glow: '#ff5a6e', size: 66 }), 2.4, 0.9, BAR.x, 3.3, BAR.z - 1.0);
  sc.add(barSign);

  // ---------- Wintergarten (south east): glass dome on a brass frame, palms inside ----------
  const WG = { x: 6.6, z: 10.2 };
  st.add(CYL8, CREAM, WG.x, 0.12, WG.z, 0, Math.PI / 8, 0, 3.6, 0.24, 3.6);
  aoAdd(sc, WG.x, WG.z, 9, 9, 0, 0.5);
  air.push({ kind: 'firefly', x: WG.x, z: WG.z, r: 2.6, n: 7, y0: 0.8, y1: 3.4 });
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * TAU, x = WG.x + Math.cos(a) * 3.3, z = WG.z + Math.sin(a) * 3.3;
    st.add(CYL8, BRASS, x, 1.3, z, 0, 0, 0, 0.09, 2.6, 0.09);
    st.beam([x, 2.6, z], [WG.x, 5.6, WG.z], 0.06, BRASS);
  }
  st.add(TOR, BRASS_HI, WG.x, 2.6, WG.z, Math.PI / 2, 0, 0, 3.3, 3.3, 2);
  const dome = new THREE.Mesh(HEMI, new THREE.MeshBasicMaterial({ color: '#8fe0d0', transparent: true, opacity: 0.22, depthWrite: false }));
  dome.scale.set(3.3, 3.0, 3.3);
  dome.position.set(WG.x, 2.6, WG.z);
  sc.add(dome);
  const palm = (x: number, z: number, s: number, pot = true) => {
    if (pot) { st.add(CYL8, BRASS, x, 0.35 * s, z, 0, 0, 0, 0.55 * s, 0.7 * s, 0.55 * s); st.add(CYL8, NAVY_D, x, 0.72 * s, z, 0, 0, 0, 0.5 * s, 0.06, 0.5 * s); }
    for (let k = 0; k < 4; k++) st.add(CYL8, '#8a5a32', x + k * 0.05 * s, (0.9 + k * 0.55) * s, z, 0, 0, 0.05 * k, 0.16 * s, 0.6 * s, 0.16 * s);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU;
      st.add(LEAF, k % 2 ? '#2fa36a' : '#3fc47e', x + Math.cos(a) * 0.9 * s, 3.1 * s, z + Math.sin(a) * 0.9 * s, 0, -a, 0.35, 1.0 * s, 0.12 * s, 0.32 * s);
    }
  };
  palm(WG.x - 0.9, WG.z, 0.95, false);
  palm(WG.x + 1.1, WG.z + 0.6, 0.75, false);
  st.add(SPH_LO, '#ff7ab8', WG.x + 0.3, 0.5, WG.z - 1.6, 0, 0, 0, 0.5, 0.4, 0.5);

  // ---------- Foyer: start marquee in front, red carpet, torches ----------
  st.add(BOX, RED_C, 0, 0.03, 19.6, 0, 0, 0, 3, 0.04, 4.2);
  for (const s of [-1, 1]) { st.add(BOX, BRASS, s * 3.9, 1.1, 21.2, 0, 0, 0, 0.3, 2.2, 0.3); gl.add(SPH, '#ffd36b', s * 3.9, 2.4, 21.2, 0, 0, 0, 0.3); }
  const startSign = signMesh(signTex('★ START ★', { w: 512, h: 120, fg: '#ffe7a8', frame: BRASS_HI, glow: '#ffb84a', bulbs: '#fff3d0', size: 74 }), 7.4, 1.75, 0, 1.45, 21.3);
  sc.add(startSign);
  air.push({ kind: 'confetti', x: 0, z: 18.5, r: 5, n: 26, y0: 0.2, y1: 5 });

  // ---------- card tables, slot machines, a vintage car ----------
  const placed: [number, number][] = [];
  const tryPlace = (x: number, z: number, rN: number, rE: number, gap: number) => {
    if (!free(x, z, rN, rE) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) return false;
    placed.push([x, z]);
    return true;
  };
  let tables = 0;
  for (const [x, z] of [[-24, 6], [-17.5, 6.5], [-27, -12], [-15, -12.5], [-26.5, 1], [24.5, 7], [18, 7.5], [27, -12], [-3, -21.5], [4, -21.8], [-24.5, 17.5], [26, 17.3]] as const) {
    if (!tryPlace(x, z, 3.2, 2.6, 4)) continue;
    const yaw = (tables * 0.7) % TAU;
    st.add(CYL, '#1f7a52', x, 0.92, z, 0, yaw, 0, 1.5, 0.12, 0.95);
    aoAdd(sc, x, z, 5, 4, yaw, 0.5);
    st.add(CYL, MAHO, x, 0.84, z, 0, yaw, 0, 1.65, 0.12, 1.08);
    st.add(CYL8, BRASS, x, 0.42, z, 0, 0, 0, 0.18, 0.84, 0.18);
    for (let k = 0; k < 4; k++) {
      const a = yaw + (k / 4) * TAU + 0.4, cx = x + Math.cos(a) * 1.75, cz = z - Math.sin(a) * 1.15;
      st.add(BOX, RED_C, cx, 0.55, cz, 0, a, 0, 0.55, 0.12, 0.55); st.add(BOX, RED_C, cx + Math.cos(a) * 0.25, 0.85, cz - Math.sin(a) * 0.25, 0, a, 0, 0.1, 0.55, 0.55);
    }
    for (let k = 0; k < 3; k++) st.add(CYL, ['#c8102e', '#16161c', '#2b6cff'][k], x - 0.5 + k * 0.5, 1.05 + (k % 2) * 0.1, z + 0.2, 0, 0, 0, 0.18, 0.1 + (k % 2) * 0.2, 0.18);
    tables++;
  }
  // slot machines along the front left
  for (let k = 0; k < 6; k++) {
    const x = -31 + k * 1.7, z = 20.1;
    if (!free(x, z, 2.2, 1.6, 0.8)) continue;
    st.add(BOX, k % 2 ? '#3a488c' : RED_C, x, 1.0, z, 0, 0, 0, 1.3, 2.0, 0.9);
    aoAdd(sc, x, z, 2.1, 1.7, 0, 0.6);
    st.add(BOX, BRASS_HI, x, 2.1, z, 0, 0, 0, 1.4, 0.2, 1.0);
    gl.add(BOX, '#fff3d0', x, 1.35, z + 0.46, 0, 0, 0, 0.95, 0.55, 0.02);
    for (let r = 0; r < 3; r++) gl.add(BOX, ['#ff5a6e', '#ffd36b', '#7dff8a'][(r + k) % 3], x - 0.3 + r * 0.3, 1.35, z + 0.475, 0, 0, 0, 0.2, 0.3, 0.02);
    st.add(CYL8, BRASS, x + 0.75, 1.3, z, 0, 0, 0, 0.05, 0.8, 0.05); gl.add(BULB, '#ff5a6e', x + 0.75, 1.75, z, 0, 0, 0, 0.12);
  }
  // vintage car at the front right
  const CAR = { x: 27.5, z: 19.6 };
  if (free(CAR.x, CAR.z, 3, 2.2, 0.5)) {
    st.add(BOX, '#13183a', CAR.x, 0.75, CAR.z, 0, 0, 0, 5.2, 0.7, 1.9);
    aoAdd(sc, CAR.x, CAR.z, 6.6, 3.0, 0, 0.7);
    st.add(BOX, '#13183a', CAR.x - 0.4, 1.4, CAR.z, 0, 0, 0, 2.4, 0.7, 1.7);
    st.add(BOX, '#9fd3ff', CAR.x - 0.4, 1.42, CAR.z, 0, 0, 0, 2.2, 0.5, 1.75);
    st.add(BOX, BRASS_HI, CAR.x + 2.62, 0.75, CAR.z, 0, 0, 0, 0.1, 0.55, 1.2);
    for (const sx of [-1.7, 1.7]) for (const sz of [-0.95, 0.95]) st.add(CYL, '#0a0a12', CAR.x + sx, 0.45, CAR.z + sz, Math.PI / 2, 0, 0, 0.45, 0.3, 0.45);
    for (const sz of [-0.6, 0.6]) gl.add(BULB, '#fff3d0', CAR.x + 2.66, 0.85, CAR.z + sz, 0, 0, 0, 0.16);
  }

  // ---------- lamps along the carpets ----------
  const lampPts: [number, number, number][] = [];
  nodes.forEach((n, i) => {
    if (i % 3 || !n.next.length) return;
    const nx = nodes[n.next[0]];
    const dx = nx.x - n.x, dz = nx.z - n.z, l = Math.hypot(dx, dz) || 1;
    const x = n.x + (-dz / l) * 2.1, z = n.z + (dx / l) * 2.1;
    if (!inOutline(OUTLINE, x, z, 0.8) || Math.hypot(x - W.x, z - W.z) < 7.4 || !kit.clearOfPath(x, z, 1.3, 1.0)) return;
    st.add(CYL8, NAVY_D, x, 0.12, z, 0, 0, 0, 0.26, 0.24, 0.26);
    st.add(CYL8, BRASS, x, 1.3, z, 0, 0, 0, 0.07, 2.4, 0.07);
    st.add(CONE, BRASS_HI, x, 2.5, z, Math.PI, 0, 0, 0.3, 0.25, 0.3);
    gl.add(SPH_LO, i % 2 ? '#ffd36b' : '#fff3d0', x, 2.85, z, 0, 0, 0, 0.28, 0.36, 0.28);
    lampPts.push([x, 2.7, z]);
    st.add(CONE, BRASS_HI, x, 3.3, z, 0, 0, 0, 0.18, 0.4, 0.18);
  });

  // ---------- potted palms and topiary cones on free spots ----------
  let greens = 0;
  for (let k = 0; k < 700 && greens < 44; k++) {
    const x = rand(-34, 34), z = rand(-23, 21);
    if (!tryPlace(x, z, 2.2, 1.7, 2.6)) continue;
    aoAdd(sc, x, z, 2.2, 2.2, 0, 0.55);
    if (greens % 3 === 2) palm(x, z, rand(0.75, 0.95));
    else {
      if (greens % 4 === 1) air.push({ kind: 'firefly', x, z, r: 1.8, n: 2, y0: 1, y1: 3 });
      st.add(CYL8, BRASS, x, 0.3, z, 0, 0, 0, 0.45, 0.6, 0.45);
      st.add(CONE, greens % 2 ? '#2fa36a' : '#24875a', x, 1.5, z, 0, 0, 0, 0.6, 1.9, 0.6);
      gl.add(BULB, '#ffd36b', x, 2.5, z, 0, 0, 0, 0.1);
    }
    greens++;
  }

  // ---------- searchlights at the back corners ----------
  const beams: THREE.Group[] = [];
  const beamMat = new THREE.MeshBasicMaterial({ color: '#fff3c8', map: coneMap(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  kit.atmo.beam(beamMat, 0.15, 0.3);
  const beamGeo = new THREE.ConeGeometry(3.2, 46, 14, 1, true).translate(0, -23, 0);
  for (const [x, z] of [[-33.2, -20.2], [33.2, -20.2]] as const) {
    st.add(CYL, NAVY_D, x, 0.3, z, 0, 0, 0, 1.2, 0.6, 1.2);
    st.add(BOX, BRASS, x, 1.2, z, 0, 0, 0, 0.5, 1.4, 1.2);
    st.add(CYL, '#2a2f55', x, 2.1, z, Math.PI / 2, 0, 0, 0.8, 1.0, 0.8);
    gl.add(CYL, '#fff3c8', x, 2.1, z - 0.52, Math.PI / 2, 0, 0, 0.66, 0.06, 0.66);
    const g = new THREE.Group();
    g.position.set(x, 2.1, z);
    const b = new THREE.Mesh(beamGeo, beamMat);
    b.rotation.x = -2.55;
    g.add(b);
    sc.add(g);
    beams.push(g);
  }

  // ---------- details: ropes, planters, bistro tables, hotel balconies and flags (instanced) ----------
  {
    const ropes: Item[] = [], plant: Item[] = [], bistro: Item[] = [], balc: Item[] = [], flags: Item[] = [], awn: Item[] = [];
    carpet.forEach((e, i) => {
      if (i % 4) return;
      const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      for (const sd of [-1, 1]) {
        const x = (A.x + B.x) / 2 + nx * sd * 1.55, z = (A.z + B.z) / 2 + nz * sd * 1.55;
        if (!inOutline(OUTLINE, x, z, 0.8) || !kit.clearOfPath(x, z, 1.5, 1.2) || Math.hypot(x - W.x, z - W.z) < 7.6) continue;
        ropes.push({ x, z, ry: Math.atan2(dx, dz) + Math.PI / 2, c: RED_C });
      }
    });
    for (let k = 0; k < 900 && plant.length < 24; k++) {
      const x = rand(-34, 34), z = rand(-23, 20.5);
      if (!tryPlace(x, z, 1.8, 1.4, 2.0)) continue;
      plant.push({ x, z, ry: rand(0, TAU), c: k % 2 ? CREAM : BRASS });
    }
    for (let k = 0; k < 6; k++) {
      const a = Math.PI * 1.05 + k * 0.33, x = BAR.x + Math.cos(a) * 4.6, z = BAR.z + Math.sin(a) * 4.6 + 2.2;
      if (tryPlace(x, z, 1.6, 1.2, 1.5)) bistro.push({ x, z, ry: a, c: ['#fff3d0', '#ff9ab0'][k % 2] });
    }
    for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) balc.push({ x: sx * (12 + i * 3.6), y: 2.4 + j * 2.6, z: HZ + 3, sx: 2.4, c: BRASS_HI });
    for (const [x, y] of [[-18, 16.3], [18, 16.3], [-6.5, 18.3], [6.5, 18.3], [-3.8, 24.3], [3.8, 24.3]] as const) flags.push({ x, y, z: HZ + 0.5, c: ['#c8102e', BRASS_HI, '#2b6cff'][Math.abs(Math.round(x)) % 3] });
    for (const sx of [-1, 1]) for (let i = 0; i < 2; i++) awn.push({ x: sx * (8 + i * 4.2), y: 2.0, z: HZ + 3.35, sx: 3.0, c: i ? RED_C : '#1f8a4c' });
    instanced(sc, PROPS.rope(), ropes);
    instanced(sc, PROPS.planter(), plant);
    instanced(sc, PROPS.bistro(), bistro);
    instanced(sc, PROPS.balcony(), balc, { cast: false });
    instanced(sc, PROPS.awning(), awn);
    instanced(sc, FLAG, flags);
  }
  // ---------- ambient life: guests strolling, gondolas on the pool ----------
  const circle = (cx: number, cz: number, r: number): P2[] => Array.from({ length: 28 }, (_, k) => [cx + Math.cos((k / 28) * TAU) * r, cz + Math.sin((k / 28) * TAU) * r] as P2);
  const GUESTS = ['#16161c', '#c8102e', '#f3e6c4', '#2b6cff', '#ff9ab0', '#1f8a4c'];
  loopers(sc, PERSON, circle(FO.x, FO.z, 5.0), 6, { speed: 0.6, colors: GUESTS, scale: 0.85, bob: 0.04 });
  loopers(sc, PERSON, circle(BS.x, BS.z, 3.6), 6, { speed: 0.8, dir: -1, colors: GUESTS, scale: 0.85, bob: 0.05 });
  {
    const prom: P2[] = [];
    for (let x = -24; x <= 24; x += 3) prom.push([x, 21.2]);
    const back = prom.slice(1, -1).reverse().map(([x, z]) => [x, z - 0.6] as P2);
    loopers(sc, PERSON, [...prom, ...back], 10, { speed: 0.8, colors: GUESTS, scale: 0.85, bob: 0.04 });
  }
  loopers(sc, BOAT, roundRect(-46, 46, -36, 31, 9, 6), 6, { y: -1.2, speed: 1.6, colors: ['#c8102e', '#16161c', '#f3e6c4', BRASS_HI], scale: 1.1 });

  sc.add(st.mesh(), gl.mesh(GLOW, false, false));
  kit.atmo.lampLights(lampPts, '#ffe0a0', { r: 1.6 });
  kit.atmo.lampLights([[-3.9, 2.3, 21.2], [3.9, 2.3, 21.2]], '#ffc860', { r: 1.5 });
  air.push({ kind: 'dust', x: 0, z: -2, r: 30, n: 80, y0: 0.4, y1: 5 });
  kit.atmo.air(air);

  // ---------- fireworks (Jackpot-Gala) ----------
  const FW_N = 96;
  const fw = new THREE.InstancedMesh(BULB, glow(new THREE.MeshBasicMaterial({ color: '#ffffff' })), FW_N);
  fw.visible = false;
  fw.frustumCulled = false;
  fw.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const fwP = new Float32Array(FW_N * 3), fwV = new Float32Array(FW_N * 3), fwL = new Float32Array(FW_N);
  const FW_COL = ['#ffd36b', '#ff5a6e', '#9fe3ff', '#7dff8a', '#fff3d0', '#ff9ab0'].map((c) => new THREE.Color(c));
  dummy.scale.setScalar(0);
  dummy.position.set(0, -50, 0);
  dummy.updateMatrix();
  for (let i = 0; i < FW_N; i++) { fw.setMatrixAt(i, dummy.matrix); fw.setColorAt(i, FW_COL[i % FW_COL.length]); }
  sc.add(fw);
  let fwNext = 0, fwSlot = 0, fwLive = 0;
  const burst = (x: number, y: number, z: number) => {
    const col = FW_COL[Math.floor(Math.random() * FW_COL.length)];
    for (let k = 0; k < 16; k++) {
      const i = fwSlot;
      fwSlot = (fwSlot + 1) % FW_N;
      const a = (k / 16) * TAU, e = rand(-0.6, 0.9), sp = rand(5, 8);
      fwP[i * 3] = x; fwP[i * 3 + 1] = y; fwP[i * 3 + 2] = z;
      fwV[i * 3] = Math.cos(a) * Math.cos(e) * sp; fwV[i * 3 + 1] = Math.sin(e) * sp; fwV[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      fwL[i] = 1.3;
      fw.setColorAt(i, col);
    }
    fwLive = 1.5;
    fw.visible = true;
    if (fw.instanceColor) fw.instanceColor.needsUpdate = true;
  };

  // ---------- state ----------
  let turnA = 0, bowlA = 0, ballA = 0, ballR = 4.0, ballMode: 'hidden' | 'spin' | 'locked' = 'hidden', ballK = 0, galaOn = false, flashT = 0;
  const setLamps = (weOpen: boolean) => {
    gateLamps.setColorAt(0, _c.set(weOpen ? '#7dff8a' : '#ff3d6e'));
    gateLamps.setColorAt(1, _c.set(weOpen ? '#ff3d6e' : '#7dff8a'));
    if (gateLamps.instanceColor) gateLamps.instanceColor.needsUpdate = true;
  };
  const setBall = () => { ball.position.set(W.x + Math.cos(ballA) * ballR, 0.34, W.z + Math.sin(ballA) * ballR); };
  /** Board angle of pocket k's centre right now (the bowl turns with rotation.y = bowlA). */
  const pocketA = (k: number) => ((k + 0.5) / 37) * TAU - bowlA;

  return {
    overview: { x: 0, z: -3, w: 78, d: 54 },
    apply(bs) {
      const wheel = Number(bs.wheel) || 0;
      turnA = -wheel * (Math.PI / 2);
      turn.rotation.y = turnA;
      setLamps(wheel % 2 === 0);
      drawJackpot(Number(bs.jackpot) || 0);
      galaOn = !!bs.gala;
    },
    async play(name, data) {
      if (name === 'wheel') {
        const wheel = Number(data?.wheel) || 0;
        kit.look(W.x, W.z);
        await wait(600);
        sfx.creak();
        const from = turnA, to = -wheel * (Math.PI / 2), dest = from - Math.PI / 2;
        let tick = 0;
        await tween(2.0, (k) => {
          turnA = lerp(from, dest, k);
          turn.rotation.y = turnA;
          const t2 = Math.floor(k * 10);
          if (t2 !== tick) { tick = t2; sfx.wheel(); }
        }, E.inOut);
        turnA = to;
        turn.rotation.y = turnA;
        setLamps(wheel % 2 === 0);
        await wait(500);
        kit.follow();
      } else if (name === 'jeton') {
        const n = Number(data?.n) || 0;
        const k = Math.max(0, POCKETS.indexOf(n));
        kit.look(W.x, W.z);
        jetonMat.color.set(data?.color === 'rot' ? '#c8102e' : '#2a2a34');
        jeton.visible = true;
        await tween(0.4, (q) => { jeton.position.set(W.x, 3 + q * 1.2, W.z + 1); jeton.rotation.set(Math.PI / 2 * (1 - q), q * 4, 0); }, E.out);
        ballMode = 'spin';
        const a0 = ballA, spins = 3;
        let tick = 0;
        await tween(2.8, (q) => {
          const e = 1 - Math.pow(1 - q, 2.4);
          ballA = lerp(a0, pocketA(k) - spins * TAU, e);
          ballR = lerp(4.05, 3.35, Math.max(0, (q - 0.55) / 0.45));
          setBall();
          jeton.rotation.y += 0.05;
          const t2 = Math.floor(e * 26);
          if (t2 !== tick) { tick = t2; sfx.wheel(); }
        });
        ballMode = 'locked';
        ballK = k;
        sfx.pop();
        floatText(new THREE.Vector3(W.x, 2.6, W.z), `${n} ${n === 0 ? 'Grün' : RED.has(n) ? 'Rot' : 'Schwarz'}`, n === 0 ? '#7dff8a' : RED.has(n) ? '#ff6e8a' : '#fff6dc', sc);
        await wait(900);
        await tween(0.3, (q) => jeton.scale.setScalar(1 - q));
        jeton.visible = false;
        jeton.scale.setScalar(1);
        drawJackpot(Number(data?.jackpot) || 0);
        kit.follow();
      } else if (name === 'jackpot') {
        drawJackpot(Number(data?.jackpot) || 0, !!data?.flash);
        if (data?.flash) { flashT = 1.6; await wait(700); }
      } else if (name === 'gala') {
        const on = !!data?.on;
        galaOn = on;
        if (on) {
          drawJackpot(Number(data?.jackpot) || 0, true);
          kit.look(0, -14);
          await wait(400);
          for (let i = 0; i < 4; i++) { burst(rand(-16, 16), rand(11, 16), rand(-24, -14)); sfx.boom(); await wait(380); }
          await wait(600);
          kit.follow();
        }
      }
    },
    update(dt, t) {
      bowlA += dt * 0.35;
      bowl.rotation.y = bowlA;
      if (ballMode === 'locked') { ballA = pocketA(ballK); ballR = 3.35; setBall(); }
      ball.visible = ballMode !== 'hidden';
      chand.rotation.z = Math.sin(t * 0.7) * 0.04;
      chand.rotation.x = Math.sin(t * 0.53 + 1) * 0.03;
      jets.scale.set(1, 0.9 + Math.sin(t * 3.1) * 0.1, 1);
      for (let i = 0; i < beams.length; i++) beams[i].rotation.y = Math.sin(t * 0.35 + i * 2.1) * 1.1 + (i ? -0.5 : 0.5);
      flashT = Math.max(0, flashT - dt);
      chase.tick(dt, galaOn || flashT > 0 ? 1 : 0);
      // fireworks
      if (galaOn) { fwNext -= dt; if (fwNext <= 0) { fwNext = rand(0.7, 1.3); burst(rand(-26, 26), rand(10, 17), rand(-26, 6)); } }
      if (fwLive > 0) {
        fwLive -= dt;
        for (let i = 0; i < FW_N; i++) {
          if (fwL[i] <= 0) continue;
          fwL[i] -= dt;
          fwV[i * 3 + 1] -= 4 * dt;
          fwP[i * 3] += fwV[i * 3] * dt; fwP[i * 3 + 1] += fwV[i * 3 + 1] * dt; fwP[i * 3 + 2] += fwV[i * 3 + 2] * dt;
          dummy.position.set(fwP[i * 3], fwP[i * 3 + 1], fwP[i * 3 + 2]);
          dummy.scale.setScalar(fwL[i] > 0 ? 0.28 * Math.min(1, fwL[i] * 1.5) : 0);
          dummy.updateMatrix();
          fw.setMatrixAt(i, dummy.matrix);
        }
        fw.instanceMatrix.needsUpdate = true;
        if (fwLive <= 0) fw.visible = false;
      }
    },
  };
}
