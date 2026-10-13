// Floor 3 "Uhrwerk": a brass-and-gears clock hall. A little baroque concerto played by the
// machine itself: harpsichord and xylophone trade a busy "tick-tock" theme, marimba turns the
// gears (broken-chord ostinato), pizzicato strings walk the bass, a cello sings the middle
// section, a woodblock is the pendulum and a ratchet winds the spring between sections.
// Form of one pass (44 bars): A (theme) · A' (xylophone, harpsichord Alberti figures) ·
// B (relative major, cello song, music box) · development (circle of fifths, canon) ·
// A'' (tutti) · break (clock alone, music box, wind-up). Three passes in D, G and A minor,
// each break ending on the dominant of the next key, ≈ 5 minutes before the form repeats.

import { n } from '../sampler';
import type { InstId } from '../voices';
import { chord, nearest, type Chord } from './jazz';
import { hum, pick, rnd, type BeatCtx, type Mood } from './types';

type Ev = [number, string, number];

// ---- The written material (in D minor; every pass transposes it) ----

const A_CH = [['Dm'], ['A7'], ['Dm'], ['Gm', 'C7'], ['F'], ['Bb', 'Gm'], ['Em7b5', 'A7'], ['Dm']];
/** The theme: a two-note "tick" (repeated pitch, then a leap) answered by a 16th-note turn. */
const A_MEL: Ev[][] = [
  [[0, 'D5', 0.5], [0.5, 'A4', 0.5], [1, 'D5', 0.25], [1.25, 'E5', 0.25], [1.5, 'F5', 0.5], [2, 'E5', 0.5], [2.5, 'D5', 0.5], [3, 'C#5', 0.5], [3.5, 'A4', 0.5]],
  [[0, 'E5', 0.5], [0.5, 'A4', 0.5], [1, 'E5', 0.25], [1.25, 'F5', 0.25], [1.5, 'G5', 0.5], [2, 'F5', 0.5], [2.5, 'E5', 0.5], [3, 'D5', 0.5], [3.5, 'C#5', 0.5]],
  [[0, 'D5', 0.5], [0.5, 'F5', 0.5], [1, 'A5', 1], [2, 'G5', 0.25], [2.25, 'F5', 0.25], [2.5, 'E5', 0.25], [2.75, 'D5', 0.25], [3, 'C#5', 0.5], [3.5, 'D5', 0.5]],
  [[0, 'Bb4', 0.5], [0.5, 'D5', 0.5], [1, 'G5', 0.5], [1.5, 'Bb4', 0.5], [2, 'C5', 0.5], [2.5, 'E5', 0.5], [3, 'G5', 0.5], [3.5, 'Bb5', 0.5]],
  [[0, 'A5', 1], [1, 'F5', 0.5], [1.5, 'C5', 0.5], [2, 'A4', 0.5], [2.5, 'C5', 0.5], [3, 'F5', 0.5], [3.5, 'A5', 0.5]],
  [[0, 'Bb5', 0.5], [0.5, 'A5', 0.25], [0.75, 'G5', 0.25], [1, 'F5', 0.5], [1.5, 'D5', 0.5], [2, 'G5', 0.5], [2.5, 'F5', 0.25], [2.75, 'E5', 0.25], [3, 'D5', 0.5], [3.5, 'Bb4', 0.5]],
  [[0, 'G4', 0.5], [0.5, 'Bb4', 0.5], [1, 'E5', 0.5], [1.5, 'G5', 0.5], [2, 'F5', 0.5], [2.5, 'E5', 0.5], [3, 'C#5', 0.5], [3.5, 'E5', 0.5]],
  [[0, 'D5', 1.5], [1.5, 'A4', 0.5], [2, 'D4', 1]],
];

