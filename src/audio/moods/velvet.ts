// Kerzensaal (floor 1): a candle-lit velvet salon after midnight. A smaller, darker band than the
// foyer: brushes, upright bass, piano low in the middle register, Wurlitzer, tenor sax and a
// muted trumpet. One long set that runs through three original tunes at a slow 66 bpm:
//   Intro         4 bars  piano and bass alone, rubato-ish rolled chords in D minor.
//   Kerzenlicht  40 bars  ballad in D minor (A/B, 16-bar form): sax head, Wurli and piano solos,
//                         muted trumpet brings the head back.
//   Samt         32 bars  C minor, two-beat slow swing: muted trumpet head, sax solo, sax head out.
//   Rauch        36 bars  slow minor blues in G, 12/8 shuffle on brushes: Wurli riff head, piano solo,
//                         head out, turning back to D minor for the intro.
// 112 bars at 66 bpm is about 6:45 before the set starts over.

import { n } from '../sampler';
import type { InstId } from '../voices';
import { chord, improvise, nearest, swing, voice, walk, type Chord, type Ev } from './jazz';
import { hum, pick, rnd, type BeatCtx, type Mood } from './types';

type Line = [number, string, number][];
type Feel = 'rubato' | 'ballad' | 'two' | 'shuffle';
type Lead = InstId | 'none';

interface Section {
  feel: Feel;
  /** One entry per bar: one or two chord symbols. */
  chart: string[][];
  /** Written melody per bar ([beat, note, beats]); empty when the lead improvises. */
  head?: Line[];
  lead: Lead;
  solo?: boolean;
  density?: number;
  /** Who comps (default piano). */
  comp?: InstId;
  /** Overall dynamics of the section (1 = normal). */
  dyn?: number;
  /** Bass walks quarters instead of the two-feel. */
  walking?: boolean;
}

const T = 1 / 3; // a triplet eighth, for the shuffle

// ---- Kerzenlicht: ballad in D minor -------------------------------------------------------
const K_A = (toNext: string[]): string[][] => [['Dm9'], ['Bbmaj7'], ['Gm9'], ['A7b9'], ['Dm9'], ['Em7b5', 'A7b9'], ['Dm9'], toNext];
const K_B: string[][] = [['Fmaj7'], ['Bbmaj7'], ['Em7b5'], ['A7b9'], ['Dm9'], ['G13'], ['Gm9'], ['A7alt']];
// A sighing four-note figure that falls to the ninth, answered higher each time.
const K_HEAD_A: Line[] = [
  [[0, 'A4', 1.5], [1.5, 'F4', 0.5], [2, 'E4', 1], [3, 'F4', 1]],
  [[0, 'D5', 3], [3, 'C5', 1]],
  [[0, 'Bb4', 1.5], [1.5, 'A4', 0.5], [2, 'G4', 1], [3, 'F4', 1]],
  [[0, 'E4', 2], [2, 'C#5', 1], [3, 'Bb4', 1]],
  [[0, 'A4', 1], [1, 'C5', 1], [2, 'E5', 2]],
  [[0, 'D5', 1], [1, 'Bb4', 1], [2, 'C#5', 1.5], [3.5, 'A4', 0.5]],
  [[0, 'D5', 3]],
  [[0, 'Bb4', 1], [1, 'A4', 1], [2, 'G4', 1], [3, 'E4', 1]],
];
// The bridge opens up to F major and climbs, then sinks back over the altered dominant.
const K_HEAD_B: Line[] = [
  [[0, 'F4', 0.5], [0.5, 'A4', 0.5], [1, 'C5', 1], [2, 'E5', 1.5], [3.5, 'D5', 0.5]],
  [[0, 'D5', 2], [2, 'F5', 1], [3, 'E5', 1]],
  [[0, 'D5', 1.5], [1.5, 'Bb4', 0.5], [2, 'G4', 2]],
  [[0, 'Bb4', 1], [1, 'A4', 1], [2, 'G4', 1], [3, 'E4', 1]],
  [[0, 'F4', 1], [1, 'A4', 1], [2, 'E5', 2]],
  [[0, 'E5', 1.5], [1.5, 'F5', 0.5], [2, 'B4', 2]],
  [[0, 'Bb4', 1.5], [1.5, 'A4', 0.5], [2, 'F4', 2]],
  [[0, 'G4', 1], [1, 'F4', 1], [2, 'C#4', 2]],
];
// Final A ends on the tonic, held, and leaves room for the pivot into C minor.
const K_HEAD_END: Line[] = [...K_HEAD_A.slice(0, 6), [[0, 'D5', 1], [1, 'A4', 1], [2, 'F4', 2]], [[0, 'D4', 2]]];

