import type { RoomDefinition } from '../core/registry';

import { FLOOR_NAMES, GAME_NAMES, SLOT_CLASSIC } from '../core/brand';
/**
 * Floor 1: a tall, mirror-symmetric candle hall. A velvet runner leads down the nave between
 * two rows of pillars, tables stand on it, machine banks line both sides, and at the far end
 * the grand piano plays on a marble dais. The elevator and the arch to the Hinterzimmer face
 * each other across the sign.
 */
export const f1: RoomDefinition = {
  id: 'f1',
  name: FLOOR_NAMES.f1,
  tagline: 'Samt, Kerzenlicht und Klavierjazz',
  floor: 1,
  elevatorX: 200,
  sign: FLOOR_NAMES.f1.toLocaleUpperCase('de-DE'),
  width: 1160,
  height: 1400,
  theme: {
    style: 'velvet',
    carpet: 0x5a1424,
    carpetPattern: 0x7a1d34,
    carpetAccent: 0xe0b25a,
    wall: 0x2a1630,
    wallTrim: 0xe0b25a,
    neon: 0xff5fa2,
    light: 0xffcf7a,
    accent: 0x3a0c18,
    sofa: 0x5a1a3a,
    curtain: 0x8a1a2e,
  },
  spawn: { x: 200, y: 200 },
  doors: [{ x: 960, y: 0, side: 'back', to: 'f1b', label: 'Hinterzimmer' }],
  stations: [
    // Upper gallery: a bank on each side, a table on the runner.
    { game: 'slots', x: 70, y: 330, label: SLOT_CLASSIC, options: { theme: 'classic' } },
    { game: 'slots', x: 150, y: 330, label: SLOT_CLASSIC, options: { theme: 'classic' } },
    { game: 'slots', x: 230, y: 330, label: SLOT_CLASSIC, options: { theme: 'classic' } },
    { game: 'slots', x: 868, y: 330, label: 'Mondschein', options: { theme: 'diamond' } },
    { game: 'slots', x: 948, y: 330, label: 'Mondschein', options: { theme: 'diamond' } },
    { game: 'slots', x: 1028, y: 330, label: 'Mondschein', options: { theme: 'diamond' } },
    { game: 'roulette', x: 505, y: 420, label: 'Roulette', options: { minBet: 10 } },
    // Middle: pairs along the walls, the second table further down the nave.
    { game: 'plinko', x: 80, y: 640, label: GAME_NAMES.plinko },
    { game: 'plinko', x: 160, y: 640, label: GAME_NAMES.plinko },
    { game: 'plinko', x: 924, y: 640, label: GAME_NAMES.plinko },
    { game: 'plinko', x: 1004, y: 640, label: GAME_NAMES.plinko },
    { game: 'roulette', x: 505, y: 760, label: 'Saaltisch', options: { minBet: 10 } },
  ],
  decor: [
    { kind: 'runner', x: 580, y: 700, w: 190, h: 760 },
    { kind: 'dais', x: 580, y: 1200, w: 460, h: 230 },
    { kind: 'rug', x: 170, y: 1170, w: 260, h: 200 },
    { kind: 'rug', x: 990, y: 1170, w: 260, h: 200 },
    { kind: 'trophyShelf', x: 580, y: 215, w: 250 },
    // The colonnade along the nave.
    { kind: 'pillar', x: 370, y: 300 },
    { kind: 'pillar', x: 790, y: 300 },
    { kind: 'pillar', x: 370, y: 600 },
    { kind: 'pillar', x: 790, y: 600 },
    { kind: 'pillar', x: 370, y: 920 },
    { kind: 'pillar', x: 790, y: 920 },
    // The far end: piano on the dais, a lounge on each side.
    { kind: 'piano', x: 580, y: 1180 },
    { kind: 'sofa', x: 170, y: 1110, w: 170 },
    { kind: 'table', x: 170, y: 1200 },
    { kind: 'armchair', x: 70, y: 1240, r: 1 },
    { kind: 'sofa', x: 990, y: 1110, w: 170 },
    { kind: 'table', x: 990, y: 1200 },
    { kind: 'armchair', x: 1090, y: 1240, r: 3 },
    { kind: 'floorLamp', x: 300, y: 1300 },
    { kind: 'floorLamp', x: 860, y: 1300 },
    { kind: 'bar', x: 190, y: 950, w: 240, h: 64 },
    { kind: 'bookshelf', x: 980, y: 930, w: 160 },
    { kind: 'statue', x: 580, y: 1060 },
    { kind: 'plant', x: 50, y: 210 },
    { kind: 'plant', x: 1110, y: 210 },
    { kind: 'plant', x: 50, y: 1350 },
    { kind: 'plant', x: 1110, y: 1350 },
    { kind: 'cabinet', x: 420, y: 1354, w: 110 },
    { kind: 'cabinet', x: 740, y: 1354, w: 110 },
    { kind: 'chandelier', x: 580, y: 760, w: 52 },
    { kind: 'chandelier', x: 580, y: 1090, w: 46 },
    { kind: 'chandelier', x: 170, y: 560, w: 36 },
    { kind: 'chandelier', x: 990, y: 560, w: 36 },
    { kind: 'sconce', x: 60, y: 0 },
    { kind: 'painting', x: 296, y: 0, w: 64, h: 70 },
    { kind: 'painting', x: 864, y: 0, w: 64, h: 70 },
    { kind: 'sconce', x: 1100, y: 0 },
  ],
};
