// Mondgarten (floor 2): a glass house full of night flowers under the moon. A slow waltz in
// 3/4 at 62 bpm, floating rather than driving: harp arpeggios carry the time, a flute sings,
// strings and bowed vibes breathe underneath, wine glasses ring in the high air, a kalimba
// drips like water, and marktree, shaker and triangle add sparkle. Keys: D major (darkened by
// a borrowed G minor six) with a moonlit turn to F major in the middle.
//   Intro    8 bars  harp alone with wine-glass pad, the kalimba tests the water.
//   A1      16 bars  the flute theme ("Mondlicht"), strings and cello pedal.
//   B       16 bars  B minor: cello sings, kalimba ostinato, the flute floats a descant.
//   A2      16 bars  theme again, fuller, celesta glints on top, the kalimba answers.
//   C       16 bars  F major night air: wine glasses play a slow tune over harp and bowed vibes.
//   A3      16 bars  theme in the flute with the cello in counterpoint.
//   Outro    8 bars  back to the harp alone, leading round to the intro.
// 96 bars of 3/4 at 62 bpm is about 4:40 before the form starts over.

import { n } from '../sampler';
import type { InstId } from '../voices';
import { chord, nearest, voice, type Chord } from './jazz';
import { hum, pick, rnd, type BeatCtx, type Mood } from './types';

type Line = [number, string, number][];

interface Section {
  name: string;
  /** One chord per bar. */
  chart: string[];
  /** Lead melody per bar ([beat, note, beats]) and who plays it. */
  lead?: { inst: InstId; line: Line[]; shift?: number };
  /** Second voice per bar (a descant or a cello line). */
  second?: { inst: InstId; line: Line[]; from?: number };
  /** Texture switches. */
  strings?: number; // pad level, 0 = off
  vibes?: boolean;
  wine?: boolean;
  cello?: 'pedal' | 'counter';
  kalimba?: 'ostinato' | 'answer' | 'test';
  celesta?: boolean;
  shaker?: boolean;
  triangle?: boolean;
  harp: 'up' | 'wave' | 'open';
  dyn: number;
}

const A_CHART = ['Dmaj9', 'Dmaj9', 'Gmaj7', 'Gmaj7', 'Bm9', 'Bm9', 'Em9', 'Asus', 'Dmaj9', 'F#m7', 'Gmaj7', 'Gm6', 'F#m7', 'Bm9', 'Em9', 'Asus'];
const B_CHART = ['Bm9', 'Bm9', 'Gmaj9', 'Gmaj9', 'Em9', 'Em9', 'F#m7', 'F#7b9', 'Bm9', 'Bm9', 'Gmaj9', 'Gmaj9', 'Em9', 'Asus', 'Dmaj9', 'Asus'];
const C_CHART = ['Fmaj9', 'Fmaj9', 'Bbmaj7', 'Bbmaj7', 'Dm9', 'Dm9', 'Gm9', 'Csus', 'Fmaj9', 'Am7', 'Bbmaj7', 'Bbm6', 'Fmaj9', 'Dm9', 'Gm9', 'Asus'];
const INTRO_CHART = ['Dmaj9', 'Dmaj9', 'Gmaj7', 'Gmaj7', 'Dmaj9', 'Dmaj9', 'Gmaj7', 'Asus'];

