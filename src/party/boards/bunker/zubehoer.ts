// CS-Bunker accessories (stage 4 detail pass, own shapes and names only): barbed-wire coils on
// the fence, sandbag nests, a field command post under a camo net (map table, radios, chairs),
// an ammo depot under a second net, lockers at the Lager, workbenches with tools, warning signs,
// barrier tape around the maintenance pit, oil puddles, steam from vents and the pipe run behind
// the vault, caged corridor lamps that flicker, and forklifts that shuttle crates between pallets.
// Static parts go into merged cells (zubehoer.ts): big things always, small things only near the
// camera. Moving parts (forklifts, flicker) sleep with quality.fx.

import type { BoardKit } from '../../view3d/boardview';
import { BOX, Batch, CYL8, GRAD, SPH_LO, THREE, ctex } from '../../view3d/kit';
import { quality } from '../../view3d/quality';
import { aoAdd, type AirArea } from '../../view3d/fx3d';
import { TAU, rand } from '../../util';
import { BULB, LEAF, type P2 } from '../bauteile';
import { VCT } from '../details';
import { Blinkers, Cells, decals, local, prefab } from '../zubehoer';
import { glow } from '../../view3d/shaderfx';

const STEEL = '#4a5562', HAZ = '#ffc61a', DARK = '#23272e', OLIVE = '#5f6b3a', OLIVE_D = '#47512a', SAND = '#c7b089', SAND_D = '#b39b74', WOOD = '#a9824e', RED = '#c9442f';
const WIRE = new THREE.TorusGeometry(1, 0.09, 3, 9);

export interface BunkerAcc { update(dt: number, t: number): void }

