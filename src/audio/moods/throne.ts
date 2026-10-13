// Floor 5, the throne hall of the Moth Queen (Mottenkönigin): a corridor of gates and the final duel.
// Gothic and majestic, dangerous but elegant: D minor with a phrygian shadow (Eb over a D pedal,
// the b6 in the string ostinato). One recurring "Queen theme" carries the whole floor and is
// re-orchestrated for each boss phase (s.intensity):
//   0  the hall before the fight: organ pedal, low choir, cello sings the theme, distant bells.
//   1  tension: a string ostinato starts, timpani pulse, the theme moves to the horns.
//   2  the fight: the theme as a brass fanfare (dotted rhythm), 3+3+2 drive in timpani, snare, tuba.
//   3  the final phase: everything, choir fortissimo on the theme, organ tutti, 16th-note strings.
// Form (8-bar sections): A theme · B second theme · C the gates (pedal, bells) · A' theme with a new
// ending. Three cycles rotate the orchestration, so the form only repeats after ~5 minutes.
// A phase change happens mid-bar: the rest of the bar plays out at the new tempo, the next bar is a
// short lead-in (impact or calm), then the form restarts at the theme in the new phase.

import { n } from '../sampler';
import type { InstId, NoteOpts } from '../voices';
import { hum, rnd, type BeatCtx, type Mood } from './types';

// ---- Harmony -------------------------------------------------------------------------------

/** A chord: bass pitch class and the upper chord tones (pitch classes). */
interface Ch {
  b: number;
  t: number[];
}
const DM: Ch = { b: 2, t: [2, 5, 9] };
const A7: Ch = { b: 9, t: [9, 1, 4, 7] };
const AM: Ch = { b: 9, t: [9, 1, 4] };
const GM: Ch = { b: 7, t: [7, 10, 2] };
const BB: Ch = { b: 10, t: [10, 2, 5] };
const EB: Ch = { b: 3, t: [3, 7, 10] };
const DM_F: Ch = { b: 5, t: [2, 5, 9] };
const EDIM: Ch = { b: 4, t: [4, 7, 10, 1] };
/** The gates: Eb major and Bb minor over a D pedal (phrygian, the Queen's shadow). */
const EB_D: Ch = { b: 2, t: [3, 7, 10] };
const BBM_D: Ch = { b: 2, t: [10, 1, 5] };

type Sec = 'A' | 'B' | 'C' | 'A2';
const FORM: Sec[] = ['A', 'B', 'C', 'A2'];
const CHART: Record<Sec, Ch[]> = {
  A: [DM, A7, GM, AM, BB, GM, A7, DM],
  B: [GM, DM_F, EB, EB, BB, GM, EDIM, A7],
  C: [DM, EB_D, DM, EB_D, BBM_D, DM, EB_D, A7],
  A2: [DM, A7, GM, AM, BB, GM, A7, DM],
};

// ---- Melody --------------------------------------------------------------------------------

