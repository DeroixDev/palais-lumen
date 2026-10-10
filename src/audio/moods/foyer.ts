// Foyer lounge: a live jazz quartet behind the reception. The jukebox switches records:
// Lounge (an easy swing tune in F), Swing (a riff blues in Bb), Mondnacht (a ballad in A minor)
// and Bossa Falter (a bossa in C minor). Every record has its own written melody ("head"),
// then the band takes solos over the changes, then the head returns.
// Recorded instruments: grand piano, upright bass, vibraphone, tenor sax, muted trumpet,
// Wurlitzer, drums (ride, hi-hat, snare, kick) and shaker.

import { n } from '../sampler';
import type { InstId } from '../voices';
import { chord, improvise, swing, voice, walk, type Chord, type Ev } from './jazz';
import { hum, pick, rnd, type BeatCtx, type Mood } from './types';

type Head = Record<number, [number, string, number][]>;
interface Tune {
  name: string;
  bpm: number;
  swing: number;
  /** One entry per bar: one or two chord symbols. */
  chart: string[][];
  /** Written melody per bar of the form: [beat, note, beats]. */
  head: Head;
  /** Who plays what in each chorus. */
  choruses: { lead: InstId | 'none'; solo?: boolean; density?: number }[];
  feel: 'swing' | 'ballad' | 'bossa';
  /** Transpose the head by octaves for some instruments. */
  shift?: Partial<Record<InstId, number>>;
}

const LOUNGE_A = (last: boolean): string[][] => [['Fmaj7'], ['D7b9'], ['Gm7'], ['C7'], ['Am7', 'D7'], ['Gm7', 'C7'], last ? ['Fmaj7'] : ['Fmaj7', 'Bb7'], last ? ['Gm7', 'C7'] : ['Am7', 'D7b9']];
const LOUNGE_HEAD_A: [number, string, number][][] = [
  [[0, 'A4', 1.5], [1.5, 'C5', 0.5], [2, 'E5', 2]],
  [[0, 'D5', 1], [1, 'C5', 0.5], [1.5, 'A4', 0.5], [2, 'F#4', 2]],
  [[0, 'Bb4', 1.5], [1.5, 'D5', 0.5], [2, 'F5', 2]],
  [[0, 'E5', 1], [1, 'D5', 0.5], [1.5, 'C5', 0.5], [2, 'Bb4', 1], [3, 'G4', 1]],
  [[0, 'C5', 1.5], [1.5, 'A4', 0.5], [2, 'C5', 1], [3, 'A4', 1]],
  [[0, 'Bb4', 1.5], [1.5, 'A4', 0.5], [2, 'G4', 1], [3, 'E4', 1]],
  [[0, 'F4', 2], [2, 'A4', 1], [3, 'Ab4', 1]],
  [[0, 'G4', 3]],
];
const LOUNGE_HEAD_LAST7: [number, string, number][][] = [[[0, 'A4', 1], [1, 'G4', 1], [2, 'F4', 2]], []];
const LOUNGE_HEAD_B: [number, string, number][][] = [
  [[0, 'G4', 1], [1, 'Bb4', 1], [2, 'D5', 1.5], [3.5, 'C5', 0.5]],
  [[0, 'Eb5', 2], [2, 'D5', 1], [3, 'C5', 1]],
  [[0, 'D5', 3], [3, 'Bb4', 1]],
  [[0, 'C5', 1], [1, 'D5', 1], [2, 'F5', 2]],
  [[0, 'F5', 1.5], [1.5, 'E5', 0.5], [2, 'D5', 1], [3, 'A4', 1]],
  [[0, 'B4', 2], [2, 'D5', 1], [3, 'F5', 1]],
  [[0, 'F5', 1.5], [1.5, 'D5', 0.5], [2, 'Bb4', 2]],
  [[0, 'G4', 1], [1, 'A4', 1], [2, 'Bb4', 1], [3, 'C5', 1]],
];
function headOf(sections: [number, string, number][][][]): Head {
  const h: Head = {};
  sections.flat().forEach((bar, i) => (h[i] = bar));
  return h;
}