// ---- Samt: C minor two-feel ------------------------------------------------------------
const S_A: string[][] = [['Cm9'], ['Abmaj7'], ['Dm7b5'], ['G7b9'], ['Cm9'], ['Bbm7', 'Eb7'], ['Abmaj7'], ['Dm7b5', 'G7alt']];
const S_B = (toNext: string[]): string[][] => [['Fm9'], ['Bb7'], ['Ebmaj7'], ['Abmaj7'], ['Dm7b5'], ['G7b9'], ['Cm9'], toNext];
// "Velvet": a pickup that climbs to the ninth and sighs down, a call the second half answers.
const S_HEAD_A: Line[] = [
  [[0, 'G4', 0.5], [0.5, 'Bb4', 0.5], [1, 'D5', 2], [3, 'C5', 1]],
  [[0, 'Eb5', 1.5], [1.5, 'C5', 0.5], [2, 'G4', 2]],
  [[0, 'F4', 0.5], [0.5, 'Ab4', 0.5], [1, 'C5', 2], [3, 'Bb4', 1]],
  [[0, 'Ab4', 1.5], [1.5, 'G4', 0.5], [2, 'B4', 2]],
  [[0, 'C5', 0.5], [0.5, 'D5', 0.5], [1, 'Eb5', 2], [3, 'G5', 1]],
  [[0, 'F5', 1], [1, 'Db5', 1], [2, 'G5', 1], [3, 'Db5', 1]],
  [[0, 'C5', 3], [3, 'Eb5', 1]],
  [[0, 'D5', 1], [1, 'C5', 1], [2, 'B4', 1], [3, 'Ab4', 1]],
];
const S_HEAD_B: Line[] = [
  [[0, 'Ab4', 1], [1, 'C5', 1], [2, 'Eb5', 1.5], [3.5, 'G5', 0.5]],
  [[0, 'F5', 2], [2, 'D5', 1], [3, 'Ab4', 1]],
  [[0, 'G4', 1.5], [1.5, 'Bb4', 0.5], [2, 'D5', 2]],
  [[0, 'C5', 2], [2, 'Eb5', 1], [3, 'G5', 1]],
  [[0, 'F5', 1.5], [1.5, 'Eb5', 0.5], [2, 'C5', 1], [3, 'Ab4', 1]],
  [[0, 'B4', 2], [2, 'D5', 1], [3, 'F5', 1]],
  [[0, 'Eb5', 1], [1, 'D5', 1], [2, 'C5', 2]],
  [[2, 'Ab4', 1], [3, 'B4', 1]],
];

// ---- Rauch: slow minor blues in G, 12/8 --------------------------------------------------
const R_CHART = (toNext: string[]): string[][] => [['Gm9'], ['Cm9'], ['Gm9'], ['Gm9'], ['Cm9'], ['Cm9'], ['Gm9'], ['Gm9'], ['Ebmaj7'], ['D7alt'], ['Gm9'], toNext];
// A lazy riff with a triplet hook ("da, da-da DAH"), moved up to C, answered by a falling line.
const R_HEAD: Line[] = [
  [[0, 'D5', 1], [1, 'F5', 2 * T], [1 + 2 * T, 'D5', T], [2, 'Bb4', 2]],
  [[0, 'Eb5', 1], [1, 'G5', 2 * T], [1 + 2 * T, 'Eb5', T], [2, 'C5', 2]],
  [[0, 'D5', 1], [1, 'F5', 2 * T], [1 + 2 * T, 'G5', T], [2, 'A5', 1], [3, 'G5', 1]],
  [[0, 'D5', 3]],
  [[0, 'Eb5', 1], [1, 'G5', 2 * T], [1 + 2 * T, 'Eb5', T], [2, 'C5', 1], [3, 'D5', 1]],
  [[0, 'Eb5', 2], [2, 'D5', 1], [3, 'C5', 1]],
  [[0, 'Bb4', 1], [1, 'D5', 2 * T], [1 + 2 * T, 'F5', T], [2, 'G5', 2]],
  [[0, 'F5', 1], [1, 'D5', 1], [2, 'Bb4', 2]],
  [[0, 'G5', 1], [1, 'F5', 2 * T], [1 + 2 * T, 'Eb5', T], [2, 'D5', 2]],
  [[0, 'C5', 1], [1, 'Bb4', 2 * T], [1 + 2 * T, 'F#4', T], [2, 'Eb5', 2]],
  [[0, 'D5', 1], [1, 'Bb4', 1], [2, 'G4', 2]],
  [[2, 'A4', 1], [3, 'C5', 1]],
];
const R_HEAD_END: Line[] = [...R_HEAD.slice(0, 10), [[0, 'D5', 1], [1, 'Bb4', 1], [2, 'G4', 2]], []];