type Line = [number, string, number][][];
/** The Queen theme: a falling fifth (D-A), the leading tone C# climbing back, a long sigh on A. */
const THEME: Line = [
  [[0, 'D5', 2], [2, 'A4', 1], [3, 'Bb4', 1]],
  [[0, 'C#5', 1.5], [1.5, 'D5', 0.5], [2, 'E5', 1], [3, 'F5', 1]],
  [[0, 'E5', 2], [2, 'D5', 1], [3, 'C#5', 0.5], [3.5, 'Bb4', 0.5]],
  [[0, 'A4', 4]],
  [[0, 'F5', 2], [2, 'E5', 1], [3, 'D5', 1]],
  [[0, 'Bb5', 1.5], [1.5, 'A5', 0.5], [2, 'G5', 1], [3, 'F5', 1]],
  [[0, 'E5', 1], [1, 'F5', 0.5], [1.5, 'G5', 0.5], [2, 'F5', 1], [3, 'E5', 1]],
  [[0, 'D5', 4]],
];
/** A': same opening, a new, darker close (falls through C# to the low D). */
const THEME_2: Line = [
  ...THEME.slice(0, 5),
  [[0, 'Bb5', 1], [1, 'A5', 1], [2, 'G5', 0.5], [2.5, 'F5', 0.5], [3, 'E5', 1]],
  [[0, 'C#5', 2], [2, 'E5', 1], [3, 'G5', 1]],
  [[0, 'F5', 1], [1, 'E5', 1], [2, 'D5', 2]],
];
/** The theme as a fight fanfare: knocking dotted pickups, rising sequence, no long sighs. */
const FANFARE: Line = [
  [[0, 'D5', 0.75], [0.75, 'D5', 0.25], [1, 'D5', 1], [2, 'A4', 1], [3, 'Bb4', 1]],
  [[0, 'C#5', 0.75], [0.75, 'D5', 0.25], [1, 'E5', 1], [2, 'F5', 1], [3, 'G5', 1]],
  [[0, 'E5', 1.5], [1.5, 'D5', 0.5], [2, 'C#5', 1], [3, 'Bb4', 0.5], [3.5, 'C#5', 0.5]],
  [[0, 'A4', 2], [2, 'A4', 0.5], [2.5, 'Bb4', 0.5], [3, 'C#5', 1]],
  [[0, 'F5', 1.5], [1.5, 'E5', 0.25], [1.75, 'F5', 0.25], [2, 'D5', 2]],
  [[0, 'Bb5', 1.5], [1.5, 'A5', 0.5], [2, 'G5', 1], [3, 'F5', 1]],
  [[0, 'E5', 1], [1, 'F5', 0.5], [1.5, 'G5', 0.5], [2, 'A5', 1], [3, 'C#5', 1]],
  [[0, 'D5', 0.75], [0.75, 'D5', 0.25], [1, 'D5', 2]],
];
/** Second theme: a slow climb into Eb (the throne steps), then down the diminished chord. */
const SECOND: Line = [
  [[0, 'G4', 2], [2, 'Bb4', 1], [3, 'D5', 1]],
  [[0, 'F5', 3], [3, 'E5', 0.5], [3.5, 'D5', 0.5]],
  [[0, 'Eb5', 2], [2, 'G5', 1], [3, 'Bb5', 1]],
  [[0, 'Bb5', 3], [3, 'G5', 1]],
  [[0, 'F5', 2], [2, 'D5', 1], [3, 'Bb4', 1]],
  [[0, 'D5', 1.5], [1.5, 'Eb5', 0.5], [2, 'D5', 1], [3, 'Bb4', 1]],
  [[0, 'C#5', 2], [2, 'Bb4', 1], [3, 'G4', 1]],
  [[0, 'A4', 3]],
];
/** Horn counter-line under A' in the fight (long notes, moving against the theme). */
const COUNTER: Line = [
  [[0, 'A3', 4]], [[0, 'G3', 2], [2, 'A3', 2]], [[0, 'Bb3', 4]], [[0, 'C#4', 2], [2, 'E4', 2]],
  [[0, 'D4', 4]], [[0, 'D4', 2], [2, 'Bb3', 2]], [[0, 'A3', 2], [2, 'C#4', 2]], [[0, 'A3', 4]],
];
/** The gate bells: the first three notes of the theme, tolled. */
const GATE_BELLS: [number, string][][] = [
  [[0, 'D5'], [1.5, 'A4'], [2, 'Bb4']],
  [[0, 'D5'], [2, 'A4']],
  [[0, 'D5'], [1, 'C#5'], [2, 'A4'], [3, 'Bb4']],
];

const RANGE: Partial<Record<InstId, [number, number]>> = {
  cello: [36, 69], horn: [36, 77], trumpet: [55, 84], trombone: [38, 65], tuba: [29, 55],
  choir: [45, 79], strings: [40, 88], organ: [36, 90], organq: [36, 90], tubbells: [60, 76],
};

