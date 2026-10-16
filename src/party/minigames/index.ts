// Minigame registry. To add a minigame: write ./<name>.ts exporting a MinigameDef (see
// ./README.md) and add it to the list below. The rotation picks by type and player count.

import funkenregen from './funkenregen';
import kreiselbalken from './kreiselbalken';
import kurbelkarren from './kurbelkarren';
import schnellziehen from './schnellziehen';
import type { MinigameDef } from './types';

export const MINIGAMES: MinigameDef<any>[] = [funkenregen, kreiselbalken, kurbelkarren, schnellziehen]; // eslint-disable-line @typescript-eslint/no-explicit-any

export function getMinigame(id: string): MinigameDef<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return MINIGAMES.find((m) => m.id === id) ?? MINIGAMES[0];
}

/** Minigames that can be played by n players. */
export function minigamesFor(n: number) {
  return MINIGAMES.filter((m) => { const [a, b] = m.players ?? [2, 4]; return n >= a && n <= b; });
}