// "Mondlicht": a rising arpeggio that reaches for the ninth, a long sigh, and in the second
// half the borrowed G minor six (E over B flat) as the moment the moon goes behind a cloud.
const THEME: Line[] = [
  [[0, 'F#4', 1], [1, 'A4', 1], [2, 'E5', 1]],
  [[0, 'D5', 2.5], [2.5, 'C#5', 0.5]],
  [[0, 'B4', 1], [1, 'D5', 1], [2, 'F#5', 1]],
  [[0, 'E5', 2], [2, 'C#5', 1]],
  [[0, 'D5', 1], [1, 'F#5', 1], [2, 'A5', 1]],
  [[0, 'F#5', 2], [2, 'C#5', 1]],
  [[0, 'B4', 1], [1, 'D5', 1], [2, 'F#5', 1]],
  [[0, 'E5', 3]],
  [[0, 'F#4', 1], [1, 'A4', 1], [2, 'E5', 1]],
  [[0, 'C#5', 2], [2, 'A4', 1]],
  [[0, 'B4', 1], [1, 'D5', 1], [2, 'F#5', 1]],
  [[0, 'E5', 2], [2, 'Bb4', 1]],
  [[0, 'A4', 2], [2, 'C#5', 1]],
  [[0, 'D5', 1], [1, 'C#5', 1], [2, 'B4', 1]],
  [[0, 'F#4', 1], [1, 'G4', 1], [2, 'B4', 1]],
  [[0, 'A4', 2]],
];
// B: the cello's song in B minor, climbing a little higher in its second phrase.
const CELLO_SONG: Line[] = [
  [[0, 'F#3', 2], [2, 'A3', 1]],
  [[0, 'B3', 1.5], [1.5, 'C#4', 0.5], [2, 'D4', 1]],
  [[0, 'D4', 2], [2, 'B3', 1]],
  [[0, 'A3', 3]],
  [[0, 'G3', 2], [2, 'B3', 1]],
  [[0, 'D4', 1.5], [1.5, 'E4', 0.5], [2, 'F#4', 1]],
  [[0, 'E4', 2], [2, 'C#4', 1]],
  [[0, 'A#3', 3]],
  [[0, 'B3', 2], [2, 'D4', 1]],
  [[0, 'F#4', 2], [2, 'E4', 1]],
  [[0, 'D4', 2], [2, 'F#4', 1]],
  [[0, 'A4', 3]],
  [[0, 'G4', 2], [2, 'F#4', 1]],
  [[0, 'E4', 2], [2, 'D4', 1]],
  [[0, 'C#4', 2], [2, 'E4', 1]],
  [[0, 'A3', 3]],
];
// The flute's descant over the second half of B: long, high, quiet.
const DESCANT: Line[] = [
  [[0, 'F#5', 3]], [[0, 'A5', 2], [2, 'F#5', 1]], [[0, 'B5', 3]], [[0, 'A5', 3]],
  [[0, 'G5', 2], [2, 'F#5', 1]], [[0, 'E5', 3]], [[0, 'F#5', 2], [2, 'E5', 1]], [[0, 'E5', 2]],
];
// C: the wine glasses' tune, one or two notes a bar (they only ring between E flat 5 and D 6).
const GLASS_TUNE: Line[] = [
  [[0, 'A5', 3]], [[0, 'G5', 3]], [[0, 'F5', 2], [2, 'G5', 1]], [[0, 'A5', 2], [2, 'C6', 1]],
  [[0, 'D6', 3]], [[0, 'C6', 3]], [[0, 'Bb5', 3]], [[0, 'G5', 3]],
  [[0, 'A5', 3]], [[0, 'C6', 2], [2, 'G5', 1]], [[0, 'D6', 3]], [[0, 'C#6', 3]],
  [[0, 'C6', 3]], [[0, 'A5', 3]], [[0, 'Bb5', 3]], [[0, 'E5', 3]],
];

const FORM: Section[] = [
  { name: 'intro', chart: INTRO_CHART, harp: 'open', wine: true, kalimba: 'test', dyn: 1.2 },
  { name: 'A1', chart: A_CHART, lead: { inst: 'flute', line: THEME }, strings: 0.8, cello: 'pedal', harp: 'up', dyn: 0.95 },
  { name: 'B', chart: B_CHART, second: { inst: 'flute', line: DESCANT, from: 8 }, lead: { inst: 'cello', line: CELLO_SONG }, vibes: true, kalimba: 'ostinato', shaker: true, harp: 'wave', dyn: 0.84 },
  { name: 'A2', chart: A_CHART, lead: { inst: 'flute', line: THEME }, strings: 1, cello: 'pedal', celesta: true, kalimba: 'answer', shaker: true, harp: 'up', dyn: 0.98 },
  { name: 'C', chart: C_CHART, lead: { inst: 'wine', line: GLASS_TUNE }, vibes: true, strings: 0.6, triangle: true, harp: 'wave', dyn: 0.95 },
  { name: 'A3', chart: A_CHART, lead: { inst: 'flute', line: THEME }, strings: 0.9, cello: 'counter', kalimba: 'answer', harp: 'up', dyn: 1 },
  { name: 'outro', chart: INTRO_CHART, harp: 'open', wine: true, strings: 0.5, dyn: 1.05 },
];
const BARS = FORM.reduce((a, s) => a + s.chart.length, 0);

/** Levels and stereo seats (balanced with tools/sounds/render.mjs). */
const MIX: Partial<Record<InstId, number>> = { harp: 1.25, flute: 1.0, strings: 0.56, cello: 0.95, vibesbow: 0.5, wine: 0.7, kalimba: 0.85, celesta: 0.5 };
const PAN: Partial<Record<InstId, number>> = { harp: -0.35, flute: 0.15, cello: -0.15, vibesbow: -0.25, wine: 0.3, kalimba: 0.4, celesta: 0.35 };

