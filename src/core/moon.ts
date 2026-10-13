// Mondstufen: a harder season for players who have won one. Each level raises every goal by
// 12 % and adds one twist (they add up); in return medals pay more Mondsteine and trophies
// come out moon-tinted. Economy only: no game's odds change.

import { BOSS_DAY, type GameState, type SaveData } from './state';

export const MAX_HEAT = 5;
export const HEAT_GOAL_STEP = 0.12;

export interface MoonLevel {
  level: number;
  name: string;
  /** The twist this level adds (all lower twists stay). */
  twist: string;
}

export const MOON_LEVELS: MoonLevel[] = [
  { level: 0, name: 'Neumond', twist: 'Die normale Saison.' },
  { level: 1, name: 'Sichel', twist: 'Alle Ziele +12 %.' },
  { level: 2, name: 'Halbmond', twist: 'Keine Zweite Chance.' },
  { level: 3, name: 'Dreiviertel', twist: 'Boss-Ziel +25 %.' },
  { level: 4, name: 'Vollmond', twist: 'Nach jedem Tag nur 2 Glücksbringer zur Wahl.' },
  { level: 5, name: 'Blutmond', twist: 'Mondsteine ×2.' },
];

/** Goal factor of a moon level (+12 % per level; the boss day +25 % more from level 3). */
export function heatQuotaFactor(d: SaveData) {
  const h = d.heat;
  if (h <= 0) return 1;
  let k = 1 + HEAT_GOAL_STEP * h;
  if (h >= 3 && d.evening.number >= BOSS_DAY) k *= 1.25;
  return k;
}

/** Mondsteine multiplier on medals: +20 % per level, doubled again on level 5. */
export function heatStoneFactor(heat: number) {
  if (heat <= 0) return 1;
  return (1 + 0.2 * heat) * (heat >= 5 ? 2 : 1);
}

/** Cards in the draft after a day. */
export const draftSize = (d: SaveData) => (d.heat >= 4 ? 2 : 3);

/** The level can be picked on day 1 of a season, before the first round. */
export function canPickHeat(d: SaveData) {
  return d.heatUnlocked > 0 && d.evening.number === 1 && d.history.length <= 1 && d.counters.heatPick !== d.season.number;
}

/** True once the level of this season has been settled (or there is nothing to pick). */
export const heatPicked = (d: SaveData) => d.heatUnlocked <= 0 || d.counters.heatPick === d.season.number;

/** Sets this season's moon level and recomputes today's goal. */
export function setHeat(state: GameState, level: number) {
  const d = state.data;
  d.heat = Math.max(0, Math.min(MAX_HEAT, Math.min(d.heatUnlocked, Math.floor(level))));
  d.counters.heatPick = d.season.number;
  if (d.heat >= 2) d.charmUsed = true;
  d.evening.quota = state.quotaToday(d.evening.number, d.evening.startBalance);
  state.emit();
}

export function installMoon(state: GameState) {
  state.quotaFactors.push(heatQuotaFactor);
  // Level 2: "Zweite Chance" is spent from the start.
  state.onDayStart((d) => {
    if (d.heat >= 2) d.charmUsed = true;
  });
  state.moonstoneBonus.push((d, _medal, base) => Math.round(base * (heatStoneFactor(d.heat) - 1)));
}
