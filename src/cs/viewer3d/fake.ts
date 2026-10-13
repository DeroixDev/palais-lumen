import type { WeaponModel } from '../contract';
import type { ArtSource } from './source';

/**
 * A stand-in art source for dev pages and tests: one rifle-ish model and a seeded camo texture
 * with float-dependent wear. Not used by the game.
 */

function rng(seed: number) {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function rect(x: number, y: number, w: number, h: number): [number, number][] {
  return [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
}

export function fakeModel(): WeaponModel {
  return {
    box: [512, 192],
    parts: [
      { name: 'barrel', rings: [rect(380, 60, 126, 10)], material: 'metal', depth: 8, layer: 1 },
      { name: 'stock', rings: [[[150, 50], [30, 66], [12, 70], [12, 128], [30, 128], [150, 96]], [[60, 80], [120, 72], [120, 88], [60, 108]]], material: 'wood', depth: 18, layer: 2 },
      { name: 'grip', rings: [[[196, 90], [226, 90], [214, 150], [190, 150]]], material: 'rubber', depth: 20, layer: 2 },
      { name: 'mag', rings: [[[280, 90], [312, 90], [330, 170], [300, 176]]], material: 'skin', depth: 16, layer: 2 },
      { name: 'receiver', rings: [[[150, 48], [310, 44], [314, 94], [150, 96]]], material: 'skin', depth: 26, layer: 4 },
      { name: 'handguard', rings: [rect(306, 54, 96, 30)], material: 'skin', depth: 22, layer: 3 },
      { name: 'rail', rings: [rect(170, 38, 210, 8)], material: 'dark', depth: 12, layer: 5 },
    ],
  };
}

export function fakeTexture(skin: string, float: number, seed: number, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const r = rng(seed + skin.length * 97);
  const pal = skin.includes('red') ? ['#7a1010', '#c22a1a', '#f0a030', '#2a0a0a'] : ['#2f4a2a', '#5b7a3a', '#a89a60', '#1d2618'];
  g.fillStyle = pal[0];
  g.fillRect(0, 0, size, size);
  for (let i = 0; i < 160; i++) {
    g.fillStyle = pal[1 + Math.floor(r() * 3)];
    g.beginPath();
    const x = r() * size, y = r() * size, rr = size * (0.02 + r() * 0.07);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2, q = rr * (0.6 + r() * 0.6);
      g.lineTo(x + Math.cos(a) * q * 1.6, y + Math.sin(a) * q);
    }
    g.fill();
  }
  // Wear: grey bare-metal scratches and blotches, more with higher float.
  const n = Math.floor(float * 600);
  for (let i = 0; i < n; i++) {
    g.fillStyle = `rgba(160,164,170,${0.5 + r() * 0.5})`;
    const x = r() * size, y = r() * size;
    g.beginPath();
    g.ellipse(x, y, size * 0.004 + r() * size * 0.02 * float, size * 0.002 + r() * size * 0.008, r() * 3, 0, Math.PI * 2);
    g.fill();
  }
  return c;
}

export const fakeArt: ArtSource = {
  weaponOf: () => ({ id: 'fake', kind: 'rifle' }),
  weaponModel: () => fakeModel(),
  renderSkinTexture: fakeTexture,
};