const INTRO: string[][] = [['Dm9'], ['Bbmaj7'], ['Em7b5'], ['A7b9']];

/** The whole set, in order. */
const SET: Section[] = [
  { feel: 'rubato', chart: INTRO, lead: 'none', dyn: 1.15 },
  { feel: 'ballad', chart: K_A(['Gm7', 'C7']), head: K_HEAD_A, lead: 'sax', dyn: 0.9 },
  { feel: 'ballad', chart: K_B, head: K_HEAD_B, lead: 'sax' },
  { feel: 'ballad', chart: K_A(['Gm7', 'A7alt']), lead: 'wurli', solo: true, density: 0.3, walking: true },
  { feel: 'ballad', chart: K_B, lead: 'piano', solo: true, density: 0.35, walking: true, comp: 'wurli', dyn: 1.05 },
  { feel: 'ballad', chart: K_A(['Dm9', 'G7alt']), head: K_HEAD_END, lead: 'mutetp', dyn: 0.9 },
  { feel: 'two', chart: S_A, head: S_HEAD_A, lead: 'mutetp', dyn: 0.9 },
  { feel: 'two', chart: S_B(['Dm7b5', 'G7b9']), head: S_HEAD_B, lead: 'mutetp' },
  { feel: 'two', chart: S_A, lead: 'sax', solo: true, density: 0.4, walking: true, dyn: 1.08 },
  { feel: 'two', chart: S_B(['Am7b5', 'D7b9']), head: S_HEAD_B, lead: 'sax', dyn: 0.95 },
  { feel: 'shuffle', chart: R_CHART(['Am7b5', 'D7b9']), head: R_HEAD, lead: 'wurli', comp: 'piano', dyn: 0.95 },
  { feel: 'shuffle', chart: R_CHART(['Am7b5', 'D7b9']), lead: 'piano', solo: true, density: 0.45, comp: 'wurli', dyn: 1.08 },
  { feel: 'shuffle', chart: R_CHART(['Em7b5', 'A7b9']), head: R_HEAD_END, lead: 'wurli', comp: 'piano', dyn: 0.88 },
];
const BARS = SET.reduce((a, s) => a + s.chart.length, 0);

/** Level of each instrument (balanced with tools/sounds/render.mjs). */
const MIX: Partial<Record<InstId, number>> = { piano: 1.05, bass: 1.9, sax: 1.1, mutetp: 1.1, wurli: 1.25 };
const PAN: Partial<Record<InstId, number>> = { piano: -0.3, bass: 0.05, sax: 0.2, mutetp: 0.12, wurli: 0.28 };
/** Leads play in their own register: the tenor sounds an octave under the written line. */
const SHIFT: Partial<Record<InstId, number>> = { sax: -12 };

interface BandState {
  comp: number;
  bass: number;
  solo: { last: number; rest: number; dir: number };
}
const bands = new WeakMap<AudioNode, BandState>();

/** Which section a bar falls in and where inside it. */
function locate(bar: number) {
  let k = bar % BARS;
  for (let i = 0; i < SET.length; i++) {
    if (k < SET[i].chart.length) return { i, sec: SET[i], k };
    k -= SET[i].chart.length;
  }
  return { i: 0, sec: SET[0], k: 0 };
}

function bassNote(pc: number, near: number) {
  let m = 31 + ((pc - 31 + 120) % 12); // G1..F#2, then up an octave if closer
  if (m + 12 <= 45 && Math.abs(m + 12 - near) < Math.abs(m - near)) m += 12;
  return m;
}

