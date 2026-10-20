// Palais Lumen accessories (stage 4 detail pass): the hotel entrance with the red carpet, velvet
// ropes, doormen, luggage trolleys and a vintage car at the kerb, photographers whose cameras
// flash during the gala, a champagne tower under the ballroom chandelier, flower urns, marble
// statues with glowing torches, the fountain's water play, and what the players left on the card
// tables in the Spielsaal (cards, chip stacks, glasses).
// Static parts go into merged cells (zubehoer.ts): big things always, small things only near the
// camera. Moving parts (droplets, flashes, a bellboy and a waiter) sleep with quality.fx.

import type { BoardKit } from '../../view3d/boardview';
import { BOX, Batch, CYL8, SPH_LO, THREE } from '../../view3d/kit';
import { quality } from '../../view3d/quality';
import { aoAdd } from '../../view3d/fx3d';
import { glow } from '../../view3d/shaderfx';
import { TAU, rand } from '../../util';
import { BULB, CYL6, LEAF, type P2 } from '../bauteile';
import { loopers } from '../details';
import { Blinkers, Cells, local, prefab } from '../zubehoer';

const BRASS = '#d9a94a', BRASS_HI = '#f2cf74', RED_C = '#a3203a', CREAM = '#f3e6c4', MARBLE = '#ece7dd', MARBLE_HI = '#f8f5ee', SKIN = '#f2c7a0', INK = '#16161c';
const CONE8 = new THREE.ConeGeometry(1, 1, 8);

/** A little person facing +z (about 1.15 tall). Arms: 'down', 'camera' (held to the face), 'tray'. */
function person(b: Batch, o: { coat: string; legs: string; arms?: 'down' | 'camera' | 'tray' | 'behind'; long?: boolean; hat?: string; band?: string; skin?: string; gloves?: string }) {
  const sk = o.skin ?? SKIN;
  for (const s of [-1, 1]) {
    b.add(CYL8, o.legs, s * 0.085, 0.24, 0, 0, 0, 0, 0.068, 0.48, 0.068);
    b.add(BOX, '#141418', s * 0.085, 0.03, 0.04, 0, 0, 0, 0.11, 0.06, 0.21);
  }
  if (o.long) b.add(CONE8, o.coat, 0, 0.62, 0, 0, Math.PI / 8, 0, 0.24, 0.62, 0.2);
  b.add(CYL8, o.coat, 0, 0.72, 0, 0, Math.PI / 8, 0, 0.19, 0.46, 0.14);
  b.add(BOX, o.coat, 0, 0.93, 0, 0, 0, 0, 0.42, 0.08, 0.18);
  b.add(CYL8, sk, 0, 0.99, 0, 0, 0, 0, 0.05, 0.06, 0.05);
  b.add(LEAF, sk, 0, 1.08, 0, 0, 0, 0, 0.12, 0.14, 0.12);
  if (o.hat) { b.add(CYL8, o.hat, 0, 1.2, 0, 0, 0, 0, 0.12, 0.1, 0.12); if (o.band) b.add(CYL8, o.band, 0, 1.17, 0, 0, 0, 0, 0.125, 0.03, 0.125); b.add(BOX, '#141418', 0, 1.16, 0.12, 0, 0, 0, 0.16, 0.02, 0.08); }
  else b.add(LEAF, '#3a2418', 0, 1.13, -0.02, 0, 0, 0, 0.125, 0.09, 0.125);
  const hand = o.gloves ?? sk, arms = o.arms ?? 'down';
  for (const s of [-1, 1]) {
    if (arms === 'down') { b.beam([s * 0.22, 0.9, 0], [s * 0.25, 0.5, 0.02], 0.045, o.coat); b.add(LEAF, hand, s * 0.25, 0.47, 0.02, 0, 0, 0, 0.05); }
    else if (arms === 'behind') { b.beam([s * 0.22, 0.9, 0], [s * 0.12, 0.6, -0.14], 0.045, o.coat); b.add(LEAF, hand, s * 0.05, 0.58, -0.16, 0, 0, 0, 0.05); }
    else if (arms === 'camera') { b.beam([s * 0.22, 0.9, 0], [s * 0.11, 1.02, 0.17], 0.045, o.coat); b.add(LEAF, hand, s * 0.1, 1.03, 0.18, 0, 0, 0, 0.045); }
    else if (s < 0) { b.beam([s * 0.22, 0.9, 0], [s * 0.25, 0.5, 0.02], 0.045, o.coat); b.add(LEAF, hand, s * 0.25, 0.47, 0.02, 0, 0, 0, 0.05); }
    else { b.beam([0.22, 0.9, 0], [0.3, 0.98, 0.2], 0.045, o.coat); b.add(LEAF, hand, 0.3, 1.0, 0.22, 0, 0, 0, 0.05); }
  }
}

