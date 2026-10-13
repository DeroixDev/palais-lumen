// Little finds in the side rooms: one per room, to be picked up once a day. They only pay
// economy things (a Mondstein, a stamp, a few Lumen that don't count towards the goal),
// never better odds. "Taken today" lives in the counters as the day it was taken.

import type { GameState } from './state';
import { addStamps } from './stamps';

import { CURRENCY_PLURAL } from './brand';
export interface Curio {
  room: string;
  /** Where it stands (middle of its footprint). */
  x: number;
  y: number;
  kind: 'cigarBox' | 'moonflower' | 'brassCoin';
  /** Prompt while it waits, and once it is gone for today. */
  title: string;
  taken: string;
  /** Floating text at the pickup. */
  float: string;
}

export const CURIOS: Curio[] = [
  { room: 'f1b', x: 690, y: 492, kind: 'cigarBox', title: 'Zigarrenkiste öffnen', taken: 'Kiste ist leer · morgen wieder', float: '+1 Mondstein' },
  { room: 'f2b', x: 450, y: 450, kind: 'moonflower', title: 'Mondblüte pflücken', taken: 'Blüte schläft · morgen wieder', float: '+1 Stempel' },
  { room: 'f3b', x: 590, y: 560, kind: 'brassCoin', title: 'Münze aus dem Zahnrad holen', taken: 'Zahnrad ist leer · morgen wieder', float: 'Glücksmünze' },
];

export const curioOf = (room: string) => CURIOS.find((c) => c.room === room) ?? null;

const key = (room: string) => `curio:${room}`;
/** One value per day of the game (a new season starts the days again). */
const dayKey = (s: GameState) => s.data.season.number * 1000 + s.data.evening.number;

export function curioTaken(s: GameState, room: string) {
  return s.data.counters[key(room)] === dayKey(s);
}

/** Lumen in the brass coin: a few minimum stakes, outside the day's goal. */
export function coinValue(s: GameState) {
  return s.stakes([30])[0];
}

const listeners = new Set<(c: Curio) => void>();

/** The room plays the pickup moment when its curio is taken. */
export function onCurio(fn: (c: Curio) => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

/** Takes the room's find if it is still there today; tells the player what it was. */
export function takeCurio(s: GameState, room: string, toast: (t: string) => void) {
  const c = curioOf(room);
  if (!c) return false;
  if (curioTaken(s, room)) {
    toast(c.kind === 'moonflower' ? 'Die Mondblüte hat sich für heute geschlossen. Morgen Nacht blüht sie wieder.' : 'Hier ist heute nichts mehr zu finden. Schau morgen wieder vorbei.');
    return false;
  }
  s.data.counters[key(room)] = dayKey(s);
  s.count('curios');
  if (c.kind === 'cigarBox') {
    s.data.moonstones += 1;
    toast('Unter den Zigarren liegt ein Mondstein! +1 Mondstein.');
  } else if (c.kind === 'moonflower') {
    toast('Die Mondblüte öffnet sich nur nachts: +1 Stempel auf der Mondgarten-Karte.');
    addStamps(s, 'f2', 1, 'Mondblüte gepflückt');
  } else {
    const n = coinValue(s);
    // Like the wishing coin: the Lumen come in without moving today's goal.
    s.data.balance += n;
    s.data.evening.startBalance += n;
    toast(`Eine Glücksmünze klemmt im Zahnrad: +${n} ${CURRENCY_PLURAL} (zählen nicht zum Tagesziel).`);
  }
  for (const l of listeners) l(c);
  s.emit();
  return true;
}
