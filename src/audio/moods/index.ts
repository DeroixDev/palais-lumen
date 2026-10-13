// The music of every place. A mood listed here replaces the old synthesised band in
// src/core/audio.ts; moods not listed yet still play their synthesised version.
import type { Mood } from './types';
import { foyer } from './foyer';
import { velvet } from './velvet';
import { garden } from './garden';
import { crystal } from './crystal';
import { clockwork } from './clockwork';
import { throne } from './throne';

export const MOOD_DEFS: Partial<Record<string, Mood>> = {
  foyer,
  velvet,
  garden,
  crystal,
  clockwork,
  throne,
};
