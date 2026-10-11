import type { RoomDefinition } from '../core/registry';

import { FLOOR_NAMES } from '../core/brand';
/**
 * Floor 2 side room: a glasshouse off the Mondgarten, warm and damp, full of night-blooming
 * plants. In the middle the Mondblüte opens once a night; picking it stamps the Mondgarten
 * card (src/core/curios.ts). Two Nachtblüte machines and the Blütenrad stay here every day.
 */
export const f2side: RoomDefinition = {
  id: 'f2b',
  parent: 'f2',
  name: 'Gewächshaus',
  tagline: 'Nachtblüher unter Glas',
  floor: 2,
  elevatorX: -1000,
  sign: 'GLASHAUS',
  width: 840,
  height: 700,
  theme: {
    style: 'garden',
    carpet: 0x23402a,
    carpetPattern: 0x2f5234,
    carpetAccent: 0xe8d8b0,
    wall: 0x0e2a2a,
    wallTrim: 0xd8e8e0,
    neon: 0xc8a8ff,
    light: 0xe0d0ff,
    accent: 0x2a3a2a,
    sofa: 0x3a5a4a,
    bare: true,
  },
  spawn: { x: 120, y: 470 },
  doors: [{ x: 0, y: 470, side: 'left', to: 'f2', label: FLOOR_NAMES.f2 }],
  stations: [
    { game: 'slots', pinned: true, x: 600, y: 230, label: 'Nachtblüte', options: { theme: 'diamond' } },
    { game: 'slots', pinned: true, x: 680, y: 230, options: { theme: 'diamond' } },
    { game: 'wheel', pinned: true, x: 600, y: 520, label: 'Blütenrad' },
  ],
  decor: [
    { kind: 'path', x: 300, y: 470, w: 460, h: 60 },
    { kind: 'path', x: 450, y: 340, w: 64, h: 190 },
    { kind: 'mosaic', x: 450, y: 450, w: 90 },
    { kind: 'flowerbed', x: 200, y: 230, w: 150 },
    { kind: 'flowerbed', x: 400, y: 220, w: 110 },
    { kind: 'flowerbed', x: 220, y: 640, w: 200 },
    { kind: 'flowerbed', x: 470, y: 640, w: 150 },
    { kind: 'flowerbed', x: 800, y: 420, w: 34, h: 150 },
    { kind: 'palm', x: 60, y: 220 },
    { kind: 'palm', x: 780, y: 640 },
    { kind: 'tree', x: 70, y: 640, w: 40 },
    { kind: 'plant', x: 300, y: 330 },
    { kind: 'plant', x: 330, y: 580 },
    { kind: 'lanternPost', x: 560, y: 380 },
    { kind: 'lanternPost', x: 230, y: 380 },
    { kind: 'bench', x: 690, y: 400, w: 100 },
    { kind: 'window', x: 70, y: 0, w: 70 },
    { kind: 'window', x: 160, y: 0, w: 70 },
    { kind: 'window', x: 660, y: 0, w: 70 },
    { kind: 'window', x: 750, y: 0, w: 70 },
    { kind: 'ivy', x: 115, y: 0, w: 160 },
    { kind: 'ivy', x: 705, y: 0, w: 160 },
  ],
};
