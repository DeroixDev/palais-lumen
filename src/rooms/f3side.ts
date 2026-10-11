import type { RoomDefinition } from '../core/registry';

import { FLOOR_NAMES } from '../core/brand';
/**
 * Floor 3 side room: the Räderkammer under the Uhrwerk, down the stairs. The heart of the
 * clockwork turns in the floor; the Uhrwerk-Derby and two Uhrturm machines stay here every
 * day, and once a day a lucky coin sticks in the great brass gear (src/core/curios.ts).
 */
export const f3side: RoomDefinition = {
  id: 'f3b',
  parent: 'f3',
  name: 'Räderkammer',
  tagline: 'Das Herz des Laternenwerks',
  floor: 3,
  elevatorX: -1000,
  sign: 'KAMMER',
  width: 760,
  height: 720,
  theme: {
    style: 'clockwork',
    carpet: 0x2a2420,
    carpetPattern: 0x3a3028,
    carpetAccent: 0xd8a050,
    wall: 0x22201e,
    wallTrim: 0xd8a050,
    neon: 0x7ad8ff,
    light: 0xffd49a,
    accent: 0x1a1410,
    sofa: 0x4a3a2a,
  },
  spawn: { x: 640, y: 240 },
  doors: [{ x: 640, y: 0, side: 'back', to: 'f3', label: FLOOR_NAMES.f3 }],
  stations: [
    { game: 'derby', pinned: true, x: 230, y: 330, label: 'Uhrwerk-Derby' },
    { game: 'tower', pinned: true, x: 70, y: 540, label: 'Uhrturm' },
    { game: 'tower', pinned: true, x: 150, y: 540 },
  ],
  decor: [
    { kind: 'gearInlay', x: 380, y: 520, w: 120 },
    { kind: 'gearInlay', x: 560, y: 640, w: 60, r: 1 },
    { kind: 'grate', x: 640, y: 380, w: 100, h: 300 },
    { kind: 'boiler', x: 60, y: 260, w: 34 },
    { kind: 'pipes', x: 736, y: 520, w: 260, r: 1 },
    { kind: 'clockTower', x: 470, y: 280 },
    { kind: 'workbench', x: 330, y: 660, w: 130 },
    { kind: 'floorLamp', x: 700, y: 660 },
    { kind: 'chandelier', x: 380, y: 690, w: 40 },
    { kind: 'gauge', x: 80, y: 0 },
    { kind: 'wallClock', x: 160, y: 0, w: 40 },
    { kind: 'gauge', x: 560, y: 0 },
    { kind: 'wallClock', x: 730, y: 0, w: 28 },
  ],
};
