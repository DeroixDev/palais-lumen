import type { RoomDefinition } from '../core/registry';

import { FLOOR_NAMES, GAME_NAMES } from '../core/brand';
/**
 * Floor 4: Club Neon. A wide room built round a dance stage instead of a grid of
 * machines: DJ, truss and moving heads at the back, the LED dance floor in the middle, the
 * light desk in front of it, machines and tables in the two wings, the neon bar and VIP
 * booths. The music gets louder and fuller the closer you get to the floor (clubLife.ts).
 * A door on the right leads through the techno bunker to the hip-hop floor.
 */
export const f4: RoomDefinition = {
  id: 'f4',
  name: FLOOR_NAMES.f4,
  tagline: 'Bühne, Bass und Lichtshow',
  floor: 4,
  elevatorX: 160,
  sign: FLOOR_NAMES.f4.toLocaleUpperCase('de-DE'),
  width: 2000,
  height: 1150,
  theme: {
    style: 'club',
    carpet: 0x1a1226,
    carpetPattern: 0x2a1a3a,
    carpetAccent: 0xff3fb4,
    wall: 0x2a1036,
    wallTrim: 0xc8d0dc,
    neon: 0xff3fb4,
    light: 0xc9a0ff,
    accent: 0x1a0a22,
    sofa: 0x5a1a6a,
    crystal: 0x9fe8ff,
    barLabel: 'NEON-BAR',
  },
  spawn: { x: 160, y: 240 },
  tabletX: 1500,
  doors: [{ x: 0, y: 930, side: 'right', to: 'f4t', label: 'Techno-Bunker' }],
  stations: [
    // Left wing: a bank by the elevator and two tables.
    { game: 'slots', x: 270, y: 196, options: { theme: 'diamond' } },
    { game: 'slots', x: 350, y: 196, label: 'Mondschein', options: { theme: 'diamond' } },
    { game: 'slots', x: 430, y: 196, options: { theme: 'diamond' } },
    { game: 'roulette', x: 70, y: 470, label: 'High Roller', options: { minBet: 50 } },
    { game: 'crash', x: 290, y: 470, label: 'Mondflug' },
    // Right wing: a bank under the bar and two tables by the bunker door.
    { game: 'plinko', x: 1560, y: 500 },
    { game: 'plinko', x: 1640, y: 500, label: GAME_NAMES.plinko },
    { game: 'plinko', x: 1720, y: 500 },
    { game: 'plinko', x: 1800, y: 500 },
    { game: 'blackjack', x: 1520, y: 720, label: 'Blackjack' },
    { game: 'hilo', x: 1720, y: 720, label: 'Hoch oder Tief' },
  ],
  decor: [
    // The stage and the floor.
    { kind: 'djStage', x: 1000, y: 245, w: 760, h: 170 },
    { kind: 'speakerStack', x: 565, y: 310 },
    { kind: 'speakerStack', x: 1435, y: 310 },
    { kind: 'danceFloor', x: 1000, y: 570, w: 700, h: 320 },
    { kind: 'ledPillar', x: 610, y: 430 },
    { kind: 'ledPillar', x: 1390, y: 430 },
    { kind: 'ledPillar', x: 610, y: 720 },
    { kind: 'ledPillar', x: 1390, y: 720 },
    { kind: 'railing', x: 610, y: 575, w: 230, r: 1 },
    { kind: 'railing', x: 1390, y: 575, w: 230, r: 1 },
    { kind: 'lightDesk', x: 1000, y: 830 },
    { kind: 'fogMachine', x: 700, y: 360 },
    { kind: 'discoBall', x: 1000, y: 600, w: 1.1, h: 455 },
    // Bar and VIP lounge (with a champagne tower from the old crystal salon).
    { kind: 'clubBar', x: 1720, y: 300, w: 380, h: 70 },
    { kind: 'vipBooth', x: 200, y: 1000, w: 220 },
    { kind: 'vipBooth', x: 480, y: 1000, w: 220 },
    { kind: 'champagne', x: 340, y: 800 },
    { kind: 'railing', x: 340, y: 890, w: 420 },
    { kind: 'vipBooth', x: 1600, y: 1010, w: 220 },
    { kind: 'railing', x: 1780, y: 880, w: 120, r: 1 },
    // Back wall.
    { kind: 'neonArt', x: 470, y: 0, r: 0, h: 0x3fe8ff },
  ],
};