const BLUES: string[][] = [['Bb7'], ['Eb7'], ['Bb7'], ['Fm7', 'Bb7'], ['Eb7'], ['Edim7'], ['Bb7'], ['G7b9'], ['Cm7'], ['F7'], ['Bb7', 'G7b9'], ['Cm7', 'F7']];
const riff = (t: number): [number, string, number][] => {
  const base: [number, number, number][] = [[0, 62, 0.5], [0.5, 65, 0.5], [1, 67, 1], [2.5, 65, 0.5], [3, 62, 1]];
  return base.map(([a, m, d]) => [a, String(m + t), d] as [number, string, number]);
};
const BLUES_HEAD: Head = {
  0: riff(0), 1: [[0, '68', 1.5], [1.5, '67', 0.5], [2, '65', 2]], 2: riff(0), 3: [[0, '68', 1], [1, '67', 1], [2, '65', 0.5], [2.5, '62', 1.5]],
  4: riff(5), 5: [[0, '73', 1.5], [1.5, '72', 0.5], [2, '70', 2]], 6: riff(0), 7: [[0, '71', 1], [1, '70', 1], [2, '67', 2]],
  8: [[0, '70', 0.5], [0.5, '72', 0.5], [1, '74', 1], [2, '72', 1], [3, '70', 1]], 9: [[0, '69', 1.5], [1.5, '72', 0.5], [2, '75', 2]],
  10: [[0, '74', 1], [1, '70', 1], [2, '67', 2]], 11: [[0, '65', 3]],
};

const BALLAD_A: string[][] = [['Am9'], ['Dm9'], ['G13'], ['Cmaj9'], ['Fmaj7'], ['Bm7b5', 'E7b9'], ['Am9'], ['Am9', 'E7b9']];
const BALLAD_B: string[][] = [['Dm9'], ['G13'], ['Cmaj9'], ['Fmaj7'], ['Bm7b5'], ['E7b9'], ['Am9'], ['Bm7b5', 'E7b9']];
const BALLAD_HEAD = headOf([
  [
    [[0, 'E5', 2], [2, 'D5', 1], [3, 'C5', 1]],
    [[0, 'D5', 3], [3, 'A4', 1]],
    [[0, 'B4', 1.5], [1.5, 'C5', 0.5], [2, 'D5', 2]],
    [[0, 'E5', 4]],
    [[0, 'F5', 2], [2, 'E5', 1], [3, 'C5', 1]],
    [[0, 'D5', 2], [2, 'G#4', 2]],
    [[0, 'A4', 1], [1, 'B4', 1], [2, 'C5', 1], [3, 'E5', 1]],
    [[0, 'B4', 3]],
  ],
  [
    [[0, 'F5', 1.5], [1.5, 'E5', 0.5], [2, 'D5', 2]],
    [[0, 'E5', 1], [1, 'D5', 1], [2, 'B4', 2]],
    [[0, 'C5', 1.5], [1.5, 'D5', 0.5], [2, 'E5', 2]],
    [[0, 'A5', 3], [3, 'G5', 1]],
    [[0, 'F5', 2], [2, 'D5', 2]],
    [[0, 'E5', 1], [1, 'D5', 1], [2, 'B4', 1], [3, 'G#4', 1]],
    [[0, 'A4', 4]],
    [[2, 'B4', 1], [3, 'C5', 1]],
  ],
]);