const B_CH = [['F'], ['C7'], ['Dm'], ['A7'], ['Bb'], ['F'], ['Gm', 'C7'], ['F', 'A7']];
/** The middle section: a singing cello line in the relative major. */
const B_MEL: Ev[][] = [
  [[0, 'C4', 1], [1, 'F4', 1.5], [2.5, 'E4', 0.5], [3, 'F4', 1]],
  [[0, 'G4', 2], [2, 'E4', 1], [3, 'C4', 1]],
  [[0, 'D4', 1], [1, 'F4', 1], [2, 'A4', 1.5], [3.5, 'G4', 0.5]],
  [[0, 'E4', 3], [3, 'C#4', 1]],
  [[0, 'Bb3', 1], [1, 'D4', 1], [2, 'F4', 2]],
  [[0, 'A4', 1], [1, 'G4', 1], [2, 'F4', 1], [3, 'C4', 1]],
  [[0, 'D4', 1], [1, 'Bb3', 1], [2, 'C4', 1], [3, 'E4', 1]],
  [[0, 'F4', 2], [2, 'E4', 1], [3, 'C#4', 1]],
];

/** Development: a falling circle of fifths, then two bars of dominant to wind back up. */
const DEV_CH = [['Dm'], ['Gm'], ['C7'], ['F'], ['Bb'], ['Em7b5'], ['A7'], ['A7']];
/** The sequenced gear motif, as steps on a ladder of chord tones (0 = root). */
const GEAR: [number, number, number][] = [[0, 0, 0.25], [0.25, 1, 0.25], [0.5, 2, 0.25], [0.75, 3, 0.25], [1, 4, 0.5], [1.5, 3, 0.5], [2, 2, 0.5], [2.5, 1, 0.25], [2.75, 2, 0.25], [3, 0, 1]];

/** Break: the clock alone; the last bar becomes the dominant of the next key. */
const BRK_CH = [['Dm'], ['Dm'], ['Gm'], ['A7']];

type Sec = 'A' | 'A2' | 'B' | 'DEV' | 'A3' | 'BRK';
const FORM: [Sec, number][] = [['A', 8], ['A2', 8], ['B', 8], ['DEV', 8], ['A3', 8], ['BRK', 4]];
const PASS = FORM.reduce((a, [, l]) => a + l, 0);
/** Key of each pass, in semitones from D minor: D, G, A minor. */
const KEYS = [0, -7, -5];
const INTRO = 4;

const MIX: Partial<Record<InstId, number>> = { harpsi: 0.62, xylo: 0.42, marimba: 0.5, pizz: 0.95, cello: 0.42, musicbox: 0.42, tuba: 0.55, tubbells: 0.3 };
const PAN: Partial<Record<InstId, number>> = { harpsi: -0.3, xylo: 0.35, marimba: 0.2, pizz: -0.05, cello: 0.1, musicbox: 0.4, tuba: -0.1, tubbells: 0 };

/** Overall level of the piece (balanced with tools/sounds/render.mjs). */
const LEVEL = 1.5;

const tr = (c: Chord, k: number): Chord => ({ ...c, root: (c.root + k + 120) % 12 });

/** Chord-tone ladder from the chord's root at or above `lo` (triad, then up an octave). */
function ladder(c: Chord, lo: number): number[] {
  const r = lo + ((c.root - lo) % 12 + 12) % 12;
  const t = c.tones.slice(0, 3);
  return [...t, ...t.map((x) => x + 12), ...t.map((x) => x + 24)].map((x) => r + x);
}

