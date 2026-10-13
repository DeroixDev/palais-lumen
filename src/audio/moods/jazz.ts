// Jazz toolkit for the band moods: chord symbols, voice-led piano voicings, a walking bass,
// swing timing and a small improviser that plays phrases over the changes. Used by the
// foyer lounge (and anyone else who wants a band).

import { hum, pick, rnd } from './types';

export interface Chord {
  root: number; // pitch class 0..11
  q: string;
  tones: number[]; // intervals from the root
  scale: number[];
  voicing: number[]; // rootless voicing intervals
}

const PC: Record<string, number> = { C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11 };

const Q: Record<string, { tones: number[]; scale: number[]; voicing: number[] }> = {
  maj7: { tones: [0, 4, 7, 11], scale: [0, 2, 4, 7, 9, 11], voicing: [4, 7, 11, 14] },
  maj9: { tones: [0, 4, 7, 11, 14], scale: [0, 2, 4, 7, 9, 11], voicing: [4, 7, 11, 14] },
  '6': { tones: [0, 4, 7, 9], scale: [0, 2, 4, 7, 9, 11], voicing: [4, 7, 9, 14] },
  '69': { tones: [0, 4, 7, 9, 14], scale: [0, 2, 4, 7, 9], voicing: [4, 9, 14, 19] },
  m7: { tones: [0, 3, 7, 10], scale: [0, 2, 3, 5, 7, 9, 10], voicing: [3, 7, 10, 14] },
  m9: { tones: [0, 3, 7, 10, 14], scale: [0, 2, 3, 5, 7, 9, 10], voicing: [3, 7, 10, 14] },
  m6: { tones: [0, 3, 7, 9], scale: [0, 2, 3, 5, 7, 9, 11], voicing: [3, 7, 9, 14] },
  mMaj7: { tones: [0, 3, 7, 11], scale: [0, 2, 3, 5, 7, 9, 11], voicing: [3, 7, 11, 14] },
  '7': { tones: [0, 4, 7, 10], scale: [0, 2, 4, 7, 9, 10], voicing: [4, 9, 10, 14] },
  '9': { tones: [0, 4, 7, 10, 14], scale: [0, 2, 4, 7, 9, 10], voicing: [4, 10, 14, 19] },
  '13': { tones: [0, 4, 10, 14, 21], scale: [0, 2, 4, 7, 9, 10], voicing: [4, 10, 14, 21] },
  '7b9': { tones: [0, 4, 7, 10, 13], scale: [0, 1, 3, 4, 7, 9, 10], voicing: [4, 10, 13, 19] },
  '7alt': { tones: [0, 4, 10, 13, 15], scale: [0, 1, 3, 4, 6, 8, 10], voicing: [4, 10, 15, 20] },
  m7b5: { tones: [0, 3, 6, 10], scale: [0, 1, 3, 5, 6, 8, 10], voicing: [3, 6, 10, 12] },
  dim7: { tones: [0, 3, 6, 9], scale: [0, 2, 3, 5, 6, 8, 9, 11], voicing: [3, 6, 9, 12] },
  m: { tones: [0, 3, 7], scale: [0, 2, 3, 5, 7, 8, 10], voicing: [3, 7, 12, 14] },
  '': { tones: [0, 4, 7], scale: [0, 2, 4, 5, 7, 9, 11], voicing: [4, 7, 12, 14] },
  sus: { tones: [0, 5, 7, 10], scale: [0, 2, 5, 7, 9, 10], voicing: [5, 10, 14, 19] },
};