/** Notes of one bar of a line, shifted; the whole 4-bar phrase drops an octave if any note would leave the range. */
function phrase(line: Line, i: number, inst: InstId, shift: number): [number, number, number][] {
  const [lo, hi] = RANGE[inst] ?? [0, 127];
  const p0 = i - (i % 4);
  const all = line.slice(p0, p0 + 4).flat().map((e) => n(e[1]) + shift);
  let s = shift;
  if (Math.max(...all) > hi) s -= 12;
  else if (Math.min(...all) < lo) s += 12;
  return (line[i] ?? []).map(([at, nm, d]) => [at, n(nm) + s, d]);
}

/** Midi note of pitch class pc inside [lo, lo+11]. */
const inOct = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);
/** Close-position chord above `lo`. */
const voiced = (c: Ch, lo: number, k = 3) => c.t.slice(0, k).map((pc) => inOct(pc, lo)).sort((a, b) => a - b);

// ---- Mix -------------------------------------------------------------------------------------

const MIX: Partial<Record<InstId, number>> = {
  organ: 0.42, organq: 0.5, choir: 0.6, strings: 0.55, cello: 0.7, horn: 0.6, trombone: 0.55, tuba: 0.7, trumpet: 0.5,
  timpani: 0.85, timproll: 0.6, tubbells: 0.4,
};
const PAN: Partial<Record<InstId, number>> = {
  organ: 0, organq: 0, choir: 0, strings: -0.35, cello: 0.3, horn: -0.2, trombone: 0.25, tuba: 0.15, trumpet: 0.2,
  timpani: -0.1, timproll: -0.1, tubbells: 0.45,
};

// ---- Per-output state: the current bar plan, played beat by beat ------------------------------

interface Ev {
  at: number;
  go: (t: number, spb: number) => void;
}
interface St {
  phase: number;
  /** Bar where the form starts (bar - start = position in the form; negative = lead-in). */
  start: number;
  /** Phase we came from at the last change (for the lead-in gesture). */
  from: number;
  plan: Ev[];
}
const states = new WeakMap<AudioNode, St>();

/**
 * Every bar is planned on its first beat but scheduled one beat at a time with the tempo of that
 * beat, so a phase change (and its new bpm) in the middle of a bar never makes notes overlap or gap.
 */
function play(c: BeatCtx) {
  let st = states.get(c.out);
  if (!st) states.set(c.out, (st = { phase: c.s.intensity, start: 1, from: -1, plan: [] }));
  if (c.b === 0) {
    if (c.s.intensity !== st.phase) {
      st.from = st.phase;
      st.phase = c.s.intensity;
      st.start = c.bar + 1;
    }
    st.plan = [];
    planBar(c, st);
  }
  for (const e of st.plan) if (e.at >= c.b && e.at < c.b + 1) e.go(c.d + (e.at - c.b) * c.spb, c.spb);
}

