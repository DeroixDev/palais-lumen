import type { RoomDefinition } from '../core/registry';

/**
 * The foyer: where every season starts and every day ends. Souvenir shop, wardrobe,
 * reception for the group, achievements, a wishing fountain and the elevator up.
 */
export const foyer: RoomDefinition = {
  id: 'foyer',
  name: 'Foyer',
  tagline: 'Laden, Umkleide, Empfang und Erfolge',
  floor: 0,
  elevatorX: 1180,
  sign: 'FOYER',
  width: 1400,
  height: 900,
  theme: {
    style: 'foyer',
    carpet: 0xe8dcc0,
    carpetPattern: 0x141a3a,
    carpetAccent: 0xd9a84a,
    wall: 0x1c2552,
    wallTrim: 0xe0b25a,
    neon: 0xa8c8ff,
    light: 0xffdca0,
    accent: 0x7e1f36,
    sofa: 0x1f5a5a,
    curtain: 0x7e1f36,
    barLabel: 'SAFTBAR · alkoholfrei',
  },
  spawn: { x: 700, y: 730 },
  tabletX: 1318,
  stations: [],
  decor: [
    // Floor
    { kind: 'rug', x: 1010, y: 790, w: 300, h: 150 },
    // Shop, vitrine, achievements, elevator along the back wall
    { kind: 'shopCounter', x: 265, y: 300, w: 250, h: 64 },
    { kind: 'trophyShelf', x: 510, y: 210, w: 190 },
    { kind: 'achievementWall', x: 968, y: 0, w: 250 },
    { kind: 'jukebox', x: 1318, y: 300 },
    // Middle: the wishing fountain on the compass star
    { kind: 'fountain', x: 700, y: 497, w: 78 },
    { kind: 'bench', x: 540, y: 470 },
    { kind: 'bench', x: 860, y: 470 },
    { kind: 'chandelier', x: 700, y: 497, w: 64, h: 200 },
    // Left: the wardrobe with clothes racks
    { kind: 'wardrobe', x: 215, y: 600, w: 150, h: 110 },
    { kind: 'clothesRack', x: 140, y: 770, w: 110 },
    { kind: 'clothesRack', x: 290, y: 770, w: 110 },
    { kind: 'chandelier', x: 420, y: 480, w: 40 },
    // Right: reception, juice bar, piano and a lounge
    { kind: 'reception', x: 1090, y: 470, w: 76 },
    { kind: 'piano', x: 1240, y: 690 },
    { kind: 'sofa', x: 960, y: 740, w: 160 },
    { kind: 'table', x: 960, y: 820 },
    { kind: 'armchair', x: 1100, y: 810, r: 3 },
    { kind: 'chandelier', x: 880, y: 650, w: 44 },
    // Entrance and greenery
    { kind: 'entrance', x: 700, y: 876 },
    { kind: 'palm', x: 545, y: 800 },
    { kind: 'palm', x: 855, y: 800 },
    { kind: 'plant', x: 55, y: 190 },
    { kind: 'plant', x: 55, y: 855 },
    { kind: 'plant', x: 1345, y: 855 },
    { kind: 'plant', x: 1345, y: 420 },
    { kind: 'floorLamp', x: 400, y: 640 },
    // Back wall
    { kind: 'plaque', x: 90, y: 0, w: 120 },
    { kind: 'moonWindow', x: 205, y: 0, w: 92 },
    { kind: 'floorBoard', x: 335, y: 0, w: 104 },
    { kind: 'keyBoard', x: 1090, y: 402 },
  ],
};