const BOSSA: string[][] = [['Cm9'], ['Fm9'], ['Dm7b5'], ['G7b9'], ['Cm9'], ['Ebm9', 'Ab13'], ['Dbmaj7'], ['Dm7b5', 'G7alt'], ['Cm9'], ['Fm9'], ['Dm7b5'], ['G7b9'], ['Cm9'], ['Ebm7', 'Ab7'], ['Dbmaj7'], ['Dm7b5', 'G7b9']];
const BOSSA_1: [number, string, number][][] = [
  [[0, 'G4', 1], [1, 'C5', 1], [2, 'Eb5', 1.5], [3.5, 'D5', 0.5]],
  [[0, 'C5', 3], [3, 'Ab4', 1]],
  [[0, 'F4', 1], [1, 'Ab4', 1], [2, 'C5', 1.5], [3.5, 'Bb4', 0.5]],
  [[0, 'B4', 3], [3, 'G4', 1]],
];
const BOSSA_HEAD = headOf([
  BOSSA_1,
  [[[0, 'Eb5', 1], [1, 'G5', 1], [2, 'Bb5', 1.5], [3.5, 'Ab5', 0.5]], [[0, 'Gb5', 2], [2, 'F5', 2]], [[0, 'F5', 3], [3, 'Eb5', 1]], [[0, 'D5', 2], [2, 'B4', 2]]],
  BOSSA_1,
  [[[0, 'G5', 2], [2, 'Eb5', 2]], [[0, 'Db5', 2], [2, 'C5', 2]], [[0, 'C5', 2], [2, 'Ab4', 2]], [[0, 'B4', 2]]],
]);

export const TUNES: Tune[] = [
  {
    name: 'Lounge',
    bpm: 92,
    swing: 0.64,
    chart: [...LOUNGE_A(false), ...LOUNGE_A(false), ['Cm7'], ['F7'], ['Bbmaj7'], ['Bbmaj7'], ['Dm7'], ['G7'], ['Gm7'], ['C7'], ...LOUNGE_A(true)],
    head: headOf([LOUNGE_HEAD_A, LOUNGE_HEAD_A, LOUNGE_HEAD_B, [...LOUNGE_HEAD_A.slice(0, 6), ...LOUNGE_HEAD_LAST7]]),
    choruses: [{ lead: 'vibes' }, { lead: 'piano', solo: true, density: 0.55 }, { lead: 'sax', solo: true, density: 0.45 }, { lead: 'sax' }],
    feel: 'swing',
    shift: { sax: -12 },
  },
  {
    name: 'Swing',
    bpm: 138,
    swing: 0.66,
    chart: BLUES,
    head: BLUES_HEAD,
    choruses: [{ lead: 'sax' }, { lead: 'sax' }, { lead: 'piano', solo: true, density: 0.7 }, { lead: 'piano', solo: true, density: 0.75 }, { lead: 'vibes', solo: true, density: 0.6 }, { lead: 'mutetp' }],
    feel: 'swing',
    shift: { sax: -12 },
  },
  {
    name: 'Mondnacht',
    bpm: 66,
    swing: 0.62,
    chart: [...BALLAD_A, ...BALLAD_B],
    head: BALLAD_HEAD,
    choruses: [{ lead: 'mutetp' }, { lead: 'piano', solo: true, density: 0.35 }, { lead: 'vibes', solo: true, density: 0.3 }, { lead: 'sax' }],
    feel: 'ballad',
    shift: { sax: -12 },
  },
  {
    name: 'Bossa Falter',
    bpm: 116,
    swing: 0.5,
    chart: BOSSA,
    head: BOSSA_HEAD,
    choruses: [{ lead: 'vibes' }, { lead: 'sax' }, { lead: 'wurli', solo: true, density: 0.5 }, { lead: 'vibes', solo: true, density: 0.5 }],
    feel: 'bossa',
    shift: { sax: -12 },
  },
];

/** Level of each instrument in the band (balanced with tools/sounds/render.mjs). */
const MIX: Partial<Record<InstId, number>> = { piano: 0.55, bass: 0.95, vibes: 0.7, sax: 0.55, mutetp: 0.6, wurli: 0.6 };
const PAN: Partial<Record<InstId, number>> = { piano: -0.25, bass: 0, vibes: 0.3, sax: 0.15, mutetp: 0.15, wurli: -0.25 };