function playBar(c: BeatCtx) {
  const { v, spb, out } = c;
  let st = bands.get(out);
  if (!st) bands.set(out, (st = { comp: 58, bass: 38, solo: { last: 66, rest: 0, dir: 1 } }));
  const { i, sec, k } = locate(c.bar);
  const len = sec.chart.length;
  const nextBar = locate(c.bar + 1);
  const syms = sec.chart[k];
  const chords: Chord[] = syms.map(chord);
  const beatsPer = syms.length === 2 ? [2, 2] : [4];
  const next = chord(nextBar.sec.chart[nextBar.k][0]);
  const sw = sec.feel === 'shuffle' ? 0.67 : 0.62;
  // A slow push and pull: a phrase swells towards its middle and settles at the end.
  const arc = (sec.dyn ?? 1) * (0.92 + 0.12 * Math.sin((Math.PI * (k % 8 + 0.5)) / 8));
  // Rubato intro: the pianist leans on the downbeats and lets the bar breathe.
  const at = (pos: number) => c.d + swing(pos, sw) * spb + hum(sec.feel === 'rubato' ? 25 : 7) + (sec.feel === 'rubato' && pos === 0 ? 0.04 : 0);

  // ---- Bass ----
  if (sec.walking) {
    const line = walk(chords, beatsPer, next, st.bass, 31, 50);
    line.forEach((m, q) => v.note('bass', m, at(q), out, { vel: (q % 2 ? 0.66 : 0.76) * arc, dur: spb * 0.92, gain: MIX.bass, pan: PAN.bass }));
    st.bass = line[line.length - 1];
  } else if (sec.feel === 'shuffle') {
    // Root, a triplet pickup, the fifth on three and an approach into the next chord.
    const cd = chords[0];
    const root = bassNote(cd.root, st.bass);
    const fifth = root + 7 > 50 ? root - 5 : root + 7;
    const seventh = nearest((cd.root + 10) % 12, root + 9);
    const tgt = bassNote(next.root, root);
    const pat: [number, number, number, number][] = [[0, root, 1.5, 0.7], [1 + 2 * T, root, 0.3, 0.45], [2, fifth, 0.9, 0.6], [3, seventh <= 52 ? seventh : seventh - 12, 0.55, 0.52], [3 + 2 * T, tgt + pick([-1, 1]), 0.3, 0.48]];
    for (const [p, m, dd, vv] of pat) v.note('bass', m, c.d + p * spb + hum(6), out, { vel: vv * arc, dur: dd * spb, gain: MIX.bass, pan: PAN.bass });
    st.bass = root;
  } else {
    // Two-feel: roots on one, fifth or a step towards the next chord on three.
    chords.forEach((cd, ci) => {
      const base = ci * beatsPer[ci];
      const root = bassNote(cd.root, st!.bass);
      const hold = sec.feel === 'rubato' ? 4 : beatsPer[ci] === 4 ? 2 : 2;
      v.note('bass', root, at(base), out, { vel: 0.78 * arc, dur: spb * hold * 0.95, gain: MIX.bass, pan: PAN.bass });
      if (beatsPer[ci] === 4 && sec.feel !== 'rubato') {
        const tgt = bassNote(next.root, root);
        const third = pick([root + 7 > 50 ? root - 5 : root + 7, tgt + (tgt > root ? -1 : 1), root + 12 <= 50 ? root + 12 : root - 5]);
        v.note('bass', third, at(2), out, { vel: 0.66 * arc, dur: spb * 1.9, gain: MIX.bass, pan: PAN.bass });
        // Now and then a passing note on the "and" of four.
        if (sec.feel === 'two' && Math.random() < 0.3) v.note('bass', tgt + pick([-2, 2]), at(3.5), out, { vel: 0.5 * arc, dur: spb * 0.45, gain: MIX.bass, pan: PAN.bass });
      }
      st!.bass = root;
    });
  }

  // ---- Drums ----
  drums(c, sec, k, i, at, arc);

  // ---- Comping (piano low in the middle, or Wurlitzer) ----
  const comp: InstId = sec.comp ?? 'piano';
  const soloing = sec.solo && sec.lead === comp;
  if (!soloing) {
    const cv = (sec.solo && (sec.lead === 'piano' || sec.lead === 'wurli') ? 0.36 : 0.46) * arc;
    chords.forEach((cd, ci) => {
      const base = ci * beatsPer[ci];
      const vo = voice(cd, st!.comp, 48, 68);
      st!.comp = vo.reduce((a, b) => a + b, 0) / vo.length;
      const o = { gain: MIX[comp], pan: PAN[comp] };
      if (sec.feel === 'rubato' || sec.feel === 'ballad') {
        // A slow roll from the bottom, the root under it, and a few notes of the chord drifting up.
        v.chord(comp, vo, at(base), out, { ...o, vel: cv * 0.9, dur: beatsPer[ci] * spb * 0.95, rel: 0.8 }, sec.feel === 'rubato' ? 0.07 : 0.04);
        if (comp === 'piano') v.note('piano', bassNote(cd.root, 40) + 12, at(base), out, { ...o, vel: cv * 0.55, dur: beatsPer[ci] * spb, rel: 0.8 });
        if (beatsPer[ci] === 4) {
          const up = pick([[2, 2.5, 3], [1.5, 2.5, 3.5], [2.5, 3]]);
          up.forEach((q, j) => v.note(comp, vo[(j + 1) % vo.length] + 12, at(base + q), out, { ...o, vel: cv * 0.42, dur: spb * 1.2, rel: 0.5 }));
        }
      } else if (sec.feel === 'two') {
        // Sparse stabs: a long chord on one or an anticipation on the "and" of two.
        const hits: [number, number][] = beatsPer[ci] === 4 ? pick([[[0, 1.8], [2.5, 1.2]], [[0, 3.5]], [[1.5, 1], [3, 0.8]], [[0, 1.4], [3.5, 0.5]]] as [number, number][][]) : pick([[[0, 1.6]], [[0.5, 1.2]]] as [number, number][][]);
        for (const [p, l] of hits) v.chord(comp, vo, at(base + p), out, { ...o, vel: cv + rnd(-0.04, 0.04), dur: l * spb, rel: 0.25 }, 0.012);
      } else {
        // Shuffle: the chord on one, then soft triplet pushes on the "a" of two and four.
        v.chord(comp, vo, c.d + base * spb + hum(6), out, { ...o, vel: cv, dur: spb * 1.4, rel: 0.3 }, 0.01);
        for (const p of [1 + 2 * T, 3 + 2 * T]) if (Math.random() < 0.75) v.chord(comp, vo, c.d + p * spb + hum(6), out, { ...o, vel: cv * 0.75, dur: spb * 0.6, rel: 0.2 }, 0.008);
      }
    });
  }

  // ---- Lead: written head or a solo ----
  if (sec.lead === 'none') {
    // The intro piano plays a small falling line on top of the rolled chords.
    if (sec.feel === 'rubato') {
      const TOPS: Line[] = [[[2, 'A5', 1], [3, 'F5', 1]], [[2, 'D5', 2]], [[2, 'Bb4', 1], [3, 'G4', 1]], [[1, 'E4', 1], [2, 'C#5', 2]]];
      const tops = TOPS[k];
      for (const [p, nm, l] of tops) v.note('piano', n(nm), at(p), out, { vel: 0.5, dur: l * spb, rel: 0.6, gain: MIX.piano, pan: PAN.piano });
    }
    return;
  }
  const lead = sec.lead;
  const sustained = lead === 'sax' || lead === 'mutetp';
  const shift = SHIFT[lead] ?? 0;
  if (!sec.solo && sec.head) {
    for (const [p, nm, l] of sec.head[k] ?? []) {
      const m = n(nm) + shift;
      // Long notes get a slow swell; a little scoop on the sax gives it breath.
      v.note(lead, m, at(p), out, { vel: (0.6 + rnd(-0.04, 0.05)) * arc, dur: l * spb * (sustained ? 0.96 : 1), rel: sustained ? 0.25 : 0.7, att: sustained ? (l >= 2 ? 0.09 : 0.03) : undefined, gain: MIX[lead], pan: PAN[lead] });
    }
    // Over the last head of the ballad the Wurli doubles the tune softly an octave up.
    if (i === 5 && k < 6) for (const [p, nm, l] of sec.head[k] ?? []) v.note('wurli', n(nm) + 12, at(p), out, { vel: 0.3, dur: l * spb, gain: MIX.wurli, pan: -0.35 });
  } else {
    const range: Record<string, [number, number]> = { piano: [58, 81], sax: [50, 72], mutetp: [60, 79], wurli: [58, 81] };
    const [lo, hi] = range[lead] ?? [58, 80];
    if (st.solo.last < lo || st.solo.last > hi) st.solo.last = (lo + hi) >> 1;
    // Solos breathe: the first bar of a solo section waits for the soloist to come in.
    if (k === 0) st.solo.rest = 1;
    const ev: Ev[] = improvise(chords, beatsPer, st.solo, lo, hi, sec.density ?? 0.4);
    for (const e of ev) v.note(lead, e.midi, at(e.at), out, { vel: e.vel * arc, dur: e.dur * spb, rel: sustained ? 0.15 : 0.5, att: sustained ? 0.02 : undefined, gain: MIX[lead], pan: PAN[lead] });
  }
  if (k === len - 1 && nextBar.sec.feel !== sec.feel) {
    // A cymbal swell carries the band into the next tune.
    v.hit('suscym', 'swell', at(1), out, { vel: 0.3, pan: 0.25 });
  }
}

