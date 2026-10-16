// Neonstadt in 3D: island with neon rim and canal, pastel houses (instanced), trees and lamps
// (one merged mesh), Riesenrad with upright gondolas, plaza with the Drehbühne, Neonturm,
// Leuchtturm with its beam, harbour with rocking boats, the start sign and the drawbridge.

import type { BEdge } from '../types';
import type { BoardDecor, BoardKit } from '../../view3d/boardview';
import {
  BOX, Batch, CONE, CYL, CYL8, FONT, GLOW, GRAD, OUT, SPH, SPH_LO, STAR_GEO, THREE, TOR, VC, VC_EMI, ctex, skyTex, toon,
} from '../../view3d/kit';
import { sfx } from '../../sfx';
import { E, TAU, clamp, lerp, pickR, rand, tween, wait } from '../../util';
import { roundRect, type P2 } from '../bauteile';
import { BOAT, PERSON, PROPS, flock, foam, groundTex, instanced, loopers, type Item } from '../details';

const _c = new THREE.Color();

/** The canal on the west side (no spaces there, the bridges cross it). */
export const inCanal = (x: number, z: number) => x < -6 && Math.abs(z) < 2.9;

export function neonDecor(kit: BoardKit, ids: { draw: BEdge; j4: number; dFirst: number }): BoardDecor {
  const sc = kit.scene, nodes = kit.graph.nodes, edges = kit.graph.edges;
  const sky = skyTex(['#5a2bd6', '#c24fd6', '#ff7ab8', '#ffc38a']);
  const skyNight = skyTex(['#0b0630', '#2a0d6e', '#5b2bd6', '#8a3fb0']);
  sc.background = sky;
  sc.fog = new THREE.Fog('#f2a3d0', 110, 320);
  const dummy = new THREE.Object3D();

  // --- island (one extruded shape with the canal inlet) ---
  const pts: [number, number][] = [];
  const arc = (cx: number, cz: number, a0: number, a1: number, r: number, n = 10) => { for (let i = 0; i <= n; i++) { const a = ((a0 + ((a1 - a0) * i) / n) * Math.PI) / 180; pts.push([cx + r * Math.cos(a), cz + r * Math.sin(a)]); } };
  pts.push([-37, 2.4]);
  arc(-29, 15, 180, 90, 8); arc(29, 15, 90, 0, 8); arc(29, -17, 0, -90, 8); arc(-29, -17, -90, -180, 8);
  pts.push([-37, -2.4], [-7.5, -2.4]);
  arc(-7.5, 0, -90, 90, 2.4, 8);
  const shape = new THREE.Shape();
  pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
  shape.closePath();
  const ig = new THREE.ExtrudeGeometry(shape, { depth: 3, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2, curveSegments: 6 });
  const tileTex = groundTex({
    a: '#b5f0d6', b: '#9fe8c8', line: 'rgba(80,170,140,.4)', vary: 0.1, speck: ['#ffffff', '#ffd9ef', '#fff3a6'],
    deco: (g, x, y, S, k) => {
      if (k === 3) { g.fillStyle = 'rgba(70,160,120,.35)'; g.beginPath(); g.arc(x + S / 2, y + S / 2, 9, 0, TAU); g.fill(); g.strokeStyle = 'rgba(40,110,90,.5)'; g.lineWidth = 2; for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(x + S / 2 - 7, y + S / 2 + i * 4); g.lineTo(x + S / 2 + 7, y + S / 2 + i * 4); g.stroke(); } }
      else if (k === 7) { for (let i = 0; i < 4; i++) { g.fillStyle = pickR(['#ff8fc8', '#fff3a6', '#ffffff']); g.beginPath(); g.arc(x + 14 + Math.random() * 36, y + 14 + Math.random() * 36, 3.2, 0, TAU); g.fill(); } }
      else if (k === 9) { g.strokeStyle = 'rgba(60,130,100,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + 8, y + 20); g.lineTo(x + 26, y + 30); g.lineTo(x + 30, y + 48); g.stroke(); }
    },
  });
  tileTex.repeat.set(1 / 18, 1 / 18);
  const island = new THREE.Mesh(ig, [new THREE.MeshToonMaterial({ map: tileTex, gradientMap: GRAD }), toon('#7a4ad8')]);
  island.rotation.x = -Math.PI / 2;
  island.position.y = -3.5;
  island.receiveShadow = true;
  sc.add(island);
  const rim = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x, 0.06, z)), true, 'catmullrom', 0.1), 420, 0.2, 6, true), new THREE.MeshBasicMaterial({ color: '#ff4fb0' }));
  const rim2 = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map(([x, z]) => new THREE.Vector3(x * 1.012, -1.6, z * 1.015)), true, 'catmullrom', 0.1), 420, 0.14, 5, true), new THREE.MeshBasicMaterial({ color: '#35e6ff' }));
  sc.add(rim, rim2);

  // --- water ---
  const waterTex = ctex(128, 128, (g) => {
    g.fillStyle = '#3cc8ef'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.lineCap = 'round';
    for (let k = 0; k < 7; k++) { const x = Math.random() * 128, y = Math.random() * 128; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + 8, y - 5, x + 16, y); g.stroke(); }
  }, true);
  waterTex.repeat.set(70, 70);
  const waterMat = new THREE.MeshBasicMaterial({ map: waterTex });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -1.25;
  sc.add(water);

  // --- free spots ---
  const LANDMARKS: [number, number, number][] = [[22, -3, 8], [1.5, -8, 6], [-22, -9, 3.6], [-33, -20.5, 3.4], [0, 13.6, 3.6]];
  const inIsland = (x: number, z: number, m: number) => x > -36 + m && x < 36 - m && z > -24 + m && z < 22 - m && !(x < -5 + m && Math.abs(z) < 2.4 + m) && !(Math.abs(x) > 28 && Math.abs(z) > 16 && Math.hypot(Math.abs(x) - 29, z > 0 ? z - 15 : -z - 17) > 8 - m);
  const free = (x: number, z: number, rN: number, rE: number, m = 1.5) => inIsland(x, z, m) && kit.clearOfPath(x, z, rN, rE) && LANDMARKS.every(([lx, lz, r]) => Math.hypot(lx - x, lz - z) > r);

  // --- buildings (instanced) ---
  const winTex = ctex(64, 128, (g) => { g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 128); g.fillStyle = '#c9c0e6'; for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) g.fillRect(5 + i * 15, 6 + j * 15, 9, 10); });
  const winEmi = ctex(64, 128, (g) => { g.fillStyle = '#000'; g.fillRect(0, 0, 64, 128); for (let i = 0; i < 4; i++) for (let j = 0; j < 8; j++) if (Math.random() < 0.45) { g.fillStyle = pickR(['#ffe680', '#8ff3ff', '#ffb3e0']); g.fillRect(5 + i * 15, 6 + j * 15, 9, 10); } });
  const BGEO = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), BOUT = new THREE.BoxGeometry(1.07, 1.02, 1.07).translate(0, 0.5, 0);
  const blds: { x: number; z: number; w: number; d: number; h: number }[] = [];
  for (let x = -33; x <= 33; x += 4.3) for (let z = -22; z <= 20; z += 4.3) {
    const px = x + rand(-0.8, 0.8), pz = z + rand(-0.8, 0.8);
    if (!free(px, pz, 3.6, 2.8, 2)) continue;
    const front = clamp((pz + 22) / 42, 0, 1);
    blds.push({ x: px, z: pz, w: rand(2.2, 3.3), d: rand(2.2, 3.3), h: lerp(rand(5, 10), rand(1.8, 3.4), front) });
  }
  const BCOL = ['#ffd0e8', '#c8f0ff', '#fff0b8', '#dccbff', '#c9ffd9', '#ffd9c2'];
  const ROOF = ['#ff4fb0', '#35d4ff', '#b8f02a', '#ffd23f', '#8a5bff'];
  const bMat = new THREE.MeshToonMaterial({ map: winTex, emissiveMap: winEmi, emissive: '#ffffff', emissiveIntensity: 0.85, gradientMap: GRAD });
  // windows keep their size on every building: the UVs repeat with the instance's width/height
  for (const t of [winTex, winEmi]) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  bMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
