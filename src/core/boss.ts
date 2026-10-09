// The Moth Queen's phases on the boss day. Her life is the goal minus today's profit:
// Phase 1 from 100 %, Phase 2 below 60 % (stakes ×2), Phase 3 below 25 % (one game type
// closed, rotating every 8 rounds; events.ts isClosed() includes it). Phases only go up
// within a day. Economy only.

import { BOSS_DAY, type GameState, type SaveData } from './state';

export const PHASE_NAME = ['', 'Die Königin wacht', 'Die Königin erhebt sich', 'Letzter Tanz'];
export const PHASE_TEXT = [
  '',
  'Jeder gewonnene Falter trifft sie.',
  'Alle Einsätze sind jetzt doppelt so hoch.',
  'Ein Spiel bleibt geschlossen und wechselt alle 8 Runden.',
];
/** Games on the boss floor that "Letzter Tanz" can close. */
export const BOSS_GAMES = ['slots', 'roulette', 'crash', 'plinko'];
export const ROTATE_EVERY = 8;

export const isBossDay = (d: SaveData) => d.evening.number >= BOSS_DAY;

/** Share of her life left, 0..1. */
export function queenLife(d: SaveData) {
  const q = Math.max(1, d.evening.quota);
  return Math.max(0, Math.min(1, (q - Math.max(0, d.balance - d.evening.startBalance)) / q));
}

/** Phase her life asks for (not lower than the phase already reached today). */
export function phaseFor(d: SaveData) {
  const life = queenLife(d);
  const p = life < 0.25 ? 3 : life < 0.6 ? 2 : 1;
  return Math.max(p, d.bossPhase);
}

/** Counter keys: rounds played since "Letzter Tanz" began, and the first closed game (reset every day). */
const k = { n: 'boss:p3rounds', seed: 'boss:p3seed' };

/** The game closed by "Letzter Tanz" right now, or ''. */
export function bossClosedGame(d: SaveData) {
  if (!isBossDay(d) || d.bossPhase < 3) return '';
  const played = Math.max(0, d.counters[k.n] ?? 0);
  const i = ((d.counters[k.seed] ?? 0) + Math.floor(played / ROTATE_EVERY)) % BOSS_GAMES.length;
  return BOSS_GAMES[i];
}

/** Rounds until the closed game changes. */
export function roundsToRotate(d: SaveData) {
  return ROTATE_EVERY - ((d.counters[k.n] ?? 0) % ROTATE_EVERY);
}

/** Moves the queen into `phase` (debug or life). Sets up the rotation for phase 3. */
export function enterPhase(d: SaveData, phase: number) {
  d.bossPhase = Math.max(0, Math.min(3, phase));
  if (d.bossPhase >= 3 && d.counters[k.n] === undefined) {
    d.counters[k.n] = 0;
    d.counters[k.seed] = Math.floor(Math.random() * BOSS_GAMES.length);
  }
  if (d.bossPhase < 3) delete d.counters[k.n];
}

export function installBoss(state: GameState) {
  state.stakeFactors.push((d) => (isBossDay(d) && d.bossPhase >= 2 ? 2 : 1));
  state.onDayStart((d) => {
    delete d.counters[k.n];
    delete d.counters[k.seed];
    if (isBossDay(d)) d.bossPhase = 1;
  });
  state.onRound(() => {
    const d = state.data;
    if (isBossDay(d) && d.bossPhase >= 3) d.counters[k.n] = (d.counters[k.n] ?? 0) + 1;
  });
}
