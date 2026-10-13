import type { RoomDefinition } from '../core/registry';

/** Floor 4 side room: the narrow techno bunker between the club and the hip-hop floor. */
export const f4techno: RoomDefinition = {
  id: 'f4t',
  parent: 'f4',
  name: 'Techno-Bunker',
  tagline: 'Beton, Laser, 134 BPM',
  floor: 4,
  elevatorX: -1000,
  sign: 'BUNKER',
  width: 1100,
  height: 640,
  theme: {
    style: 'techno',
    carpet: 0x1d1d22,
    carpetPattern: 0x2a2a30,
    carpetAccent: 0xff2040,
    wall: 0x141418,
    wallTrim: 0x6a6a74,
    neon: 0xff2040,
    light: 0xff6070,
    accent: 0x101014,
    sofa: 0x2a2a30,
  },
  spawn: { x: 120, y: 470 },
  tabletX: 1010,
  doors: [
    { x: 0, y: 470, side: 'left', to: 'f4', label: 'Club' },
    { x: 0, y: 470, side: 'right', to: 'f4h', label: 'Hip-Hop-Floor' },
  ],
  stations: [
    { game: 'mines', x: 300, y: 196, label: 'Minenfeld' },
    { game: 'mines', x: 724, y: 196 },
  ],
  decor: [
    { kind: 'danceFloor', x: 550, y: 430, w: 420, h: 200 },
    { kind: 'speakerStack', x: 220, y: 330, w: 0.9 },
    { kind: 'speakerStack', x: 880, y: 330, w: 0.9 },
    { kind: 'fogMachine', x: 300, y: 590 },
    { kind: 'railing', x: 550, y: 600, w: 360 },
    { kind: 'laser', x: 150, y: 0, r: 0 },
    { kind: 'strobe', x: 400, y: 0 },
    { kind: 'strobe', x: 700, y: 0 },
    { kind: 'laser', x: 950, y: 0, r: 1 },
  ],
};
