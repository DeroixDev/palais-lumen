import type { RoomDefinition } from '../core/registry';

import { FLOOR_NAMES, SLOT_GOLD } from '../core/brand';
/**
 * Floor 1 side room: the Hinterzimmer behind the Kerzensaal. Low green lamps, leather, cigar
 * smoke and high limits: a roulette from 50, Goldmotte machines and a baccarat salon, all on
 * fixed spots. A cigar box on the side table hides a Mondstein once a day (src/core/curios.ts).
 */
export const f1side: RoomDefinition = {
  id: 'f1b',
  parent: 'f1',
  name: 'Hinterzimmer',
  tagline: 'Hohe Limits hinter dem Samtvorhang',
  floor: 1,
  elevatorX: -1000,
  sign: 'PRIVAT',
  width: 820,
  height: 640,
  theme: {
    style: 'velvet',
    carpet: 0x1c2a22,
    carpetPattern: 0x24382c,
    carpetAccent: 0xc9a24a,
    wall: 0x14241c,
    wallTrim: 0xc9a24a,
    neon: 0xffb347,
    light: 0xffd49a,
    accent: 0x2a1410,
    sofa: 0x4a2a16,
    curtain: 0x1f4a3a,
    barLabel: 'SALON · Tonic & Mocktails',
  },
  spawn: { x: 690, y: 220 },
  tabletX: 42,
  doors: [{ x: 690, y: 0, side: 'back', to: 'f1', label: FLOOR_NAMES.f1 }],
  stations: [
    { game: 'slots', pinned: true, x: 60, y: 210, label: SLOT_GOLD, options: { theme: 'gold' } },
    { game: 'slots', pinned: true, x: 140, y: 210, options: { theme: 'gold' } },
    { game: 'roulette', pinned: true, x: 300, y: 300, label: 'Hohe Kante · ab 50', options: { minBet: 50 } },
    { game: 'baccarat', pinned: true, x: 380, y: 470, label: 'Salon Privé' },
  ],
  decor: [
    { kind: 'rug', x: 375, y: 360, w: 360, h: 230 },
    { kind: 'bookshelf', x: 42, y: 470, w: 150, r: 1 },
    { kind: 'armchair', x: 120, y: 560, r: 1 },
    { kind: 'table', x: 200, y: 580 },
    { kind: 'floorLamp', x: 70, y: 380 },
    { kind: 'armchair', x: 760, y: 560, r: 3 },
    { kind: 'floorLamp', x: 770, y: 410 },
    { kind: 'plant', x: 560, y: 196 },
    { kind: 'cabinet', x: 600, y: 600, w: 100 },
    { kind: 'chandelier', x: 200, y: 470, w: 32 },
    { kind: 'armchair', x: 770, y: 290, r: 3 },
    { kind: 'painting', x: 120, y: 0, w: 70, h: 64 },
    { kind: 'sconce', x: 200, y: 0 },
    { kind: 'sconce', x: 620, y: 0 },
    { kind: 'curtain', x: 770, y: 0, w: 70 },
  ],
};
