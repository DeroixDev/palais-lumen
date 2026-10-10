// The music of every place. A mood listed here replaces the old synthesised band in
// src/core/audio.ts; moods not listed yet still play their synthesised version.
import type { Mood } from './types';
import { foyer } from './foyer';

export const MOOD_DEFS: Partial<Record<string, Mood>> = {
  foyer,
};