/** Per-output band memory (the crossfade gives every visit a fresh output). */
interface BandState {
  comp: number;
  bass: number;
  solo: { last: number; rest: number; dir: number };
}
const bands = new WeakMap<AudioNode, BandState>();

function noteNum(s: string) {
  return /^\d+$/.test(s) ? Number(s) : n(s);
}

/** Plays one bar of a tune (called on the first beat of every bar). */
export function playTuneBar(c: BeatCtx, tune: Tune, out: AudioNode, intro = true) {
  const { v, spb } = c;
  let st = bands.get(out);
  if (!st) bands.set(out, (st = { comp: 62, bass: 40, solo: { last: 70, rest: 0, dir: 1 } }));
  const F = tune.chart.length;
  const barIn = c.bar % F;
  const chorus = Math.floor(c.bar / F) % tune.choruses.length;
  const ch = tune.choruses[chorus];
  const syms = tune.chart[barIn];
  const chords: Chord[] = syms.map(chord);
  const beatsPer = syms.length === 2 ? [2, 2] : [4];
  const next = chord(tune.chart[(barIn + 1) % F][0]);
  const at = (pos: number) => c.d + swing(pos, tune.swing) * spb + hum(6);
  const firstBars = intro && c.bar < 2;

  // ---- Bass ----
  if (tune.feel === 'bossa') {
    chords.forEach((cd, i) => {
      const base = i * beatsPer[i];
      const root = nearestLow(cd.root, st!.bass);
      const fifth = root + 7 > 50 ? root - 5 : root + 7;
      const pat = beatsPer[i] === 4 ? [[0, root, 1.4], [1.5, fifth, 0.45], [2, root, 1.4], [3.5, fifth, 0.45]] : [[0, root, 1.4], [1.5, fifth, 0.45]];
      for (const [p, m, dd] of pat) v.note('bass', m, at(base + p), out, { vel: 0.8, dur: dd * spb, gain: MIX.bass, pan: PAN.bass });
      st!.bass = root;
    });
  } else if (tune.feel === 'ballad') {
    chords.forEach((cd, i) => {
      const base = i * beatsPer[i];
      const root = nearestLow(cd.root, st!.bass);
      v.note('bass', root, at(base), out, { vel: 0.75, dur: spb * Math.min(2, beatsPer[i]) * 0.95, gain: MIX.bass });
      if (beatsPer[i] === 4) v.note('bass', pick([root + 7, root + 12, root + 3 + (cd.tones.includes(4) ? 1 : 0)]) - (root + 7 > 50 ? 12 : 0), at(2), out, { vel: 0.65, dur: spb * 1.9, gain: MIX.bass });
      st!.bass = root;
    });
  } else {
    const line = walk(chords, beatsPer, next, st.bass);
    line.forEach((m, k) => v.note('bass', m, at(k), out, { vel: k % 2 ? 0.72 : 0.82, dur: spb * 0.9, gain: MIX.bass, pan: PAN.bass }));
    st.bass = line[line.length - 1];
  }

  // ---- Drums ----
  if (!firstBars) drums(c, tune, at, out);

  // ---- Piano (or Wurlitzer) comping ----
  const compInst: InstId = tune.feel === 'bossa' && chorus % 2 === 0 ? 'wurli' : 'piano';
  const soloist = ch.solo ? ch.lead : 'none';
  const compVel = soloist === 'piano' || soloist === 'wurli' ? 0.38 : 0.5;
  if (!(ch.solo && (ch.lead === compInst))) {
    chords.forEach((cd, i) => {
      const base = i * beatsPer[i];
      const vo = voice(cd, st!.comp, 50, 72);
      st!.comp = vo.reduce((a, b) => a + b, 0) / vo.length;
      let hits: [number, number][];
      if (tune.feel === 'bossa') hits = beatsPer[i] === 4 ? pick([[[0, 1], [1.5, 0.5], [3, 0.8]], [[0.5, 0.5], [1.5, 1], [3, 0.8]]] as [number, number][][]) : [[0, 0.9], [1.5, 0.4]];
      else if (tune.feel === 'ballad') hits = beatsPer[i] === 4 ? [[0, 3.6]] : [[0, 1.8]];
      else hits = beatsPer[i] === 4 ? pick([[[0, 0.8], [1.5, 0.4]], [[1.5, 0.6], [3, 0.4]], [[0, 0.5], [2.5, 0.8]], [[-0.5, 1.2], [2, 0.5]]] as [number, number][][]) : pick([[[0, 0.6]], [[0.5, 0.8]], [[-0.5, 0.9]]] as [number, number][][]);
      for (const [p, len] of hits) {
        const pos = Math.max(0, base + p);
        if (tune.feel === 'ballad') {
          // Ballad: a slow rolled chord, then a few notes of it arpeggiated.
          v.chord(compInst, vo, at(pos), out, { vel: compVel * 0.85, dur: len * spb, rel: 0.6, gain: MIX[compInst], pan: PAN[compInst] }, 0.035);
          v.note(compInst, vo[0] - 12, at(pos), out, { vel: compVel * 0.6, dur: len * spb, rel: 0.6, gain: MIX[compInst] });
          if (beatsPer[i] === 4) [2, 2.5, 3].forEach((q, k) => v.note(compInst, vo[(k + 1) % vo.length] + 12, at(pos + q), out, { vel: compVel * 0.45, dur: spb, gain: MIX[compInst], pan: PAN[compInst] }));
        } else {
          v.chord(compInst, vo, at(pos), out, { vel: compVel + rnd(-0.05, 0.05), dur: len * spb, rel: 0.15, gain: MIX[compInst], pan: PAN[compInst] }, 0.008);
        }
      }
    });
  }
  if (firstBars) return;

  // ---- Lead: the written head, or a solo ----
  if (ch.lead === 'none') return;
  if (!ch.solo) {
    const ev = tune.head[barIn] ?? [];
    const shift = tune.shift?.[ch.lead] ?? 0;
    for (const [p, nm, len] of ev) {
      const m = noteNum(nm) + shift;
      const sustained = ch.lead === 'sax' || ch.lead === 'mutetp';
      v.note(ch.lead, m, at(p), out, { vel: 0.62 + rnd(-0.05, 0.05), dur: len * spb * (sustained ? 0.95 : 1), rel: sustained ? 0.12 : 0.6, att: sustained ? 0.03 : undefined, gain: MIX[ch.lead], pan: PAN[ch.lead] });
      // Vibes melody doubled softly by the piano an octave down in the last chorus.
      if (ch.lead === 'vibes' && chorus === tune.choruses.length - 1) v.note('piano', m - 12, at(p), out, { vel: 0.35, dur: len * spb, gain: MIX.piano });
    }
  } else {
    const range: Record<string, [number, number]> = { piano: [62, 86], vibes: [62, 86], sax: [50, 74], mutetp: [62, 82], wurli: [60, 84] };
    const [lo, hi] = range[ch.lead] ?? [60, 84];
    if (st.solo.last < lo || st.solo.last > hi) st.solo.last = (lo + hi) >> 1;
    const ev: Ev[] = improvise(chords, beatsPer, st.solo, lo, hi, ch.density ?? 0.5);
    const sustained = ch.lead === 'sax' || ch.lead === 'mutetp';
    for (const e of ev) v.note(ch.lead, e.midi, at(e.at), out, { vel: e.vel, dur: e.dur * spb, rel: sustained ? 0.1 : 0.4, att: sustained ? 0.02 : undefined, gain: MIX[ch.lead], pan: PAN[ch.lead] });
  }
}