#ifdef USE_INSTANCING
  vec2 wrep = vec2(max(1.0, floor(length(instanceMatrix[0].xyz) / 2.4 + 0.5)), max(1.0, floor(length(instanceMatrix[1].xyz) / 4.6 + 0.5)));
  vMapUv *= wrep; vEmissiveMapUv *= wrep;
#endif`);
  };
  const bM = new THREE.InstancedMesh(BGEO, bMat, blds.length);
  const bO = new THREE.InstancedMesh(BOUT, OUT, blds.length), rM = new THREE.InstancedMesh(BOX, toon('#ffffff'), blds.length);
  blds.forEach((b, i) => {
    dummy.position.set(b.x, 0, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
    bM.setMatrixAt(i, dummy.matrix); bO.setMatrixAt(i, dummy.matrix); bM.setColorAt(i, _c.set(BCOL[i % BCOL.length]));
    dummy.position.set(b.x, b.h + 0.15, b.z); dummy.scale.set(b.w + 0.35, 0.3, b.d + 0.35); dummy.updateMatrix();
    rM.setMatrixAt(i, dummy.matrix); rM.setColorAt(i, _c.set(ROOF[i % ROOF.length]));
  });
  bM.castShadow = rM.castShadow = true;
  bM.receiveShadow = rM.receiveShadow = true;
  sc.add(bM, bO, rM);

  // --- façade detail: doors, awnings, balconies, rooftop clutter (instanced) ---
  {
    const doors: Item[] = [], awn: Item[] = [], balc: Item[] = [], ac: Item[] = [], tank: Item[] = [], ant: Item[] = [];
    const AWN = ['#ff4fb0', '#35d4ff', '#ffd23f', '#b8f02a', '#ff9a5c', '#b46bff'];
    blds.forEach((b, i) => {
      const fz = b.z + b.d / 2;
      doors.push({ x: b.x - b.w * 0.18, z: fz + 0.03, c: AWN[(i + 2) % AWN.length] });
      if (b.h > 2.6) awn.push({ x: b.x + b.w * 0.12, y: 1.75, z: fz + 0.36, sx: b.w * 0.62, c: AWN[i % AWN.length] });
      for (let y = 3.2; y < b.h - 0.8; y += 2.3) balc.push({ x: b.x, y, z: fz, sx: b.w * 0.72, c: i % 2 ? '#ffffff' : '#fff0f8' });
      const r = (i * 37) % 7, top = b.h + 0.3;
      if (r < 3) ac.push({ x: b.x + b.w * 0.18, y: top, z: b.z - b.d * 0.15, ry: r, c: '#eae6f6' });
      if (r === 2 || r === 5) tank.push({ x: b.x - b.w * 0.2, y: top, z: b.z + b.d * 0.12, s: 0.8, c: pickR(['#ffd0e8', '#c8f0ff', '#fff0b8']) });
      if (r === 4 || r === 6 || (b.h > 7 && r === 1)) ant.push({ x: b.x + b.w * 0.25, y: top, z: b.z + b.d * 0.2 });
    });
    instanced(sc, PROPS.door(), doors, { cast: false });
    instanced(sc, PROPS.awning(), awn);
    instanced(sc, PROPS.balcony(), balc, { cast: false });
    instanced(sc, PROPS.roofAC(), ac);
    instanced(sc, PROPS.roofTank(), tank);
    instanced(sc, PROPS.antenna(), ant, { cast: false });
  }
  const nearBld = (x: number, z: number, m: number) => blds.some((b) => Math.abs(b.x - x) < b.w / 2 + m && Math.abs(b.z - z) < b.d / 2 + m);

  // --- static decor batch (trees, lamps, landmarks) ---
  const st = new Batch(), gl = new Batch();
  let trees = 0;
  for (let k = 0; k < 400 && trees < 46; k++) {
    const x = rand(-34, 34), z = rand(-23, 21);
    if (!free(x, z, 1.9, 1.3, 1) || blds.some((b) => Math.hypot(b.x - x, b.z - z) < Math.max(b.w, b.d) * 0.8 + 0.8)) continue;
    const s = rand(0.8, 1.2), col = pickR(['#3fd27a', '#2fc4a0', '#7be05a', '#ff8fc8', '#3fd27a']);
    st.add(CYL8, '#8a4e2e', x, 0.5 * s, z, 0, 0, 0, 0.16 * s, 1 * s, 0.16 * s);
    st.add(SPH_LO, col, x, 1.45 * s, z, 0, 0, 0, 0.8 * s, 0.7 * s, 0.8 * s);
    st.add(SPH_LO, col, x + 0.3 * s, 1.95 * s, z - 0.1, 0, 0, 0, 0.5 * s);
    trees++;
  }
  nodes.forEach((n, i) => {
    if (i % 3) return;
    const nx = nodes[n.next[0]];
    if (!nx) return;
    const dx = nx.x - n.x, dz = nx.z - n.z, l = Math.hypot(dx, dz) || 1, ox = (-dz / l) * 1.9, oz = (dx / l) * 1.9;
    const x = n.x + ox, z = n.z + oz;
    if (!inIsland(x, z, 0.6) || inCanal(x, z)) return;
    st.add(CYL8, '#2a1258', x, 1.2, z, 0, 0, 0, 0.08, 2.4, 0.08); st.add(CYL8, '#2a1258', x, 0.1, z, 0, 0, 0, 0.22, 0.2, 0.22);
    gl.add(SPH_LO, i % 2 ? '#ff7ad0' : '#7af0ff', x, 2.5, z, 0, 0, 0, 0.26);
  });
  // start sign
  st.add(BOX, '#2a1258', -3.2, 1.6, 13.8, 0, 0, 0, 0.25, 3.2, 0.25); st.add(BOX, '#2a1258', 3.2, 1.6, 13.8, 0, 0, 0, 0.25, 3.2, 0.25);
  ([['#ff4fb0', -2.6], ['#ffd23f', -3.4], ['#35d4ff', 2.8], ['#b8f02a', 3.6]] as const).forEach(([c, x]) => { st.beam([x > 0 ? 3.2 : -3.2, 3.2, 13.8], [x, 4.6, 13.6], 0.02, '#ffffff'); st.add(SPH, c, x, 4.9, 13.6, 0, 0, 0, 0.38, 0.46, 0.38); });
  const startSign = new THREE.Mesh(new THREE.PlaneGeometry(6.6, 1.7), new THREE.MeshBasicMaterial({
    map: ctex(512, 132, (g) => {
      g.fillStyle = '#1a0b33'; g.fillRect(0, 0, 512, 132);
      const gr = g.createLinearGradient(0, 0, 512, 0);
      ['#ff7ac2', '#ffe14a', '#9dffcf', '#6fd6ff', '#b38cff'].forEach((c, i) => gr.addColorStop(i / 4, c));
      g.strokeStyle = gr; g.lineWidth = 10; g.strokeRect(6, 6, 500, 120);
      g.font = `italic 900 92px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = gr; g.fillText('★ START ★', 256, 72);
    }),
  }));
  startSign.position.set(0, 2.6, 13.95);
  sc.add(startSign);

  // fixed bridge (Hafenweg) + drawbridge towers (Brückenweg)
  let drawX = 0;
  for (const e of edges.filter((x) => x.flag)) {
    const A = nodes[e.a], B = nodes[e.b], mx = (A.x + B.x) / 2, yaw = Math.atan2(B.x - A.x, B.z - A.z);
    if (e.flag === 'fixed') {
      st.add(BOX, '#fff1d6', mx, 0.2, 0, 0, yaw, 0, 2.2, 0.3, 7.6); st.add(BOX, '#8e6be0', mx, 0.02, 0, 0, yaw, 0, 2.6, 0.25, 7.9);
      for (const s of [-1, 1]) {
        const px = mx + Math.cos(yaw) * s * 1.2, pz = -Math.sin(yaw) * s * 1.2;
        st.add(BOX, '#ff4fb0', px, 0.75, pz, 0, yaw, 0, 0.16, 0.16, 7.4);
        for (let k = -3; k <= 3; k++) st.add(CYL8, '#ffffff', px + Math.sin(yaw) * k * 1.15, 0.45, pz + Math.cos(yaw) * k * 1.15, 0, 0, 0, 0.08, 0.6, 0.08);
      }
    } else {
      drawX = mx;
      for (const sx of [-1.6, 1.6]) for (const sz of [-2.9, 2.9]) { st.add(BOX, '#dccbff', mx + sx, 1.1, sz, 0, 0, 0, 0.6, 2.2, 0.6); st.add(CONE, '#ff4fb0', mx + sx, 2.6, sz, 0, Math.PI / 4, 0, 0.55, 0.8, 0.55); }
    }
  }
  void ids.draw;
  const leaves: { g: THREE.Group; s: number }[] = [];
  for (const s of [1, -1]) {
    const g = new THREE.Group();
    g.position.set(drawX, 0.22, s * 2.5);
    const lb = new Batch();
    lb.add(BOX, '#fff1d6', 0, 0, -s * 1.25, 0, 0, 0, 2.3, 0.3, 2.5); lb.add(BOX, '#8e6be0', 0, -0.12, -s * 1.25, 0, 0, 0, 2.6, 0.2, 2.6);
    lb.add(BOX, '#ffd23f', 1.2, 0.25, -s * 1.25, 0, 0, 0, 0.12, 0.2, 2.4); lb.add(BOX, '#ffd23f', -1.2, 0.25, -s * 1.25, 0, 0, 0, 0.12, 0.2, 2.4);
    for (let k = 0; k < 3; k++) lb.add(BOX, k % 2 ? '#ff3d6e' : '#ffffff', 0, 0.17, -s * (0.4 + k * 0.8), 0, 0, 0, 2.2, 0.04, 0.35);
    g.add(lb.mesh());
    sc.add(g);
    leaves.push({ g, s });
  }
  const lampMat = new THREE.MeshBasicMaterial({ color: '#7dff8a' });
  const bridgeLamp = new THREE.Mesh(SPH_LO, lampMat);
  bridgeLamp.scale.setScalar(0.32);
  bridgeLamp.position.set(drawX + 1.6, 3.2, 2.9);
  const bridgeLamp2 = bridgeLamp.clone();
  bridgeLamp2.position.z = -2.9;
  sc.add(bridgeLamp, bridgeLamp2);

  // Riesenrad
  const FW = { x: 22, y: 7.8, z: -3, R: 5.4 };
  for (const sz of [-1.1, 1.1]) { st.beam([FW.x - 3.4, 0, FW.z + sz * 1.4], [FW.x, FW.y, FW.z + sz], 0.22, '#ffffff'); st.beam([FW.x + 3.4, 0, FW.z + sz * 1.4], [FW.x, FW.y, FW.z + sz], 0.22, '#ffffff'); }
  st.add(CYL, '#ff4fb0', FW.x, 0.15, FW.z, 0, 0, 0, 4.4, 0.3, 2.8); st.add(BOX, '#ffd23f', FW.x + 2.6, 0.9, FW.z + 1.6, 0, 0, 0, 1.2, 1.4, 1);
  const wb = new Batch(), wg = new Batch();
  for (const sz of [-0.75, 0.75]) { wb.add(TOR, '#ff4fb0', 0, 0, sz, 0, 0, 0, FW.R, FW.R, 2); for (let k = 0; k < 12; k++) { const a = (k / 12) * TAU; wb.beam([0, 0, sz], [Math.cos(a) * FW.R, Math.sin(a) * FW.R, sz], 0.06, '#ffffff'); } }
  wb.add(CYL, '#ffd23f', 0, 0, 0, Math.PI / 2, 0, 0, 0.6, 1.9, 0.6);
  for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; wg.add(SPH_LO, k % 2 ? '#ffe680' : '#8ff3ff', Math.cos(a) * FW.R, Math.sin(a) * FW.R, 0.95, 0, 0, 0, 0.16); }
  const wheel = new THREE.Group();
  wheel.position.set(FW.x, FW.y, FW.z);
  wheel.add(wb.mesh(VC, false), wg.mesh(GLOW, false, false));
  sc.add(wheel);
  const gb = new Batch();
  gb.add(BOX, '#ffffff', 0, -0.45, 0, 0, 0, 0, 1, 0.8, 0.9); gb.add(BOX, '#1a0b33', 0, -0.35, 0.46, 0, 0, 0, 0.7, 0.35, 0.02); gb.add(CONE, '#ffffff', 0, 0.12, 0, 0, Math.PI / 4, 0, 0.8, 0.4, 0.8); gb.add(CYL8, '#2a1258', 0, 0.5, 0, 0, 0, 0, 0.05, 0.5, 0.05);
  const gondolas = new THREE.InstancedMesh(gb.geometry(), VC, 10);
  for (let k = 0; k < 10; k++) gondolas.setColorAt(k, _c.set(['#ff7ad0', '#ffd23f', '#35d4ff', '#b8f02a', '#ff9a5c'][k % 5]));
  gondolas.frustumCulled = false;
  gondolas.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  sc.add(gondolas);

  // Plaza with the Drehbühne + star statue; an arrow on the stage shows the open exit
  const PZ = { x: 1.5, z: -8 };
  st.add(CYL, '#8e6be0', PZ.x, 0.08, PZ.z, 0, 0, 0, 5.1, 0.16, 5.1); st.add(CYL, '#e6dcff', PZ.x, 0.14, PZ.z, 0, 0, 0, 4.8, 0.16, 4.8);
  for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU; gl.add(SPH_LO, k % 2 ? '#ff7ad0' : '#ffe680', PZ.x + Math.cos(a) * 4.5, 0.35, PZ.z + Math.sin(a) * 4.5, 0, 0, 0, 0.2); }
  const tb = new Batch(), TT = ['#ff5fae', '#ffd23f', '#35d4ff', '#b8f02a'];
  for (let k = 0; k < 8; k++) tb.addM(new THREE.CylinderGeometry(3.5, 3.5, 0.3, 6, 1, false, (k * TAU) / 8, TAU / 8), TT[k % 4], new THREE.Matrix4());
  tb.add(CYL, '#ffffff', 0, 0.5, 0, 0, 0, 0, 0.9, 0.8, 0.9); tb.add(CYL, '#1a0b33', 0, 0.95, 0, 0, 0, 0, 1.05, 0.12, 1.05);
  // exit arrow on the stage (points +x = east when open)
  tb.addM(new THREE.ConeGeometry(0.7, 1.4, 3).rotateZ(-Math.PI / 2), '#ffffff', new THREE.Matrix4().makeTranslation(2.6, 0.35, 0));
  tb.add(BOX, '#ffffff', 1.6, 0.35, 0, 0, 0, 0, 1.4, 0.12, 0.5);
  const turn = new THREE.Group();
  turn.position.set(PZ.x, 0.38, PZ.z);
  turn.add(tb.mesh(VC, false));
  const statue = new THREE.Mesh(STAR_GEO, VC_EMI);
  statue.scale.setScalar(1.5);
  statue.position.y = 2.6;
  turn.add(statue);
  sc.add(turn);
  // the gate at the start of the Plaza-Abkürzung
  const dA = nodes[ids.j4], dB = nodes[ids.dFirst];
  const gx = lerp(dA.x, dB.x, 0.5), gz = lerp(dA.z, dB.z, 0.5), gyaw = Math.atan2(dB.x - dA.x, dB.z - dA.z);
  for (const s of [-1, 1]) st.add(BOX, '#2a1258', gx + Math.cos(gyaw) * s * 1.1, 0.8, gz - Math.sin(gyaw) * s * 1.1, 0, 0, 0, 0.25, 1.6, 0.25);
  const gate = new THREE.Group();
  gate.position.set(gx + Math.cos(gyaw) * 1.1, 1.3, gz - Math.sin(gyaw) * 1.1);
  gate.rotation.y = gyaw + Math.PI / 2;
  const gateBar = new Batch();
  for (let k = 0; k < 4; k++) gateBar.add(BOX, k % 2 ? '#ffffff' : '#ff3d6e', -0.28 - k * 0.55, 0, 0, 0, 0, 0, 0.55, 0.22, 0.14);
  gate.add(gateBar.mesh());
  sc.add(gate);

  // Neonturm with sign + spinning crown
  const NT = { x: -22, z: -9 };
  st.add(BOX, '#5b2bd6', NT.x, 0.5, NT.z, 0, 0, 0, 4, 1, 4);
  st.addM(new THREE.CylinderGeometry(0.9, 1.5, 9, 16), '#dccbff', new THREE.Matrix4().makeTranslation(NT.x, 5.5, NT.z));
  for (let k = 0; k < 4; k++) gl.add(TOR, k % 2 ? '#35e6ff' : '#ff4fb0', NT.x, 2.5 + k * 2, NT.z, Math.PI / 2, 0, 0, 1.45 - k * 0.13, 1.45 - k * 0.13, 3);
  gl.add(SPH, '#fff3a6', NT.x, 10.6, NT.z, 0, 0, 0, 0.55);
  const crownB = new Batch();
  for (let k = 0; k < 6; k++) { const a = (k / 6) * TAU; crownB.add(CONE, k % 2 ? '#ff4fb0' : '#ffd23f', Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1, 0, 0, 0, 0.25, 0.9, 0.25); }
  crownB.add(CYL, '#1a0b33', 0, -0.5, 0, 0, 0, 0, 1.3, 0.2, 1.3);
  const crown = crownB.mesh(VC, false);
  crown.position.set(NT.x, 10.4, NT.z);
  sc.add(crown);
  const neonSign = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 1.6), new THREE.MeshBasicMaterial({
    transparent: true,
    map: ctex(512, 160, (g) => {
      g.fillStyle = 'rgba(26,11,51,.92)'; g.fillRect(0, 0, 512, 160);
      g.strokeStyle = '#ff4fb0'; g.lineWidth = 10; g.strokeRect(8, 8, 496, 144);
      g.font = `italic 900 112px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.shadowColor = '#35e6ff'; g.shadowBlur = 18; g.fillStyle = '#c8fbff'; g.fillText('NEON', 256, 88);
    }),
  }));
  neonSign.position.set(NT.x, 6.6, NT.z + 1.45);
  sc.add(neonSign);

  // Leuchtturm + beam
  const LH = { x: -33, z: -20.5 };
  for (let k = 0; k < 5; k++) st.add(CYL, k % 2 ? '#ffffff' : '#ff3d6e', LH.x, 0.8 + k * 1.6, LH.z, 0, 0, 0, 1.3 - k * 0.1, 1.6, 1.3 - k * 0.1);
  st.add(CYL, '#1a0b33', LH.x, 8.5, LH.z, 0, 0, 0, 1.25, 0.25, 1.25); st.add(CONE, '#ff3d6e', LH.x, 10.4, LH.z, 0, 0, 0, 1.1, 1.2, 1.1);
  gl.add(CYL, '#fff3a6', LH.x, 9.2, LH.z, 0, 0, 0, 0.75, 1.2, 0.75);
  const beamG = new THREE.Group();
  beamG.position.set(LH.x, 9.2, LH.z);
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.2, 16, 16, 1, true).translate(0, -8, 0), new THREE.MeshBasicMaterial({ color: '#fff3a6', transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  beam.rotation.z = Math.PI / 2;
  beamG.add(beam);
  sc.add(beamG);

  // a kiosk next to every shop
  for (const n of nodes.filter((x) => x.type === 'S')) {
    const nx = nodes[n.next[0]];
    const dx = nx.x - n.x, dz = nx.z - n.z, l = Math.hypot(dx, dz) || 1;
    let kx = n.x + (dz / l) * 2.6, kz = n.z - (dx / l) * 2.6;
    if (!inIsland(kx, kz, 1) || inCanal(kx, kz)) { kx = n.x - (dz / l) * 2.6; kz = n.z + (dx / l) * 2.6; }
    const yaw = Math.atan2(n.x - kx, n.z - kz);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(kx, 0, kz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0)), new THREE.Vector3(1, 1, 1));
    const kb = new Batch();
    kb.add(BOX, '#ffffff', 0, 0.6, 0, 0, 0, 0, 2.4, 1.2, 1.4); kb.add(BOX, '#b46bff', 0, 0.6, 0.72, 0, 0, 0, 2.2, 0.9, 0.05);
    for (let k = 0; k < 6; k++) kb.add(BOX, k % 2 ? '#ffffff' : '#b46bff', -1.25 + k * 0.5, 2.1, 0.35, -0.35, 0, 0, 0.5, 0.1, 1.7);
    kb.add(CYL8, '#2a1258', -1.1, 1.3, 0.9, 0, 0, 0, 0.06, 1.6, 0.06); kb.add(CYL8, '#2a1258', 1.1, 1.3, 0.9, 0, 0, 0, 0.06, 1.6, 0.06);
    st.addM(kb.geometry(), '#ffffff', m);
  }
  // harbour + boats
  st.add(BOX, '#c79a6a', -40, -0.6, 9, 0, 0, 0, 7, 0.25, 1.6);
  for (let k = 0; k < 4; k++) st.add(CYL8, '#8a4e2e', -43 + k * 2, -1, 9.8, 0, 0, 0, 0.15, 1.4, 0.15);
  const boats: THREE.Mesh[] = [];
  ([[-42, 12, '#ff5fae'], [-44, -8, '#35d4ff'], [12, 28, '#ffd23f'], [41, -6, '#b8f02a']] as const).forEach(([x, z, c], i) => {
    const bb = new Batch();
    bb.add(SPH, '#ffffff', 0, 0, 0, 0, 0, 0, 1, 0.45, 2.1); bb.add(BOX, c, 0, 0.35, 0, 0, 0, 0, 1.6, 0.2, 3); bb.add(CYL8, '#2a1258', 0, 1.6, 0, 0, 0, 0, 0.07, 2.6, 0.07);
    bb.addM(new THREE.ConeGeometry(1.1, 2.2, 3).rotateY(Math.PI / 6), c, new THREE.Matrix4().compose(new THREE.Vector3(0, 1.8, -0.4), new THREE.Quaternion(), new THREE.Vector3(0.15, 1, 1)));
    const m = bb.mesh(VC, false);
    m.position.set(x, -1.1, z);
    m.rotation.y = i * 1.3;
    sc.add(m);
    boats.push(m);
  });
  // --- street furniture along the paths and greenery on free spots (instanced) ---
  {
    const bench: Item[] = [], bed: Item[] = [], hyd: Item[] = [], sign: Item[] = [], bush: Item[] = [], tuft: Item[] = [];
    const taken: P2[] = [];
    const ok = (x: number, z: number, r: number) => !inCanal(x, z) && inIsland(x, z, 0.8) && !nearBld(x, z, 0.5) && taken.every(([a, b]) => Math.hypot(a - x, b - z) > r) && LANDMARKS.every(([lx, lz, rr]) => Math.hypot(lx - x, lz - z) > rr);
    edges.forEach((e, i) => {
      if (e.flag) return;
      const A = nodes[e.a], B = nodes[e.b], dx = B.x - A.x, dz = B.z - A.z, l = Math.hypot(dx, dz) || 1, nx = -dz / l, nz = dx / l;
      const side = i % 2 ? 1 : -1, mx = (A.x + B.x) / 2 + nx * side * 2.0, mz = (A.z + B.z) / 2 + nz * side * 2.0;
      if (!ok(mx, mz, 1.6) || !kit.clearOfPath(mx, mz, 1.5, 1.05)) return;
      taken.push([mx, mz]);
      const face = Math.atan2(-nx * side, -nz * side), kind = i % 5;
      if (kind === 0 || kind === 3) bench.push({ x: mx, z: mz, ry: face, c: pickR(['#ff7ad0', '#35d4ff', '#ffd23f', '#ffffff']) });
      else if (kind === 1) bed.push({ x: mx, z: mz, ry: face, c: pickR(['#ff5fae', '#ffd23f', '#ff9a5c', '#b46bff']) });
      else if (kind === 2) hyd.push({ x: mx, z: mz, c: pickR(['#ff3d6e', '#ffd23f']) });
      else sign.push({ x: mx, z: mz, ry: face, c: pickR(['#35d4ff', '#ffd23f', '#ff4fb0']) });
    });
    for (let k = 0; k < 900 && bush.length < 38; k++) {
      const x = rand(-35, 35), z = rand(-23.5, 21.5);
      if (!ok(x, z, 1.2) || !kit.clearOfPath(x, z, 1.5, 1.0)) continue;
      taken.push([x, z]);
      bush.push({ x, z, s: rand(0.7, 1.15), ry: rand(0, TAU), c: pickR(['#3fd27a', '#2fc4a0', '#7be05a', '#5fd88a']) });
    }
    for (let k = 0; k < 900 && tuft.length < 90; k++) {
      const x = rand(-35.5, 35.5), z = rand(-24, 22);
      if (inCanal(x, z) || !inIsland(x, z, 0.4) || nearBld(x, z, 0.2) || !kit.clearOfPath(x, z, 1.4, 0.8)) continue;
      tuft.push({ x, z, s: rand(0.8, 1.4), ry: rand(0, TAU), c: pickR(['#4fcf7a', '#6fdc6a', '#3fbf8a']) });
    }
    instanced(sc, PROPS.bench(), bench);
    instanced(sc, PROPS.flowers(), bed);
    instanced(sc, PROPS.hydrant(), hyd);
    instanced(sc, PROPS.sign(), sign);
    instanced(sc, PROPS.bush(), bush);
    instanced(sc, PROPS.tuft(), tuft, { cast: false });
  }

  // --- ambient life: boats around the island, strollers on the promenade, gulls ---
  const isle = roundRect(-37, 37, -25, 23, 8, 6);
  const shore = foam(sc, isle, -1.2, '#ffffff', 2.2);
  loopers(sc, BOAT, roundRect(-47, 47, -33, 31, 10, 6), 7, { y: -1.2, speed: 2.2, colors: ['#ff5fae', '#35d4ff', '#ffd23f', '#b8f02a', '#ff9a5c'], scale: 1.1 });
  {
    const walk: P2[] = [];
    for (let x = -30; x <= 30; x += 3) walk.push([x, 20.7]);
    const back = walk.slice(1, -1).reverse().map(([x, z]) => [x, z + 0.7] as P2);
    loopers(sc, PERSON, [...walk, ...back], 12, { y: 0, speed: 0.9, colors: ['#ff4fb0', '#35d4ff', '#ffd23f', '#8a5bff', '#ff9a5c', '#ffffff'], scale: 0.85, bob: 0.06 });
    const ring: P2[] = [];
    for (let k = 0; k < 24; k++) { const a = (k / 24) * TAU; ring.push([1.5 + Math.cos(a) * 5.75, -8 + Math.sin(a) * 5.75]); }
    loopers(sc, PERSON, ring, 7, { y: 0, speed: 0.7, dir: -1, colors: ['#b8f02a', '#ff7ad0', '#35d4ff', '#ffffff'], scale: 0.85, bob: 0.06 });
  }
  flock(sc, 9, 4, -4, 26, 17, '#ffffff');

  // clouds
  const cl = new THREE.InstancedMesh(SPH_LO, toon('#ffffff'), 30);
  let ci = 0;
  ([[-55, 6, -30], [50, 9, -34], [-60, 10, 20], [58, 7, 18], [0, 12, -52], [-30, 8, 44]] as const).forEach(([x, y, z]) => {
    for (let k = 0; k < 5; k++) { dummy.position.set(x + (k - 2) * 2.6, y + (k % 2) * 0.9, z + rand(-1, 1)); dummy.rotation.set(0, 0, 0); dummy.scale.set(rand(2, 3), rand(1.4, 2), rand(1.8, 2.4)); dummy.updateMatrix(); cl.setMatrixAt(ci++, dummy.matrix); }
  });
  cl.count = ci;
  sc.add(cl);
  sc.add(st.mesh(), gl.mesh(GLOW, false, false));

  // ---------- state ----------
  let bridge = 0, plaza = 0, plazaT = 0, night = 0, nightT = 0;
  const setBridge = (v: number) => { bridge = v; for (const L of leaves) L.g.rotation.x = L.s * v * 1.12; };
  const setPlaza = (open: boolean) => { plazaT = open ? 0 : Math.PI / 2; };
  const setGate = (open: boolean) => { gate.rotation.z = open ? Math.PI / 2.3 : 0; };
  const setNight = (k: number) => {
    night = k;
    kit.lights.hemi.intensity = lerp(1.55, 0.55, k);
    kit.lights.sun.intensity = lerp(2.3, 0.6, k);
    bMat.emissiveIntensity = lerp(0.85, 1.6, k);
    sc.background = k > 0.5 ? skyNight : sky;
    (sc.fog as THREE.Fog).color.set(k > 0.5 ? '#3a1a7a' : '#f2a3d0');
    waterMat.color.setScalar(lerp(1, 0.45, k));
  };

  return {
    overview: { x: 0, z: -1.5, w: 76, d: 50 },
    apply(bs) {
      const up = !!bs.bridgeUp, open = bs.plazaOpen !== false;
      setBridge(up ? 1 : 0);
      lampMat.color.set(up ? '#ff3d6e' : '#7dff8a');
      setPlaza(open);
      plaza = plazaT;
      setGate(open);
      nightT = bs.night ? 1 : 0;
      setNight(nightT);
    },
    async play(name, data) {
      if (name === 'bridge') {
        const up = !!data?.up;
        kit.look(drawX, 0);
        await wait(650);
        sfx.creak();
        lampMat.color.set(up ? '#ff3d6e' : '#7dff8a');
        const from = bridge, to = up ? 1 : 0;
        await tween(1.3, (k) => setBridge(lerp(from, to, k)), E.inOut);
        await wait(500);
        kit.follow();
      } else if (name === 'plaza') {
        const open = !!data?.open;
        kit.look(PZ.x + 4, PZ.z);
        await wait(500);
        sfx.whoosh();
        setPlaza(open);
        await tween(0.5, (k) => setGate(open ? k > 0.5 : k < 0.5));
        await wait(900);
        kit.follow();
      } else if (name === 'night') {
        const on = !!data?.on;
        nightT = on ? 1 : 0;
        await wait(800);
      }
    },
    update(dt, t) {
      wheel.rotation.z = t * 0.18;
      for (let k = 0; k < 10; k++) {
        const a = t * 0.18 + (k / 10) * TAU;
        dummy.position.set(FW.x + Math.cos(a) * FW.R, FW.y + Math.sin(a) * FW.R - 0.25, FW.z);
        dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
        gondolas.setMatrixAt(k, dummy.matrix);
      }
      gondolas.instanceMatrix.needsUpdate = true;
      plaza += (plazaT - plaza) * (1 - Math.exp(-dt * 3));
      turn.rotation.y = plaza + Math.sin(t * 0.6) * 0.04;
      statue.rotation.y = t * 0.8;
      crown.rotation.y = -t * 0.8;
      beamG.rotation.y = t * 0.9;
      for (let i = 0; i < boats.length; i++) { const m = boats[i]; m.position.y = -1.1 + Math.sin(t * 1.6 + i) * 0.12; m.rotation.z = Math.sin(t * 1.2 + i * 2) * 0.06; }
      waterTex.offset.set(t * 0.004, t * 0.006);
      shore.tick(t);
      if (Math.abs(night - nightT) > 0.001) setNight(night + (nightT - night) * Math.min(1, dt * 2));
    },
  };
}
