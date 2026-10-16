// Helpers shared by minigame views: lights, the floating cloud arena, clouds below, camera fit,
// and the figure setup for the participants.

import { TAU, rand } from '../util';
import { makeFigure, type Fig } from '../view3d/figures';
import { Batch, CYL, SPH_LO, TAPER, THREE, addLights, toon } from '../view3d/kit';
import { VH, VW } from '../view3d/stage';
import type { MgSetup } from './types';

export function mgLights(scene: THREE.Scene, half: number) { return addLights(scene, half, 2048, [-10, 26, 14], 2.2); }

/** Fits an arena of radius-ish `w` into the view (portrait phones step back). */
export function arenaCam(cam: THREE.PerspectiveCamera, w: number, elevTilt = 0.78) {
  const aspect = VW / VH;
  const d = Math.max((w * 1.08) / (0.384 * aspect), (w * 1.12) / 0.384);
  cam.position.set(0, d * elevTilt, d * 0.64);
  cam.lookAt(0, -0.3, 0.4);
}

export function floatingArena(b: Batch, R: number, rings: [number, string][], under = '#8a5bff') {
  rings.forEach(([r, c], i) => b.add(CYL, c, 0, i * 0.012 - 0.3, 0, 0, 0, 0, r * R, 0.6, r * R));
  b.add(TAPER, under, 0, -3.1, 0, 0, 0, 0, R * 0.98, 5, R * 0.98);
  for (let k = 0; k < 9; k++) { const a = (k / 9) * TAU; b.add(SPH_LO, '#6a3fd0', Math.cos(a) * R * 0.55, -4.6 - (k % 3) * 0.7, Math.sin(a) * R * 0.55, 0, 0, 0, 1.6, 1.1, 1.6); }
}

export function cloudsBelow(scene: THREE.Scene, n = 8) {
  const cl = new THREE.InstancedMesh(SPH_LO, toon('#ffffff'), n * 4), d = new THREE.Object3D();
  let i = 0;
  for (let c = 0; c < n; c++) {
    const a = (c / n) * TAU + 0.3, r = rand(16, 26), y = rand(-12, -6);
    for (let k = 0; k < 4; k++) { d.position.set(Math.cos(a) * r + (k - 1.5) * 2.2, y + (k % 2) * 0.8, Math.sin(a) * r + rand(-1, 1)); d.scale.set(rand(2, 3), rand(1.3, 1.9), rand(1.8, 2.4)); d.updateMatrix(); cl.setMatrixAt(i++, d.matrix); }
  }
  scene.add(cl);
  return cl;
}

export function mgFigures(scene: THREE.Scene, setup: MgSetup, scale = 1): Fig[] {
  return setup.players.map((p) => { const f = makeFigure({ color: p.color, acc: p.acc, feat: p.feat }, scale); scene.add(f.root); return f; });
}

/** Players' names for card texts. */
export const names = (setup: MgSetup, idx: number[]) => idx.map((i) => setup.players[i].name).join(', ');
export const teamOf = (setup: MgSetup, t: number) => setup.players.map((p, i) => (p.team === t ? i : -1)).filter((i) => i >= 0);

export const KBD = (k: string) => `<span class="kbd">${k}</span>`;
