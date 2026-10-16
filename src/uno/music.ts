// Music for Unser Uno Spiel, composed in code and played on the casino's recorded instruments.
// "Bunte Runde": a bright game-show pop tune in C major, 120 BPM, 16-bar form. Bars 1-8 are the
// groove (bouncy piano, punchy synth bass, 808 drums, a soft xylophone answer), bars 9-16 the
// hook on muted trumpet and xylophone in octaves with claps. The lobby plays a soft cut.
// Nothing sounds until the instruments are loaded; the bass is synthesised (clean and tight).

import type { InstId, Sampler } from '../audio/sampler';
import { audio, loadFx, whenAudio } from './sfx';

type Scene = 'lobby' | 'table' | null;

const BPM = 120;
const STEP = 60 / BPM / 4; // a 16th
const SWING = 0.08;
const LOOKAHEAD = 0.2;

// one chord per bar: [bass root, chord tones]
const A: [number, number[]][] = [
  [36, [60, 64, 67, 72]], // C
  [35, [59, 62, 67, 71]], // G/B
  [33, [57, 60, 64, 69]], // Am
  [29, [57, 60, 65, 69]], // F
  [36, [60, 64, 67, 72]], // C
  [35, [59, 62, 67, 71]], // G/B
  [29, [57, 60, 65, 69]], // F
  [31, [59, 62, 65, 67]], // G7
];
const B: [number, number[]][] = [
  [29, [57, 60, 65, 69]], // F
  [31, [59, 62, 67, 71]], // G
  [28, [59, 64, 67, 71]], // Em
  [33, [57, 60, 64, 69]], // Am
  [29, [57, 60, 65, 69]], // F
  [31, [59, 62, 67, 71]], // G
  [36, [60, 64, 67, 72]], // C
  [31, [59, 62, 65, 67]], // G7 back to the top
];
// hook over 8 bars: [bar, step, midi, length in 16ths]
const HOOK: [number, number, number, number][] = [
  [0, 0, 76, 2], [0, 2, 79, 2], [0, 4, 81, 1], [0, 6, 79, 3], [0, 10, 76, 2], [0, 12, 74, 2], [0, 14, 72, 2],
  [1, 0, 74, 3], [1, 4, 67, 2], [1, 6, 74, 2], [1, 8, 76, 4], [1, 12, 74, 2], [1, 14, 71, 2],
  [2, 0, 72, 2], [2, 2, 76, 2], [2, 4, 81, 2], [2, 6, 79, 2], [2, 8, 76, 4], [2, 12, 72, 2], [2, 14, 74, 2],
  [3, 0, 72, 6], [3, 8, 69, 2], [3, 10, 72, 2], [3, 12, 74, 4],
  [4, 0, 76, 2], [4, 2, 79, 2], [4, 4, 81, 1], [4, 6, 79, 3], [4, 10, 76, 2], [4, 12, 79, 2], [4, 14, 84, 2],
  [5, 0, 83, 3], [5, 4, 79, 2], [5, 6, 74, 2], [5, 8, 79, 4], [5, 12, 77, 2], [5, 14, 76, 2],
  [6, 0, 76, 2], [6, 2, 74, 2], [6, 4, 72, 8], [6, 14, 67, 2],
  [7, 0, 72, 2], [7, 4, 72, 1], [7, 6, 74, 2], [7, 8, 76, 2], [7, 10, 79, 6],
];
// the groove's little answer phrase (xylophone, end of every other bar in the A part)
const ANSWER: [number, number][] = [[10, 79], [11, 81], [12, 84], [14, 79]];

let scene: Scene = null;
let timer = 0;
let next = 0;
let step = 0;
let loading: Promise<void> | null = null;
let ready = false;
let bus: GainNode | null = null;

function ensureLoaded() {
  const a = audio();
  if (!a || loading) return;
  // drums, piano and bell first so the groove starts early; the trumpet for the hook after
  loading = a.sampler.need('tr808', 'pianof', 'xylo', 'shaker').then(() => { ready = true; return a.sampler.need('mutetp', 'glock'); }).then(() => loadFx());
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
  if (bus) { const old = bus; old.gain.setTargetAtTime(0, a.ctx.currentTime, 0.4); setTimeout(() => old.disconnect(), 2500); }
  bus = null;
  clearInterval(timer);
  if (!scene) return;
  bus = a.ctx.createGain();
  bus.gain.value = 0;
  bus.gain.setTargetAtTime(scene === 'lobby' ? 0.75 : 1, a.ctx.currentTime + 0.05, 0.6);
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
  if (next < a.ctx.currentTime - 0.1) next = a.ctx.currentTime + 0.05;
  while (next < a.ctx.currentTime + LOOKAHEAD) {
    if (ready) play(a.ctx, a.sampler, bus, scene, step, next + (step % 2 ? SWING * STEP : 0));
    next += STEP;
    step++;
  }
}

