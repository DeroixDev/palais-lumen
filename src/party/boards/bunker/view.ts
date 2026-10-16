// CS-Bunker in 3D (own shapes only): a concrete compound in the desert at dusk. Asphalt walkways
// with hazard edges, the conveyor belt (scrolling), the vault courtyard with its round door, the
// freight lift tower with the cabin, the command bunker with the radar dish, the west
// warehouse, the loading yard with containers and a gantry crane, rails with a mine cart along
// the Schienenweg, a water tower, floodlights, barrels, sandbags and lots of crates, warning
// beacons, and the Kistenregen crates for the Brettfest.
// Static parts are merged (Batch) or instanced; the animated parts are a handful of meshes.

import type { BoardDecor, BoardKit } from '../../view3d/boardview';
import {
  BOX, Batch, CONE, CYL, CYL8, GLOW, GRAD, HEMI, SPH_LO, THREE, TOR, ctex, skyTex, toon,
} from '../../view3d/kit';
import { sfx } from '../../sfx';
import { E, TAU, lerp, rand, tween, wait } from '../../util';
import { BULB, CYL6, LEAF, inOutline, plinth, ribbons, roundRect, signMesh, signTex, trim, type P2 } from '../bauteile';

const TENT = new THREE.CylinderGeometry(1.2, 1.2, 2.6, 3, 1).rotateX(-Math.PI / 2);
const CONC = '#a3a6ab', CONC_D = '#6f737a', STEEL = '#4a5562', HAZ = '#ffc61a', DARK = '#23272e', RUST = '#b5562a', OLIVE = '#5f6b3a';

