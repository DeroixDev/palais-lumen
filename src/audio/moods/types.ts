// Contract for the music of one place ("mood"): the title street, the foyer lounge, each floor,
// the club rooms. audio.ts calls `play` once per beat, a little ahead of time; everything a
// beat contains is scheduled relative to `c.d` (seconds from now until that beat).

import type { InstId, Voices } from '../voices';

export interface MoodState {
  /** Boss phase 0..3 on the throne floor (0 elsewhere). */
  intensity: number;
  /** Jukebox record in the foyer (index into the mood's records, if it has any). */
  record: number;
}

export interface BeatCtx {
  v: Voices;
  /** Where this mood's music goes (crossfaded and levelled by audio.ts). */
  out: AudioNode;
  /** Bars and beats since this mood started playing (so every visit starts at the top of the form). */
  bar: number;
  beat: number;
  /** Beat inside the bar, 0-based. */
  b: number;
  /** Seconds from now until this beat. */
  d: number;
  /** Seconds per beat. */
  spb: number;
  s: MoodState;
}

export interface Mood {
  /** Instruments to load when the mood comes up (the synth stand-ins play until they are ready). */
  instruments: InstId[];
  bpm(s: MoodState): number;
  /** Beats per bar (default 4). */
  beatsPerBar?: number;
  play(c: BeatCtx): void;
  /** Optional names of jukebox records (foyer). */
  records?: string[];
}

/** Small helpers for writing music by hand. */
export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
export const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
/** Human timing: a few milliseconds early or late. */
export const hum = (ms = 8) => (Math.random() * 2 - 1) * (ms / 1000);
