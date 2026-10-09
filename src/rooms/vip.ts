import type { RoomDefinition } from '../core/registry';

export const vip: RoomDefinition = {
  id: 'vip',
  name: 'VIP-Lounge',
  sign: 'VIP LOUNGE',
  width: 1000,
  height: 760,
  unlockCost: 5000,
  theme: {
    carpet: 0x0f2338,
    carpetPattern: 0x16324f,
    carpetAccent: 0x9fe8ff,
    wall: 0x0a1626,
    wallTrim: 0xfff1c4,
    neon: 0x5fe3ff,
    light: 0xbfefff,
  },
  spawn: { x: 500, y: 660 },
  stations: [
    { game: 'roulette', x: 420, y: 300, label: 'High Roller', options: { minBet: 50 } },
    { game: 'slots', x: 140, y: 250, label: 'Goldmotte', options: { theme: 'gold' } },
    { game: 'slots', x: 240, y: 250, label: 'Goldmotte', options: { theme: 'gold' } },
    { game: 'slots', x: 760, y: 250, label: 'Mondschein', options: { theme: 'diamond' } },
    { game: 'plinko', x: 150, y: 380, label: 'Mottenfall' },
    { game: 'crash', x: 730, y: 380, label: 'Mondflug' },
  ],
  doors: [{ to: 'lobby', x: 500, label: 'Lobby' }],
  decor: [
    { kind: 'sofa', x: 120, y: 560, w: 180, h: 54 },
    { kind: 'sofa', x: 700, y: 560, w: 180, h: 54 },
    { kind: 'plant', x: 60, y: 180 },
    { kind: 'plant', x: 940, y: 180 },
    { kind: 'rope', x: 380, y: 480, w: 240 },
  ],
};