function where(bar: number): { sec: Sec; i: number; pass: number } {
  if (bar < INTRO) return { sec: 'BRK', i: bar, pass: -1 };
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
  const { sec, i, pass } = where(c.bar);
  const key = pass < 0 ? 0 : KEYS[pass % KEYS.length];
  const nextKey = KEYS[(pass + 1) % KEYS.length];
  const at = (pos: number) => c.d + pos * spb + hum(5);
  const play = (id: InstId, m: number, pos: number, len: number, vel: number, o: { pan?: number; gain?: number; rel?: number } = {}) =>
    v.note(id, m, at(pos), out, { vel: vel + rnd(-0.04, 0.04), dur: len * spb, rel: o.rel ?? 0.25, gain: (MIX[id] ?? 0.5) * (o.gain ?? 1) * LEVEL, pan: o.pan ?? PAN[id] });

  // Chords of this bar (the break's last bar is the dominant of the coming key).
  const table = sec === 'B' ? B_CH : sec === 'DEV' ? DEV_CH : sec === 'BRK' ? BRK_CH : A_CH;
  const syms = table[i];
  const chords = syms.map((s, k) => tr(chord(s), sec === 'BRK' && i === 3 && k === 0 ? nextKey : key));
  const span = syms.length === 2 ? 2 : 4;
  const tick = (sec === 'A3' || sec === 'DEV') ? 1 : 0.8;

  // ---- The clock: pendulum tick-tock on the woodblock, a light escapement on the offbeats ----
  for (let b = 0; b < 4; b++) v.hit('woodblock', b % 2 ? 'w' : 'hi', at(b), out, { vel: (b % 2 ? 0.2 : 0.26) * tick, pan: b % 2 ? 0.45 : -0.45, cents: rnd(-15, 15) });
  if (sec === 'A3' || sec === 'DEV') for (const p of [0.5, 1.5, 2.5, 3.5]) v.hit('claves', 'c', at(p), out, { vel: 0.1, pan: 0.6 });
  // Winding the spring before a new section.
  if ((sec === 'DEV' && i === 7) || (sec === 'BRK' && i === 3)) v.hit('ratchet', pick(['crank', 'slow']), at(2), out, { vel: 0.35, pan: 0.25 });
  // The hall clock strikes at the top of a section, now and then.
  if (i === 0 && sec !== 'A2' && Math.random() < 0.8) {
    const bell = nearest(chords[0].root, 66);
    v.note('tubbells', bell < 60 ? bell + 12 : bell, at(0), out, { vel: 0.55, gain: MIX.tubbells, pan: PAN.tubbells });
  }

  // ---- Bass: pizzicato quarters (root, fifth, octave, fifth), cello / tuba underneath ----
  const bassRoot = (cd: Chord) => {
    let r = 38 + ((cd.root - 38) % 12 + 12) % 12; // D2..C#3
    if (r > 45) r -= 12;
    return r;
  };
  chords.forEach((cd, k) => {
    const r = bassRoot(cd);
    const five = r + cd.tones[2];
    const pat = span === 4 ? [r, five, r + 12, five] : [r, five];
    if (sec === 'BRK' && i < 3) return;
    pat.forEach((m, q) => play('pizz', m, k * span + q, 0.5, q === 0 ? 0.75 : 0.6));
    if (sec === 'A3' || (sec === 'A2' && i % 2 === 0)) play('cello', bassRoot(cd), k * span, span * 0.95, 0.55, { rel: 0.3 });
    if (sec === 'DEV' && i < 6) play('tuba', bassRoot(cd), k * span, 0.9, 0.6);
  });
  if (sec === 'DEV' && i >= 6) for (let q = 0; q < 8; q++) play('cello', bassRoot(chords[0]) + 12, q / 2, 0.45, q % 2 ? 0.45 : 0.6);
  if (sec === 'BRK') play('cello', bassRoot(chords[0]) + 12, 0, 3.9, 0.45, { rel: 0.5 });

  // ---- Gears: marimba broken-chord ostinato in eighths ----
  if (sec === 'A' || sec === 'A3' || sec === 'B' || (sec === 'DEV' && i < 6)) {
    chords.forEach((cd, k) => {
      const l = ladder(cd, 55);
      const shape = sec === 'B' ? [0, 2, 1, 2] : pass % 2 ? [0, 1, 2, 1] : [0, 2, 1, 2];
      for (let q = 0; q < span * 2; q++) play('marimba', l[shape[q % 4]], k * span + q / 2, 0.45, q % 2 ? 0.42 : 0.55);
    });
  }

  // ---- Harpsichord Alberti figures in sixteenths (under the xylophone, and in the B section) ----
  if (sec === 'A2' || sec === 'B') {
    chords.forEach((cd, k) => {
      const l = ladder(cd, sec === 'B' ? 60 : 55);
      const fig = [0, 2, 1, 2];
      for (let q = 0; q < span * 4; q++) play('harpsi', l[fig[q % 4]] + (sec === 'B' ? 0 : 0), k * span + q / 4, 0.22, q % 4 === 0 ? 0.5 : 0.38, { gain: 0.7 });
    });
  }

  // ---- Melody ----
  const mel = (id: InstId, ev: Ev[], shift = 0, vel = 0.66, o: { gain?: number; pan?: number } = {}) => {
    for (const [p, nm, len] of ev) play(id, n(nm) + key + shift, p, len * 0.9, vel + (len < 0.5 ? -0.06 : 0), o);
  };
  // Who leads the theme changes every pass so the A sections never sound the same twice.
  const leadA: InstId = (['harpsi', 'marimba', 'harpsi'] as InstId[])[Math.max(0, pass) % 3];
  const leadA2: InstId = (['xylo', 'harpsi', 'xylo'] as InstId[])[Math.max(0, pass) % 3];
  if (sec === 'A') {
    mel(leadA, A_MEL[i], 0, 0.68);
    if (pass === 2) mel('musicbox', A_MEL[i], 12, 0.4, { gain: 0.8 });
  } else if (sec === 'A2') {
    mel(leadA2, A_MEL[i], 0, 0.66);
    // A second voice answers in thirds below in the last half.
    if (i >= 4) mel(leadA2 === 'xylo' ? 'marimba' : 'xylo', A_MEL[i], -12, 0.5, { gain: 0.8 });
  } else if (sec === 'A3') {
    mel('harpsi', A_MEL[i], 0, 0.72);
    mel('xylo', A_MEL[i], 0, 0.5, { gain: 0.85 });
    if (i === 7) mel('musicbox', [[2.5, 'A5', 0.5], [3, 'D6', 1]], 0, 0.45);
  } else if (sec === 'B') {
    mel('cello', B_MEL[i], 0, 0.62, { gain: 1.25 });
    // Music box countermelody: two chime-like chord tones per bar, high above.
    chords.forEach((cd, k) => {
      const l = ladder(cd, 79);
      play('musicbox', l[k ? 1 : 2], k * span + 1.5, 1, 0.45);
      if (span === 4) play('musicbox', l[pick([0, 1, 3])], 3, 1, 0.38);
    });
  } else if (sec === 'DEV') {
    const cd = chords[0];
    if (i < 6) {
      // Canon: harpsichord states the gear motif, marimba answers two beats later an octave down.
      const l = ladder(cd, 62);
      for (const [p, s, len] of GEAR) play('harpsi', l[s], p, len * 0.9, len < 0.5 ? 0.55 : 0.65);
      for (const [p, s, len] of GEAR) if (p < 2) play('xylo', l[s], p + 2, len * 0.9, 0.45, { gain: 0.8 });
    } else if (i === 6) {
      // Rising arpeggio over two octaves on the dominant.
      const l = ladder(cd, 57);
      for (let q = 0; q < 16; q++) play('harpsi', l[Math.min(l.length - 1, Math.floor(q / 2) + (q % 2))], q / 4, 0.22, 0.45 + q * 0.015);
    } else {
      // Spring released: a falling scale on the xylophone into the return of the theme.
      const top = n('A5') + key;
      // A G F E D C# Bb A (harmonic minor, down an octave).
      [0, -2, -4, -5, -7, -8, -11, -12].forEach((s, q) => play('xylo', top + s, q / 2, 0.45, 0.6 - q * 0.02));
    }
  } else if (sec === 'BRK') {
    // The music box plays the theme's opening alone, slowly, like a clock tune.
    if (i === 0 || i === 1) for (const [p, nm, len] of A_MEL[i].filter(([p]) => p % 1 === 0 || p === 0.5)) play('musicbox', n(nm) + key + 12, p, len, 0.48);
    if (i === 2) play('musicbox', n('D6') + key, 0, 2, 0.45);
    if (i === 3) {
      const l = ladder(chords[0], 60);
      v.chord('harpsi', [l[0], l[1], l[2], l[3]], at(0), out, { vel: 0.55, dur: spb * 3.5, rel: 0.4, gain: MIX.harpsi, pan: PAN.harpsi }, 0.03);
    }
  }
}

export const clockwork: Mood = {
  instruments: ['harpsi', 'xylo', 'marimba', 'pizz', 'cello', 'musicbox', 'tuba', 'tubbells', 'woodblock', 'claves', 'ratchet'],
  bpm: () => 106,
  play(c) {
    if (c.b !== 0) return;
    playBar(c);
  },
};
