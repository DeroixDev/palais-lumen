// "Kristallsalon": a slow, glittering salon waltz under chandeliers. Harp plays the waltz
// (bass on one, chord on two and three), a warm string pad breathes underneath, the celesta
// sings the tune, glockenspiel and toy glockenspiel catch the light, wine glasses ring
// sustained chord tones and a triangle marks the phrases.
// Form of one pass (56 bars of 3/4): A (celesta, 16) · B (strings sing, harp arpeggios, 16) ·
// A' (glockenspiel + celesta in octaves, toy-glock sparkle, 16) · interlude (wine glasses and
// harp, 8, ending on the dominant of the next key). Passes in Eb, F and C major ≈ 6½ minutes
// before the form repeats.

import { n } from '../sampler';
import type { InstId } from '../voices';
import { chord, voice, type Chord } from './jazz';
import { hum, pick, rnd, type BeatCtx, type Mood } from './types';

type Ev = [number, string, number];

// ---- The written material (in Eb major; every pass transposes it) ----

const A_CH = ['Eb', 'Cm7', 'Fm7', 'Bb7', 'Gm7', 'C7', 'Fm7', 'Bb7', 'Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Abmaj7', 'Abm6', 'Ebmaj7', 'Ebmaj7'];
/** The waltz tune: a rising arpeggio that floats up to a long note, then falls in steps. */
const A_MEL: Ev[][] = [
  [[0, 'Bb4', 1], [1, 'Eb5', 1], [2, 'G5', 1]],
  [[0, 'Bb5', 2], [2, 'G5', 1]],
  [[0, 'Ab5', 1.5], [1.5, 'G5', 0.5], [2, 'F5', 1]],
  [[0, 'D5', 2], [2, 'F5', 1]],
  [[0, 'Bb4', 1], [1, 'D5', 1], [2, 'F5', 1]],
  [[0, 'G5', 2], [2, 'E5', 1]],
  [[0, 'Ab5', 1], [1, 'G5', 1], [2, 'F5', 1]],
  [[0, 'F5', 2], [2, 'D5', 1]],
  [[0, 'Bb4', 1], [1, 'Eb5', 1], [2, 'G5', 1]],
  [[0, 'C6', 2], [2, 'Bb5', 1]],
  [[0, 'Ab5', 1.5], [1.5, 'G5', 0.5], [2, 'F5', 1]],
  [[0, 'D5', 1], [1, 'Eb5', 1], [2, 'F5', 1]],
  [[0, 'G5', 2], [2, 'C6', 1]],
  [[0, 'Bb5', 1.5], [1.5, 'Ab5', 0.5], [2, 'F5', 1]],
  [[0, 'G5', 3]],
  [],
];

const B_CH = ['Abmaj7', 'Bb7', 'Gm7', 'Cm7', 'Fm7', 'Bb7', 'Ebmaj7', 'C7', 'Fm7', 'Ddim7', 'Ebmaj7', 'Cm7', 'Fm7', 'Bb7', 'Eb', 'Bb7'];
/** The middle section: a long-breathed string melody. */
const B_MEL: Ev[][] = [
  [[0, 'C5', 3]],
  [[0, 'D5', 2], [2, 'Eb5', 1]],
  [[0, 'F5', 3]],
  [[0, 'Eb5', 2], [2, 'G5', 1]],
  [[0, 'Ab5', 2], [2, 'G5', 1]],
  [[0, 'F5', 2], [2, 'D5', 1]],
  [[0, 'Eb5', 3]],
  [[0, 'E5', 2], [2, 'G5', 1]],
  [[0, 'Ab5', 3]],
  [[0, 'Ab5', 1], [1, 'F5', 1], [2, 'D5', 1]],
  [[0, 'G5', 2], [2, 'Bb5', 1]],
  [[0, 'Bb5', 1.5], [1.5, 'Ab5', 0.5], [2, 'G5', 1]],
  [[0, 'Ab5', 2], [2, 'C5', 1]],
  [[0, 'D5', 2], [2, 'F5', 1]],
  [[0, 'Eb5', 3]],
  [],
];

/** Interlude: the chandelier turns; its last bar is the dominant of the next key. */
const I_CH = ['Abmaj7', 'Abm6', 'Ebmaj7', 'Cm7', 'Fm7', 'Abm6', 'Ebmaj7', 'Bb7'];

