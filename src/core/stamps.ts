// The regulars' stamp card ("Stammkunden-Karte"): one card per floor. Stamps come from
// playing on that floor, from passed days and from guest tasks. A full card of 8 unlocks a
// permanent upgrade for that floor's room; every further full card pays Mondsteine.

import { floorForDay, type GameState, type SaveData } from './state';
import { currentEvent, stampFactor } from './events';
import { perkFactor } from './perks';

export const STAMPS_PER_CARD = 8;
/** Rounds played on a floor for one stamp. */
export const ROUNDS_PER_STAMP = 15;
/** Mondsteine for every full card after the first. */
export const REFILL_STONES = 3;

export interface StampReward {
  floor: string;
  name: string;
  /** One line, shown on the card. */
  text: string;
  /** Roulette tables get gold felt. */
  felt?: boolean;
  /** Slot cabinets turn golden. */
  goldSlots?: boolean;
}

/** Every full first card also puts a golden regulars' statue on the floor. */
export const STAMP_REWARDS: Record<string, StampReward> = {
  f1: { floor: 'f1', name: 'Goldfilz-Roulette', text: 'Goldfilz am Roulette und eine Ehrenmotte aus Gold.', felt: true },
  f2: { floor: 'f2', name: 'Goldene Automaten', text: 'Goldene Mondschein-Automaten und eine Ehrenmotte.', goldSlots: true },
  f3: { floor: 'f3', name: 'Goldenes Räderwerk', text: 'Goldene Automaten, Goldfilz und eine Ehrenmotte.', goldSlots: true, felt: true },
  f4: { floor: 'f4', name: 'Goldener High Roller', text: 'Goldfilz am High-Roller-Tisch und eine Ehrenmotte.', felt: true },
  f5: { floor: 'f5', name: 'Königlicher Goldfilz', text: 'Goldfilz am Königstisch und eine Ehrenmotte.', felt: true },
};

export const STAMP_FLOORS = ['f1', 'f2', 'f3', 'f4', 'f5'];

export interface StampNews {
  floor: string;
  /** Stamps on the current card after this one (1–8). */
  onCard: number;
  /** This stamp filled the card. */
  full: boolean;
  /** The floor's reward was unlocked with it. */
  unlocked: boolean;
  /** The floor's reward was already unlocked before this stamp. */
  had: boolean;
  /** Mondsteine paid for a refilled card. */
  stones: number;
  reason: string;
}

const listeners = new Set<(n: StampNews) => void>();

/** Called for every single stamp that lands. */
export function onStamp(fn: (n: StampNews) => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Total stamps ever collected on a floor. */
export function stampTotal(d: SaveData, floor: string) {
  return d.stamps[floor] ?? 0;
}

/** Stamps on the card that is shown now (a full card stays full until the next stamp). */
export function stampsOnCard(d: SaveData, floor: string) {
  const t = stampTotal(d, floor);
  return t === 0 ? 0 : ((t - 1) % STAMPS_PER_CARD) + 1;
}

export function hasReward(d: SaveData, floor: string) {
  return d.stampRewards.includes(floor);
}

/** Floor room id of a day ('f1' … 'f5'). */
export function floorOfDay(day: number) {
  return `f${floorForDay(day)}`;
}

/** Puts `n` stamps on a floor's card and pays what they unlock. */
export function addStamps(state: GameState, floor: string, n: number, reason: string) {
  if (!STAMP_FLOORS.includes(floor)) return;
  const d = state.data;
  for (let i = 0; i < n; i++) {
    const total = stampTotal(d, floor) + 1;
    d.stamps[floor] = total;
    const full = total % STAMPS_PER_CARD === 0;
    const had = hasReward(d, floor);
    let unlocked = false;
    let stones = 0;
    if (full) {
      if (!hasReward(d, floor)) {
        d.stampRewards.push(floor);
        unlocked = true;
      } else {
        stones = REFILL_STONES;
        d.moonstones += stones;
      }
    }
    const news: StampNews = { floor, onCard: stampsOnCard(d, floor), full, unlocked, had, stones, reason };
    for (const l of listeners) l(news);
  }
  state.emit();
}

/** Stamps from rounds played on a floor, and one for each passed day. */
export function installStamps(state: GameState) {
  state.onRound(() => {
    const d = state.data;
    const floor = d.roomId;
    if (!STAMP_FLOORS.includes(floor)) return;
    const key = `stampRounds:${floor}`;
    const n = (d.counters[key] ?? 0) + 1;
    if (n >= ROUNDS_PER_STAMP) {
      d.counters[key] = 0;
      addStamps(state, floor, stampFactor(d) * perkFactor(d, 'stamps'), `${ROUNDS_PER_STAMP} Runden gespielt`);
    } else d.counters[key] = n;
  });
  // A passed day stamps its floor's card. Wrapped here so the day's event (Sammeltag) still counts.
  const endEvening = state.endEvening.bind(state);
  state.endEvening = () => {
    const d = state.data;
    const floor = floorOfDay(d.evening.number);
    const factor = (currentEvent(d)?.stamps ?? 1) * perkFactor(d, 'stamps');
    const r = endEvening();
    if (r.passed) addStamps(state, floor, factor, `Tag ${r.evening} geschafft`);
    return r;
  };
}