function planBar(c: BeatCtx, st: St) {
  const { v, out } = c;
  const plan = st.plan;
  const p = st.phase;
  const fb = c.bar - st.start;
  /** The fight phases are denser, so every voice plays a little softer there. */
  const lvl = p >= 3 ? 0.66 : p >= 2 ? 0.72 : 1;

  /** A note `beats` long at beat `at` (durations follow the tempo at play time). */
  const N = (inst: InstId, midi: number, at: number, beats: number, o: NoteOpts = {}, h = 6) =>
    plan.push({ at, go: (t, spb) => void v.note(inst, midi, t + hum(h), out, { pan: PAN[inst], ...o, gain: (o.gain ?? MIX[inst] ?? 1) * lvl, dur: beats * spb }) });
  const H = (kit: InstId, art: string, at: number, o: NoteOpts = {}, h = 5) => plan.push({ at, go: (t) => void v.hit(kit, art, t + hum(h), out, { ...o, gain: (o.gain ?? 1) * lvl }) });
  /** A sustained chord (pads: choir, organ, strings). */
  const pad = (inst: InstId, notes: number[], at: number, beats: number, vel: number, o: NoteOpts = {}) =>
    notes.forEach((m, k) => N(inst, m, at, beats, { vel: vel * (k === 0 ? 1 : 0.92), att: 0.25, rel: 0.9, ...o }, 3));
  /** One bar of a melodic line. */
  const melody = (line: Line, i: number, inst: InstId, shift: number, vel: number, o: NoteOpts = {}, legato = 0.96) => {
    for (const [at, m, d] of phrase(line, i, inst, shift)) {
      const accent = at === 0 ? 0.06 : at % 1 ? -0.06 : 0;
      N(inst, m, at, d * legato, { vel: vel + accent + rnd(-0.03, 0.03), att: 0.03, rel: 0.25, ...o });
    }
  };
  /** A snare crescendo roll in 32nds over `beats` ending at the bar line. */
  const snareRoll = (from: number, v0: number, v1: number) => {
    const steps = Math.round((4 - from) * 8);
    for (let k = 0; k < steps; k++) H('snare', k % 2 ? 'tap' : 's', from + k / 8, { vel: v0 + ((v1 - v0) * k) / steps, pan: -0.15 }, 2);
  };
  /** Cymbal swell peaking on the next downbeat (the sample peaks 1.2 s in). */
  const swell = (vel: number) => H('suscym', 'swell', Math.max(0, 4 - 1.2 / c.spb), { vel, pan: 0.3 }, 0);

  // ---- Lead-in bar after a phase change (or the very start) ----
  if (fb < 0) {
    leadIn(c, st, N, H, pad, snareRoll, swell);
    return;
  }

  const secIdx = Math.floor(fb / 8) % FORM.length;
  const sec = FORM[secIdx];
  const i = fb % 8;
  const cycle = Math.floor(fb / 32) % 3;
  const ch = CHART[sec][i];
  const next = CHART[FORM[(secIdx + (i === 7 ? 1 : 0)) % FORM.length]][(i + 1) % 8];
  const bass = inOct(ch.b, 36); // D2..C#3
  const timp = inOct(ch.b, 43); // G2..F#3, the kettle range
  const theme = sec === 'A2' ? THEME_2 : THEME;
  const lastOfSec = i === 7;

  // =========================== Phase 0: the hall before the fight ===========================
  if (p <= 0) {
    // Organ pedal: the bass held through the bar (the whole gate section rests on D).
    N('organ', bass, 0, 4, { vel: 0.5, att: 0.4, rel: 1.2, lp: 1400 }, 0);
    if (i % 2 === 0) N('organ', bass + 12, 0, 8, { vel: 0.3, att: 1.2, rel: 1.5, lp: 1800 }, 0);
    // Low choir: a slow breath on each chord, in the low register.
    pad('choir', voiced(ch, 53), 0, 4, sec === 'C' ? 0.42 : 0.34, { att: 1.1, rel: 1.4, lp: 2600 });
    // Low strings: root and fifth, swelling every two bars.
    if (i % 2 === 0) pad('strings', [inOct(ch.b, 41), inOct(ch.b, 41) + 7], 0, 8, 0.3, { att: 2, rel: 1.5, lp: 2000 });
    if (sec === 'A' || sec === 'A2') {
      // The theme, sung low: cello (or horn, or the quiet organ in later cycles).
      const lead: InstId = sec === 'A' ? (['cello', 'cello', 'horn'] as InstId[])[cycle] : (['organq', 'horn', 'cello'] as InstId[])[cycle];
      melody(theme, i, lead, lead === 'organq' ? 0 : -12, lead === 'horn' ? 0.42 : 0.55, { lp: lead === 'horn' ? 1800 : undefined, att: lead === 'cello' ? 0.08 : 0.04 });
    } else if (sec === 'B') {
      // The second theme as a distant horn call answered by the choir.
      if (i < 4) melody(SECOND, i, 'horn', -12, 0.38, { lp: 1500, pan: -0.4 });
      else melody(SECOND, i, 'strings', 0, 0.42, { att: 0.15, rel: 0.6 });
    } else {
      // The gates: bells toll the theme's head far away, a gong breathes at the first gate.
      if (i % 2 === 0) for (const [at, nm] of GATE_BELLS[(i / 2 + cycle) % 3]) N('tubbells', n(nm), at, 3, { vel: 0.38 + rnd(-0.05, 0.05), lp: 3500, pan: 0.5 });
      if (i === 0) H('gong', 'g', 0, { vel: 0.35, pan: -0.2 });
      if (i === 4) H('gong', 'scrape', 0, { vel: 0.5, pan: 0.3 });
    }
    // Distant bell and a low kettle note marking every four bars.
    if (i % 4 === 0 && sec !== 'C') N('tubbells', inOct(ch.b, 62), 0, 4, { vel: 0.28, lp: 2500, pan: 0.55 });
    if (i === 0) N('timpani', timp, 0, 2, { vel: 0.4 });
    if (lastOfSec && sec === 'B') N('timproll', timp, 1, 3, { vel: 0.35, att: 2.4 * c.spb, rel: 0.3 });
    if (lastOfSec && sec === 'C') swell(0.3);
    return;
  }

  // =========================== Phases 1–3: the fight builds ===========================
  const fight = p >= 2;
  const fin = p >= 3;

  // ---- String ostinato: root, fifth, octave, fifth, b6, fifth (the moth's wings) ----
  {
    const r = inOct(ch.b, fin ? 50 : 45);
    const cell = [0, 7, 12, 7, 8, 7, 12, 7];
    const steps = fin ? 16 : 8;
    const len = 4 / steps;
    for (let k = 0; k < steps; k++) {
      const accent = fight ? [0, 3, 6].includes(k % 8) : k % 2 === 0;
      const base = fin ? 0.5 : fight ? 0.48 : 0.36 + i * 0.02;
      N('strings', r + cell[k % 8], k * len, len * 0.85, { vel: base + (accent ? 0.16 : 0), att: 0.008, rel: 0.07 }, 3);
    }
    // Cellos double the ostinato's pulse an octave down (quarters, or the 3+3+2 in the fight).
    const cpos = fight ? [0, 1.5, 3] : [0, 1, 2, 3];
    for (const at of cpos) N('cello', inOct(ch.b, 38), at, fight ? 1.2 : 0.9, { vel: fight ? 0.62 : 0.5, att: 0.01, rel: 0.12 }, 4);
  }

  // ---- Timpani (and the low brass in the fight) ----
  if (!fight) {
    N('timpani', timp, 0, 1, { vel: 0.6 });
    N('timpani', timp, 2, 1, { vel: 0.45 });
    if (i % 2 === 1) N('timpani', inOct(ch.b + 7, 43), 3.5, 0.5, { vel: 0.35 });
  } else {
    for (const [at, vel] of [[0, 0.85], [1.5, 0.6], [3, 0.7], [3.5, 0.45]] as const) N('timpani', at === 3.5 ? inOct(ch.b + 7, 43) : timp, at, 1, { vel: fin ? vel + 0.1 : vel });
    const tb = bass - 12 >= 29 ? bass - 12 : bass;
    for (const at of [0, 1.5, 3]) N('tuba', tb, at, 1.1, { vel: at === 0 ? 0.75 : 0.6, att: 0.01, rel: 0.12 });
    // Trombones punch the chord on the 3+3+2 accents (sustained in the second theme).
    const tbn = voiced(ch, 50, 2);
    if (sec === 'B') pad('trombone', tbn, 0, 4, 0.5, { att: 0.08, rel: 0.4 });
    else for (const at of [0, 1.5]) pad('trombone', tbn, at, 0.7, 0.6, { att: 0.01, rel: 0.12 });
  }

  // ---- Drums: snare, bass drum, cymbals ----
  if (fight) {
    for (const at of [1, 3]) H('snare', 's', at, { vel: fin ? 0.6 : 0.5, pan: -0.15 });
    for (const at of [0.5, 1.75, 2.5, 3.25, 3.5]) H('snare', 'tap', at, { vel: rnd(0.15, 0.25), pan: -0.15 });
    for (const at of [0, 1.5, 3]) H('kick', 'k', at, { vel: 0.3 });
    if (i === 0) H('clash', 'crash', 0, { vel: fin ? 0.55 : 0.42, pan: 0.35 });
    if (i === 4) H('suscym', 'hit', 0, { vel: 0.3, pan: 0.35 });
    if (lastOfSec) {
      snareRoll(2, 0.15, 0.6);
      swell(fin ? 0.5 : 0.4);
    }
  } else {
    // Phase 1: a soft snare roll and a cymbal swell lead into every section.
    if (lastOfSec) {
      snareRoll(2, 0.08, 0.38);
      swell(0.3);
    }
    if (i === 0) H('suscym', 'hit', 0, { vel: 0.18, pan: 0.35 });
  }

  // ---- Pads: choir, organ ----
  const choirLo = fin ? 60 : fight ? 57 : 53;
  pad('choir', voiced(ch, choirLo), 0, 4, fin ? 0.62 : fight ? 0.5 : 0.4, { att: fight ? 0.15 : 0.6, rel: 1 });
  if (!fight) N('organ', bass, 0, 4, { vel: 0.38, att: 0.3, rel: 1, lp: 1200 }, 0);
  if (fin) {
    pad('organ', [bass, ...voiced(ch, 55)], 0, 4, 0.36, { att: 0.05, rel: 0.8 });
    if (i % 2 === 0) N('tubbells', inOct(ch.b, 62), 0, 3, { vel: 0.5 });
  }

  // ---- The Queen theme and its companions ----
  if (sec === 'A' || sec === 'A2') {
    if (!fight) {
      // Phase 1: horns carry the theme, cellos an octave below in the second phrase.
      melody(theme, i, 'horn', -12, 0.55);
      if (i >= 4) melody(theme, i, 'cello', -24, 0.45);
    } else {
      const line = sec === 'A' ? FANFARE : theme;
      melody(line, i, 'trumpet', 0, fin ? 0.72 : 0.65, {}, 0.9);
      melody(line, i, 'horn', -12, fin ? 0.68 : 0.6, {}, 0.92);
      if (fin) {
        // Final phase: the choir sings the theme fortissimo, strings soar an octave above.
        melody(line, i, 'choir', 0, 0.78, { att: 0.04, rel: 0.4 });
      } else if (sec === 'A2') {
        melody(COUNTER, i, 'trombone', 0, 0.45, { att: 0.08 });
      }
    }
  } else if (sec === 'B') {
    if (!fight) {
      melody(SECOND, i, 'strings', 0, 0.5, { att: 0.1, rel: 0.5 });
      if (i % 4 === 3) melody(SECOND, i, 'horn', -12, 0.45);
    } else {
      // The second theme in the horns, strings an octave above; the finale adds the choir.
      melody(SECOND, i, 'horn', -12, 0.62);
      melody(SECOND, i, fin ? 'trumpet' : 'strings', 0, fin ? 0.6 : 0.52, { att: 0.04 });
      if (fin) melody(SECOND, i, 'choir', -12, 0.7, { att: 0.05 });
    }
  } else {
    // The gates: the theme's head tolled on the bells against Eb over the D pedal.
    if (i % 2 === 0) for (const [at, nm] of GATE_BELLS[(i / 2 + cycle) % 3]) N('tubbells', n(nm), at, 3, { vel: fight ? 0.6 : 0.48, pan: 0.5 });
    if (i === 0) H('gong', 'g', 0, { vel: fight ? 0.6 : 0.45, pan: -0.2 });
    if (fight) {
      // Brass answer the bells with the theme's knock, one gate after another.
      const knock = voiced(ch, 62, 3);
      if (i % 2 === 1) for (const [at, d] of [[0, 0.75], [0.75, 0.25], [1, 1.5]] as const) pad('horn', knock.map((m) => m - 12), at, d * 0.9, 0.6, { att: 0.01, rel: 0.15 });
      if (fin && i % 2 === 1) for (const [at, d] of [[0, 0.75], [0.75, 0.25], [1, 1.5]] as const) N('trumpet', knock[2], at, d * 0.9, { vel: 0.62, att: 0.01, rel: 0.15 });
      if (i >= 6) N('timproll', timp, 0, 4, { vel: 0.55, att: 3.2 * c.spb, rel: 0.2 });
    } else if (i % 2 === 1) {
      melody(THEME, i % 4 === 1 ? 0 : 2, 'horn', -12, 0.45, { lp: 2000 });
    }
  }
  // Harmony change into the next bar is foreshadowed by a single high string note in phase 1.
  if (!fight && i % 4 === 3 && sec !== 'B') N('strings', inOct(next.t[1], 69), 2, 2, { vel: 0.3, att: 0.4, rel: 0.6, pan: 0.4 });
}