export interface PalaisAcc { update(dt: number, t: number, gala: boolean): void }

export function palaisZubehoer(kit: BoardKit, o: {
  HZ: number; FO: { x: number; z: number }; BS: { x: number; z: number }; BAR: { x: number; z: number };
  tables: { x: number; z: number; yaw: number }[];
  tryPlace: (x: number, z: number, rN: number, rE: number, gap: number) => boolean;
  free: (x: number, z: number, rN: number, rE: number, m?: number) => boolean;
}): PalaisAcc {
  const sc = kit.scene, { HZ, FO, BS, BAR } = o;
  const big = new Cells(40), fine = new Cells(16, 44);
  const FRONT = HZ + 3; // façade front (z)
  const AY = 0.1; // apron height in front of the hotel

  // ---------- prefabs ----------
  const DOORMAN = prefab((b, g) => {
    person(b, { coat: '#7a1630', legs: '#2a1420', long: true, hat: '#7a1630', band: BRASS_HI, gloves: '#ffffff', arms: 'behind' });
    for (let k = 0; k < 3; k++) g.add(BULB, BRASS_HI, 0, 0.62 + k * 0.12, 0.2, 0, 0, 0, 0.022);
    for (const s of [-1, 1]) b.add(BOX, BRASS_HI, s * 0.21, 0.97, 0, 0, 0, 0, 0.1, 0.03, 0.14);
  });
  const PHOTOG = prefab((b) => {
    person(b, { coat: '#22242e', legs: '#18181e', arms: 'camera', hat: '#3a3a44' });
    b.add(BOX, INK, 0, 1.03, 0.26, 0, 0, 0, 0.2, 0.14, 0.12);
    b.add(CYL8, '#3a3a44', 0, 1.03, 0.36, Math.PI / 2, 0, 0, 0.05, 0.1, 0.05);
    b.add(BOX, '#d8d8e0', 0.05, 1.15, 0.26, 0, 0, 0, 0.09, 0.1, 0.06);
    b.add(BOX, '#e8d070', -0.12, 0.62, 0.05, 0, 0, 0, 0.04, 0.06, 0.2);
  });
  const WAITER = prefab((b, g) => {
    person(b, { coat: '#f4f1ea', legs: '#18181e', arms: 'tray', gloves: '#ffffff' });
    b.add(BOX, INK, 0, 0.95, 0.15, 0, 0, 0, 0.1, 0.04, 0.02);
    b.add(CYL8, '#d8dce4', 0.3, 1.02, 0.22, 0, 0, 0, 0.2, 0.02, 0.2);
    for (const [x, z] of [[0.24, 0.18], [0.36, 0.26], [0.3, 0.12]] as const) { b.add(CYL8, '#e8f6ff', x, 1.07, z, 0, 0, 0, 0.012, 0.08, 0.012); g.add(CONE8, '#ffe28a', x, 1.13, z, Math.PI, 0, 0, 0.05, 0.05, 0.05); }
  });
  const TROLLEY = (b: Batch, z0 = 0) => {
    b.add(BOX, BRASS, 0, 0.24, z0, 0, 0, 0, 0.85, 0.06, 1.35);
    b.add(BOX, RED_C, 0, 0.28, z0, 0, 0, 0, 0.8, 0.02, 1.3);
    for (const sx of [-0.36, 0.36]) for (const sz of [-0.55, 0.55]) b.add(CYL8, INK, sx, 0.1, z0 + sz, 0, 0, Math.PI / 2, 0.1, 0.06, 0.1);
    for (const sz of [-0.62, 0.62]) b.add(CYL8, BRASS_HI, 0, 1.0, z0 + sz, 0, 0, 0, 0.035, 1.5, 0.035);
    b.add(BOX, BRASS_HI, 0, 1.76, z0, 0, 0, 0, 0.05, 0.05, 1.3);
    b.add(SPH_LO, BRASS_HI, 0, 1.8, z0 - 0.62, 0, 0, 0, 0.06); b.add(SPH_LO, BRASS_HI, 0, 1.8, z0 + 0.62, 0, 0, 0, 0.06);
    const cases: [number, number, number, number, number, number, string][] = [
      [0, 0.52, -0.3, 0.72, 0.46, 0.55, '#24306a'], [0, 0.5, 0.3, 0.66, 0.42, 0.5, '#c08a4a'], [0.02, 0.92, -0.28, 0.54, 0.34, 0.44, '#8a1a30'], [-0.04, 1.2, -0.3, 0.42, 0.24, 0.36, '#2f6a4a'],
    ];
    for (const [x, y, z, w, h, d, c] of cases) {
      b.add(BOX, c, x, y, z0 + z, 0, 0, 0, w, h, d);
      for (const s of [-0.28, 0.28]) b.add(BOX, '#3a2414', x, y, z0 + z + s * d, 0, 0, 0, w + 0.02, h + 0.02, 0.04);
      b.add(BOX, BRASS_HI, x, y + h / 2 + 0.03, z0 + z, 0, 0, 0, 0.16, 0.04, 0.05);
    }
    b.add(CYL8, CREAM, 0, 0.88, z0 + 0.3, 0, 0, 0, 0.22, 0.32, 0.22);
    b.add(CYL8, RED_C, 0, 0.92, z0 + 0.3, 0, 0, 0, 0.225, 0.05, 0.225);
    b.add(BOX, '#1f3a2a', 0, 1.25, z0 + 0.58, 0, 0, 0, 0.5, 0.95, 0.06);
  };
  const LUGGAGE = prefab((b) => TROLLEY(b));
  const BELLBOY = prefab((b) => {
    person(b, { coat: '#c8102e', legs: '#1a1420', hat: '#c8102e', band: BRASS_HI, arms: 'camera' });
    TROLLEY(b, 1.05);
  });
  const CAR = prefab((b, g) => {
    const BODY = '#6a1024', TOP = CREAM, CHROME = '#e8ecf4';
    b.add(BOX, '#1a1418', 0, 0.42, 0, 0, 0, 0, 1.5, 0.22, 4.3);
    b.add(BOX, BODY, 0, 0.74, -0.2, 0, 0, 0, 1.62, 0.46, 3.3);
    b.add(BOX, TOP, 0, 0.98, 1.25, 0, 0, 0, 1.12, 0.46, 1.7);
    b.add(BOX, BODY, 0, 1.22, 1.25, 0, 0, 0, 0.16, 0.03, 1.7);
    b.add(BOX, CHROME, 0, 0.96, 2.12, 0, 0, 0, 1.0, 0.56, 0.08);
    for (let k = -2; k <= 2; k++) b.add(BOX, '#3a3a44', k * 0.17, 0.96, 2.17, 0, 0, 0, 0.05, 0.46, 0.02);
    b.add(SPH_LO, BRASS_HI, 0, 1.33, 2.08, 0, 0, 0, 0.07);
    b.add(BOX, TOP, 0, 1.34, -0.65, 0, 0, 0, 1.5, 0.66, 1.9);
    b.add(BOX, '#9fd3ff', 0, 1.36, -0.6, 0, 0, 0, 1.53, 0.42, 1.6);
    b.add(BOX, '#9fd3ff', 0, 1.38, 0.32, 0.25, 0, 0, 1.36, 0.46, 0.05);
    b.add(BOX, BODY, 0, 1.69, -0.65, 0, 0, 0, 1.56, 0.06, 1.96);
    for (const s of [-1, 1]) {
      for (const z of [-1.35, 1.35]) b.add(LEAF, '#3a0c18', s * 0.8, 0.62, z, 0, 0, 0, 0.3, 0.32, 0.72);
      b.add(BOX, '#2a2228', s * 0.86, 0.4, 0, 0, 0, 0, 0.26, 0.05, 1.5);
      b.add(BOX, BRASS_HI, s * 0.82, 0.9, -0.2, 0, 0, 0, 0.02, 0.04, 3.2);
      for (const z of [-1.35, 1.35]) {
        b.add(CYL8, '#121216', s * 0.8, 0.38, z, 0, 0, Math.PI / 2, 0.38, 0.24, 0.38);
        b.add(CYL8, '#f4f4f0', s * 0.81, 0.38, z, 0, 0, Math.PI / 2, 0.25, 0.25, 0.25);
        b.add(CYL8, CHROME, s * 0.82, 0.38, z, 0, 0, Math.PI / 2, 0.12, 0.27, 0.12);
      }
      b.add(CYL8, CHROME, s * 0.62, 1.04, 2.05, Math.PI / 2, 0, 0, 0.17, 0.1, 0.17);
      g.add(BULB, '#fff3d0', s * 0.62, 1.04, 2.11, 0, 0, 0, 0.13);
      g.add(BULB, '#ff3a4a', s * 0.66, 0.78, -1.86, 0, 0, 0, 0.07);
    }
    for (const z of [2.2, -1.9]) b.add(BOX, CHROME, 0, 0.5, z, 0, 0, 0, 1.75, 0.1, 0.1);
    b.add(CYL8, '#121216', 0, 0.86, -2.05, Math.PI / 2, 0, 0, 0.36, 0.2, 0.36);
    b.add(CYL8, CHROME, 0, 0.86, -2.16, Math.PI / 2, 0, 0, 0.12, 0.04, 0.12);
  });
  const URN = (bloom: string, alt: string) => prefab((b) => {
    b.add(CYL8, MARBLE, 0, 0.07, 0, 0, 0, 0, 0.2, 0.14, 0.2);
    b.add(CYL8, MARBLE, 0, 0.2, 0, 0, 0, 0, 0.09, 0.16, 0.09);
    b.add(LEAF, MARBLE_HI, 0, 0.42, 0, 0, 0, 0, 0.33, 0.24, 0.33);
    b.add(CYL8, BRASS_HI, 0, 0.6, 0, 0, 0, 0, 0.3, 0.05, 0.3);
    for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; b.add(LEAF, k % 2 ? '#2f9e5e' : '#3fb86a', Math.cos(a) * 0.2, 0.72, Math.sin(a) * 0.2, 0.4 * Math.sin(a), 0, -0.4 * Math.cos(a), 0.16, 0.08, 0.26); }
    for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU * 2.1, r = 0.08 + (k % 3) * 0.08; b.add(BULB, k % 3 === 2 ? alt : bloom, Math.cos(a) * r, 0.78 + (k % 4) * 0.07, Math.sin(a) * r, 0, k, 0, 0.075); }
    b.add(CYL8, '#2f8a4e', 0, 1.0, 0, 0, 0, 0, 0.012, 0.3, 0.012);
    b.add(BULB, alt, 0, 1.16, 0, 0, 0, 0, 0.06);
  });
  const URNS = [URN('#ff7ab8', '#fff3f8'), URN('#e8304a', '#ffd36b'), URN('#fff6e8', '#ffb3d0')];
  const STATUE = (globe: boolean) => prefab((b, g) => {
    b.add(BOX, MARBLE, 0, 0.08, 0, 0, 0, 0, 1.2, 0.16, 1.2);
    b.add(BOX, MARBLE_HI, 0, 0.62, 0, 0, 0, 0, 0.92, 0.95, 0.92);
    b.add(BOX, BRASS, 0, 0.86, 0, 0, 0, 0, 0.95, 0.07, 0.95);
    b.add(BOX, MARBLE, 0, 1.15, 0, 0, 0, 0, 1.08, 0.12, 1.08);
    b.add(BOX, BRASS_HI, 0, 0.55, 0.47, 0, 0, 0, 0.42, 0.2, 0.02);
    const W = '#f6f3ec';
    b.add(CONE8, W, 0, 1.78, 0, 0, Math.PI / 8, 0, 0.36, 1.14, 0.3);
    b.add(CYL8, W, 0, 2.42, 0, 0, Math.PI / 8, 0, 0.19, 0.5, 0.15);
    b.add(LEAF, W, 0, 2.86, 0, 0, 0, 0, 0.14, 0.16, 0.14);
    b.add(LEAF, W, 0, 2.95, -0.06, 0, 0, 0, 0.12, 0.09, 0.12);
    b.beam([-0.2, 2.6, 0], [-0.32, 2.05, 0.08], 0.05, W);
    b.add(BOX, W, 0.05, 2.2, 0.12, 0, 0, 0.5, 0.32, 0.6, 0.05);
    if (globe) {
      b.beam([0.2, 2.6, 0], [0.2, 3.25, 0.04], 0.05, W);
      b.beam([-0.2, 2.6, 0], [-0.12, 3.25, 0.04], 0.05, W);
      b.add(SPH_LO, BRASS_HI, 0.04, 3.48, 0.04, 0, 0, 0, 0.26);
      b.add(CYL8, BRASS, 0.04, 3.48, 0.04, 0, 0, 0.5, 0.27, 0.03, 0.27);
    } else {
      b.beam([0.2, 2.6, 0], [0.34, 3.28, 0.04], 0.05, W);
      b.add(CYL8, BRASS, 0.36, 3.42, 0.04, 0, 0, 0, 0.05, 0.36, 0.05);
      b.add(CYL8, BRASS_HI, 0.36, 3.6, 0.04, 0, 0, 0, 0.1, 0.06, 0.1);
      g.add(CONE8, '#ffcf6b', 0.36, 3.78, 0.04, 0, 0, 0, 0.09, 0.3, 0.09);
      g.add(CONE8, '#fff3c8', 0.36, 3.74, 0.04, 0, 0, 0, 0.05, 0.18, 0.05);
    }
  });
  const STATUES = [STATUE(false), STATUE(true)];
  /** A coupe glass: foot, stem, bowl; the champagne in it glows a little. */
  const coupe = (c: Cells, x: number, y: number, z: number, s = 1) => {
    c.add(CYL8, '#dff2ff', x, y + 0.005 * s, z, 0, 0, 0, 0.07 * s, 0.01 * s, 0.07 * s);
    c.add(CYL8, '#dff2ff', x, y + 0.07 * s, z, 0, 0, 0, 0.018 * s, 0.13 * s, 0.018 * s);
    c.add(CONE8, '#e8f8ff', x, y + 0.18 * s, z, Math.PI, 0, 0, 0.15 * s, 0.1 * s, 0.15 * s);
    c.glow(CYL8, '#ffe08a', x, y + 0.225 * s, z, 0, 0, 0, 0.13 * s, 0.012 * s, 0.13 * s);
  };

  // ---------- hotel entrance: steps, doors, red carpet, ropes, doormen ----------
  const dz = FRONT;
  big.add(BOX, MARBLE, 0, AY + 0.08, dz + 0.45, 0, 0, 0, 5.2, 0.16, 0.9);
  big.add(BOX, MARBLE_HI, 0, AY + 0.2, dz + 0.22, 0, 0, 0, 4.6, 0.12, 0.5);
  big.add(BOX, '#141a3a', 0, 1.55, dz + 0.04, 0, 0, 0, 3.6, 2.9, 0.1);
  big.glow(BOX, '#ffcf80', 0, 1.45, dz + 0.1, 0, 0, 0, 3.0, 2.4, 0.02);
  for (let k = -2; k <= 2; k++) big.add(BOX, BRASS_HI, k * 0.75, 1.45, dz + 0.13, 0, 0, 0, 0.07, 2.5, 0.05);
  big.add(BOX, BRASS_HI, 0, 2.72, dz + 0.13, 0, 0, 0, 3.3, 0.1, 0.06);
  big.add(BOX, BRASS_HI, 0, 0.32, dz + 0.13, 0, 0, 0, 3.3, 0.08, 0.06);
  big.add(TOR_HALF, BRASS_HI, 0, 2.75, dz + 0.14, 0, 0, 0, 1.6, 1.0, 1.4);
  for (const s of [-1, 1]) {
    // wall lanterns beside the door
    big.add(BOX, BRASS, s * 2.25, 2.1, dz + 0.12, 0, 0, 0, 0.12, 0.5, 0.12);
    big.add(BOX, '#1a1f40', s * 2.25, 2.3, dz + 0.32, 0, 0, 0, 0.26, 0.4, 0.26);
    big.glow(BOX, '#ffe2a0', s * 2.25, 2.3, dz + 0.32, 0, 0, 0, 0.2, 0.32, 0.28);
    big.add(CONE8, BRASS_HI, s * 2.25, 2.6, dz + 0.32, 0, Math.PI / 8, 0, 0.22, 0.2, 0.22);
    // pilasters and gilded capitals framing the door
    big.add(BOX, MARBLE_HI, s * 2.9, 1.7, dz + 0.1, 0, 0, 0, 0.5, 3.4, 0.22);
    big.add(BOX, BRASS_HI, s * 2.9, 3.45, dz + 0.14, 0, 0, 0, 0.64, 0.16, 0.3);
    big.add(BOX, BRASS, s * 2.9, 0.12, dz + 0.14, 0, 0, 0, 0.62, 0.18, 0.3);
  }
  // red carpet from the door to the kerb, gold edges, brass stair rods
  big.add(BOX, RED_C, 0, AY + 0.03, -26.55, 0, 0, 0, 2.4, 0.04, 2.9);
  for (const s of [-1, 1]) big.add(BOX, BRASS_HI, s * 1.22, AY + 0.04, -26.55, 0, 0, 0, 0.07, 0.04, 2.9);
  big.add(BOX, RED_C, 0, AY + 0.28, dz + 0.5, 0, 0, 0, 2.4, 0.03, 0.55);
  for (const s of [-1, 1]) {
    for (let k = 0; k < 3; k++) {
      const z = -27.45 + k * 0.9, x = s * 1.6;
      fine.add(CYL8, BRASS, x, AY + 0.45, z, 0, 0, 0, 0.04, 0.9, 0.04);
      fine.add(CYL8, BRASS, x, AY + 0.02, z, 0, 0, 0, 0.15, 0.04, 0.15);
      fine.add(SPH_LO, BRASS_HI, x, AY + 0.93, z, 0, 0, 0, 0.065);
      if (k < 2) for (let q = 0; q < 5; q++) { const u = (q + 0.5) / 5; fine.add(CYL6, RED_C, x, AY + 0.82 - Math.sin(u * Math.PI) * 0.13, z + u * 0.9, Math.PI / 2, 0, 0, 0.028, 0.2, 0.028); }
    }
    big.put(DOORMAN, s * 2.0, AY, dz + 0.75, 0, 1);
    big.put(URNS[1], s * 3.6, AY, dz + 0.55, 0, 1.25);
  }
  // luggage trolleys, a pile of suitcases, the vintage car at the kerb and its chauffeur
  big.put(LUGGAGE, -5.4, AY, -26.6, 0.2);
  big.put(LUGGAGE, -12.6, AY, -26.5, -0.15);
  for (const [x, z, w, h, d, c, ry] of [[-7.0, -27.1, 0.7, 0.42, 0.5, '#24306a', 0.3], [-7.0, -27.05, 0.55, 0.32, 0.4, '#8a1a30', 0.5], [-6.6, -26.2, 0.6, 0.36, 0.45, '#c08a4a', -0.2]] as const) {
    const y = c === '#8a1a30' ? AY + 0.42 + h / 2 : AY + h / 2;
    big.add(BOX, c, x, y, z, 0, ry, 0, w, h, d);
    big.add(BOX, BRASS_HI, x, y + h / 2 + 0.03, z, 0, ry, 0, 0.16, 0.04, 0.05);
  }
  big.put(CAR, 7.6, AY, -26.6, -Math.PI / 2);
  aoAdd(sc, 7.6, -26.6, 5.4, 2.4, Math.PI / 2, 0.6);
  aoAdd(sc, -5.4, -26.6, 1.4, 1.9, 0.2, 0.45);
  aoAdd(sc, -12.6, -26.5, 1.4, 1.9, -0.15, 0.45);
  big.put(prefab((b) => person(b, { coat: '#1c1c26', legs: '#141418', hat: '#1c1c26', band: '#3a3a44', gloves: '#ffffff' })), 4.6, AY, -25.9, Math.PI * 0.75);
  for (const s of [-1, 1]) { big.put(STATUES[s > 0 ? 1 : 0], s * 11.4, AY, -26.6, 0, 0.9); aoAdd(sc, s * 11.4, -26.6, 1.6, 1.6, 0, 0.5); }
  // a second car of the same make waits at the front right of the terrace
  if (o.free(27.5, 19.6, 3, 2.2, 0.5)) { big.put(CAR, 27.5, 0, 19.6, Math.PI / 2); aoAdd(sc, 27.5, 19.6, 5.4, 2.4, Math.PI / 2, 0.7); }
  // photographers behind the balustrade, aimed at the door; their flashes are Blinkers
  const flashes: { x: number; y: number; z: number; c: string; s: number; flash: boolean }[] = [];
  for (const [x, z] of [[-3.3, -23.3], [-1.4, -22.9], [2.0, -23.0], [4.0, -23.35], [6.4, -23.2]] as const) {
    if (!o.tryPlace(x, z, 1.25, 0.95, 0.9)) continue;
    const yaw = Math.atan2(0 - x, dz + 1 - z);
    big.put(PHOTOG, x, 0, z, yaw);
    const L = local(x, z, yaw), [fx, fz] = L(0.05, 0.3);
    flashes.push({ x: fx, y: 1.18, z: fz, c: '#ffffff', s: 0.42, flash: true });
  }
  const flash = new Blinkers(sc, flashes);

  // ---------- champagne tower under the chandelier, buckets beside it ----------
  big.add(CYL8, '#f4efe4', BS.x, 0.46, BS.z, 0, 0, 0, 1.35, 0.9, 1.35);
  aoAdd(sc, BS.x, BS.z, 3.2, 3.2, 0, 0.4);
  big.add(CYL8, BRASS_HI, BS.x, 0.93, BS.z, 0, 0, 0, 1.38, 0.05, 1.38);
  for (let lv = 0; lv < 5; lv++) {
    const n = 5 - lv, y = 0.96 + lv * 0.24, sp = 0.29;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = BS.x + (i - (n - 1) / 2) * sp, z = BS.z + (j - (n - 1) / 2) * sp;
      coupe(fine, x, y, z, 0.95);
    }
  }
  big.glow(CYL8, '#ffe8a8', BS.x, 2.36, BS.z, 0, 0, 0, 0.04, 0.4, 0.04);
  for (const s of [-1, 1]) {
    const x = BS.x + s * 0.95, z = BS.z + 0.75;
    big.add(CYL8, '#d8dce4', x, 1.07, z, 0, 0, 0, 0.16, 0.24, 0.16);
    big.add(CYL8, '#1f4a2a', x + 0.03, 1.24, z, 0.25 * s, 0, 0.2, 0.05, 0.36, 0.05);
    big.add(CYL8, BRASS_HI, x + 0.06, 1.43, z, 0.25 * s, 0, 0.2, 0.03, 0.08, 0.03);
  }

  // ---------- flower urns and marble statues on the terrace ----------
  let urns = 0;
  for (const [x, z] of [
    [FO.x - 4.9, FO.z - 4.1], [FO.x + 4.9, FO.z - 4.1], [FO.x - 4.9, FO.z + 4.1], [FO.x + 4.9, FO.z + 4.1],
    [BS.x - 5.8, BS.z + 3.8], [BS.x + 5.6, BS.z - 4.2], [BAR.x - 3.6, BAR.z - 1.6], [BAR.x + 3.6, BAR.z - 1.6],
    [-2.6, 20.4], [2.6, 20.4], [-11, 21], [11, 21], [-33, 15], [33, 14.5], [-24, -22], [24, -22], [-33.5, -16], [33.5, -16],
  ] as const) {
    if (!o.tryPlace(x, z, 1.5, 1.05, 1.1)) continue;
    big.put(URNS[urns % 3], x, 0, z, rand(0, TAU), 1.1);
    aoAdd(sc, x, z, 1.0, 1.0, 0, 0.4);
    urns++;
  }
  let statues = 0;
  for (const [x, z] of [[FO.x, FO.z - 6.4], [FO.x, FO.z + 6.6], [BS.x - 7.0, BS.z - 5.2], [BS.x + 7.2, BS.z + 5.6], [-34, -4], [34, -6], [-13.5, -24], [13.5, -24], [-25, 21], [25, 21]] as const) {
    if (statues >= 6 || !o.tryPlace(x, z, 1.9, 1.5, 1.6)) continue;
    big.put(STATUES[statues % 2], x, 0, z, Math.atan2(-x, 2 - z), 0.85);
    aoAdd(sc, x, z, 1.6, 1.6, Math.atan2(-x, 2 - z), 0.55);
    statues++;
  }

  // ---------- Spielsaal: what the players left on the card tables ----------
  const CHIP = ['#c8102e', INK, '#1f8a4c', '#2b6cff', '#f2cf74', '#f4f1ea'];
  for (const T of o.tables) {
    const L = local(T.x, T.z, T.yaw), y = 0.985;
    for (let k = 0; k < 6; k++) {
      const [x, z] = L(-0.8 + k * 0.32 + rand(-0.06, 0.06), rand(-0.25, 0.3));
      fine.add(BOX, '#fbfaf5', x, y + 0.004 + k * 0.001, z, 0, T.yaw + rand(-0.6, 0.6), 0, 0.17, 0.006, 0.24);
      if (k % 2) fine.add(BOX, k % 4 === 1 ? '#c8102e' : INK, x, y + 0.009 + k * 0.001, z, 0, T.yaw + rand(-0.6, 0.6), 0, 0.05, 0.003, 0.05);
    }
    for (let s = 0; s < 4; s++) {
      const [x, z] = L((s - 1.5) * 0.45, s % 2 ? -0.55 : 0.6), n = 2 + ((s * 3 + Math.round(T.x)) % 5);
      for (let k = 0; k < n; k++) fine.add(CYL8, CHIP[(s + k) % CHIP.length], x + rand(-0.01, 0.01), y + 0.02 + k * 0.04, z, 0, 0, 0, 0.09, 0.035, 0.09);
    }
    for (let k = 0; k < 4; k++) { const [x, z] = L(rand(-1.1, 1.1), rand(-0.6, 0.6)); fine.add(CYL8, CHIP[k % CHIP.length], x, y + 0.012, z, rand(-0.1, 0.1), 0, rand(-0.1, 0.1), 0.09, 0.03, 0.09); }
    { const [x, z] = L(0.95, 0.15); fine.add(BOX, '#3a1a12', x, y + 0.08, z, 0, T.yaw, 0, 0.22, 0.16, 0.34); fine.add(BOX, '#fbfaf5', x, y + 0.17, z - 0.05, 0, T.yaw, 0, 0.17, 0.02, 0.24); }
    { const [x, z] = L(-1.05, 0.3); coupe(fine, x, y, z, 0.8); }
    { const [x, z] = L(0.3, 0); fine.glow(CYL8, '#ffe8b0', x, y + 0.12, z, 0, 0, 0, 0.035, 0.18, 0.035); fine.add(CYL8, BRASS_HI, x, y + 0.02, z, 0, 0, 0, 0.07, 0.04, 0.07); }
    // a few chips dropped on the floor
    for (let k = 0; k < 3; k++) { const [x, z] = L(rand(-2.2, 2.2), rand(-1.8, 1.8)); fine.add(CYL8, CHIP[(k + 2) % CHIP.length], x, 0.02, z, 0, 0, 0, 0.09, 0.03, 0.09); }
  }
  // the bar: glasses, bottles and a cocktail shaker on the counter, cups on the bistro tables
  for (let k = 0; k < 7; k++) {
    const a = Math.PI * 0.15 + (k / 6) * Math.PI * 0.7, x = BAR.x + Math.cos(a) * 2.4, z = BAR.z + Math.sin(a) * 2.4;
    coupe(fine, x + 0.15, 1.17, z, 0.8);
    if (k % 2) fine.add(CYL8, '#d8dce4', x - 0.2, 1.3, z, 0, 0, 0, 0.06, 0.26, 0.06);
  }

  // ---------- moving life ----------
  // the bellboy pushes his trolley along the hotel front, a waiter makes rounds at the bar
  const apron: P2[] = [];
  for (let x = -21; x <= -8.5; x += 2.5) apron.push([x, -26.0]);
  const back = apron.slice(1, -1).reverse().map(([x, z]) => [x, z - 0.15] as P2);
  loopers(sc, BELLBOY.st, [...apron, ...back], 1, { y: AY, speed: 0.8, colors: ['#ffffff'] });
  const bar: P2[] = Array.from({ length: 20 }, (_, k) => [BAR.x + Math.cos((k / 20) * TAU) * 4.4, BAR.z + 0.9 + Math.sin((k / 20) * TAU) * 3.2] as P2);
  loopers(sc, WAITER.st, bar, 1, { speed: 0.7, colors: ['#ffffff'] });
  if (WAITER.gl) loopers(sc, WAITER.gl, bar, 1, { speed: 0.7, colors: ['#ffffff'], mat: glow(new THREE.MeshBasicMaterial({ vertexColors: true }), 0.6) });
  // the fountain's water play: eight arcs from the rim into the bowl, rising in a running wave
  const ARCS = 8, DROPS = 7, PLUME = 12, N = ARCS * DROPS + PLUME;
  const drops = new THREE.InstancedMesh(BULB, glow(new THREE.MeshBasicMaterial({ color: '#d6f3ff' }), 0.45), N);
  drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  drops.castShadow = drops.receiveShadow = false;
  drops.frustumCulled = false;
  sc.add(drops);
  const dummy = new THREE.Object3D();
  const water = (t: number) => {
    let i = 0;
    for (let a = 0; a < ARCS; a++) {
      const ang = (a / ARCS) * TAU, h = 0.9 + 1.5 * Math.max(0, Math.sin(t * 1.1 - a * (TAU / ARCS) * 2)) ** 2;
      const x0 = FO.x + Math.cos(ang) * 3.5, z0 = FO.z + Math.sin(ang) * 3.5, x1 = FO.x + Math.cos(ang) * 1.5, z1 = FO.z + Math.sin(ang) * 1.5;
      for (let d = 0; d < DROPS; d++) {
        const u = (t * 0.85 + d / DROPS + a * 0.13) % 1;
        dummy.position.set(x0 + (x1 - x0) * u, 0.62 + (2.25 - 0.62) * u + 4 * h * u * (1 - u), z0 + (z1 - z0) * u);
        dummy.scale.setScalar(0.07 + 0.03 * h);
        dummy.updateMatrix();
        drops.setMatrixAt(i++, dummy.matrix);
      }
    }
    const top = 1.1 + 0.9 * (0.5 + 0.5 * Math.sin(t * 0.7));
    for (let d = 0; d < PLUME; d++) {
      const u = (t * 0.7 + d / PLUME) % 1, a = d * 2.4;
      const r = 0.25 + u * 0.75;
      dummy.position.set(FO.x + Math.cos(a) * r, 3.8 + top * 4 * u * (1 - u) + 0.2, FO.z + Math.sin(a) * r);
      dummy.scale.setScalar(0.08);
      dummy.updateMatrix();
      drops.setMatrixAt(i++, dummy.matrix);
    }
    drops.instanceMatrix.needsUpdate = true;
  };
  water(0);

  big.finish(sc);
  fine.finish(sc);

  return {
    update(dt, t, gala) {
      const on = quality.fx;
      if (drops.visible !== on) drops.visible = on;
      if (on) water(t);
      const G = kit.atmo.live.glow;
      flash.tick(dt, gala ? 1.6 : 0.04 + 0.2 * G);
    },
  };
}

/** Half a torus (the fanlight over the door), opening downwards. */
const TOR_HALF = new THREE.TorusGeometry(1, 0.06, 5, 16, Math.PI);