/** Brushes and a soft ride; the drummer never plays above a whisper in here. */
function drums(c: BeatCtx, sec: Section, k: number, i: number, at: (p: number) => number, arc: number) {
  const { v, spb, out } = c;
  if (sec.feel === 'rubato') {
    if (k === 0) v.hit('suscym', 'roll', at(0), out, { vel: 0.18, pan: 0.3 });
    return;
  }
  const lvl = 1.5 * arc;
  if (sec.feel === 'shuffle') {
    // 12/8: ride on the beat and the last triplet, brush slaps on two and four, kick on one and three.
    for (let q = 0; q < 4; q++) {
      v.hit('suscym', 'ride', c.d + q * spb + hum(5), out, { vel: (q % 2 ? 0.3 : 0.36) * lvl, pan: 0.3 });
      v.hit('suscym', 'ride', c.d + (q + 2 * T) * spb + hum(5), out, { vel: 0.2 * lvl, pan: 0.3 });
    }
    for (const q of [1, 3]) {
      v.hit('snare', 'tap', c.d + q * spb + hum(5), out, { vel: 0.4 * lvl, pan: -0.12 });
      v.noise(0.16, 0.05 * lvl, c.d + q * spb, 3800, 'bandpass', 0.7, out);
      v.hit('hihat', 'p', c.d + q * spb + hum(4), out, { vel: 0.3 * lvl, pan: 0.38 });
    }
    for (const q of [0, 2]) v.hit('kick', 'k', c.d + q * spb + hum(5), out, { vel: 0.16 * lvl });
    if (k === 11) for (const q of [3, 3 + T, 3 + 2 * T]) v.hit('snare', 'tap', c.d + q * spb + hum(4), out, { vel: rnd(0.25, 0.4) * lvl, pan: -0.12 });
    return;
  }
  // Brushes: a long swirl over each half bar, a tap on two and four.
  for (const p of [0, 2]) v.noise(spb * 1.85, 0.028 * lvl, at(p), 3600, 'bandpass', 0.5, out);
  for (const p of [1, 3]) {
    v.noise(0.13, 0.05 * lvl, at(p), 4200, 'bandpass', 0.7, out);
    v.hit('snare', 'tap', at(p), out, { vel: 0.18 * lvl, pan: -0.12, lp: 3500 });
    v.hit('hihat', 'p', at(p), out, { vel: 0.24 * lvl, pan: 0.38 });
  }
  if (sec.feel === 'two' || sec.walking) {
    // Ride feathered in: "ding, ding-a ding, ding-a".
    for (const p of [0, 1, 1.5, 2, 3, 3.5]) v.hit('suscym', 'ride', at(p), out, { vel: (p % 1 ? 0.18 : 0.28) * lvl, pan: 0.3 });
    for (let q = 0; q < 4; q++) v.hit('kick', 'k', at(q), out, { vel: 0.09 * lvl });
  } else if (k % 2 === 1) v.hit('suscym', 'ride', at(0), out, { vel: 0.22 * lvl, pan: 0.3 });
  if (k % 8 === 7 && Math.random() < 0.7) v.hit('snare', 'tap', at(3.5), out, { vel: 0.3 * lvl, pan: -0.12 });
  if (k === 0 && i > 0) v.hit('suscym', 'hit', at(0), out, { vel: 0.22, pan: 0.35 });
}

export const velvet: Mood = {
  instruments: ['piano', 'bass', 'sax', 'mutetp', 'wurli', 'suscym', 'hihat', 'snare', 'kick'],
  bpm: () => 66,
  play(c) {
    if (c.b !== 0) return;
    playBar(c);
  },
};