interface GardenState {
  pad: number;
  harp: number;
}
const states = new WeakMap<AudioNode, GardenState>();

function locate(bar: number) {
  let k = bar % BARS;
  for (const sec of FORM) {
    if (k < sec.chart.length) return { sec, k };
    k -= sec.chart.length;
  }
  return { sec: FORM[0], k: 0 };
}

/** Chord tones of `cd` between lo and hi, ascending. */
function tonesIn(cd: Chord, lo: number, hi: number) {
  const pcs = new Set(cd.tones.map((x) => (cd.root + x) % 12));
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.has(m % 12)) out.push(m);
  return out;
}

function playBar(c: BeatCtx) {
  const { v, spb, out } = c;
  let st = states.get(out);
  if (!st) states.set(out, (st = { pad: 62, harp: 64 }));
  const { sec, k } = locate(c.bar);
  const cd = chord(sec.chart[k]);
  const barLen = 3 * spb;
  // Phrases of four bars swell and settle; the section sets the overall level.
  const arc = sec.dyn * (0.9 + 0.14 * Math.sin((Math.PI * (k % 4 + 0.5)) / 4));
  const at = (pos: number, ms = 10) => c.d + pos * spb + hum(ms);

  // ---- Harp: a low root, then the chord rippling upward in eighths ----
  const root = 34 + ((cd.root - 34 + 120) % 12); // B flat 1..A2, the low strings of the harp
  const vo = voice(cd, st.harp, 55, 79);
  st.harp = vo.reduce((a, b) => a + b, 0) / vo.length;
  const fifth = root + 7;
  let seq: number[];
  if (sec.harp === 'open') seq = [root, fifth, vo[1], vo[3], vo[2], vo[1]];
  else if (sec.harp === 'wave') seq = k % 2 ? [root, vo[0], vo[2], vo[3], vo[1], vo[2]] : [root, fifth, vo[1], vo[2], vo[3], vo[2]];
  else seq = [root, fifth, vo[0], vo[1], vo[2], vo[3]];
  seq.forEach((m, j) => {
    const accent = j === 0 ? 0.62 : j === 3 ? 0.48 : 0.4;
    v.note('harp', m, at(j * 0.5, 6), out, { vel: (accent + rnd(-0.04, 0.04)) * arc, gain: MIX.harp, pan: PAN.harp! + (m - 60) * 0.012 });
  });
  // At the end of each eight-bar phrase the harp sweeps a glissando up into the next one.
  if (k % 8 === 7 && sec.name !== 'outro') {
    const gl = tonesIn(cd, 62, 86).slice(-7);
    gl.forEach((m, j) => v.note('harp', m, at(2 + j * (0.9 / gl.length), 3), out, { vel: (0.28 + j * 0.03) * arc, gain: MIX.harp, pan: 0.1 + j * 0.05 }));
  }

  // ---- Pads ----
  if (sec.strings) {
    const pv = voice(cd, st.pad, 52, 74);
    st.pad = pv.reduce((a, b) => a + b, 0) / pv.length;
    pv.forEach((m, j) => v.note('strings', m, at(0, 20), out, { vel: 0.42 * sec.strings! * arc, dur: barLen * 1.02, att: 0.5, rel: 1.4, gain: MIX.strings, pan: -0.45 + j * 0.3, lp: 3200 }));
  }
  if (sec.vibes) {
    // Bowed vibes: two upper chord tones, held, slowly fading in.
    const top = tonesIn(cd, 64, 79);
    for (const m of [top[0], top[Math.min(2, top.length - 1)]]) v.note('vibesbow', m, at(0, 15), out, { vel: 0.4 * arc, dur: barLen, att: 0.7, rel: 1.6, gain: MIX.vibesbow, pan: PAN.vibesbow! + (m % 2 ? 0.2 : 0) });
  }
  if (sec.wine && k % 2 === 0) {
    // Wine glasses rubbed into a two-note shimmer for two bars.
    const ring = tonesIn(cd, 75, 86);
    for (const m of ring.slice(0, 2)) v.note('wine', m, at(0, 20), out, { vel: 0.38 * arc, dur: barLen * 2, att: 0.9, rel: 2, gain: MIX.wine, pan: m % 2 ? 0.35 : -0.35 });
  }

  // ---- Cello: a pedal on the root, or a slow counterline to the theme ----
  if (sec.cello === 'pedal' && k % 2 === 0) {
    v.note('cello', root < 36 ? root + 12 : root, at(0), out, { vel: 0.4 * arc, dur: barLen * 2 * 0.97, att: 0.25, rel: 0.9, gain: MIX.cello, pan: PAN.cello });
  } else if (sec.cello === 'counter') {
    // Thirds and sevenths of the chords, moving against the flute's long notes.
    const g = nearest((cd.root + cd.tones[1]) % 12, 55);
    const s7 = nearest((cd.root + cd.tones[cd.tones.length > 3 ? 3 : 2]) % 12, g);
    v.note('cello', g, at(0), out, { vel: 0.46 * arc, dur: spb * 1.9, att: 0.12, rel: 0.6, gain: MIX.cello, pan: PAN.cello });
    v.note('cello', s7 < 48 ? s7 + 12 : s7, at(2), out, { vel: 0.42 * arc, dur: spb * 1.1, att: 0.1, rel: 0.6, gain: MIX.cello, pan: PAN.cello });
  }

  // ---- Lead melody and second voice ----
  if (sec.lead) {
    const { inst, line, shift = 0 } = sec.lead;
    for (const [p, nm, l] of line[k] ?? []) {
      const m = n(nm) + shift;
      const long = l >= 2;
      v.note(inst, m, at(p, 12), out, { vel: (0.6 + rnd(-0.04, 0.05)) * arc, dur: l * spb * 0.97, att: inst === 'wine' ? 0.35 : long ? 0.08 : 0.03, rel: inst === 'wine' ? 1.5 : 0.35, gain: MIX[inst], pan: PAN[inst] });
      // Celesta glints an octave up on the first note of each bar.
      if (sec.celesta && p === 0 && m + 12 <= 96) v.note('celesta', m + 12, at(p, 6), out, { vel: 0.4 * arc, gain: MIX.celesta, pan: PAN.celesta });
    }
  }
  if (sec.second && k >= (sec.second.from ?? 0)) {
    const { inst, line, from = 0 } = sec.second;
    for (const [p, nm, l] of line[k - from] ?? []) v.note(inst, n(nm), at(p, 12), out, { vel: 0.46 * arc, dur: l * spb * 0.97, att: 0.2, rel: 0.6, gain: MIX[inst], pan: -0.1 });
  }

  // ---- Kalimba: drops of water ----
  const kal = tonesIn(cd, 64, 83);
  const kv = { gain: MIX.kalimba, pan: PAN.kalimba };
  if (sec.kalimba === 'ostinato' && kal.length >= 4) {
    const idx = k % 2 ? [3, 1, 2, 0] : [1, 3, 2, 4 % kal.length];
    [0, 1, 1.5, 2.5].forEach((p, j) => v.note('kalimba', kal[idx[j]], at(p, 8), out, { ...kv, vel: (j === 0 ? 0.5 : 0.4) * arc }));
  } else if (sec.kalimba === 'answer' && k % 4 === 3) {
    // Answers the theme's held note with three falling drops.
    const top = kal.slice(-4);
    [1, 1.5, 2].forEach((p, j) => v.note('kalimba', top[top.length - 1 - j], at(p, 8), out, { ...kv, vel: 0.42 * arc }));
  } else if (sec.kalimba === 'test' && k >= 4 && k % 2 === 0) {
    const m = pick(kal.slice(-3));
    v.note('kalimba', m, at(1, 8), out, { ...kv, vel: 0.4 });
    v.note('kalimba', m - (kal.includes(m - 3) ? 3 : 4), at(2.5, 8), out, { ...kv, vel: 0.32 });
  }

  // ---- Sparkle ----
  if (k % 8 === 0) v.hit('marktree', pick(['asc', 'desc', 'random']), at(0, 5), out, { vel: 0.3, pan: rnd(-0.5, 0.5) });
  if (sec.shaker) {
    // A soft "tss-ka" on two and three, like leaves moving.
    v.hit('shaker', 'down', at(1, 6), out, { vel: 0.18 * arc, pan: 0.5 });
    v.hit('shaker', 'up', at(2, 6), out, { vel: 0.14 * arc, pan: 0.5 });
    if (Math.random() < 0.5) v.hit('shaker', 'up', at(2.5, 6), out, { vel: 0.1 * arc, pan: 0.5 });
  }
  if (sec.triangle && k % 4 === 0) v.hit('triangle', 'hit', at(0, 5), out, { vel: 0.18, pan: 0.45 });
}

export const garden: Mood = {
  instruments: ['harp', 'flute', 'strings', 'cello', 'vibesbow', 'wine', 'kalimba', 'celesta', 'marktree', 'shaker', 'triangle'],
  bpm: () => 62,
  beatsPerBar: 3,
  play(c) {
    if (c.b !== 0) return;
    playBar(c);
  },
};