function nearestLow(pc: number, near: number) {
  let m = 28 + ((pc - 28 + 120) % 12);
  while (m + 12 <= 45 && Math.abs(m + 12 - near) < Math.abs(m - near)) m += 12;
  return m;
}

function drums(c: BeatCtx, tune: Tune, at: (p: number) => number, out: AudioNode) {
  const { v, spb } = c;
  const lvl = tune.feel === 'ballad' ? 0.5 : tune.bpm > 120 ? 1 : 0.8;
  if (tune.feel === 'bossa') {
    // Cross-stick bossa clave, soft eighth hats, kick on 1 and the "and" of 2.
    const clave = c.bar % 2 === 0 ? [0, 1.5, 3] : [1, 2.5];
    for (const p of clave) v.hit('snare', 'stick', at(p), out, { vel: 0.5 * lvl, pan: -0.1 });
    for (let k = 0; k < 8; k++) v.hit('hihat', 'c', at(k / 2), out, { vel: (k % 2 ? 0.28 : 0.4) * lvl, pan: 0.35 });
    for (const p of [0, 1.5, 2, 3.5]) v.hit('kick', 'k', at(p), out, { vel: (p % 2 === 0 ? 0.35 : 0.22) * lvl });
    for (let k = 0; k < 4; k++) v.hit('shaker', 'slap', at(k + 0.5), out, { vel: 0.25, pan: 0.5 });
    return;
  }
  if (tune.feel === 'ballad') {
    // Brushes: a slow swirl (stir) and soft ride touches.
    for (const p of [0, 2]) v.noise(spb * 1.8, 0.03, at(p), 3800, 'bandpass', 0.5, out);
    for (const p of [1, 3]) v.noise(0.12, 0.05, at(p), 4200, 'bandpass', 0.7, out);
    if (c.bar % 2 === 1) v.hit('suscym', 'ride', at(0), out, { vel: 0.22, pan: 0.3 });
    v.hit('hihat', 'p', at(1), out, { vel: 0.25, pan: 0.35 });
    v.hit('hihat', 'p', at(3), out, { vel: 0.25, pan: 0.35 });
    return;
  }
  // Swing: ride "ding ding-a ding ding-a", hi-hat foot on 2 and 4, feathered kick, snare chatter.
  for (const p of [0, 1, 1.5, 2, 3, 3.5]) v.hit('suscym', 'ride', at(p), out, { vel: (p % 1 ? 0.32 : p % 2 ? 0.5 : 0.42) * lvl, pan: 0.3 });
  for (const p of [1, 3]) v.hit('hihat', 'p', at(p), out, { vel: 0.5 * lvl, pan: 0.35 });
  for (let k = 0; k < 4; k++) v.hit('kick', 'k', at(k), out, { vel: 0.12 * lvl });
  if (Math.random() < 0.55) v.hit('snare', 'tap', at(pick([1.5, 2.5, 3.5])), out, { vel: rnd(0.15, 0.3) * lvl, pan: -0.1 });
  if (c.bar % 8 === 7) {
    // A little fill into the next phrase.
    v.hit('snare', 's', at(3), out, { vel: 0.35 * lvl, pan: -0.1 });
    v.hit('snare', 's', at(3.5), out, { vel: 0.5 * lvl, pan: -0.1 });
    v.hit('kick', 'k', at(3.5), out, { vel: 0.4 * lvl });
  }
  if (c.bar % (tune.chart.length) === 0 && c.bar > 0) v.hit('clash', 'crash', at(0), out, { vel: 0.2 * lvl, pan: 0.4 });
}

export const foyer: Mood = {
  instruments: ['piano', 'bass', 'vibes', 'sax', 'mutetp', 'wurli', 'suscym', 'hihat', 'snare', 'kick', 'clash', 'shaker'],
  records: TUNES.map((t) => t.name),
  bpm: (s) => TUNES[s.record % TUNES.length].bpm,
  play(c) {
    if (c.b !== 0) return;
    playTuneBar(c, TUNES[c.s.record % TUNES.length], c.out);
  },
};