const hum = () => (Math.random() * 2 - 1) * 0.005;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Tight synth bass: saw plus a square an octave down, a closing filter and a short body. */
function bass(ctx: BaseAudioContext, out: AudioNode, midi: number, t: number, len: number, vel: number) {
  const g = ctx.createGain();
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(2400, t);
  f.frequency.exponentialRampToValueAtTime(320, t + Math.min(0.25, len));
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.32 * vel, t + 0.006);
  g.gain.setTargetAtTime(0.2 * vel, t + 0.02, 0.08);
  g.gain.setTargetAtTime(0.0001, t + len, 0.03);
  f.connect(g).connect(out);
  for (const [type, mul, lvl] of [['sawtooth', 1, 0.6], ['square', 0.5, 0.5]] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = mtof(midi) * mul;
    const og = ctx.createGain();
    og.gain.value = lvl;
    o.connect(og).connect(f);
    o.start(t);
    o.stop(t + len + 0.2);
  }
}

function play(ctx: BaseAudioContext, sm: Sampler, out: AudioNode, sc: 'lobby' | 'table', st: number, t: number) {
  const s = st % 16;
  const bar = Math.floor(st / 16) % 16;
  const inB = bar >= 8;
  const bi = bar % 8;
  const [root, chord] = (inB ? B : A)[bi];
  const full = sc === 'table';
  const N = (id: InstId, m: number, at: number, o: Parameters<Sampler['note']>[4]) => sm.note(id, m, at + hum(), out, o);
  const K = (id: InstId, art: string, at: number, o: Parameters<Sampler['hit']>[4]) => sm.hit(id, art, at + hum(), out, o);

  // ---- piano: bouncy pop comping, chord on 1, offbeat stabs, a push into the next bar
  const pv = full ? 1 : 0.8;
  if (s === 0) chord.forEach((m, i) => N('pianof', m, t + i * 0.006, { vel: 0.5 * pv, dur: STEP * 3, rel: 0.15, pan: (i - 1.5) * 0.1 }));
  if (s === 6 || s === 10 || (full && s === 14)) chord.slice(1).forEach((m, i) => N('pianof', m, t + i * 0.004, { vel: 0.4 * pv, dur: STEP * 1.2, rel: 0.08, pan: (i - 1) * 0.12 }));
  if (s === 0) N('pianof', root + 24, t, { vel: 0.38 * pv, dur: STEP * 3, rel: 0.2 });

  // ---- bass
  const bassHits: [number, number, number][] = full
    ? [[0, 0, 1], [3, 0, 0.7], [6, 12, 0.75], [8, 0, 0.9], [11, 7, 0.7], [14, 12, 0.8]]
    : [[0, 0, 0.8], [8, 0, 0.7]];
  for (const [bs, iv, v] of bassHits) if (bs === s) bass(ctx, out, root + iv, t, STEP * (bs === 0 || bs === 8 ? 2.2 : 1.4), v * (full ? 1 : 0.7));

  // ---- shaker 16ths
  K('shaker', s % 2 ? 'up' : 'down', t, { vel: (s % 4 === 2 ? 0.36 : 0.22) * (full ? 1 : 0.85), pan: 0.4 });

  if (!full) {
    if (inB) for (const [hb, hs, hm, hl] of HOOK) if (hb === bi && hs === s) N('xylo', hm, t, { vel: 0.34, dur: hl * STEP, rel: 0.2, pan: -0.2 });
    return;
  }

  // ---- 808 drums
  const fill = bar === 15 && s >= 12;
  if (s === 0 || s === 8 || s === 10 || (s === 3 && bi % 2 === 1)) K('tr808', s === 0 ? 'bd7550' : 'bd5050', t, { vel: s === 0 || s === 8 ? 0.95 : 0.75 });
  if ((s === 4 || s === 12) && !fill) { K('tr808', 'cp', t, { vel: inB ? 0.85 : 0.7 }); K('tr808', 'sd2550', t, { vel: 0.45 }); }
  if (inB && (s === 4 || s === 12)) K('tr808', 'cp', t + 0.012, { vel: 0.5, pan: 0.3 });
  if (fill) K('tr808', s % 2 ? 'mt00' : 'ht00', t, { vel: 0.55 + (s - 12) * 0.1 });
  if (s % 2 === 0 && !fill) K('tr808', s === 6 || s === 14 ? 'oh00' : 'ch', t, { vel: s % 4 === 2 ? 0.5 : 0.36, pan: -0.25 });
  if (s === 0 && (bar === 0 || bar === 8) && st > 0) K('tr808', 'cy2550', t, { vel: 0.55 });
  if (inB && s % 4 === 2) K('tr808', 'cb', t, { vel: 0.18, pan: 0.5 });

  // ---- melody: answer phrase in the groove, the full hook in the second half
  if (!inB && bi % 2 === 1) for (const [as, am] of ANSWER) if (as === s) N('xylo', am, t, { vel: 0.4, pan: 0.25 });
  if (inB) for (const [hb, hs, hm, hl] of HOOK) if (hb === bi && hs === s) {
    if (!N('mutetp', hm - 12, t, { vel: 0.7, dur: hl * STEP * 0.9, rel: 0.08, pan: -0.1 })) N('xylo', hm, t, { vel: 0.5 });
    N('xylo', hm, t + 0.004, { vel: 0.42, pan: 0.2 });
    if (hl >= 4) N('glock', hm + 12, t, { vel: 0.22, pan: 0.35 });
  }
}