type Sec = 'A' | 'B' | 'A2' | 'INT';
const FORM: [Sec, number][] = [['A', 16], ['B', 16], ['A2', 16], ['INT', 8]];
const PASS = FORM.reduce((a, [, l]) => a + l, 0);
/** Key of each pass, in semitones from Eb major: Eb, F, C. */
const KEYS = [0, 2, -3];
const INTRO = 4;

const MIX: Partial<Record<InstId, number>> = { harp: 0.62, strings: 0.24, celesta: 0.85, glock: 0.5, tglock: 0.42, wine: 0.3 };
const PAN: Partial<Record<InstId, number>> = { harp: -0.35, strings: 0, celesta: 0.25, glock: 0.35, tglock: 0.55, wine: -0.5 };
/** Overall level of the piece (balanced with tools/sounds/render.mjs). */
const LEVEL = 1.7;

const tr = (c: Chord, k: number): Chord => ({ ...c, root: (c.root + k + 120) % 12 });
/** Midi notes of the chord's pitch classes inside lo..hi. */
const tonesIn = (c: Chord, lo: number, hi: number) => {
  const pcs = c.tones.map((x) => (c.root + x) % 12);
  const out: number[] = [];
  for (let m = lo; m <= hi; m++) if (pcs.includes(m % 12)) out.push(m);
  return out;
};

/** Per-output memory (the crossfade gives every visit a fresh output). */
const pads = new WeakMap<AudioNode, { centre: number }>();

function where(bar: number): { sec: Sec | 'INTRO'; i: number; pass: number } {
  if (bar < INTRO) return { sec: 'INTRO', i: bar, pass: -1 };
  const p = bar - INTRO;
  let i = p % PASS;
  const pass = Math.floor(p / PASS);
  for (const [sec, len] of FORM) {
    if (i < len) return { sec, i, pass };
    i -= len;
  }
  return { sec: 'A', i: 0, pass };
}

