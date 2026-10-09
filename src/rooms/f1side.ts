import type { RoomDefinition } from '../core/registry';
import { f1 } from './f1';

/** Floor 1 side room: a small back room behind the Kerzensaal. */
export const f1side: RoomDefinition = {
  id: 'f1b',
  parent: 'f1',
  name: 'Hinterzimmer',
  tagline: 'Hinter dem Samtvorhang',
  floor: 1,
  elevatorX: -1000,
  sign: 'HINTERZIMMER',
  width: 760,
  height: 640,
  theme: f1.theme,
  spawn: { x: 380, y: 300 },
  doors: [{ x: 380, y: 0, side: 'back', to: 'f1', label: 'Kerzensaal' }],
  stations: [],
  decor: [
    { kind: 'rug', x: 380, y: 420, w: 300, h: 200 },
    { kind: 'chandelier', x: 380, y: 420, w: 40 },
  ],
};