/** The bar after a phase change: an impact going up, a fall into calm going down, a gong at the start. */
function leadIn(
  c: BeatCtx,
  st: St,
  N: (inst: InstId, midi: number, at: number, beats: number, o?: NoteOpts, h?: number) => void,
  H: (kit: InstId, art: string, at: number, o?: NoteOpts, h?: number) => void,
  pad: (inst: InstId, notes: number[], at: number, beats: number, vel: number, o?: NoteOpts) => void,
  snareRoll: (from: number, v0: number, v1: number) => void,
  swell: (vel: number) => void,
) {
  const p = st.phase;
  const up = p > st.from;
  if (p <= 0) {
    // The hall: a gong in the dark, the organ pedal and the choir breathe in.
    H('gong', 'g', 0, { vel: 0.4, pan: -0.2 });
    N('organ', 38, 0, 4, { vel: 0.5, att: 1.2, rel: 1.2, lp: 1400 }, 0);
    pad('choir', [57, 62, 65], 0.5, 3.5, 0.32, { att: 1.5, rel: 1 });
    N('timpani', 50, 0, 2, { vel: 0.45 });
    return;
  }
  if (p === 1) {
    // Tension arrives: kettle strokes and the strings start their tremolo on D.
    for (const at of [0, 2, 3]) N('timpani', at === 3 ? 45 : 50, at, 1, { vel: at === 0 ? 0.7 : 0.45 });
    for (let k = 0; k < 8; k++) N('strings', k % 2 ? 57 : 50, k / 2, 0.42, { vel: 0.3 + k * 0.03, att: 0.01, rel: 0.06 }, 3);
    N('organ', 38, 0, 4, { vel: 0.4, att: 0.3, rel: 1, lp: 1200 }, 0);
    pad('choir', [53, 57, 62], 0, 4, 0.38, { att: 0.8 });
    swell(0.32);
    return;
  }
  // The fight (2/3): a full Dm hit, then the kettles roll and the snare drives into the theme.
  const v = p >= 3 ? 0.8 : 0.7;
  pad('trumpet', [62, 65, 69], 0, 1.2, v, { att: 0.01, rel: 0.3 });
  pad('horn', [50, 53, 57], 0, 1.5, v, { att: 0.01, rel: 0.3 });
  pad('trombone', [38, 45, 50], 0, 1.5, v, { att: 0.01, rel: 0.3 });
  N('tuba', 38, 0, 1.5, { vel: v, att: 0.01, rel: 0.3 });
  N('timpani', 50, 0, 1, { vel: 0.95 });
  H(up ? 'clash' : 'suscym', up ? 'crash' : 'hit', 0, { vel: 0.5, pan: 0.35 });
  if (up) H('gong', 'g', 0, { vel: 0.55, pan: -0.25 });
  pad('choir', p >= 3 ? [62, 65, 69] : [57, 62, 65], 0, 4, p >= 3 ? 0.65 : 0.5, { att: 0.05, rel: 0.8 });
  N('timproll', 45, 1.5, 2.5, { vel: 0.6, att: 2 * c.spb, rel: 0.2 });
  snareRoll(2, 0.12, 0.6);
  swell(0.45);
}

export const throne: Mood = {
  instruments: ['organ', 'organq', 'choir', 'strings', 'cello', 'horn', 'trombone', 'tuba', 'trumpet', 'timpani', 'timproll', 'tubbells', 'gong', 'suscym', 'clash', 'snare', 'kick'],
  // 80 bpm in the hall, 84 when the tension rises, 94 in the fight, 104 in the final phase.
  bpm: (s) => [80, 84, 94, 104][Math.max(0, Math.min(3, s.intensity))],
  play,
};