function playBar(c: BeatCtx) {
  const { v, out, spb } = c;
  let st = pads.get(out);
  if (!st) pads.set(out, (st = { centre: 62 }));
  const { sec, i, pass } = where(c.bar);
  const key = pass < 0 ? 0 : KEYS[pass % KEYS.length];
  const nextKey = KEYS[(pass + 1) % KEYS.length];
  // Viennese lilt: the second beat comes a touch early, the third settles.
  const lilt = [0, -0.06, 0.02];
  const at = (pos: number) => c.d + (pos + (Number.isInteger(pos) ? lilt[pos % 3] : 0)) * spb + hum(7);
  const play = (id: InstId, m: number, pos: number, len: number, vel: number, o: { pan?: number; gain?: number; rel?: number; att?: number } = {}) =>
    v.note(id, m, at(pos), out, { vel: vel + rnd(-0.04, 0.04), dur: len * spb, rel: o.rel ?? 0.8, att: o.att, gain: (MIX[id] ?? 0.5) * (o.gain ?? 1) * LEVEL, pan: o.pan ?? PAN[id] });

  const sym = sec === 'INTRO' ? ['Ebmaj7', 'Abmaj7', 'Ebmaj7', 'Bb7'][i] : sec === 'B' ? B_CH[i] : sec === 'INT' ? I_CH[i] : A_CH[i];
  const cd = tr(chord(sym), sec === 'INT' && i === 7 ? nextKey : key);
  // Phrase shape: swell into the middle of each 4-bar phrase, relax at its end.
  const swell = [0.9, 1, 1.05, 0.92][i % 4];

  // ---- Harp waltz: low root on one, a chord on two and three ----
  let root = 39 + ((cd.root - 39) % 12 + 12) % 12; // Eb2..D3
  if (root > 46) root -= 12;
  const upper = voice(cd, st.centre, 55, 72).slice(0, 3);
  st.centre = upper.reduce((a, b) => a + b, 0) / upper.length;
  if (sec === 'INTRO' || sec === 'INT') {
    // Rolled arpeggio rising over two octaves across the bar.
    const arp = tonesIn(cd, root + 12, root + 36).slice(0, 9);
    arp.forEach((m, k) => play('harp', m, (k * 3) / arp.length, 2.5, 0.42 + k * 0.02));
    play('harp', root, 0, 3, 0.55);
  } else {
    play('harp', root, 0, 3, 0.7 * swell);
    if (i % 4 === 1 && pick([true, false])) play('harp', root + 7, 0, 1, 0.4);
    v.chord('harp', upper, at(1), out, { vel: 0.38, dur: spb, rel: 0.6, gain: MIX.harp! * LEVEL, pan: PAN.harp }, 0.012);
    v.chord('harp', upper, at(2), out, { vel: 0.34, dur: spb, rel: 0.6, gain: MIX.harp! * LEVEL, pan: PAN.harp }, 0.012);
  }

  // ---- Warm string pad: a held voicing per bar, softer while the strings sing in B ----
  const padV = voice(cd, st.centre, 52, 70);
  if (sec !== 'INTRO' || i >= 2) v.chord('strings', [root, root + 12, ...padV.slice(0, 3)], at(0), out, { vel: (sec === 'B' ? 0.32 : 0.4) * swell, dur: spb * 3.05, att: 0.25, rel: 0.6, gain: MIX.strings! * LEVEL, pan: 0 });

  // ---- Melody ----
  const mel = (id: InstId, ev: Ev[], shift: number, vel: number, o: { gain?: number; pan?: number; rel?: number; att?: number } = {}) => {
    for (const [p, nm, len] of ev) play(id, n(nm) + key + shift, p, len, vel * swell + (p === 0 ? 0.04 : 0), o);
  };
  if (sec === 'A') {
    mel('celesta', A_MEL[i], 0, 0.64);
    // A glint of the toy glockenspiel when the tune holds a long note.
    for (const [p, , len] of A_MEL[i]) if (len >= 2 && Math.random() < 0.4) {
      const sp = tonesIn(cd, 79, 93);
      if (sp.length) play('tglock', pick(sp), p + 1.5, 0.5, 0.32);
    }
    // Second pass onward: the harp shadows the tune an octave down.
    if (pass > 0) mel('harp', A_MEL[i], -12, 0.34, { pan: -0.15 });
  } else if (sec === 'B') {
    mel('strings', B_MEL[i], 0, 0.55, { att: 0.12, rel: 0.5, gain: 1.6, pan: 0.15 });
    // The celesta answers each long note with a little descending figure.
    if (i % 2 === 1) tonesIn(cd, 76, 91).reverse().slice(0, 3).forEach((m, k) => play('celesta', m, 1 + k * 0.5, 0.6, 0.38 - k * 0.05));
  } else if (sec === 'A2') {
    mel('glock', A_MEL[i], 0, 0.55);
    mel('celesta', A_MEL[i], -12, 0.5);
    // Toy glockenspiel sparkle on the long notes.
    for (const [p, , len] of A_MEL[i]) if (len >= 2 && Math.random() < 0.7) {
      const sp = tonesIn(cd, 79, 93);
      if (sp.length) play('tglock', pick(sp), p + 1.5, 0.5, 0.4);
    }
  } else if (sec === 'INT') {
    // The celesta remembers the opening of the tune, slowly.
    if (i === 0) mel('celesta', [[0, 'G5', 3]], 0, 0.5);
    if (i === 2) mel('celesta', [[0, 'Bb4', 1], [1, 'Eb5', 1], [2, 'G5', 1]], 0, 0.5);
    if (i === 3) mel('celesta', [[0, 'Bb5', 3]], 0, 0.48);
  }

  // ---- Wine glasses: a sustained ringing chord tone over two bars, from time to time ----
  const wineOn = sec === 'INTRO' || sec === 'INT' || (sec === 'B' && i % 4 === 0) || (sec === 'A' && pass > 0 && i % 8 === 4);
  if (wineOn && i % 2 === 0) {
    const g = tonesIn(cd, 75, 86);
    if (g.length) play('wine', pick(g), 0, 5.5, 0.5, { att: 1.2, rel: 1.5 });
  }

  // ---- Triangle marks every phrase; the glockenspiel adds a chime on the top of the form ----
  if (sec !== 'INTRO' && i % 4 === 0) v.hit('triangle', i % 8 === 0 ? 'hit' : 'mute', at(0), out, { vel: i % 8 === 0 ? 0.3 : 0.2, pan: 0.5 });
  if (sec === 'A' && i === 0) {
    const g = tonesIn(cd, 79, 91);
    g.slice(-3).forEach((m, k) => play('glock', m, k * 0.33, 1, 0.42));
  }
}

export const crystal: Mood = {
  instruments: ['harp', 'strings', 'celesta', 'glock', 'tglock', 'wine', 'triangle'],
  bpm: () => 78,
  beatsPerBar: 3,
  play(c) {
    if (c.b !== 0) return;
    playBar(c);
  },
};