export function bunkerZubehoer(kit: BoardKit, o: {
  free: (x: number, z: number, rN: number, rE: number, m?: number) => boolean;
  tryPlace: (x: number, z: number, rN: number, rE: number, gap: number) => boolean;
  placed: [number, number][];
  outline: P2[];
  air: AirArea[];
  WH: { x: number; z: number; w: number; d: number };
  EH: { x: number; z: number; w: number; d: number };
  HQ: { x: number; z: number };
  vault: { x0: number; x1: number; z0: number; z1: number };
  crateCol: string[];
}): BunkerAcc {
  const sc = kit.scene, nodes = kit.graph.nodes, { WH, EH, HQ, vault: V } = o;
  const big = new Cells(40), fine = new Cells(16, 44), mid = new Cells(24, 62);
  const clear = kit.clearOfPath;
  /** First free spot from the candidates, else a random one (reserved in `placed`). */
  const spot = (rN: number, rE: number, gap: number, cands: P2[] = [], tries = 900, ok: (x: number, z: number) => boolean = () => true): P2 | null => {
    for (const [x, z] of cands) if (ok(x, z) && o.tryPlace(x, z, rN, rE, gap)) return [x, z];
    for (let k = 0; k < tries; k++) { const x = rand(-33, 33), z = rand(-23, 19); if (ok(x, z) && o.tryPlace(x, z, rN, rE, gap)) return [x, z]; }
    return null;
  };
  /** A camo net hangs high: seen from the camera it reaches further towards +z, keep that side clear too. */
  const netOk = (x: number, z: number) => clear(x, z + 1.8, 4.0, 3.4);

  // ---------- prefabs ----------
  const AMMO = prefab((b) => {
    b.add(BOX, OLIVE, 0, 0.2, 0, 0, 0, 0, 0.9, 0.4, 0.5);
    b.add(BOX, OLIVE_D, 0, 0.42, 0, 0, 0, 0, 0.94, 0.05, 0.54);
    b.add(BOX, HAZ, 0, 0.2, 0.252, 0, 0, 0, 0.5, 0.07, 0.01);
    for (const s of [-1, 1]) { b.add(BOX, DARK, s * 0.46, 0.25, 0, 0, 0, 0, 0.03, 0.06, 0.2); b.add(BOX, '#8a9098', s * 0.3, 0.38, 0.26, 0, 0, 0, 0.06, 0.08, 0.02); }
  });
  const LOCKER = prefab((b) => {
    b.add(BOX, '#ffffff', 0, 0.95, 0, 0, 0, 0, 0.56, 1.9, 0.5);
    b.add(BOX, '#2a3038', 0, 0.95, 0.252, 0, 0, 0, 0.02, 1.86, 0.01);
    for (const s of [-1, 1]) {
      for (let k = 0; k < 4; k++) b.add(BOX, '#2a3038', s * 0.14, 1.62 - k * 0.07, 0.253, 0, 0, 0, 0.16, 0.025, 0.01);
      b.add(BOX, '#d8dce4', s * 0.035, 1.0, 0.26, 0, 0, 0, 0.025, 0.14, 0.02);
      b.add(BOX, '#f4f4f0', s * 0.14, 1.3, 0.254, 0, 0, 0, 0.12, 0.06, 0.01);
    }
  });
  const JERRY = prefab((b) => { b.add(BOX, '#ffffff', 0, 0.24, 0, 0, 0, 0, 0.18, 0.46, 0.34); b.add(BOX, '#ffffff', 0, 0.5, -0.06, 0, 0, 0, 0.1, 0.06, 0.18); b.add(CYL8, DARK, 0, 0.5, 0.11, 0, 0, 0, 0.03, 0.07, 0.03); });
  const EXTING = prefab((b) => { b.add(CYL8, '#d02a20', 0, 0.3, 0, 0, 0, 0, 0.1, 0.5, 0.1); b.add(SPH_LO, '#d02a20', 0, 0.55, 0, 0, 0, 0, 0.1, 0.06, 0.1); b.add(BOX, DARK, 0, 0.64, 0, 0, 0, 0, 0.05, 0.08, 0.12); b.beam([0, 0.62, 0.06], [0.08, 0.3, 0.12], 0.015, DARK); });
  const GASBOTTLE = prefab((b) => { for (let k = 0; k < 3; k++) { const x = (k - 1) * 0.26; b.add(CYL8, ['#2f6fb5', '#8a9098', RED][k], x, 0.55, 0, 0, 0, 0, 0.12, 1.1, 0.12); b.add(SPH_LO, ['#2f6fb5', '#8a9098', RED][k], x, 1.1, 0, 0, 0, 0, 0.12, 0.08, 0.12); b.add(CYL8, '#d8dce4', x, 1.2, 0, 0, 0, 0, 0.035, 0.1, 0.035); } b.add(BOX, DARK, 0, 0.75, -0.13, 0, 0, 0, 0.9, 0.04, 0.02); });
  const RADIO = prefab((b, g) => {
    b.add(BOX, OLIVE_D, 0, 0.17, 0, 0, 0, 0, 0.5, 0.34, 0.3);
    b.add(BOX, '#2a3038', 0, 0.2, 0.152, 0, 0, 0, 0.44, 0.24, 0.01);
    g.add(BOX, '#7dff8a', -0.1, 0.24, 0.158, 0, 0, 0, 0.16, 0.08, 0.005);
    g.add(BULB, '#ff4a3a', 0.15, 0.27, 0.158, 0, 0, 0, 0.018);
    for (let k = 0; k < 3; k++) b.add(CYL8, '#c8ccd2', 0.04 + k * 0.07, 0.13, 0.165, Math.PI / 2, 0, 0, 0.022, 0.02, 0.022);
    b.beam([0.2, 0.34, -0.08], [0.32, 1.25, -0.12], 0.008, DARK);
    b.add(BOX, DARK, -0.3, 0.12, 0.05, 0, 0.4, 0, 0.08, 0.06, 0.2);
  });
  const CHAIR = prefab((b) => {
    b.add(BOX, OLIVE_D, 0, 0.45, 0, 0, 0, 0, 0.42, 0.04, 0.4);
    b.add(BOX, OLIVE_D, 0, 0.72, -0.2, -0.12, 0, 0, 0.42, 0.3, 0.03);
    for (const s of [-1, 1]) { b.beam([s * 0.19, 0, 0.2], [s * 0.19, 0.86, -0.22], 0.018, '#8a9098'); b.beam([s * 0.19, 0, -0.2], [s * 0.19, 0.45, 0.18], 0.018, '#8a9098'); }
  });
  const BENCH = prefab((b, g) => {
    // workbench, facing +z: top, legs, shelf, vise, toolbox, drill, spanners, pegboard with tools
    b.add(BOX, WOOD, 0, 0.9, 0, 0, 0, 0, 2.4, 0.08, 0.8);
    for (const sx of [-1.12, 1.12]) for (const sz of [-0.34, 0.34]) b.add(BOX, STEEL, sx, 0.45, sz, 0, 0, 0, 0.06, 0.9, 0.06);
    b.add(BOX, '#7a5a38', 0, 0.22, 0, 0, 0, 0, 2.3, 0.04, 0.72);
    b.add(BOX, RED, -0.6, 0.38, 0.05, 0, 0.1, 0, 0.6, 0.3, 0.3);
    b.add(BOX, '#3a6ab0', 0.5, 0.3, -0.05, 0, 0, 0, 0.5, 0.16, 0.4);
    b.add(BOX, '#3c4652', 0.95, 1.02, 0.25, 0, 0, 0, 0.2, 0.16, 0.22);
    b.add(BOX, '#3c4652', 0.95, 1.08, 0.38, 0, 0, 0, 0.24, 0.1, 0.04);
    b.add(CYL8, '#c8ccd2', 0.95, 1.08, 0.46, Math.PI / 2, 0, 0, 0.015, 0.2, 0.015);
    b.add(BOX, RED, -0.75, 1.06, 0.05, 0, 0.2, 0, 0.5, 0.22, 0.24);
    b.add(BOX, DARK, -0.75, 1.2, 0.05, 0, 0.2, 0, 0.36, 0.04, 0.03);
    b.add(BOX, HAZ, 0.2, 0.99, 0.15, 0, 0.6, 0, 0.26, 0.1, 0.09);
    b.add(BOX, DARK, 0.25, 0.99, 0.26, 0, 0.6, 0, 0.06, 0.16, 0.06);
    for (let k = 0; k < 3; k++) b.add(BOX, '#c8ccd2', -0.15 + k * 0.1, 0.945, -0.15 + k * 0.03, 0, 0.3 * k, 0, 0.03, 0.01, 0.26);
    b.add(BOX, '#8a6a48', 0, 1.65, -0.38, 0, 0, 0, 2.3, 1.1, 0.04);
    b.add(BOX, WOOD, 0, 2.22, -0.38, 0, 0, 0, 2.36, 0.06, 0.08);
    for (let k = 0; k < 4; k++) { const x = -0.9 + k * 0.3; b.add(BOX, '#c8ccd2', x, 1.6 + (k % 2) * 0.08, -0.35, 0, 0, 0.1, 0.035, 0.4 - k * 0.04, 0.01); }
    b.add(BOX, '#7a4a28', 0.25, 1.55, -0.35, 0, 0, 0, 0.04, 0.42, 0.02); b.add(BOX, '#6a7078', 0.25, 1.77, -0.35, 0, 0, 0, 0.18, 0.06, 0.03);
    b.add(BOX, '#c8ccd2', 0.7, 1.6, -0.35, 0, 0, 0, 0.38, 0.14, 0.01);
    b.add(BOX, '#7a4a28', 0.95, 1.6, -0.35, 0, 0, 0, 0.12, 0.06, 0.02);
    b.add(WIRE, '#2a2a30', -0.35, 1.45, -0.34, 0, 0, 0, 0.16, 0.16, 2.5);
    b.add(CYL8, DARK, 0, 2.3, -0.1, 0, 0, Math.PI / 2, 0.06, 1.6, 0.06);
    g.add(BOX, '#fff3c8', 0, 2.26, -0.1, 0, 0, 0, 1.4, 0.03, 0.08);
  });
  const SANDBAGS = (b: Batch, r: number, arc: number, layers: number) => {
    for (let l = 0; l < layers; l++) {
      const n = Math.max(2, Math.round((arc * r) / 0.82));
      for (let k = 0; k <= n; k++) {
        const a = -arc / 2 + (arc * (k + (l % 2) * 0.5)) / n;
        if (k === n && l % 2) continue;
        b.add(LEAF, (k + l) % 3 ? SAND : SAND_D, Math.sin(a) * r, 0.18 + l * 0.3, Math.cos(a) * r, 0, a + Math.PI / 2, 0, 0.44, 0.17, 0.24);
      }
    }
  };
  const NEST = prefab((b) => SANDBAGS(b, 1.6, Math.PI * 1.1, 3));
  const CRATE_S = prefab((b) => { b.add(BOX, '#ffffff', 0, 0.3, 0, 0, 0, 0, 0.6, 0.6, 0.6); for (const s of [-1, 1]) b.add(BOX, '#7a6a54', 0, 0.3, s * 0.305, 0, 0, 0, 0.62, 0.08, 0.02); });

  // ---------- barbed-wire coils on the back and side fences ----------
  {
    const P = o.outline;
    for (let i = 0; i < P.length; i++) {
      const [ax, az] = P[i], [bx, bz] = P[(i + 1) % P.length];
      if (az > 15 && bz > 15) continue; // the front stays open (start gate)
      const L = Math.hypot(bx - ax, bz - az), n = Math.floor(L / 0.55), yaw = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k < n; k++) {
        const x = (ax + ((bx - ax) * (k + 0.5)) / n) * 0.982, z = (az + ((bz - az) * (k + 0.5)) / n) * 0.982;
        if (z > 15) continue;
        mid.add(WIRE, k % 2 ? '#8a9098' : '#6f7780', x, 1.22, z, 0, yaw + (k % 2 ? 0.4 : -0.4), 0, 0.33, 0.33, 0.33);
        if (k % 6 === 0) big.add(CYL8, DARK, x, 1.0, z, 0, 0, 0, 0.03, 0.65, 0.03);
      }
    }
  }

  // ---------- sandbag nests with ammo crates ----------
  let nests = 0;
  for (const c of [[-11, 15.5], [12, -3], [-9, -23.5], [15.5, -24], [27, 16.5], [-15, -11]] as P2[]) {
    const s = spot(2.4, 1.9, 3.2, [c], 0);
    if (!s) continue;
    const yaw = Math.atan2(-s[0], -s[1]);
    big.put(NEST, s[0], 0, s[1], yaw);
    aoAdd(sc, s[0], s[1], 3.4, 3.4, yaw, 0.35);
    const L = local(s[0], s[1], yaw);
    for (let k = 0; k < 2 + (nests % 2); k++) { const [x, z] = L(k === 2 ? -0.45 : -0.5 + k * 0.55, k === 2 ? -0.33 : -0.35 - (k % 2) * 0.1); big.put(AMMO, x, k === 2 ? 0.44 : 0, z, yaw + 0.1 * k); }
    const [jx, jz] = L(0.7, -0.6); fine.put(JERRY, jx, 0, jz, yaw, 1, OLIVE);
    nests++;
  }

  // ---------- camo nets: command post (map table, radios, chairs) and the ammo depot ----------
  const camoTex = ctex(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    const cols = ['#5f6b3a', '#3d4428', '#8a7a52', '#6b5434', '#4f5a30'];
    for (let k = 0; k < 70; k++) { g.fillStyle = cols[k % cols.length]; g.beginPath(); g.ellipse(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 12, 4 + Math.random() * 8, Math.random() * 3, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < 90; k++) { g.beginPath(); g.arc(Math.random() * 128, Math.random() * 128, 1.5 + Math.random() * 3.5, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(40,44,28,1)'; g.lineWidth = 1;
    for (let k = -128; k < 128; k += 9) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke(); g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke(); }
  }, true);
  camoTex.repeat.set(2, 2);
  const netMat = new THREE.MeshToonMaterial({ map: camoTex, gradientMap: GRAD, alphaTest: 0.5, side: THREE.DoubleSide });
  const net = (x: number, z: number, w: number, d: number, h: number) => {
    const g = new THREE.PlaneGeometry(w, d, 8, 6).rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const u = p.getX(i) / (w / 2), v = p.getZ(i) / (d / 2);
      const edge = Math.max(Math.abs(u), Math.abs(v));
      const sag = 0.35 * (1 - u * u) * (1 - v * v);
      p.setY(i, h - sag - (edge > 0.97 ? 0.5 : 0) + Math.sin(u * 7 + v * 5) * 0.06);
    }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, netMat);
    m.position.set(x, 0, z);
    m.castShadow = m.receiveShadow = true;
    sc.add(m);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      big.add(CYL8, '#6b5434', x + sx * (w / 2 - 0.3), (h - 0.3) / 2, z + sz * (d / 2 - 0.3), 0, 0, 0, 0.06, h - 0.3, 0.06);
      big.beam([x + sx * (w / 2 - 0.3), h - 0.35, z + sz * (d / 2 - 0.3)], [x + sx * (w / 2 + 0.6), 0, z + sz * (d / 2 + 0.6)], 0.012, '#3a3a30');
    }
    big.add(CYL8, '#6b5434', x, (h - 0.4) / 2, z, 0, 0, 0, 0.06, h - 0.4, 0.06);
  };
  const mapTex = ctex(256, 170, (g) => {
    g.fillStyle = '#e8dcb8'; g.fillRect(0, 0, 256, 170);
    g.strokeStyle = 'rgba(120,100,70,.35)'; g.lineWidth = 1;
    for (let x = 0; x < 256; x += 21) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 170); g.stroke(); }
    for (let y = 0; y < 170; y += 21) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
    g.strokeStyle = 'rgba(140,110,60,.7)';
    for (let k = 0; k < 5; k++) { g.beginPath(); g.ellipse(80, 70, 20 + k * 12, 14 + k * 9, 0.3, 0, TAU); g.stroke(); g.beginPath(); g.ellipse(190, 120, 10 + k * 8, 8 + k * 6, -0.4, 0, TAU); g.stroke(); }
    g.strokeStyle = '#4a8ad0'; g.lineWidth = 4; g.beginPath(); g.moveTo(0, 140); g.bezierCurveTo(70, 120, 120, 165, 256, 100); g.stroke();
    g.strokeStyle = '#6b5434'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(20, 20); g.lineTo(130, 60); g.lineTo(230, 30); g.stroke(); g.setLineDash([]);
    g.strokeStyle = '#c9302a'; g.fillStyle = '#c9302a'; g.lineWidth = 5;
    for (const [x0, y0, x1, y1] of [[40, 150, 110, 95], [220, 150, 170, 90]]) {
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      const a = Math.atan2(y1 - y0, x1 - x0); g.beginPath(); g.moveTo(x1 + Math.cos(a) * 12, y1 + Math.sin(a) * 12); g.lineTo(x1 + Math.cos(a + 2.2) * 12, y1 + Math.sin(a + 2.2) * 12); g.lineTo(x1 + Math.cos(a - 2.2) * 12, y1 + Math.sin(a - 2.2) * 12); g.fill();
    }
    g.lineWidth = 4; for (const [x, y] of [[130, 60], [80, 70]]) { g.beginPath(); g.moveTo(x - 8, y - 8); g.lineTo(x + 8, y + 8); g.moveTo(x + 8, y - 8); g.lineTo(x - 8, y + 8); g.stroke(); }
    g.fillStyle = '#2a2a30'; g.font = 'bold 15px sans-serif'; g.fillText('LAGEPLAN', 10, 18); g.font = 'bold 12px sans-serif'; g.fillText('A', 126, 52); g.fillText('B', 76, 92);
  });
  const mapMat = new THREE.MeshToonMaterial({ map: mapTex, gradientMap: GRAD });
  const lampPts: [number, number, number][] = [];
  const CP = spot(3.8, 3.2, 6, [[-12.5, 15.3], [13.5, -24.5], [-14, -24.5], [26.5, 16.5], [-10.5, -11]], 900, netOk);
  if (CP) {
    const [x, z] = CP;
    net(x, z, 5.6, 4.4, 2.5);
    aoAdd(sc, x, z, 6.2, 5.0, 0, 0.3);
    big.add(BOX, WOOD, x, 0.82, z, 0, 0, 0, 1.9, 0.06, 1.2);
    for (const sx of [-0.85, 0.85]) for (const sz of [-0.52, 0.52]) big.add(BOX, '#6b5434', x + sx, 0.4, z + sz, 0, 0, 0, 0.06, 0.8, 0.06);
    const map = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.1).rotateX(-Math.PI / 2), mapMat);
    map.position.set(x, 0.856, z);
    map.receiveShadow = true;
    sc.add(map);
    for (let k = 0; k < 6; k++) fine.add(CYL8, k % 2 ? '#2f6fb5' : RED, x + rand(-0.7, 0.7), 0.9, z + rand(-0.45, 0.45), 0, 0, 0, 0.025, 0.08, 0.025);
    fine.add(BOX, '#2a2a30', x + 0.55, 0.87, z + 0.35, 0, 0.4, 0, 0.3, 0.02, 0.06);
    fine.add(CYL8, '#e6e8ea', x - 0.65, 0.89, z - 0.35, 0, 0, 0, 0.06, 0.1, 0.06);
    big.put(RADIO, x - 1.6, 0.5, z - 1.4, 0.3);
    big.add(BOX, OLIVE_D, x - 1.6, 0.25, z - 1.4, 0, 0.3, 0, 0.8, 0.5, 0.5);
    big.put(RADIO, x + 1.7, 0, z - 1.3, -0.4);
    big.put(AMMO, x + 1.8, 0, z + 1.2, 0.2);
    for (const [cx, cz, ry] of [[0, 1.0, Math.PI], [-1.2, 0.2, Math.PI / 2], [1.25, -0.3, -Math.PI / 2 - 0.3]] as const) fine.put(CHAIR, x + cx, 0, z + cz, ry);
    big.add(CYL8, DARK, x, 2.0, z, 0, 0, 0, 0.012, 0.4, 0.012);
    big.add(CONE8, '#3a4224', x, 1.78, z, 0, 0, 0, 0.18, 0.12, 0.18);
    lampPts.push([x, 1.7, z]);
  }
  const AD = spot(3.6, 3.0, 6, [[13.5, -24.5], [-14, -24.5], [26.5, 16.5], [-12.5, 15.3], [-10.5, -11]], 900, netOk);
  if (AD) {
    const [x, z] = AD;
    net(x, z, 5.0, 4.0, 2.3);
    aoAdd(sc, x, z, 5.6, 4.6, 0, 0.3);
    for (let k = 0; k < 7; k++) { const i = k % 4, j = Math.floor(k / 4); big.put(AMMO, x - 1.4 + i * 0.95, j * 0.44, z - 0.9 + (j ? 0.1 : 0), 0); }
    for (let k = 0; k < 4; k++) big.put(AMMO, x - 1.0 + k * 0.95, 0, z + 0.4, Math.PI);
    big.add(BOX, WOOD, x + 1.4, 0.07, z + 1.3, 0, 0.2, 0, 1.2, 0.14, 1.0);
    big.put(CRATE_S, x + 1.25, 0.14, z + 1.2, 0.3, 1, o.crateCol[1]);
    big.put(CRATE_S, x + 1.6, 0.14, z + 1.5, -0.2, 0.8, o.crateCol[3]);
    big.put(CRATE_S, x + 1.4, 0.74, z + 1.3, 0.1, 0.75, o.crateCol[2]);
  }

  // ---------- lockers along the Lager, workbenches with tools ----------
  {
    const lx = WH.x + WH.w / 2 + 0.95;
    for (let k = 0; k < 5; k++) {
      const z = WH.z - WH.d / 2 + 0.6 + k * 0.58;
      if (!clear(lx, z, 1.6, 1.2)) continue;
      big.put(LOCKER, lx, 0, z, Math.PI / 2, 1, ['#8fb0cc', '#a4c0d6', '#7f9fbc'][k % 3]);
    }
    aoAdd(sc, lx + 0.1, WH.z - WH.d / 2 + 1.75, 0.9, 3.2, 0, 0.5);
    if (clear(lx + 1.2, WH.z - WH.d / 2 + 1.7, 1.6, 1.2)) { big.add(BOX, WOOD, lx + 1.1, 0.42, WH.z - WH.d / 2 + 1.7, 0, 0, 0, 0.36, 0.06, 2.0); for (const s of [-0.8, 0.8]) big.add(BOX, STEEL, lx + 1.1, 0.2, WH.z - WH.d / 2 + 1.7 + s, 0, 0, 0, 0.3, 0.4, 0.06); fine.add(BOX, '#e6e8ea', lx + 1.1, 0.5, WH.z - WH.d / 2 + 1.4, 0, 0.3, 0, 0.3, 0.1, 0.22); }
    fine.put(EXTING, WH.x + WH.w / 2 + 0.15, 0, WH.z + WH.d / 2 - 0.2, Math.PI / 2);
  }
  const benches: [number, number, number][] = [[EH.x - EH.w / 2 - 0.45, EH.z, -Math.PI / 2], [WH.x, WH.z - WH.d / 2 - 0.45, Math.PI]];
  for (const [x, z, ry] of benches) {
    const L = local(x, z, ry), [cx, cz] = L(0, 0.4);
    if (!clear(cx, cz, 1.7, 1.3)) continue;
    big.put(BENCH, x, 0, z, ry);
    aoAdd(sc, x, z, 2.7, 1.1, ry, 0.45);
    const [sx, sz] = L(-1.6, 0.1); big.put(GASBOTTLE, sx, 0, sz, ry);
    const [ex, ez] = L(1.5, -0.1); fine.put(EXTING, ex, 0, ez, ry);
    const [tx, tz] = L(0.4, 0.95); fine.add(CYL8, DARK, tx, 0.3, tz, 0, 0, 0, 0.18, 0.6, 0.18); fine.add(CYL8, '#8a9098', tx, 0.61, tz, 0, 0, 0, 0.2, 0.03, 0.2);
  }

  // ---------- pipe run behind the vault with valves and a steam riser ----------
  {
    const z = V.z0 - 1.0, x0 = V.x0 + 0.3, x1 = V.x1 - 0.3;
    if (z > -26.2) {
      big.beam([x0, 0.38, z], [x1, 0.38, z], 0.17, '#7a8a6a');
      big.beam([x0, 0.82, z - 0.15], [x1, 0.82, z - 0.15], 0.11, '#b5562a');
      for (let x = x0 + 0.6; x < x1; x += 2.4) { big.add(BOX, DARK, x, 0.28, z - 0.05, 0, 0, 0, 0.12, 0.56, 0.6); big.add(CYL8, '#5a6a4a', x + 0.6, 0.38, z, 0, 0, Math.PI / 2, 0.21, 0.1, 0.21); }
      for (const x of [x0 + 2.0, (x0 + x1) / 2, x1 - 2.4]) { big.add(TORV, RED, x, 0.82, z + 0.05, 0, 0, 0, 0.2, 0.2, 2.5); big.add(CYL8, DARK, x, 0.82, z, Math.PI / 2, 0, 0, 0.03, 0.2, 0.03); }
      const rx = (x0 + x1) / 2 + 3.2;
      big.add(CYL8, '#7a8a6a', rx, 1.3, z, 0, 0, 0, 0.13, 1.9, 0.13);
      big.add(CYL8, '#5a6a4a', rx, 2.3, z, 0, 0, 0, 0.2, 0.14, 0.2);
      o.air.push({ kind: 'smoke', x: rx, z, r: 0.1, n: 8, y0: 2.35, size: 1.1 });
    }
  }
  // ---------- maintenance pit with a steaming grate, barrier tape, warning signs ----------
  const tape = (pts: P2[], h = 0.8) => {
    for (const [x, z] of pts) { fine.add(CYL8, '#e6e8ea', x, h / 2, z, 0, 0, 0, 0.035, h, 0.035); big.add(CONE8, '#ff6a1a', x, 0.15, z, 0, 0, 0, 0.16, 0.3, 0.16); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), n = Math.max(2, Math.round(L / 0.25)), yaw = Math.atan2(bx - ax, bz - az);
      for (let k = 0; k < n; k++) { const u = (k + 0.5) / n; fine.add(BOX, k % 2 ? '#f4f4f0' : '#d8261a', ax + (bx - ax) * u, h - 0.06 - Math.sin(u * Math.PI) * 0.06, az + (bz - az) * u, 0, yaw, 0, 0.012, 0.07, L / n + 0.005); }
    }
  };
  const vents: P2[] = [];
  const PIT = spot(2.4, 1.9, 3.4, [[-2.5, -5.5], [14.5, 1.5], [-17, 16], [6, 13.5]]);
  if (PIT) {
    const [x, z] = PIT;
    big.add(BOX, '#3a3f46', x, 0.03, z, 0, 0, 0, 1.6, 0.06, 1.6);
    for (let k = 0; k < 7; k++) big.add(BOX, '#1a1d22', x - 0.6 + k * 0.2, 0.065, z, 0, 0, 0, 0.08, 0.02, 1.3);
    big.add(BOX, HAZ, x, 0.04, z + 0.85, 0, 0, 0, 1.8, 0.04, 0.1); big.add(BOX, HAZ, x, 0.04, z - 0.85, 0, 0, 0, 1.8, 0.04, 0.1);
    tape([[x - 1.4, z - 1.4], [x + 1.4, z - 1.4], [x + 1.4, z + 1.4], [x - 1.4, z + 1.4], [x - 1.4, z - 1.4]]);
    vents.push([x, z]);
    fine.add(BOX, '#3c4652', x + 1.0, 0.2, z + 0.6, 0, 0.3, 0, 0.6, 0.4, 0.4);
  }
  // little floor vents near the bunker and the halls
  for (const c of [[HQ.x + 4.6, HQ.z - 3.0], [EH.x - 4.4, EH.z + 5.0], [WH.x + 5.2, WH.z - 7.2], [-27, 16], [9.5, 15.2]] as P2[]) {
    if (!o.free(c[0], c[1], 1.4, 1.1, 0.8)) continue;
    big.add(BOX, '#3a3f46', c[0], 0.04, c[1], 0, 0.4, 0, 0.9, 0.08, 0.9);
    for (let k = 0; k < 4; k++) { const [px, pz] = local(c[0], c[1], 0.4)(0, -0.27 + k * 0.18); big.add(BOX, '#1a1d22', px, 0.085, pz, 0, 0.4, 0, 0.7, 0.02, 0.07); }
    vents.push(c);
  }
  for (const [x, z] of vents) o.air.push({ kind: 'smoke', x, z, r: 0.25, n: 7, y0: 0.1, size: 1.2 });

  // warning signs (one atlas, own pictograms): Achtung, Hochspannung, Rauchen verboten, Sperrzone
  const signTexA = ctex(256, 256, (g) => {
    const tri = (cx: number, cy: number, s: number) => { g.beginPath(); g.moveTo(cx, cy - s); g.lineTo(cx + s * 1.1, cy + s * 0.8); g.lineTo(cx - s * 1.1, cy + s * 0.8); g.closePath(); };
    for (let q = 0; q < 4; q++) {
      const ox = (q % 2) * 128, oy = Math.floor(q / 2) * 128;
      g.fillStyle = '#f4f4f0'; g.fillRect(ox + 2, oy + 2, 124, 124);
      g.strokeStyle = '#23272e'; g.lineWidth = 4; g.strokeRect(ox + 4, oy + 4, 120, 120);
      g.textAlign = 'center'; g.fillStyle = '#23272e'; g.font = 'bold 15px sans-serif';
      if (q < 2) {
        g.fillStyle = '#ffc61a'; tri(ox + 64, oy + 50, 34); g.fill(); g.strokeStyle = '#23272e'; g.lineWidth = 6; tri(ox + 64, oy + 50, 34); g.stroke();
        g.fillStyle = '#23272e';
        if (q === 0) { g.fillRect(ox + 60, oy + 34, 8, 26); g.fillRect(ox + 60, oy + 66, 8, 8); }
        else { g.beginPath(); g.moveTo(ox + 70, oy + 28); g.lineTo(ox + 54, oy + 54); g.lineTo(ox + 66, oy + 54); g.lineTo(ox + 58, oy + 76); g.lineTo(ox + 76, oy + 46); g.lineTo(ox + 64, oy + 46); g.closePath(); g.fill(); }
        g.font = 'bold 17px sans-serif'; g.fillText(q === 0 ? 'ACHTUNG' : 'HOCHSPANNUNG', ox + 64, oy + 110);
      } else if (q === 2) {
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ox + 64, oy + 52, 34, 0, TAU); g.fill();
        g.fillStyle = '#23272e'; g.fillRect(ox + 38, oy + 48, 44, 9); g.fillStyle = '#ff8a2e'; g.fillRect(ox + 82, oy + 48, 6, 9);
        g.strokeStyle = '#d8261a'; g.lineWidth = 8; g.beginPath(); g.arc(ox + 64, oy + 52, 34, 0, TAU); g.stroke();
        g.beginPath(); g.moveTo(ox + 40, oy + 28); g.lineTo(ox + 88, oy + 76); g.stroke();
        g.fillStyle = '#23272e'; g.font = 'bold 16px sans-serif'; g.fillText('NICHT RAUCHEN', ox + 64, oy + 110);
      } else {
        for (let k = -6; k < 10; k++) { g.fillStyle = k % 2 ? '#d8261a' : '#f4f4f0'; g.beginPath(); g.moveTo(ox + 4 + k * 16, oy + 4); g.lineTo(ox + 20 + k * 16, oy + 4); g.lineTo(ox - 40 + k * 16 + 60, oy + 40); g.lineTo(ox - 56 + k * 16 + 60, oy + 40); g.closePath(); g.fill(); }
        g.fillStyle = '#d8261a'; g.fillRect(ox + 4, oy + 44, 120, 50);
        g.fillStyle = '#ffffff'; g.font = 'bold 22px sans-serif'; g.fillText('SPERRZONE', ox + 64, oy + 78);
        g.fillStyle = '#23272e'; g.font = 'bold 13px sans-serif'; g.fillText('ZUTRITT VERBOTEN', ox + 64, oy + 114);
      }
    }
  });
  const sP: number[] = [], sN: number[] = [], sU: number[] = [], sI: number[] = [];
  const sign = (x: number, y: number, z: number, yaw: number, q: number, s = 0.7, post = true) => {
    const c = Math.cos(yaw), sn = Math.sin(yaw), u0 = (q % 2) * 0.5, v1 = 1 - Math.floor(q / 2) * 0.5, n0 = sP.length / 3;
    for (const [lx, ly, u, v] of [[-0.5, -0.5, u0, v1 - 0.5], [0.5, -0.5, u0 + 0.5, v1 - 0.5], [0.5, 0.5, u0 + 0.5, v1], [-0.5, 0.5, u0, v1]]) {
      sP.push(x + lx * s * c + 0.03 * sn, y + ly * s, z - lx * s * sn + 0.03 * c); sN.push(sn, 0, c); sU.push(u, v);
    }
    sI.push(n0, n0 + 1, n0 + 2, n0, n0 + 2, n0 + 3);
    big.add(BOX, '#8a9098', x, y, z, 0, yaw, 0, s + 0.06, s + 0.06, 0.04);
    if (post) { big.add(CYL8, '#8a9098', x - sn * 0.05, (y - s / 2) / 2, z - c * 0.05, 0, 0, 0, 0.04, y - s / 2, 0.04); big.add(BOX, DARK, x - sn * 0.05, 0.05, z - c * 0.05, 0, yaw, 0, 0.3, 0.1, 0.3); }
  };
  // on the hall fronts and at the vault, then free-standing ones where something is dangerous
  sign(WH.x + 3.0, 2.6, WH.z + WH.d / 2 + 0.05, 0, 0, 0.8, false);
  sign(EH.x + 2.6, 2.2, EH.z + EH.d / 2 + 0.05, 0, 1, 0.75, false);
  sign((V.x0 + V.x1) / 2 + 4.2, 2.0, V.z1 + 0.5, 0, 3, 0.85, false);
  if (PIT) sign(PIT[0] - 1.4, 1.25, PIT[1] + 1.45, 0, 3, 0.55);
  for (const [x, z, q] of [[-31.2, 15.8, 1], [-26.3, 15.8, 2], [30.0, -20.5, 0], [15.5, -9.8, 1], [-4, -1.6, 0]] as const) {
    if (!o.free(x, z, 1.35, 1.0, 0.8)) continue;
    sign(x, 1.25, z, Math.atan2(-x, 2 - z), q, 0.6);
  }
  if (sP.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(sP, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(sN, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(sU, 2));
    g.setIndex(sI);
    g.computeBoundingSphere();
    const m = new THREE.Mesh(g, new THREE.MeshToonMaterial({ map: signTexA, gradientMap: GRAD, emissive: '#2a2418' }));
    m.receiveShadow = true;
    sc.add(m);
  }

  // ---------- oil puddles ----------
  const oilTex = ctex(64, 64, (g) => {
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 31);
    gr.addColorStop(0, 'rgba(14,14,18,.92)'); gr.addColorStop(0.55, 'rgba(22,20,30,.85)'); gr.addColorStop(0.75, 'rgba(70,40,110,.55)'); gr.addColorStop(0.86, 'rgba(40,110,120,.4)'); gr.addColorStop(1, 'rgba(20,20,24,0)');
    g.fillStyle = gr; g.beginPath(); g.ellipse(32, 32, 31, 26, 0.3, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(24, 24, 7, 3, -0.5, 0, TAU); g.fill();
  });
  const oil: { x: number; z: number; ry: number; w: number; d: number }[] = [];

  // ---------- caged corridor lamps along the vault walls and the Kontrollgang ----------
  const blink: { x: number; y: number; z: number; c: string; s: number; flicker?: boolean }[] = [];
  const cage = (x: number, y: number, z: number, k: number) => {
    fine.add(WIRE, '#2a2a30', x, y, z, 0, 0, 0, 0.21, 0.21, 2.5);
    fine.add(WIRE, '#2a2a30', x, y, z, 0, Math.PI / 2, 0, 0.21, 0.21, 2.5);
    big.add(CYL8, DARK, x, y + 0.23, z, 0, 0, 0, 0.17, 0.07, 0.17);
    blink.push({ x, y, z, c: k % 4 === 1 ? '#ffd88a' : '#fff1c8', s: 0.16, flicker: k % 3 === 1 });
    if (k % 2 === 0) lampPts.push([x, y - 0.1, z]);
  };
  {
    let k = 0;
    for (let x = V.x0 + 1.6; x < V.x1 - 1; x += 3.6) { const z = V.z0 + 0.5; big.add(BOX, DARK, x, 2.45, z - 0.05, 0, 0, 0, 0.1, 0.1, 0.36); cage(x, 2.25, z + 0.1, k++); }
    for (const x of [V.x0 + 0.5, V.x1 - 0.5]) { const z = (V.z0 + V.z1) / 2; big.add(BOX, DARK, x, 2.45, z, 0, 0, 0, 0.36, 0.1, 0.1); cage(x + (x < 0 ? 0.25 : -0.25), 2.25, z, k++); }
    // lamp posts beside the Kontrollgang
    const kn = nodes.filter((n) => n.seg === 'k');
    kn.forEach((n, i) => {
      const m = kn[Math.min(kn.length - 1, i + 1)], p = kn[Math.max(0, i - 1)], dx = m.x - p.x, dz = m.z - p.z, l = Math.hypot(dx, dz) || 1;
      const x = n.x - (dz / l) * 1.9, z = n.z + (dx / l) * 1.9;
      if (!clear(x, z, 1.35, 1.0) || !o.free(x, z, 1.35, 1.0, 0.8)) return;
      big.add(CYL8, STEEL, x, 1.1, z, 0, 0, 0, 0.06, 2.2, 0.06);
      big.add(BOX, DARK, x, 0.06, z, 0, 0, 0, 0.3, 0.12, 0.3);
      big.add(BOX, STEEL, x, 2.2, z, 0, 0, 0, 0.5, 0.05, 0.05);
      cage(x + 0.22, 2.02, z, k++);
    });
    // lamps over the hall doors
    cage(WH.x, 3.85, WH.z + WH.d / 2 + 0.3, 1);
    cage(EH.x, 3.4, EH.z + EH.d / 2 + 0.3, 4);
  }
  const lamps = new Blinkers(sc, blink);
  kit.atmo.lampLights(lampPts, '#ffe8b8', { r: 1.1, pool: 2.6, base: 0.75 });

  // ---------- forklifts that shuttle crates between two pallets ----------
  const BODY = prefab((b, g) => {
    b.add(BOX, HAZ, 0, 0.55, -0.05, 0, 0, 0, 1.0, 0.55, 1.45);
    b.add(BOX, '#d8a810', 0, 0.62, -0.72, 0, 0, 0, 1.02, 0.66, 0.36);
    for (const sx of [-0.5, 0.5]) for (const sz of [-0.5, 0.45]) b.add(CYL8, '#16181c', sx, 0.26, sz, 0, 0, Math.PI / 2, sz > 0 ? 0.26 : 0.22, 0.2, sz > 0 ? 0.26 : 0.22);
    for (const sx of [-0.44, 0.44]) for (const sz of [-0.55, 0.4]) b.add(BOX, DARK, sx, 1.45, sz, 0, 0, 0, 0.05, 1.3, 0.05);
    b.add(BOX, DARK, 0, 2.1, -0.08, 0, 0, 0, 0.98, 0.05, 1.05);
    for (let k = 0; k < 4; k++) b.add(BOX, DARK, 0, 2.13, -0.45 + k * 0.25, 0, 0, 0, 0.94, 0.02, 0.04);
    b.add(BOX, '#2a2a30', 0, 0.92, -0.25, 0, 0, 0, 0.5, 0.12, 0.5);
    b.add(BOX, '#2a2a30', 0, 1.2, -0.48, -0.15, 0, 0, 0.5, 0.5, 0.08);
    b.add(CYL8, DARK, 0, 1.15, 0.28, 0.6, 0, 0, 0.03, 0.4, 0.03);
    b.add(WIRE, DARK, 0, 1.32, 0.38, -0.9, 0, 0, 0.15, 0.15, 2);
    // driver in a hi-vis vest with a hard hat
    b.add(CYL8, '#ff6a1a', 0, 1.25, -0.22, 0, 0, 0, 0.17, 0.42, 0.13);
    b.add(LEAF, '#f2c7a0', 0, 1.58, -0.2, 0, 0, 0, 0.11, 0.13, 0.11);
    b.add(LEAF, HAZ, 0, 1.66, -0.2, 0, 0, 0, 0.125, 0.07, 0.125);
    for (const s of [-1, 1]) b.beam([s * 0.17, 1.38, -0.2], [s * 0.08, 1.3, 0.25], 0.04, '#ff6a1a');
    for (const sx of [-0.32, 0.32]) b.add(BOX, DARK, sx, 1.3, 0.78, 0, 0, 0, 0.08, 2.3, 0.1);
    b.add(BOX, DARK, 0, 2.42, 0.78, 0, 0, 0, 0.72, 0.06, 0.1);
    g.add(BULB, '#ff9a2e', 0, 2.2, -0.45, 0, 0, 0, 0.08);
  });
  const FORK = prefab((b) => {
    b.add(BOX, '#3c4652', 0, 0.3, 0.88, 0, 0, 0, 0.8, 0.5, 0.06);
    for (const sx of [-0.25, 0.25]) b.add(BOX, '#3c4652', sx, 0.04, 1.35, 0, 0, 0, 0.12, 0.05, 1.0);
    b.add(BOX, WOOD, 0, 0.13, 1.4, 0, 0, 0, 1.05, 0.12, 1.05);
    b.add(BOX, '#c99a5b', 0, 0.62, 1.4, 0, 0, 0, 0.95, 0.85, 0.95);
    for (const s of [-1, 1]) b.add(BOX, '#7a6a54', 0, 0.62, 1.4 + s * 0.48, 0, 0, 0, 0.97, 0.1, 0.02);
    b.add(BOX, '#7a6a54', 0, 0.62, 1.4, 0, 0, 0, 0.97, 0.85, 0.1);
  });
  type Lane = { x: number; z: number; ux: number; uz: number; yaw: number; L: number; ph: number };
  const lanes: Lane[] = [];
  for (let k = 0; k < 2500 && lanes.length < 2; k++) {
    const x = rand(-31, 31), z = rand(-21, 17), yaw = Math.floor(rand(0, 4)) * (Math.PI / 2) + rand(-0.25, 0.25), L = 7.5;
    const ux = Math.sin(yaw), uz = Math.cos(yaw);
    let ok = true;
    for (let s = -1.2; s <= L + 2.4 && ok; s += 0.8) {
      const px = x + ux * s, pz = z + uz * s;
      if (!o.free(px, pz, 2.1, 1.7, 1.2) || o.placed.some(([qx, qz]) => Math.hypot(qx - px, qz - pz) < 2.0) || lanes.some((l) => Math.hypot(l.x + l.ux * L / 2 - px, l.z + l.uz * L / 2 - pz) < L / 2 + 3)) ok = false;
    }
    if (!ok) continue;
    lanes.push({ x, z, ux, uz, yaw, L, ph: lanes.length * 7.3 });
    for (let s = -1; s <= L + 2.4; s += 1.6) o.placed.push([x + ux * s, z + uz * s]);
    // lane marks, a pallet stack at each end, oil drips where the forklift stops
    for (let s = 0.6; s < L + 1; s += 1.1) for (const sd of [-0.75, 0.75]) big.add(BOX, HAZ, x + ux * s + uz * sd, 0.012, z + uz * s - ux * sd, 0, yaw, 0, 0.1, 0.02, 0.6);
    for (const [s, side] of [[L + 2.6, 0], [-1.4, 1]] as const) {
      const px = x + ux * s, pz = z + uz * s;
      if (!o.free(px, pz, 1.6, 1.3, 0.8)) continue;
      big.add(BOX, WOOD, px, 0.07, pz, 0, yaw, 0, 1.15, 0.14, 1.15);
      big.put(CRATE_S, px, 0.14, pz, yaw + 0.1, 1.3, o.crateCol[(lanes.length + side) % o.crateCol.length]);
      aoAdd(sc, px, pz, 1.5, 1.5, yaw, 0.45);
    }
    oil.push({ x: x + ux * (L + 0.2), z: z + uz * (L + 0.2), ry: rand(0, TAU), w: 1.3, d: 1.0 }, { x: x + ux * 0.3 + uz * 0.4, z: z + uz * 0.3 - ux * 0.4, ry: rand(0, TAU), w: 0.8, d: 0.6 });
  }
  const bodyIM = new THREE.InstancedMesh(BODY.st, VCT, Math.max(1, lanes.length));
  const bodyGl = new THREE.InstancedMesh(BODY.gl!, glow(new THREE.MeshBasicMaterial({ vertexColors: true })), Math.max(1, lanes.length));
  const forkIM = new THREE.InstancedMesh(FORK.st, VCT, Math.max(1, lanes.length));
  for (const im of [bodyIM, bodyGl, forkIM]) { im.count = lanes.length; im.castShadow = false; im.receiveShadow = true; im.frustumCulled = false; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < lanes.length; i++) im.setColorAt(i, new THREE.Color('#ffffff')); sc.add(im); }
  const d = new THREE.Object3D();
  const drive = (t: number) => {
    for (let i = 0; i < lanes.length; i++) {
      const l = lanes[i], T1 = l.L / 1.5, T2 = 2.2, T3 = l.L / 1.2, T4 = 2.2, T = T1 + T2 + T3 + T4;
      let u = (t + l.ph) % T, s: number, h = 0.32;
      const ease = (q: number) => q * q * (3 - 2 * q);
      if (u < T1) s = ease(u / T1) * l.L;
      else if ((u -= T1) < T2) { s = l.L; h = 0.32 + Math.sin((u / T2) * Math.PI) * 0.9; }
      else if ((u -= T2) < T3) s = l.L * (1 - ease(u / T3));
      else { u -= T3; s = 0; h = 0.32 - Math.sin((u / T4) * Math.PI) * 0.28; }
      d.position.set(l.x + l.ux * s, 0, l.z + l.uz * s);
      d.rotation.set(0, l.yaw, 0);
      d.scale.setScalar(1);
      d.updateMatrix();
      bodyIM.setMatrixAt(i, d.matrix);
      bodyGl.setMatrixAt(i, d.matrix);
      d.position.y = h;
      d.updateMatrix();
      forkIM.setMatrixAt(i, d.matrix);
    }
    bodyIM.instanceMatrix.needsUpdate = bodyGl.instanceMatrix.needsUpdate = forkIM.instanceMatrix.needsUpdate = true;
  };
  drive(0);

  // oil under the generators, the truck, barrels, and along the rails
  for (const c of [[-29.5, 16.6], [EH.x + 1.2, EH.z + EH.d / 2 + 3.4], [HQ.x + 5.6, HQ.z + 4.2], [-9, 9], [24, -14], [6, -26]] as P2[]) {
    if (!kit.clearOfPath(c[0], c[1], 1.6, 1.2)) continue;
    oil.push({ x: c[0], z: c[1], ry: rand(0, TAU), w: rand(1.2, 2.2), d: rand(0.9, 1.5) });
  }
  if (oil.length) decals(sc, oilTex, oil);

  // ---------- small things on free spots: jerry cans, extinguishers, gas bottles, ammo ----------
  for (let k = 0, n = 0; k < 600 && n < 16; k++) {
    const x = rand(-34, 34), z = rand(-24, 20);
    if (!o.tryPlace(x, z, 1.6, 1.25, 2.0)) continue;
    const ry = rand(0, TAU), L = local(x, z, ry);
    if (n % 4 === 0) { for (let q = 0; q < 3; q++) { const [px, pz] = L(q * 0.22 - 0.22, 0); fine.put(JERRY, px, 0, pz, ry, 1, [RED, OLIVE, RED][q]); } }
    else if (n % 4 === 1) { big.put(AMMO, x, 0, z, ry); big.put(AMMO, x, 0.44, z, ry + 0.15); const [px, pz] = L(0.75, 0.1); fine.put(AMMO, px, 0, pz, ry - 0.3); }
    else if (n % 4 === 2) big.put(GASBOTTLE, x, 0, z, ry);
    else { big.put(CRATE_S, x, 0, z, ry, 1.1, o.crateCol[n % o.crateCol.length]); const [px, pz] = L(0.7, 0.2); fine.put(EXTING, px, 0, pz, ry); }
    aoAdd(sc, x, z, 1.4, 1.2, ry, 0.35);
    n++;
  }

  big.finish(sc);
  mid.finish(sc);
  fine.finish(sc);

  return {
    update(dt, t) {
      lamps.tick(dt, 0);
      // forklifts stop where they are while the effects sleep
      if (quality.fx) drive(t);
    },
  };
}

const CONE8 = new THREE.ConeGeometry(1, 1, 8);
const TORV = new THREE.TorusGeometry(1, 0.1, 4, 12);
