// Music for Unser Uno Spiel, composed in code and played on the casino's recorded instruments.
// "Neon Party": a funky pop groove in A minor, 112 BPM, 16-bar form (8 bars groove, 8 bars with
// the marimba hook, a drum fill into the top). The lobby plays a soft cut (keys, bass, shaker);
// the table plays the full band. Nothing sounds until the instruments are loaded.

import type { InstId } from '../audio/sampler';
import { audio, loadFx, whenAudio } from './sfx';

type Scene = 'lobby' | 'table' | null;

const BPM = 112;
const STEP = 60 / BPM / 4; // a 16th
const SWING = 0.12; // late off-16ths, a little
const LOOKAHEAD = 0.18;

// Fmaj7  G6  Em7  Am7, one bar each; second half of the form swaps the last bar to Dm9 -> E7 lift
const CHORDS: number[][] = [
  [53, 57, 60, 64],
  [55, 59, 62, 64],
  [52, 55, 59, 62],
  [57, 60, 64, 67],
];
const LIFT: number[][] = [[50, 53, 57, 60, 64], [52, 56, 59, 62]];
const ROOTS = [29, 31, 28, 33];
// bass: step -> interval above the root (12 = octave, 7 = fifth, -1/-2 = approach to the next root)
const BASS: [number, number, number][] = [[0, 0, 0.9], [3, 0, 0.6], [6, 7, 0.7], [8, 0, 0.85], [10, 12, 0.7], [11, 10, 0.5], [14, -2, 0.6]];
// marimba hook over four bars: [bar, step, midi, length in steps]
const HOOK: [number, number, number, number][] = [
  [0, 0, 69, 2], [0, 3, 72, 2], [0, 6, 76, 4], [0, 12, 74, 2], [0, 14, 72, 2],
  [1, 0, 71, 3], [1, 4, 74, 2], [1, 6, 79, 6], [1, 14, 76, 2],
  [2, 0, 79, 2], [2, 2, 76, 2], [2, 4, 74, 2], [2, 6, 71, 6], [2, 14, 74, 2],
  [3, 0, 76, 6], [3, 8, 72, 2], [3, 10, 69, 6],
];

let scene: Scene = null;
let timer = 0;
let next = 0; // audio time of the next 16th
let step = 0; // 16ths since the scene started
let loading: Promise<void> | null = null;
let ready = false;
let bus: GainNode | null = null;

function ensureLoaded() {
  const a = audio();
  if (!a || loading) return;
  // drums and keys first, so the groove can start early; the hook instrument last
  loading = a.sampler.need('wurli', 'bass', 'lm2', 'hihat', 'shaker').then(() => { ready = true; return a.sampler.need('snare', 'kick', 'marimba'); }).then(() => loadFx());
}

/** Switch the music to a scene (null = silence). Safe to call before audio is unlocked. */
export function music(s: Scene) {
  if (s === scene) return;
  scene = s;
  whenAudio(() => start());
}

function start() {
  const a = audio();
  if (!a) return;
  ensureLoaded();
  // each scene fades in on its own little gain, the old one fades out
  if (bus) { const old = bus; old.gain.setTargetAtTime(0, a.ctx.currentTime, 0.4); setTimeout(() => old.disconnect(), 2500); }
  bus = null;
  clearInterval(timer);
  if (!scene) return;
  bus = a.ctx.createGain();
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(scene === 'lobby' ? 0.7 : 1, a.ctx.currentTime + 0.05, 0.6);
  bus.connect(a.bus);
  next = a.ctx.currentTime + 0.15;
  step = 0;
  timer = window.setInterval(tick, 50);
  tick();
}

function tick() {
  const a = audio();
  if (!a || !bus || !scene) return;
  if (a.ctx.state !== 'running') { next = a.ctx.currentTime + 0.1; return; }
  // after a hidden tab or a stall, do not play everything that was missed
  if (next < a.ctx.currentTime - 0.1) next = a.ctx.currentTime + 0.05;
  while (next < a.ctx.currentTime + LOOKAHEAD) {
    if (ready) play(step, next + (step % 2 ? SWING * STEP : 0), a.sampler, bus, scene);
    next += STEP;
    step++;
  }
}