const cache = new Map<string, Chord>();
/** Parses 'Fmaj7', 'D7b9', 'Bbm7b5', 'C69' … */
export function chord(sym: string): Chord {
  let c = cache.get(sym);
  if (c) return c;
  const m = /^([A-G][b#]?)(.*)$/.exec(sym);
  if (!m || !(m[2] in Q)) throw new Error('chord ' + sym);
  const q = Q[m[2]];
  c = { root: PC[m[1]], q: m[2], ...q };
  cache.set(sym, c);
  return c;
}

/** Midi note of pitch class `pc` closest to `near`. */
export function nearest(pc: number, near: number) {
  const base = near - (((near - pc) % 12) + 12) % 12;
  return near - base > 6 ? base + 12 : base;
}

/** Voice-leads a rootless voicing: the inversion/octave whose centre is closest to `prev` (kept within lo..hi). */
export function voice(c: Chord, prev: number, lo = 50, hi = 74): number[] {
  let best: number[] = [];
  let bestCost = Infinity;
  for (let inv = 0; inv < c.voicing.length; inv++) {
    const iv = c.voicing.map((x, i) => (i < inv ? x + 12 : x)).sort((a, b) => a - b);
    for (let oct = 3; oct <= 6; oct++) {
      const notes = iv.map((x) => c.root + oct * 12 + x);
      if (notes[0] < lo || notes[notes.length - 1] > hi) continue;
      const centre = notes.reduce((a, b) => a + b, 0) / notes.length;
      const cost = Math.abs(centre - prev);
      if (cost < bestCost) {
        bestCost = cost;
        best = notes;
      }
    }
  }
  return best.length ? best : c.voicing.map((x) => c.root + 48 + x);
}

/** Swing: an offbeat eighth (x.5) is pushed late to x + ratio. */
export function swing(pos: number, ratio: number) {
  const f = pos - Math.floor(pos);
  return Math.abs(f - 0.5) < 1e-6 ? Math.floor(pos) + ratio : pos;
}

/** A walking bass line for one bar of chords: [beat, midi] (four quarters, approach note into the next root). */
export function walk(chords: Chord[], beatsPer: number[], next: Chord, prevNote: number, lo = 28, hi = 50): number[] {
  const out: number[] = [];
  let cur = prevNote;
  chords.forEach((c, ci) => {
    const n = beatsPer[ci];
    const isLastChord = ci === chords.length - 1;
    const target = isLastChord ? next : chords[ci + 1];
    for (let k = 0; k < n; k++) {
      let m: number;
      if (k === 0) m = nearest(c.root, cur);
      else if (k === n - 1) {
        // Approach the next root from a semitone above or below, or by its fifth.
        const tr = nearest(target.root, cur);
        m = pick([tr - 1, tr + 1, tr - 1, tr + 7 - 12]);
      } else {
        const pool = c.tones.slice(0, 4).map((x) => nearest((c.root + x) % 12, cur));
        const steps = c.scale.map((x) => nearest((c.root + x) % 12, cur)).filter((x) => Math.abs(x - cur) <= 4 && x !== cur);
        m = Math.random() < 0.6 ? pick(pool.filter((x) => x !== cur).length ? pool.filter((x) => x !== cur) : pool) : steps.length ? pick(steps) : pool[0];
      }
      while (m < lo) m += 12;
      while (m > hi) m -= 12;
      out.push(m);
      cur = m;
    }
  });
  return out;
}

export interface Ev {
  /** Position in beats from the bar start. */
  at: number;
  midi: number;
  dur: number;
  vel: number;
}

/**
 * Improvises one bar over `chords` (each `beats` long): phrases of swung eighths and quarters
 * with breaths, chord tones on the strong beats, scale steps in between. `state.last` keeps
 * the line connected from bar to bar; `state.rest` counts beats of silence still to wait.
 */
export function improvise(chords: Chord[], beatsPer: number[], state: { last: number; rest: number; dir: number }, lo: number, hi: number, density = 0.6): Ev[] {
  const ev: Ev[] = [];
  let pos = 0;
  chords.forEach((c, ci) => {
    const end = pos + beatsPer[ci];
    while (pos < end - 1e-6) {
      if (state.rest > 0) {
        const r = Math.min(state.rest, end - pos);
        state.rest -= r;
        pos += r;
        continue;
      }
      const strong = Math.abs(pos - Math.round(pos)) < 1e-6 && Math.round(pos) % 2 === 0;
      const len = Math.random() < density ? 0.5 : Math.random() < 0.7 ? 1 : 1.5;
      const pool = (strong ? c.tones.concat(c.voicing.filter((x) => x > 12).map((x) => x - 12)) : c.scale).map((x) => (c.root + x) % 12);
      // Move in the current direction by a small step, turning at the edges.
      let best = state.last;
      let bestCost = Infinity;
      for (const pc of pool)
        for (const cand of [nearest(pc, state.last), nearest(pc, state.last) + 12, nearest(pc, state.last) - 12]) {
          if (cand < lo || cand > hi || cand === state.last) continue;
          const step = cand - state.last;
          const cost = Math.abs(step - state.dir * (strong ? 3 : 2)) + rnd(0, 1.5);
          if (cost < bestCost) {
            bestCost = cost;
            best = cand;
          }
        }
      if (best >= hi - 2) state.dir = -1;
      else if (best <= lo + 2) state.dir = 1;
      else if (Math.random() < 0.18) state.dir = -state.dir;
      const d = Math.min(len, end - pos);
      ev.push({ at: pos, midi: best, dur: d * 0.92, vel: (pos % 1 ? 0.62 : 0.55) + rnd(-0.06, 0.08) });
      state.last = best;
      pos += d;
      // End of a phrase: take a breath.
      if (Math.random() < 0.09) state.rest = pick([1, 1.5, 2, 3]);
    }
  });
  return ev;
}

export { hum, pick, rnd };
