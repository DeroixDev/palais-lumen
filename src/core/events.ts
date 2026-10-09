// Day events: every day (except day 1 and the boss day) may bring one special evening.
// Events only touch the economy — goal, stake size, bonus Mondsteine, stamps, which games
// are open — never the odds. Every game keeps its true house edge.

import { floorRooms } from './registry';
import { BOSS_DAY, floorForDay, type GameState, type RoundReport, type SaveData } from './state';
import { bossClosedGame } from './boss';

export interface DayEvent {
  id: string;
  name: string;
  /** One exact line: what changes today. */
  rule: string;
  /** Short sign painted on the chip and the day card. */
  icon: string;
  color: number;
  weight: number;
  /** Factor on today's goal / stake unit. */
  quota?: number;
  stake?: number;
  /** Games that stay closed today. */
  closed?: string[];
  /** Games the floor must have for this event to make sense. */
  needs?: string[];
  /** More (or fewer) guests in the rooms. */
  guests?: number;
  /** Only candles light the rooms. */
  dark?: boolean;
  /** Stamps count double. */
  stamps?: number;
  /** Bonus Mondsteine for a finished round (capped per day, see BONUS_CAP). */
  bonus?: (r: RoundReport) => number;
}

const mult = (r: RoundReport) => (r.stake > 0 ? r.win / r.stake : 0);

export const EVENTS: DayEvent[] = [
  {
    id: 'happyHour',
    name: 'Happy Hour',
    rule: 'Roulette-Gewinne ab 5× geben +1 Mondstein (bis 5 am Tag).',
    icon: '♣',
    color: 0xff9a3c,
    weight: 10,
    needs: ['roulette'],
    bonus: (r) => (r.game === 'roulette' && mult(r) >= 5 ? 1 : 0),
  },
  {
    id: 'stromausfall',
    name: 'Stromausfall',
    rule: 'Nur Kerzenlicht: Automaten geschlossen, Ziel −10 %.',
    icon: 'ϟ',
    color: 0xffc46b,
    weight: 8,
    needs: ['slots'],
    closed: ['slots'],
    quota: 0.9,
    dark: true,
  },
  {
    id: 'hochstapler',
    name: 'Hochstapler-Abend',
    rule: 'Alle Einsätze ×2, Tagesziel ×1,5.',
    icon: '♛',
    color: 0xe0b25a,
    weight: 7,
    stake: 2,
    quota: 1.5,
  },
  {
    id: 'ruhig',
    name: 'Ruhiger Abend',
    rule: 'Tagesziel −15 %.',
    icon: '☾',
    color: 0x9fb8ff,
    weight: 9,
    quota: 0.85,
    guests: 0.6,
  },
  {
    id: 'mottenschwarm',
    name: 'Mottenschwarm',
    rule: 'Mondflug-Gewinne ab 2× geben +1 Mondstein (bis 5 am Tag).',
    icon: '✦',
    color: 0xc9a0ff,
    weight: 9,
    needs: ['crash'],
    bonus: (r) => (r.game === 'crash' && mult(r) >= 2 ? 1 : 0),
  },
  {
    id: 'sammeltag',
    name: 'Sammeltag',
    rule: 'Alle Stempel zählen heute doppelt.',
    icon: '✚',
    color: 0x7bd47b,
    weight: 9,
    stamps: 2,
  },
  {
    id: 'gala',
    name: 'Galaabend',
    rule: 'Mehr Gäste, Ziel +10 %, Gewinne ab 10× geben +1 Mondstein.',
    icon: '♦',
    color: 0xff5fa2,
    weight: 8,
    quota: 1.1,
    guests: 1.6,
    bonus: (r) => (mult(r) >= 10 ? 1 : 0),
  },
  {
    id: 'randnacht',
    name: 'Randfächer-Nacht',
    rule: 'Mottenfall: jedes Randfach gibt +1 Mondstein (bis 5 am Tag).',
    icon: '▼',
    color: 0x5fe3ff,
    weight: 8,
    needs: ['plinko'],
    bonus: (r) => (r.game === 'plinko' && r.tags.includes('edge') ? 1 : 0),
  },
  {
    id: 'nullnacht',
    name: 'Null-Nacht',
    rule: 'Roulette: ein Treffer auf die Null gibt +2 Mondsteine.',
    icon: '0',
    color: 0x3fbf7a,
    weight: 7,
    needs: ['roulette'],
    bonus: (r) => (r.game === 'roulette' && r.tags.includes('zero') ? 2 : 0),
  },
  {
    id: 'groschen',
    name: 'Groschenabend',
    rule: 'Einsätze halbiert, Tagesziel −40 %.',
    icon: '½',
    color: 0xcfa070,
    weight: 6,
    stake: 0.5,
    quota: 0.6,
  },
  {
    id: 'wartung',
    name: 'Wartungsarbeiten',
    rule: 'Mondflug geschlossen, Tagesziel −10 %.',
    icon: '⚙\uFE0E',
    color: 0xa0a8b8,
    weight: 5,
    needs: ['crash'],
    closed: ['crash'],
    quota: 0.9,
  },
];