const hum = () => (Math.random() * 2 - 1) * 0.006;

function play(st: number, t: number, sm: NonNullable<ReturnType<typeof audio>>['sampler'], out: AudioNode, sc: 'lobby' | 'table') {
  const s = st % 16; // step in bar
  const bar = Math.floor(st / 16) % 16; // bar in the form
  const ci = bar % 4;
  const hookHalf = bar >= 8;
  const lift = hookHalf && ci === 3;
  const full = sc === 'table';
  const N = (id: InstId, m: number, at: number, o: Parameters<typeof sm.note>[4]) => sm.note(id, m, at + hum(), out, o);
  const K = (id: InstId, art: string, at: number, o: Parameters<typeof sm.hit>[4]) => sm.hit(id, art, at + hum(), out, o);

  // ---- keys: chord on 1 (held), offbeat stabs on the "and" of 2 and 3
  const chord = lift ? (s < 8 ? LIFT[0] : LIFT[1]) : CHORDS[ci];
  const keyHit = s === 0 || s === 6 || s === 10 || (lift && s === 8);
  if (keyHit) {
    const len = s === 0 ? 5 : 2;
    chord.forEach((m, i) => N('wurli', m, t + i * 0.004, { vel: (s === 0 ? 0.5 : 0.42) * (full ? 1 : 0.85), dur: len * STEP, rel: 0.12, pan: (i - 1.5) * 0.12 }));
  }

  // ---- bass
  const root = lift ? (s < 8 ? 26 : 28) : ROOTS[ci];
  for (const [bs, iv, v] of BASS) {
    if (bs !== s) continue;
    if (!full && bs > 8) continue;
    const m = iv < 0 ? ROOTS[(ci + 1) % 4] + iv : root + iv;
    N('bass', m + 12, t, { vel: v * 0.95, dur: STEP * (bs === 0 ? 2.5 : 1.4), rel: 0.06 });
  }

  // ---- shaker 16ths (both scenes), accent on 8ths
  K('shaker', s % 2 ? 'up' : 'down', t, { vel: (s % 4 === 2 ? 0.42 : 0.26) * (full ? 1 : 0.8), pan: 0.35 });

  if (!full) {
    // the lobby gets the hook once in a while, softly
    if (hookHalf) for (const [hb, hs, hm, hl] of HOOK) if (hb === ci && hs === s) N('marimba', hm, t, { vel: 0.38, dur: hl * STEP, rel: 0.3, pan: -0.2 });
    return;
  }

  // ---- drums
  const fill = bar === 15 && s >= 8;
  if (s === 0 || s === 8 || (s === 7 && bar % 2) || (hookHalf && s === 10)) K('lm2', 'kick', t, { vel: s === 0 ? 0.95 : 0.8 });
  if ((s === 4 || s === 12) && !fill) { K('lm2', 'clap', t, { vel: 0.62 }); K('snare', 's', t + 0.003, { vel: 0.5, lp: 7000 }); }
  if (fill) K('snare', 's', t, { vel: 0.3 + (s - 8) * 0.07, pan: (s - 12) * 0.08 });
  if (s % 2 === 0 && !fill) K('hihat', s === 14 ? 'o' : 'c', t, { vel: s % 4 === 0 ? 0.42 : 0.55, pan: -0.25, dur: s === 14 ? STEP * 1.8 : undefined, rel: 0.05 });
  if (hookHalf && s % 4 === 2) K('lm2', 'tambourine', t, { vel: 0.35, pan: 0.45 });
  if (s === 0 && (bar === 0 || bar === 8) && st > 0) K('lm2', 'crash', t, { vel: 0.5 });

  // ---- marimba hook in the second half, with a ghost octave
  if (hookHalf) for (const [hb, hs, hm, hl] of HOOK) if (hb === ci && hs === s) {
    N('marimba', hm, t, { vel: 0.62, dur: hl * STEP, rel: 0.35, pan: -0.15 });
    N('marimba', hm + 12, t + 0.01, { vel: 0.22, dur: hl * STEP, rel: 0.3, pan: 0.2 });
  }
}