export function bunkerDecor(kit: BoardKit, ids: { jv: number; vFirst: number; vault: number[]; oben: number; unten: number }): BoardDecor {
  const sc = kit.scene, nodes = kit.graph.nodes, edges = kit.graph.edges;
  sc.background = skyTex(['#33609e', '#6f9fd0', '#f1c08a', '#f59358']);
  sc.fog = new THREE.Fog('#e8bf92', 120, 330);
  kit.lights.hemi.color.set('#fff1dc');
  kit.lights.hemi.groundColor.set('#6a5a4a');
  kit.lights.hemi.intensity = 1.45;
  kit.lights.sun.color.set('#ffd9a8');
  kit.lights.sun.intensity = 2.25;
  const dummy = new THREE.Object3D();
  const _c = new THREE.Color();

  // ---------- compound plate (chamfered) and desert ----------
  const OUTLINE: P2[] = roundRect(-37, 37, -27, 22.5, 4, 1);
  const floorTex = ctex(256, 256, (g) => {
    g.fillStyle = '#9b9ea3'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { g.fillStyle = (i + j) % 2 ? '#a2a5aa' : '#979a9f'; g.fillRect(i * 64, j * 64, 64, 64); }
    g.strokeStyle = 'rgba(60,64,70,.5)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, 256); g.stroke(); g.beginPath(); g.moveTo(0, i * 64); g.lineTo(256, i * 64); g.stroke(); }
    for (let k = 0; k < 7; k++) { g.fillStyle = 'rgba(50,50,55,.12)'; g.beginPath(); g.ellipse(Math.random() * 256, Math.random() * 256, 8 + Math.random() * 14, 5 + Math.random() * 8, Math.random() * 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,198,26,.55)'; g.fillRect(0, 126, 256, 4);
  }, true);
  floorTex.repeat.set(1 / 10, 1 / 10);
  plinth(sc, OUTLINE, new THREE.MeshToonMaterial({ map: floorTex, gradientMap: GRAD }), '#7c6a55');
  trim(sc, OUTLINE, 0.06, 0.12, HAZ);
  const sandTex = ctex(128, 128, (g) => {
    g.fillStyle = '#dcb47e'; g.fillRect(0, 0, 128, 128);
    for (let k = 0; k < 90; k++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(170,120,70,.35)' : 'rgba(255,236,200,.45)'; g.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    g.strokeStyle = 'rgba(176,128,78,.4)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let k = 0; k < 5; k++) { const x = Math.random() * 100, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 12, y - 5, x + 24, y); g.stroke(); }
  }, true);
  sandTex.repeat.set(90, 90);
  const sand = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), new THREE.MeshBasicMaterial({ map: sandTex }));
  sand.rotation.x = -Math.PI / 2;
  sand.position.y = -1.0;
  sc.add(sand);

  // ---------- walkways and the conveyor belt ----------
  const walk = edges.filter((e) => e.flag === 'walk'), band = edges.filter((e) => e.flag === 'band');
  ribbons(sc, nodes, walk, { top: '#565b63', border: HAZ, stud: '#ffffff' });
  const beltTex = ctex(64, 128, (g) => {
    g.fillStyle = '#2b2f36'; g.fillRect(0, 0, 64, 128);
    g.strokeStyle = '#3f454e'; g.lineWidth = 4;
    for (let y = 0; y < 128; y += 16) { g.beginPath(); g.moveTo(0, y); g.lineTo(64, y); g.stroke(); }
    g.fillStyle = '#ffc61a';
    for (const y of [20, 84]) { g.beginPath(); g.moveTo(16, y + 22); g.lineTo(32, y); g.lineTo(48, y + 22); g.lineTo(40, y + 22); g.lineTo(32, y + 10); g.lineTo(24, y + 22); g.closePath(); g.fill(); }
  }, true);
  {
    const P: number[] = [], U: number[] = [], I: number[] = [];
    let v0 = 0;
    band.forEach((e, i) => {
      const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), nx = (-dz / L) * 0.62, nz = (dx / L) * 0.62;
      const ax = A.x - (dx / L) * 0.3, az = A.z - (dz / L) * 0.3, bx = B.x + (dx / L) * 0.3, bz = B.z + (dz / L) * 0.3, v1 = v0 + (L + 0.6) / 2.2;
      P.push(ax + nx, 0.13, az + nz, ax - nx, 0.13, az - nz, bx + nx, 0.13, bz + nz, bx - nx, 0.13, bz - nz);
      U.push(0, -v0, 1, -v0, 0, -v1, 1, -v1);
      const o = i * 4;
      I.push(o, o + 2, o + 1, o + 1, o + 2, o + 3);
      v0 = v1;
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    g.setIndex(I);
    g.computeVertexNormals();
    const belt = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: beltTex, gradientMap: GRAD, side: THREE.DoubleSide }));
    belt.receiveShadow = true;
    sc.add(belt);
  }

  // ---------- free spots ----------
  const TOWER = { x: 4.0, z: -1.8 };
  const ZONES: [number, number, number][] = [[-23, -3, 7.2], [21, -6.5, 6.5], [21.5, 5.5, 5], [-4, 3.5, 5.2], [TOWER.x, TOWER.z, 2.8], [-4.5, 11.5, 3.4], [0, 21, 4.5], [0.5, -20, 10.5]];
  const free = (x: number, z: number, rN: number, rE: number, m = 1.5) => inOutline(OUTLINE, x, z, m) && kit.clearOfPath(x, z, rN, rE) && ZONES.every(([lx, lz, r]) => Math.hypot(lx - x, lz - z) > r);
  const placed: [number, number][] = [];
  const tryPlace = (x: number, z: number, rN: number, rE: number, gap: number) => {
    if (!free(x, z, rN, rE) || placed.some(([px, pz]) => Math.hypot(px - x, pz - z) < gap)) return false;
    placed.push([x, z]);
    return true;
  };

  const st = new Batch(), gl = new Batch();

  // perimeter: concrete barriers with hazard caps
  for (let i = 0; i < OUTLINE.length; i++) {
    const [ax, az] = OUTLINE[i], [bx, bz] = OUTLINE[(i + 1) % OUTLINE.length];
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 2.4)), yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const x = lerp(ax, bx, (k + 0.5) / n) * 0.982, z = lerp(az, bz, (k + 0.5) / n) * 0.982;
      st.add(BOX, CONC, x, 0.4, z, 0, yaw, 0, 0.55, 0.8, (L / n) * 0.9);
      st.add(BOX, k % 2 ? HAZ : DARK, x, 0.84, z, 0, yaw, 0, 0.6, 0.1, (L / n) * 0.9);
    }
  }

  // conveyor frame: side rails and rollers
  for (const e of band) {
    const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), nx = -dz / L, nz = dx / L;
    for (const s of [-1, 1]) st.add(BOX, STEEL, (A.x + B.x) / 2 + nx * s * 0.72, 0.16, (A.z + B.z) / 2 + nz * s * 0.72, 0, yaw, 0, 0.16, 0.3, L + 0.4);
    st.add(BOX, DARK, (A.x + B.x) / 2, 0.06, (A.z + B.z) / 2, 0, yaw, 0, 1.4, 0.12, L + 0.4);
    for (let k = 0; k < 3; k++) { const t = (k + 0.5) / 3; st.add(CYL8, HAZ, lerp(A.x, B.x, t) + nx * 0.86, 0.2, lerp(A.z, B.z, t) + nz * 0.86, 0, 0, 0, 0.1, 0.4, 0.1); }
  }

  // ---------- crates (instanced, one texture) ----------
  const crateTex = ctex(128, 128, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 128);
    g.fillStyle = '#d9d2c4';
    for (let y = 0; y < 128; y += 21) g.fillRect(0, y, 128, 2);
    g.strokeStyle = '#7a6a54'; g.lineWidth = 12; g.strokeRect(6, 6, 116, 116);
    g.lineWidth = 10; g.beginPath(); g.moveTo(12, 12); g.lineTo(116, 116); g.stroke();
    g.fillStyle = '#5d503f'; for (const [x, y] of [[12, 12], [116, 12], [12, 116], [116, 116]]) { g.beginPath(); g.arc(x, y, 4, 0, TAU); g.fill(); }
  });
  const crateMat = new THREE.MeshToonMaterial({ map: crateTex, gradientMap: GRAD });
  const CRATE_COL = ['#c99a5b', '#b98a4e', '#d8ab6a', '#7f8c4f', '#c46a35', '#c99a5b'];
  const crates: { x: number; y: number; z: number; s: number; r: number; c: string }[] = [];
  const stack = (x: number, z: number, n: number, s = 1.3) => {
    for (let k = 0; k < n; k++) crates.push({ x: x + (k % 2) * s * 1.02 - (n > 1 ? s * 0.5 : 0), y: Math.floor(k / 2) * s, z: z + (k === 3 ? 0.15 : 0), s, r: rand(-0.2, 0.2), c: CRATE_COL[(k + Math.round(x)) % CRATE_COL.length] });
    if (n === 3) crates.push({ x, y: s, z, s: s * 0.9, r: 0.4, c: CRATE_COL[2] });
  };

  // ---------- west warehouse (Lagerhalle) ----------
  const WH = { x: -23, z: -3, w: 8, d: 12, h: 4.6 };
  const corrTex = ctex(128, 64, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,.16)'; g.fillRect(x, 0, 3, 64); }
  }, true);
  const wallMat = new THREE.MeshToonMaterial({ map: corrTex, gradientMap: GRAD });
  const walls: { x: number; y: number; z: number; w: number; h: number; d: number; c: string }[] = [];
  walls.push({ x: WH.x, y: 0, z: WH.z, w: WH.w, h: WH.h, d: WH.d, c: '#8fa3b5' });
  for (let k = 0; k <= 10; k++) {
    const a = Math.PI * (k / 10);
    st.add(BOX, k % 2 ? '#7d93a6' : '#9db1c2', WH.x + Math.cos(a) * (WH.w / 2), WH.h + Math.sin(a) * 2.2, WH.z, 0, 0, a + Math.PI / 2, 0.15, 1.42, WH.d + 0.4);
  }
  st.add(BOX, '#2e3540', WH.x, 1.7, WH.z + WH.d / 2 + 0.02, 0, 0, 0, 4.6, 3.4, 0.08);
  for (let k = 0; k < 7; k++) st.add(BOX, k % 2 ? HAZ : DARK, WH.x - 2.4 + k * 0.8, 3.55, WH.z + WH.d / 2 + 0.06, 0, 0, 0, 0.8, 0.3, 0.06);
  st.add(BOX, '#2e3540', WH.x + WH.w / 2 + 0.02, 1.4, WH.z + 2, 0, 0, 0, 0.08, 2.8, 3.6);
  gl.add(BOX, '#ffe7a8', WH.x, 4.0, WH.z + WH.d / 2 + 0.1, 0, 0, 0, 1.4, 0.3, 0.06);
  const whSign = signMesh(signTex('LAGER 1', { w: 256, h: 80, bg: '#2e3540', fg: '#ffc61a', frame: '#ffc61a', size: 50 }), 2.8, 0.88, WH.x, 5.3, WH.z + WH.d / 2 + 0.6);
  sc.add(whSign);
  stack(WH.x - 3.2, WH.z + WH.d / 2 + 1.8, 3); stack(WH.x + 3.4, WH.z + WH.d / 2 + 1.8, 2);

  // ---------- east loading yard: hall, containers, gantry crane ----------
  const EH = { x: 21, z: -6.5, w: 7, d: 8, h: 4.2 };
  walls.push({ x: EH.x, y: 0, z: EH.z, w: EH.w, h: EH.h, d: EH.d, c: '#c2a37a' });
  st.add(BOX, '#7d6448', EH.x, EH.h + 0.15, EH.z, 0, 0, 0.12, EH.w + 0.6, 0.3, EH.d + 0.6);
  st.add(BOX, '#2e3540', EH.x, 1.5, EH.z + EH.d / 2 + 0.02, 0, 0, 0, 3.8, 3, 0.08);
  for (let k = 0; k < 6; k++) st.add(BOX, k % 2 ? HAZ : DARK, EH.x - 1.75 + k * 0.7, 3.15, EH.z + EH.d / 2 + 0.06, 0, 0, 0, 0.7, 0.3, 0.06);
  for (let k = 0; k < 3; k++) st.add(BOX, '#ffffff', EH.x - 2.4 + k * 2.4, EH.h - 0.6, EH.z + EH.d / 2 + 0.04, 0, 0, 0, 1.2, 0.5, 0.04);
  const contTex = ctex(128, 64, (g) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 64);
    for (let x = 0; x < 128; x += 6) { g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x, 0, 2, 64); }
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 4; g.strokeRect(2, 2, 124, 60);
  });
  const conts: { x: number; y: number; z: number; yaw: number; c: string }[] = [];
  const YD = { x: 21.5, z: 5.5 };
  conts.push({ x: YD.x - 2.2, y: 0, z: YD.z, yaw: 0, c: '#c9442f' }, { x: YD.x + 2.2, y: 0, z: YD.z - 0.3, yaw: 0, c: '#2f6fb5' }, { x: YD.x - 2.2, y: 2.6, z: YD.z + 0.1, yaw: 0, c: '#2f9e8a' });
  // gantry crane over the yard: legs, beam (static), trolley + hook (animated)
  for (const sx of [-5.4, 5.4]) for (const sz of [-2.4, 2.4]) st.add(BOX, HAZ, YD.x + sx, 3.8, YD.z + sz, 0, 0, 0, 0.4, 7.6, 0.4);
  for (const sx of [-5.4, 5.4]) st.add(BOX, HAZ, YD.x + sx, 7.7, YD.z, 0, 0, 0, 0.5, 0.4, 5.3);
  for (const sz of [-1.1, 1.1]) st.add(BOX, '#e0a810', YD.x, 8.0, YD.z + sz, 0, 0, 0, 11.4, 0.5, 0.35);
  for (const sx of [-5.4, 5.4]) st.add(BOX, DARK, YD.x + sx, 0.2, YD.z, 0, 0, 0, 0.9, 0.4, 5.6);
  const trolley = new THREE.Group();
  const trb = new Batch();
  trb.add(BOX, '#e0a810', 0, 8.5, 0, 0, 0, 0, 1.6, 0.6, 2.8);
  trb.add(BOX, DARK, 0, 8.5, 1.45, 0, 0, 0, 1.0, 0.4, 0.1);
  trb.add(CYL8, DARK, 0, 6.6, 0, 0, 0, 0, 0.04, 3.6, 0.04);
  trb.add(BOX, HAZ, 0, 4.7, 0, 0, 0, 0, 0.6, 0.3, 0.6);
  trb.add(TOR, DARK, 0, 4.25, 0, 0, 0, 0, 0.3, 0.3, 3);
  trb.add(BOX, '#c99a5b', 0, 3.3, 0, 0, 0, 0, 1.2, 1.2, 1.2);
  trolley.add(trb.mesh());
  trolley.position.set(YD.x, 0, YD.z);
  sc.add(trolley);

  // ---------- command bunker with the radar dish ----------
  const HQ = { x: -4, z: 3.5 };
  st.add(HEMI, CONC, HQ.x, 0, HQ.z, 0, 0, 0, 4.4, 2.8, 4.4);
  st.add(BOX, CONC_D, HQ.x, 0.9, HQ.z + 3.6, 0, 0, 0, 3.0, 1.8, 2.0);
  st.add(BOX, '#2e3540', HQ.x, 0.8, HQ.z + 4.62, 0, 0, 0, 1.6, 1.5, 0.06);
  for (let k = 0; k < 5; k++) st.add(BOX, k % 2 ? HAZ : DARK, HQ.x - 1.2 + k * 0.6, 1.7, HQ.z + 4.64, 0, 0, 0, 0.6, 0.18, 0.04);
  for (let k = -2; k <= 2; k++) { const a = Math.PI / 2 + k * 0.32; gl.add(BOX, '#9ff3ff', HQ.x + Math.cos(a) * 3.9, 1.6, HQ.z + Math.sin(a) * 3.9, 0, -a + Math.PI / 2, 0, 0.9, 0.18, 0.1); }
  st.add(CYL8, STEEL, HQ.x + 2.4, 3.6, HQ.z - 1.2, 0, 0, 0, 0.06, 3, 0.06);
  gl.add(BULB, '#ff3d3d', HQ.x + 2.4, 5.2, HQ.z - 1.2, 0, 0, 0, 0.14);
  st.add(CYL8, STEEL, HQ.x, 3.2, HQ.z, 0, 0, 0, 0.35, 1.4, 0.35);
  const radar = new THREE.Group();
  const rb = new Batch();
  rb.addM(new THREE.SphereGeometry(1.6, 14, 6, 0, TAU, 0, 0.9), '#e6e8ea', new THREE.Matrix4().makeRotationX(-Math.PI / 2 + 0.5));
  rb.add(CYL8, STEEL, 0, 0, 0.8, Math.PI / 2 - 0.5, 0, 0, 0.05, 1.6, 0.05);
  rb.add(SPH_LO, '#ff3d3d', 0, 0.5, 1.5, 0, 0, 0, 0.12);
  rb.add(BOX, STEEL, 0, -0.3, 0, 0, 0, 0, 0.6, 0.5, 0.6);
  const radarM = rb.mesh();
  radarM.material = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: GRAD, side: THREE.DoubleSide });
  radar.add(radarM);
  radar.position.set(HQ.x, 4.3, HQ.z);
  sc.add(radar);
  // sandbags around the bunker
  for (let k = 0; k < 14; k++) {
    const a = Math.PI * 0.9 + (k / 13) * Math.PI * 1.2, x = HQ.x + Math.cos(a) * 5.4, z = HQ.z + Math.sin(a) * 5.4;
    if (!kit.clearOfPath(x, z, 1.6, 1.1)) continue;
    for (let r = 0; r < 2; r++) st.add(LEAF, r ? '#c7b089' : '#b39b74', x, 0.25 + r * 0.38, z, 0, -a, 0, 0.42, 0.2, 0.8);
  }
  // helipad
  const HP = { x: -4.5, z: 11.5 };
  st.add(CYL, DARK, HP.x, 0.04, HP.z, 0, 0, 0, 3.1, 0.08, 3.1);
  st.add(TOR, HAZ, HP.x, 0.1, HP.z, Math.PI / 2, 0, 0, 2.7, 2.7, 0.6);
  st.add(BOX, '#ffffff', HP.x - 0.7, 0.1, HP.z, 0, 0, 0, 0.32, 0.04, 2.0);
  st.add(BOX, '#ffffff', HP.x + 0.7, 0.1, HP.z, 0, 0, 0, 0.32, 0.04, 2.0);
  st.add(BOX, '#ffffff', HP.x, 0.1, HP.z, 0, 0, 0, 1.4, 0.04, 0.3);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; gl.add(BULB, '#7dff8a', HP.x + Math.cos(a) * 3.0, 0.16, HP.z + Math.sin(a) * 3.0, 0, 0, 0, 0.12); }

  // ---------- the freight lift tower ----------
  const T = TOWER, TH = 6.6;
  for (const sx of [-1.2, 1.2]) for (const sz of [-1.2, 1.2]) st.add(BOX, HAZ, T.x + sx, TH / 2, T.z + sz, 0, 0, 0, 0.26, TH, 0.26);
  for (let y = 1.5; y < TH; y += 1.5) {
    for (const s of [-1, 1]) { st.add(BOX, '#e0a810', T.x, y, T.z + s * 1.2, 0, 0, 0, 2.4, 0.12, 0.12); st.add(BOX, '#e0a810', T.x + s * 1.2, y, T.z, 0, 0, 0, 0.12, 0.12, 2.4); }
    st.beam([T.x - 1.2, y - 1.5, T.z + 1.2], [T.x + 1.2, y, T.z + 1.2], 0.05, '#e0a810');
  }
  st.add(BOX, STEEL, T.x, TH + 0.2, T.z, 0, 0, 0, 3.0, 0.4, 3.0);
  st.add(CYL, DARK, T.x, TH + 0.8, T.z, Math.PI / 2, 0, 0, 0.6, 0.6, 0.6);
  st.add(BOX, CONC_D, T.x, 0.1, T.z, 0, 0, 0, 3.2, 0.2, 3.2);
  const cab = new THREE.Group();
  const cb = new Batch();
  cb.add(BOX, '#3c4652', 0, 0.9, 0, 0, 0, 0, 2.0, 1.8, 2.0);
  cb.add(BOX, '#ffffff', 0, 1.0, 1.01, 0, 0, 0, 1.3, 1.2, 0.04);
  for (let k = 0; k < 5; k++) cb.add(BOX, k % 2 ? HAZ : DARK, -0.8 + k * 0.4, 1.9, 1.02, 0, 0, 0, 0.4, 0.2, 0.06);
  cb.add(BOX, STEEL, 0, 1.85, 0, 0, 0, 0, 2.1, 0.1, 2.1);
  cb.add(CYL8, DARK, 0, 3, 0, 0, 0, 0, 0.04, 2.2, 0.04);
  cab.add(cb.mesh());
  cab.position.set(T.x, 0.25, T.z);
  sc.add(cab);
  // lift stations: a door frame and a sign next to each X space
  const stationSign = (nid: number, text: string) => {
    const n = nodes[nid], dx = T.x - n.x, dz = T.z - n.z, l = Math.hypot(dx, dz);
    const x = n.x + (dx / l) * 2.1, z = n.z + (dz / l) * 2.1, yaw = Math.atan2(-dx, -dz);
    st.add(BOX, HAZ, x + Math.cos(yaw) * 0.9, 1.2, z - Math.sin(yaw) * 0.9, 0, yaw, 0, 0.2, 2.4, 0.2);
    st.add(BOX, HAZ, x - Math.cos(yaw) * 0.9, 1.2, z + Math.sin(yaw) * 0.9, 0, yaw, 0, 0.2, 2.4, 0.2);
    st.add(BOX, DARK, x, 2.45, z, 0, yaw, 0, 2.0, 0.2, 0.25);
    const m = signMesh(signTex(text, { w: 256, h: 72, bg: '#23272e', fg: '#ffc61a', frame: '#ffc61a', size: 40 }), 1.9, 0.55, x, 2.95, z, yaw);
    sc.add(m);
  };
  stationSign(ids.oben, 'AUFZUG ▲');
  stationSign(ids.unten, 'AUFZUG ▼');

  // ---------- the vault courtyard ----------
  const VN = ids.vault.map((i) => nodes[i]);
  const vx0 = Math.min(...VN.map((n) => n.x)) - 2.3, vx1 = Math.max(...VN.map((n) => n.x)) + 2.3;
  const vz0 = Math.min(...VN.map((n) => n.z)) - 2.3, vz1 = -16.5;
  const wallRun = (ax: number, az: number, bx: number, bz: number) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / 1.2)), yaw = Math.atan2(bx - ax, bz - az);
    for (let k = 0; k < n; k++) {
      const x = lerp(ax, bx, (k + 0.5) / n), z = lerp(az, bz, (k + 0.5) / n);
      if (!kit.clearOfPath(x, z, 1.75, 1.2)) continue;
      st.add(BOX, CONC_D, x, 1.3, z, 0, yaw, 0, 0.9, 2.6, L / n + 0.02);
      st.add(BOX, k % 2 ? HAZ : DARK, x, 2.66, z, 0, yaw, 0, 0.95, 0.14, L / n + 0.02);
    }
  };
  wallRun(vx0, vz1, vx0, vz0); wallRun(vx0, vz0, vx1, vz0); wallRun(vx1, vz0, vx1, vz1); wallRun(vx0, vz1, vx1, vz1);
  st.add(BOX, '#c9b26a', (vx0 + vx1) / 2, 0.015, (vz0 + vz1) / 2, 0, 0, 0, vx1 - vx0 - 1, 0.02, vz1 - vz0 - 1);
  // gold, cash and deposit boxes along the back wall
  for (let k = 0; k < 12; k++) st.add(BOX, k % 3 ? '#8d939b' : '#a7adb5', vx0 + 1.3 + k * ((vx1 - vx0 - 2.6) / 11), 1.1, vz0 + 0.75, 0, 0, 0, 1.1, 2.0, 0.5);
  for (const [gx, gz] of [[(vx0 + vx1) / 2 - 3.5, (vz0 + vz1) / 2 + 0.2], [(vx0 + vx1) / 2 + 3.6, (vz0 + vz1) / 2 + 0.4]] as const) {
    if (!kit.clearOfPath(gx, gz, 1.6, 1.1)) continue;
    for (let lv = 0; lv < 3; lv++) for (let k = 0; k < 3 - lv; k++) gl.add(BOX, '#ffd23f', gx - 0.5 + k * 0.5 + lv * 0.25, 0.14 + lv * 0.26, gz, 0, 0, 0, 0.44, 0.24, 0.9);
  }
  // the round door at the entrance edge (hinge on its west side)
  const VA = nodes[ids.jv], VB = nodes[ids.vFirst];
  const tD = (vz1 - VA.z) / (VB.z - VA.z), DX = lerp(VA.x, VB.x, tD), DZ = vz1;
  const DR = 1.75;
  st.add(TOR, '#5b6470', DX, DR + 0.05, DZ, 0, 0, 0, DR + 0.25, DR + 0.25, 6);
  for (const s of [-1, 1]) st.add(BOX, CONC_D, DX + s * (DR + 0.6), 1.9, DZ, 0, 0, 0, 0.9, 3.8, 1.1);
  st.add(BOX, CONC_D, DX, 3.9, DZ, 0, 0, 0, 2 * DR + 2.1, 0.5, 1.1);
  const doorHinge = new THREE.Group();
  doorHinge.position.set(DX - DR, 0, DZ + 0.35);
  const db = new Batch();
  db.add(CYL, '#b9c0c8', DR, DR + 0.05, 0, Math.PI / 2, 0, 0, DR, 0.5, DR);
  db.add(CYL, '#9aa2ab', DR, DR + 0.05, 0.27, Math.PI / 2, 0, 0, DR * 0.72, 0.06, DR * 0.72);
  for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; db.add(CYL8, '#6c747e', DR + Math.cos(a) * DR * 0.86, DR + 0.05 + Math.sin(a) * DR * 0.86, 0.27, Math.PI / 2, 0, 0, 0.09, 0.08, 0.09); }
  db.add(TOR, '#3c4652', DR, DR + 0.05, 0.38, 0, 0, 0, 0.62, 0.62, 3);
  for (let k = 0; k < 3; k++) db.add(BOX, '#3c4652', DR, DR + 0.05, 0.38, 0, 0, (k * Math.PI) / 3, 1.3, 0.1, 0.08);
  db.add(CYL, '#ffd23f', DR, DR + 0.05, 0.4, Math.PI / 2, 0, 0, 0.16, 0.1, 0.16);
  for (const y of [0.6, DR * 2 - 0.5]) db.add(BOX, '#3c4652', 0.05, y, 0, 0, 0, 0, 0.3, 0.35, 0.6);
  const door = db.mesh();
  doorHinge.add(door);
  sc.add(doorHinge);
  const vaultSign = signMesh(signTex('TRESOR', { w: 256, h: 72, bg: '#23272e', fg: '#ffd23f', frame: '#ffd23f', size: 46 }), 2.6, 0.73, DX, 4.55, DZ + 0.4);
  sc.add(vaultSign);
  // exit turnstile at the exit edge
  const exitE = edges.find((e) => ids.vault.includes(e.a) && !ids.vault.includes(e.b))!;
  {
    const A = nodes[exitE.a], B = nodes[exitE.b], t = (vz1 - A.z) / (B.z - A.z), x = lerp(A.x, B.x, t);
    for (const s of [-1, 1]) st.add(BOX, HAZ, x + s * 1.2, 0.6, vz1, 0, 0, 0, 0.18, 1.2, 0.18);
    st.add(BOX, DARK, x, 1.25, vz1, 0, 0, 0, 2.6, 0.12, 0.12);
    gl.add(BULB, '#7dff8a', x + 1.2, 1.35, vz1, 0, 0, 0, 0.14);
  }

  // ---------- warning beacons (spinning reflectors) ----------
  const BEACONS: [number, number, number][] = [[DX - DR - 0.6, 4.25, DZ], [DX + DR + 0.6, 4.25, DZ], [T.x, TH + 1.35, T.z], [-3.8, 1.25, 21.2], [3.8, 1.25, 21.2]];
  for (const [x, y, z] of BEACONS) { st.add(CYL8, DARK, x, y - 0.15, z, 0, 0, 0, 0.22, 0.2, 0.22); gl.add(SPH_LO, '#ff8a2e', x, y + 0.12, z, 0, 0, 0, 0.18, 0.24, 0.18); }
  const beaconGeo = new THREE.ConeGeometry(0.5, 2.2, 10, 1, true).rotateZ(Math.PI / 2).translate(1.1, 0, 0);
  const beacons = new THREE.InstancedMesh(beaconGeo, new THREE.MeshBasicMaterial({ color: '#ff9a3d', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }), BEACONS.length);
  beacons.frustumCulled = false;
  beacons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sc.add(beacons);

  // ---------- rails with a mine cart along the Schienenweg ----------
  const dNodes = nodes.filter((n) => n.seg === 'd');
  const RAIL: P2[] = [];
  for (let i = 0; i < dNodes.length; i++) {
    const n = dNodes[i], m = dNodes[Math.min(dNodes.length - 1, i + 1)], p = dNodes[Math.max(0, i - 1)];
    const dx = m.x - p.x, dz = m.z - p.z, l = Math.hypot(dx, dz) || 1;
    RAIL.push([n.x + (-dz / l) * 2.05, n.z + (dx / l) * 2.05]);
  }
  const railOk: boolean[] = RAIL.map(([x, z]) => kit.clearOfPath(x, z, 1.45, 0.9) && Math.hypot(x - T.x, z - T.z) > 2.4);
  for (let i = 0; i < RAIL.length - 1; i++) {
    if (!railOk[i] || !railOk[i + 1]) continue;
    const [ax, az] = RAIL[i], [bx, bz] = RAIL[i + 1], dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz), yaw = Math.atan2(dx, dz), nx = -dz / L, nz = dx / L;
    for (const s of [-1, 1]) st.add(BOX, '#7a7f87', (ax + bx) / 2 + nx * s * 0.42, 0.1, (az + bz) / 2 + nz * s * 0.42, 0, yaw, 0, 0.08, 0.1, L + 0.1);
    for (let k = 0; k < 4; k++) { const t = (k + 0.5) / 4; st.add(BOX, '#6b4a2e', lerp(ax, bx, t), 0.04, lerp(az, bz, t), 0, yaw, 0, 1.3, 0.08, 0.26); }
  }
  // the cart runs on the longest stretch of free rail
  let best = [0, 0], cur = -1;
  for (let i = 0; i < RAIL.length; i++) {
    if (railOk[i]) { if (cur < 0) cur = i; if (i - cur > best[1] - best[0]) best = [cur, i]; } else cur = -1;
  }
  const cartPts = RAIL.slice(best[0], best[1] + 1);
  const cartLen: number[] = [0];
  for (let i = 1; i < cartPts.length; i++) cartLen.push(cartLen[i - 1] + Math.hypot(cartPts[i][0] - cartPts[i - 1][0], cartPts[i][1] - cartPts[i - 1][1]));
  const cartTotal = cartLen[cartLen.length - 1];
  const cart = new THREE.Group();
  const cab2 = new Batch();
  cab2.add(BOX, RUST, 0, 0.55, 0, 0, 0, 0, 1.0, 0.6, 1.3);
  cab2.add(BOX, '#8a3c18', 0, 0.86, 0, 0, 0, 0, 1.1, 0.06, 1.4);
  cab2.add(SPH_LO, '#ffd23f', 0, 0.9, 0, 0, 0, 0, 0.4, 0.22, 0.5);
  for (const sx of [-0.42, 0.42]) for (const sz of [-0.4, 0.4]) cab2.add(CYL8, DARK, sx, 0.2, sz, 0, 0, Math.PI / 2, 0.16, 0.12, 0.16);
  cart.add(cab2.mesh());
  cart.visible = cartTotal > 4;
  sc.add(cart);

  // ---------- water tower, floodlights, barrels, start gate ----------
  const WT = { x: 33, z: -22.5 };
  if (inOutline(OUTLINE, WT.x, WT.z, 1) && kit.clearOfPath(WT.x, WT.z, 3, 2.4)) {
    for (const sx of [-1.3, 1.3]) for (const sz of [-1.3, 1.3]) st.beam([WT.x + sx * 1.3, 0, WT.z + sz * 1.3], [WT.x + sx * 0.8, 7, WT.z + sz * 0.8], 0.14, STEEL);
    st.add(CYL, '#b9c0c8', WT.x, 8.4, WT.z, 0, 0, 0, 2.0, 2.8, 2.0);
    st.add(CONE, '#9aa2ab', WT.x, 10.3, WT.z, 0, 0, 0, 2.2, 1.0, 2.2);
    st.add(TOR, HAZ, WT.x, 7.2, WT.z, Math.PI / 2, 0, 0, 2.05, 2.05, 1.5);
  }
  for (const [x, z] of [[-34, -24], [-34.5, 19.5], [34.5, 19.5]] as const) {
    if (!inOutline(OUTLINE, x, z, 0.4)) continue;
    st.add(CYL8, STEEL, x, 4, z, 0, 0, 0, 0.14, 8, 0.14);
    st.add(BOX, DARK, x, 8.1, z, 0, 0, 0, 1.8, 0.2, 0.3);
    for (const s of [-0.55, 0.55]) gl.add(BOX, '#fff3c8', x + s, 8.0, z + (z > 0 ? -0.2 : 0.2), -0.5 * Math.sign(z), 0, 0, 0.5, 0.36, 0.1);
  }
  // start: boom gate and the sign in front
  st.add(BOX, DARK, 0, 0.03, 20, 0, 0, 0, 3.4, 0.04, 3.6);
  for (let k = 0; k < 6; k++) st.add(BOX, k % 2 ? HAZ : DARK, -1.4 + k * 0.56, 0.06, 21.6, 0, 0.7, 0, 0.25, 0.04, 1.4);
  for (const s of [-1, 1]) st.add(BOX, CONC, s * 3.8, 0.55, 21.2, 0, 0, 0, 0.6, 1.1, 0.6);
  const startSign = signMesh(signTex('★ START ★', { w: 512, h: 120, bg: '#23272e', fg: '#ffc61a', frame: '#ffc61a', bulbs: '#ff8a2e', size: 74 }), 6.4, 1.5, 0, 1.25, 21.4);
  sc.add(startSign);

  // corner yards: container stack (back left), generators and fuel tanks (front left), truck at the east dock
  const CY = { x: -30.5, z: -21.5 };
  if (kit.clearOfPath(CY.x, CY.z, 4.2, 3.6)) {
    conts.push({ x: CY.x, y: 0, z: CY.z, yaw: Math.PI / 2, c: '#c9442f' }, { x: CY.x, y: 0, z: CY.z + 2.5, yaw: Math.PI / 2, c: '#e0a810' }, { x: CY.x + 0.3, y: 2.6, z: CY.z + 1.2, yaw: Math.PI / 2, c: '#2f9e8a' });
    ZONES.push([CY.x, CY.z + 1.2, 4.5]);
  }
  const GY = { x: -29.5, z: 18.2 };
  if (kit.clearOfPath(GY.x, GY.z, 3.6, 2.6)) {
    for (let k = 0; k < 2; k++) {
      const x = GY.x - 1.6 + k * 3.4;
      st.add(CYL, '#d6d9dd', x, 1.0, GY.z - 0.6, 0, 0, Math.PI / 2, 0.75, 2.8, 0.75);
      for (const sx of [-0.9, 0.9]) st.add(BOX, STEEL, x + sx, 0.3, GY.z - 0.6, 0, 0, 0, 0.2, 0.6, 1.2);
      st.add(BOX, HAZ, x, 1.0, GY.z - 0.6, 0, 0, 0, 0.3, 1.56, 1.56);
    }
    st.add(BOX, OLIVE, GY.x, 0.6, GY.z + 1.4, 0, 0, 0, 2.6, 1.2, 1.3);
    st.add(BOX, DARK, GY.x + 0.7, 1.25, GY.z + 1.4, 0, 0, 0, 0.5, 0.1, 0.9);
    st.add(CYL8, DARK, GY.x - 0.9, 1.6, GY.z + 1.2, 0, 0, 0, 0.1, 1.0, 0.1);
    gl.add(BULB, '#7dff8a', GY.x - 0.2, 0.9, GY.z + 2.07, 0, 0, 0, 0.1);
    ZONES.push([GY.x, GY.z, 3.6]);
  }
  // truck with trailer at the east hall dock
  {
    const tx = EH.x + 0.2, tz = EH.z + EH.d / 2 + 3.4;
    if (kit.clearOfPath(tx, tz, 3.0, 2.2)) {
      st.add(BOX, '#d6d9dd', tx, 1.5, tz, 0, Math.PI / 2, 0, 2.3, 2.4, 5.4);
      st.add(BOX, DARK, tx, 0.35, tz, 0, Math.PI / 2, 0, 2.0, 0.3, 5.4);
      st.add(BOX, '#c9442f', tx + 3.5, 1.1, tz, 0, Math.PI / 2, 0, 2.2, 1.8, 1.6);
      st.add(BOX, '#9ff3ff', tx + 4.32, 1.45, tz, 0, Math.PI / 2, 0, 1.8, 0.7, 0.04);
      for (const sx of [-1.8, 1.0, 3.6]) for (const sz of [-1.05, 1.05]) st.add(CYL8, '#16181c', tx + sx, 0.42, tz + sz, Math.PI / 2, 0, 0, 0.42, 0.3, 0.42);
      for (const sz of [-0.7, 0.7]) gl.add(BULB, '#fff3c8', tx + 4.34, 0.75, tz + sz, 0, 0, 0, 0.13);
      ZONES.push([tx + 1, tz, 3.4]);
    }
  }
  // floor markings: parking boxes and arrows
  for (const [x, z, yaw] of [[-4, -16, 0], [-21, 6.5, 0.3], [24, -14, 0], [15, 1, 1.2], [-26, -20, 0]] as const) {
    if (!free(x, z, 2.2, 1.6, 1)) continue;
    for (const s2 of [-1, 1]) st.add(BOX, HAZ, x + Math.cos(yaw) * s2 * 1.4, 0.012, z - Math.sin(yaw) * s2 * 1.4, 0, yaw, 0, 0.16, 0.02, 3.2);
    st.add(BOX, HAZ, x, 0.012, z, 0, yaw, 0, 2.96, 0.02, 0.16);
  }
  // radio mast with guy wires
  {
    const mx = 15.5, mz = -12.2;
    if (free(mx, mz, 2.0, 1.6, 1)) {
      st.add(CYL8, '#d6d9dd', mx, 4.5, mz, 0, 0, 0, 0.12, 9, 0.12);
      for (let k = 0; k < 3; k++) { const a = (k / 3) * TAU; st.beam([mx, 7, mz], [mx + Math.cos(a) * 2, 0, mz + Math.sin(a) * 2], 0.025, '#6f737a'); }
      for (let y = 2; y < 9; y += 2) st.add(BOX, k3(y), mx, y, mz, 0, 0, 0, 0.5, 0.3, 0.5);
      gl.add(BULB, '#ff3d3d', mx, 9.1, mz, 0, 0, 0, 0.16);
    }
  }
  function k3(y: number) { return y % 4 ? '#c9442f' : '#ffffff'; }

  // crate stacks, barrels, pallets, forklifts and tents on free spots
  const BARREL_COL = ['#c9442f', '#2f6fb5', '#e0a810', '#5f6b3a'];
  const barrels: { x: number; z: number; c: string; tip: boolean }[] = [];
  let props = 0;
  for (let k = 0; k < 1200 && props < 58; k++) {
    const x = rand(-34.5, 34.5), z = rand(-24.5, 20.5);
    if (!tryPlace(x, z, 2.3, 1.8, 2.6)) continue;
    const kind = props % 6;
    if (kind === 4) {
      const yaw = rand(0, TAU), c = Math.cos(yaw), sn = Math.sin(yaw);
      const at = (lx: number, lz: number): [number, number] => [x + lx * c + lz * sn, z - lx * sn + lz * c];
      let [px, pz] = at(0, 0); st.add(BOX, HAZ, px, 0.6, pz, 0, yaw, 0, 1.1, 0.7, 1.6);
      [px, pz] = at(0, -0.3); st.add(BOX, DARK, px, 1.4, pz, 0, yaw, 0, 1.0, 0.08, 1.0);
      for (const lx of [-0.45, 0.45]) { [px, pz] = at(lx, -0.7); st.add(BOX, DARK, px, 1.0, pz, 0, yaw, 0, 0.06, 1.0, 0.06); [px, pz] = at(lx, 0.25); st.add(BOX, DARK, px, 1.0, pz, 0, yaw, 0, 0.06, 1.0, 0.06); }
      [px, pz] = at(0, 1.0); st.add(BOX, STEEL, px, 1.2, pz, 0, yaw, 0, 0.9, 2.2, 0.12);
      for (const lx of [-0.3, 0.3]) { [px, pz] = at(lx, 1.5); st.add(BOX, STEEL, px, 0.12, pz, 0, yaw, 0, 0.14, 0.06, 1.0); }
      for (const lx of [-0.6, 0.6]) for (const lz of [-0.5, 0.5]) { [px, pz] = at(lx, lz); st.add(CYL8, '#16181c', px, 0.25, pz, 0, yaw, Math.PI / 2, 0.25, 0.2, 0.25); }
    } else if (kind === 5) {
      const yaw = rand(0, Math.PI);
      st.addM(TENT, OLIVE, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, 0.6, z));
      st.add(BOX, '#3a4224', x + Math.sin(yaw) * 1.31, 0.45, z + Math.cos(yaw) * 1.31, 0, yaw, 0, 0.7, 0.9, 0.04);
    } else if (kind === 0 || kind === 2) stack(x, z, 1 + (props % 4), rand(1.0, 1.35));
    else if (kind === 1) { for (let b = 0; b < 3; b++) barrels.push({ x: x + (b % 2) * 0.75 - 0.35, z: z + (b > 1 ? 0.7 : 0), c: BARREL_COL[(props + b) % 4], tip: b === 2 && props % 3 === 0 }); }
    else { st.add(BOX, '#a9824e', x, 0.08, z, 0, rand(0, 3), 0, 1.6, 0.16, 1.3); st.add(BOX, OLIVE, x, 0.55, z, 0, 0.3, 0, 1.2, 0.8, 0.9); }
    props++;
  }
  const crateIM = new THREE.InstancedMesh(BOX, crateMat, crates.length);
  crates.forEach((c, i) => { dummy.position.set(c.x, c.y + c.s / 2, c.z); dummy.rotation.set(0, c.r, 0); dummy.scale.setScalar(c.s); dummy.updateMatrix(); crateIM.setMatrixAt(i, dummy.matrix); crateIM.setColorAt(i, _c.set(c.c)); });
  crateIM.castShadow = crateIM.receiveShadow = true;
  sc.add(crateIM);
  for (const b of barrels) {
    if (b.tip) st.add(CYL8, b.c, b.x, 0.4, b.z, Math.PI / 2, 0.6, 0, 0.38, 1.1, 0.38);
    else { st.add(CYL8, b.c, b.x, 0.55, b.z, 0, 0, 0, 0.38, 1.1, 0.38); for (const y of [0.3, 0.8]) st.add(CYL8, DARK, b.x, y, b.z, 0, 0, 0, 0.4, 0.06, 0.4); st.add(CYL6, '#e6e8ea', b.x, 1.11, b.z, 0, 0, 0, 0.12, 0.02, 0.12); }
  }
  const BW = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const wallIM = new THREE.InstancedMesh(BW, wallMat, walls.length);
  walls.forEach((w, i) => { dummy.position.set(w.x, w.y, w.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(w.w, w.h, w.d); dummy.updateMatrix(); wallIM.setMatrixAt(i, dummy.matrix); wallIM.setColorAt(i, _c.set(w.c)); });
  wallIM.castShadow = wallIM.receiveShadow = true;
  sc.add(wallIM);
  const contIM = new THREE.InstancedMesh(BW, new THREE.MeshToonMaterial({ map: contTex, gradientMap: GRAD }), conts.length);
  conts.forEach((c, i) => { dummy.position.set(c.x, c.y, c.z); dummy.rotation.set(0, c.yaw, 0); dummy.scale.set(2.3, 2.6, 5.6); dummy.updateMatrix(); contIM.setMatrixAt(i, dummy.matrix); contIM.setColorAt(i, _c.set(c.c)); });
  contIM.castShadow = true;
  sc.add(contIM);

  // a few dusty clouds
  const cl = new THREE.InstancedMesh(SPH_LO, toon('#fff1e0'), 24);
  let ci = 0;
  ([[-60, 14, -40], [55, 16, -46], [-70, 12, 18], [64, 13, 12], [5, 18, -70]] as const).forEach(([x, y, z]) => {
    for (let k = 0; k < 4 && ci < 24; k++) { dummy.position.set(x + (k - 1.5) * 3, y + (k % 2) * 0.8, z); dummy.rotation.set(0, 0, 0); dummy.scale.set(rand(2.4, 3.4), rand(1.2, 1.8), rand(2, 2.6)); dummy.updateMatrix(); cl.setMatrixAt(ci++, dummy.matrix); }
  });
  cl.count = ci;
  sc.add(cl);
  sc.add(st.mesh(), gl.mesh(GLOW, false, false));

  // ---------- Kistenregen: falling crates ----------
  const RAIN_N = 18;
  const rain = new THREE.InstancedMesh(BOX, new THREE.MeshToonMaterial({ map: crateTex, gradientMap: GRAD, emissive: '#5a2400' }), RAIN_N);
  rain.frustumCulled = false;
  rain.castShadow = true;
  rain.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < RAIN_N; i++) rain.setColorAt(i, _c.set(['#ff8a2e', '#ffb13d', '#ff6a3d'][i % 3]));
  rain.visible = false;
  sc.add(rain);
  const rX = new Float32Array(RAIN_N), rZ = new Float32Array(RAIN_N), rY = new Float32Array(RAIN_N), rV = new Float32Array(RAIN_N), rS = new Float32Array(RAIN_N);
  let rainLive = false;
  const dropCrates = (spots: number[], instant: boolean) => {
    for (let i = 0; i < RAIN_N; i++) {
      let x: number, z: number;
      if (i < spots.length) { const n = nodes[spots[i]] ?? nodes[0]; x = n.x + 1.5; z = n.z - 1.2; }
      else { let tries = 0; do { x = rand(-32, 32); z = rand(-22, 18); tries++; } while (tries < 40 && !free(x, z, 1.6, 1.2, 1)); }
      rX[i] = x; rZ[i] = z; rS[i] = rand(0.8, 1.1);
      rY[i] = instant ? 0 : 22 + i * 1.6; rV[i] = 0;
    }
    rain.visible = true;
    rainLive = true;
  };

  // ---------- state ----------
  let doorA = 0, cabY = 0.25, beltSpeed = 0.55, beaconBoost = 0, crane = 0;
  const setDoor = (k: number) => { doorA = k; doorHinge.rotation.y = -k * 1.9; };
  const cabFor = (lvl: unknown) => (lvl === 'oben' ? TH - 2.2 : 0.25);

  return {
    overview: { x: 0, z: -2.5, w: 78, d: 54 },
    apply(bs) {
      setDoor(bs.vault ? 1 : 0);
      cabY = cabFor(bs.lift);
      cab.position.y = cabY;
      if (bs.crates) { if (!rain.visible) dropCrates([], true); } else { rain.visible = false; rainLive = false; }
    },
    async play(name, data) {
      if (name === 'vault') {
        const open = !!data?.open;
        kit.look(DX, DZ + 2);
        beaconBoost = 1;
        await wait(600);
        sfx.creak();
        const from = doorA;
        await tween(1.6, (k) => setDoor(lerp(from, open ? 1 : 0, k)), E.inOut);
        sfx.bonk();
        await wait(600);
        beaconBoost = 0;
        kit.follow();
      } else if (name === 'lift') {
        kit.look(T.x, T.z);
        await wait(500);
        const from = cabY, to = cabFor(data?.to);
        let tick = 0;
        sfx.crank();
        await tween(1.4, (k) => { cabY = lerp(from, to, k); cab.position.y = cabY; const t2 = Math.floor(k * 8); if (t2 !== tick) { tick = t2; sfx.crank(); } }, E.inOut);
        sfx.beep(true);
        await wait(data?.ride ? 200 : 500);
        kit.follow();
      } else if (name === 'belt') {
        const mid = nodes[band[Math.floor(band.length / 2)].a];
        kit.look(mid.x, mid.z);
        sfx.whoosh();
        beltSpeed = 3;
        await wait(1200);
        beltSpeed = 0.55;
        kit.follow();
      } else if (name === 'crates') {
        if (data?.on) {
          kit.look(0, 0);
          dropCrates(Array.isArray(data.nodes) ? (data.nodes as number[]) : [], false);
          await wait(2200);
          kit.follow();
        } else { rain.visible = false; rainLive = false; }
      }
    },
    update(dt, t) {
      beltTex.offset.y = (beltTex.offset.y + dt * beltSpeed) % 1;
      radar.rotation.y = t * 0.9;
      crane = Math.sin(t * 0.22);
      trolley.position.x = YD.x + crane * 4;
      for (let i = 0; i < BEACONS.length; i++) {
        const [x, y, z] = BEACONS[i];
        dummy.position.set(x, y + 0.12, z);
        dummy.rotation.set(0, t * (beaconBoost ? 9 : 3) + i * 1.3, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        beacons.setMatrixAt(i, dummy.matrix);
      }
      beacons.instanceMatrix.needsUpdate = true;
      if (cart.visible) {
        const s = (Math.sin(t * 0.35) * 0.5 + 0.5) * cartTotal;
        let i = 1;
        while (i < cartLen.length - 1 && cartLen[i] < s) i++;
        const k = (s - cartLen[i - 1]) / (cartLen[i] - cartLen[i - 1] || 1);
        const [ax, az] = cartPts[i - 1], [bx, bz] = cartPts[i];
        cart.position.set(lerp(ax, bx, k), 0, lerp(az, bz, k));
        cart.rotation.y = Math.atan2(bx - ax, bz - az);
      }
      if (rainLive) {
        let moving = false;
        for (let i = 0; i < RAIN_N; i++) {
          if (rY[i] > 0 || rV[i] !== 0) {
            rV[i] -= 30 * dt;
            rY[i] += rV[i] * dt;
            if (rY[i] <= 0) { rY[i] = 0; rV[i] = rV[i] < -4 ? -rV[i] * 0.3 : 0; }
            moving = true;
          }
          dummy.position.set(rX[i], rY[i] + rS[i] / 2, rZ[i]);
          dummy.rotation.set(0, i * 0.7, 0);
          dummy.scale.setScalar(rS[i]);
          dummy.updateMatrix();
          rain.setMatrixAt(i, dummy.matrix);
        }
        rain.instanceMatrix.needsUpdate = true;
        if (!moving) rainLive = false;
      }
    },
  };
}