/** Chance of a plain day without an event. */
const PLAIN = 0.25;
/** Most bonus Mondsteine an event pays in one day. */
export const BONUS_CAP = 5;

export function eventById(id: string) {
  return EVENTS.find((e) => e.id === id) ?? null;
}

/** Today's event, or null on a plain day. */
export function currentEvent(d: SaveData) {
  return d.event ? eventById(d.event) : null;
}

/** Games on the floor of a day. */
function gamesOnDay(day: number) {
  return new Set(floorRooms(floorForDay(day)).flatMap((r) => r.stations.map((s) => s.game)));
}

/** Events that fit a day (their games exist on that floor). */
export function eventsFor(day: number) {
  const games = gamesOnDay(day);
  return EVENTS.filter((e) => !e.needs || e.needs.every((g) => games.has(g)));
}

/** True if a game is closed today (by the day's event, or by the boss's "Letzter Tanz"). */
export function isClosed(d: SaveData, game: string) {
  return !!currentEvent(d)?.closed?.includes(game) || bossClosedGame(d) === game;
}

/** All games closed right now (event and boss phase). */
export function closedGames(d: SaveData): string[] {
  const out = [...(currentEvent(d)?.closed ?? [])];
  const b = bossClosedGame(d);
  if (b && !out.includes(b)) out.push(b);
  return out;
}

/** Factor on stamps today. */
export function stampFactor(d: SaveData) {
  return currentEvent(d)?.stamps ?? 1;
}

/** Factor on the number of guests in a room. */
export function guestFactor(d: SaveData) {
  return currentEvent(d)?.guests ?? 1;
}

function roll(d: SaveData) {
  const day = d.evening.number;
  // The first day stays plain; the boss day has its own phases.
  if (day <= 1 || day >= BOSS_DAY) return '';
  if (Math.random() < PLAIN) return '';
  const last = d.counters.lastEvent ?? -1;
  const pool = eventsFor(day).filter((e) => EVENTS.indexOf(e) !== last);
  let r = Math.random() * pool.reduce((s, e) => s + e.weight, 0);
  for (const e of pool) if ((r -= e.weight) < 0) return e.id;
  return pool[0]?.id ?? '';
}

/**
 * Hooks the events into the state: the roll at day start, the goal and stake factors, and
 * the bonus Mondsteine. `notify` shows a short message (a toast).
 */
export function installEvents(state: GameState, notify: (text: string) => void) {
  state.onDayStart((d) => {
    d.event = roll(d);
    const i = EVENTS.findIndex((e) => e.id === d.event);
    if (i >= 0) d.counters.lastEvent = i;
    d.counters.eventBonus = 0;
  });
  state.quotaFactors.push((d) => currentEvent(d)?.quota ?? 1);
  state.stakeFactors.push((d) => currentEvent(d)?.stake ?? 1);
  state.onRound((r) => {
    const d = state.data;
    const e = currentEvent(d);
    if (!e?.bonus) return;
    const got = d.counters.eventBonus ?? 0;
    const n = Math.min(e.bonus(r), BONUS_CAP - got);
    if (n <= 0) return;
    d.counters.eventBonus = got + n;
    d.moonstones += n;
    notify(`${e.name}: +${n} Mondstein${n === 1 ? '' : 'e'}`);
  });
}

const switchListeners = new Set<() => void>();

/**
 * Runs after today's event was switched mid-day (debug), so the event-dependent parts of the
 * day setup can be redone: tasks, guests, room extras, closed games. Money and history stay.
 */
export function onEventSwitch(fn: () => void) {
  switchListeners.add(fn);
  return () => void switchListeners.delete(fn);
}

/** Debug: switch today's event, fix the goal again and redo the event-dependent day setup. */
export function setEvent(state: GameState, id: string) {
  const d = state.data;
  d.event = eventById(id) ? id : '';
  d.counters.eventBonus = 0;
  d.evening.quota = state.quotaToday(d.evening.number, d.evening.startBalance);
  for (const l of [...switchListeners]) l();
  state.emit();
}
