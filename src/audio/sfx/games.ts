// Effects of the games (wins, chips, cards, dice, wheels, balls …). See kit.ts.
//
// One tonal world: the casino band plays jazz in F / Bb / Cm / Am, so every musical effect
// lives in F major (pentatonic F G A C D for runs and ladders, F6/9 and Fmaj9 for resolutions,
// Bb -> C7 -> F for fanfares). Losses fall gently in F minor, never a buzzer.
// Physical effects are layered: a transient (click/snap), a body (wood, felt, clay) and a tail.
// Frequent effects (chips, ticks, cards, clicker, pegs) vary pitch, level and pan every time.

import type { FxKit } from './kit';
import type { InstId, NoteOpts } from '../voices';
import { pick, rnd } from '../moods/types';

export const INSTRUMENTS: InstId[] = [
  'claves', 'woodblock', 'cajon', 'shaker', 'ratchet', 'guiro', 'tom',
  'glock', 'celesta', 'vibes', 'harp', 'marimba', 'triangle', 'marktree',
  'vibesbow', 'trumpet', 'horn', 'choir', 'timpani', 'timproll', 'suscym', 'gong', 'clash',
];

// ---- Helpers -----------------------------------------------------------------

/** F major pentatonic from F4 (index 0 = F4, 3 = C5, 5 = F5 …). */
const PENTA = [0, 2, 4, 7, 9];
const penta = (i: number) => 65 + 12 * Math.floor(i / 5) + PENTA[((i % 5) + 5) % 5];
/** F major scale from F4. */
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const scale = (i: number) => 65 + 12 * Math.floor(i / 7) + MAJOR[((i % 7) + 7) % 7];

interface Burst {
  d?: number;
  dur: number;
  /** Filter frequency (Hz) and optional sweep target. */
  f: number;
  to?: number;
  type?: BiquadFilterType;
  q?: number;
  vol: number;
  att?: number;
  pan?: number;
  out?: AudioNode;
}

/** A shaped, filtered, panned noise burst (snaps, slides, air, water). */
function burst(k: FxKit, o: Burst) {
  const ctx = k.ctx;
  const t = ctx.currentTime + Math.max(0, o.d ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = k.v.noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const att = Math.min(o.att ?? 0.002, o.dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g);
  if (o.pan) {
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, o.pan));
    g.connect(p).connect(o.out ?? k.out);
  } else g.connect(o.out ?? k.out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

/** A pitched note with a little spread of pan; `o` as NoteOpts. */
function note(k: FxKit, id: InstId, midi: number, d: number, o: NoteOpts = {}, out: AudioNode = k.out) {
  k.v.note(id, midi, d, out, o);
}
function hit(k: FxKit, id: InstId, art: string, d: number, o: NoteOpts = {}, out: AudioNode = k.out) {
  k.v.hit(id, art, d, out, o);
}

/** The effect's own level trim (dB), so each one sits right against the others. */
function lv(k: FxKit, db: number): FxKit {
  if (!db) return k;
  const g = k.ctx.createGain();
  g.gain.value = Math.pow(10, db / 20);
  g.connect(k.out);
  return { ...k, out: g };
}

/** A synth voice into the effect's output. */
function tone(k: FxKit, f: number, dur: number, type: OscillatorType, vol: number, d = 0, slideTo?: number, attack = 0.008) {
  k.v.tone(f, dur, type, vol, d, slideTo, k.out, attack);
}

/** Moth wings: soft feathery beats (filtered air) drifting across the stereo field. */
function wings(k: FxKit, d: number, beats: number, rate: number, vol: number, from = -0.6, to = 0.6) {
  for (let i = 0; i < beats; i++) {
    const p = i / Math.max(1, beats - 1);
    const env = Math.sin(Math.PI * Math.min(1, 0.15 + p)) * vol;
    burst(k, { d: d + i / rate + rnd(-0.006, 0.006), dur: 0.07, f: rnd(700, 1100) + p * 300, to: rnd(1500, 2200), q: 0.9, vol: Math.max(0.002, env), att: 0.025, pan: from + (to - from) * p });
  }
}

// ---- Chips, ticks, thuds -----------------------------------------------------------

/** Two clay chips clacking onto a stack on the felt. */
export function chip(k: FxKit) {
  k = lv(k, -4);
  const pan = rnd(-0.25, 0.25);
  const c = rnd(300, 700);
  // First chip strikes: a hard clay click (claves cut short and tuned up) over a bright snap.
  hit(k, 'claves', 'c', 0, { vel: rnd(0.32, 0.42), cents: c, dur: 0.03, rel: 0.03, lp: 7500, pan });
  burst(k, { dur: 0.025, f: rnd(3400, 4200), q: 2.2, vol: 0.32, pan });
  // The second chip settles a moment later, softer and a touch lower.
  const d2 = rnd(0.035, 0.06);
  hit(k, 'claves', 'c', d2, { vel: rnd(0.2, 0.26), cents: c - rnd(150, 400), dur: 0.025, rel: 0.03, lp: 6500, pan });
  burst(k, { d: d2, dur: 0.03, f: rnd(2800, 3400), q: 2.2, vol: 0.2, pan });
  // Sometimes a third tiny rattle as the stack finds its balance.
  if (Math.random() < 0.5) burst(k, { d: d2 + rnd(0.03, 0.05), dur: 0.018, f: 4400, q: 3, vol: 0.08, pan });
  // The felt underneath: a dull, soft tap.
  burst(k, { dur: 0.05, f: 450, type: 'lowpass', q: 0.7, vol: 0.14, pan });
}

/** Small UI/mechanism tick: a light wooden tap. Fires constantly, so quiet and varied. */
export function tick(k: FxKit) {
  k = lv(k, 14);
  hit(k, 'woodblock', 'hi', 0, { vel: rnd(0.12, 0.17), cents: rnd(300, 800), dur: 0.02, rel: 0.02, lp: 6000, pan: rnd(-0.15, 0.15) });
  burst(k, { dur: 0.012, f: rnd(4500, 5500), q: 3, vol: 0.05 });
}

/** A reel (or lid, or stamp) slamming home: wooden knock with weight underneath. */
export function thud(k: FxKit) {
  hit(k, 'cajon', 'bass', 0, { vel: rnd(0.6, 0.7), lp: 1600 });
  hit(k, 'woodblock', 'w', 0, { vel: 0.3, cents: -1200 + rnd(-60, 60), dur: 0.06, rel: 0.05, lp: 2500 });
  tone(k, rnd(105, 115), 0.2, 'sine', 0.22, 0, 52);
  burst(k, { dur: 0.035, f: 2600, q: 2, vol: 0.1 });
}

// ---- Slots, wheel, roulette ---------------------------------------------------------

/** Lever pull: ratchet teeth, then the reels whir up with a little harp "go". */
export function spinStart(k: FxKit) {
  k = lv(k, -9);
  hit(k, 'ratchet', 'crank', 0, { vel: 0.38, dur: 0.24, rel: 0.06, lp: 5000, pan: -0.1 });
  burst(k, { d: 0.16, dur: 0.38, f: 500, to: 2600, q: 1, vol: 0.09, att: 0.12 });
  hit(k, 'woodblock', 'w', 0.2, { vel: 0.22, cents: -700, dur: 0.05, rel: 0.04, lp: 2500 });
  // Harp: F A C F A rippling upwards.
  [65, 69, 72, 77, 81].forEach((m, i) => note(k, 'harp', m, 0.2 + i * 0.032, { vel: 0.32 + i * 0.03, pan: -0.3 + i * 0.15 }));
}

/**
 * The roulette ball: it runs round the wooden track (bright roll, panned with every lap, laps
 * slowing down), the bowl rumbles under it, then it hops over the diamonds, ever further apart.
 */
export function ballRoll(k: FxKit, duration: number) {
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const end = t + duration;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 0.12);
  out.gain.setValueAtTime(1, t + duration * 0.7);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  const pan = ctx.createStereoPanner();
  out.connect(pan).connect(k.out);
  const lap = ctx.createOscillator();
  lap.frequency.setValueAtTime(2.4, t);
  lap.frequency.exponentialRampToValueAtTime(0.8, end);
  const lapDepth = ctx.createGain();
  lapDepth.gain.value = 0.45;
  lap.connect(lapDepth).connect(pan.pan);
  // Rolling: a bright band of noise with a fast rattle (the ball skipping on the grain).
  const roll = ctx.createBufferSource();
  roll.buffer = k.v.noiseBuffer;
  roll.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(3400, t);
  bp.frequency.exponentialRampToValueAtTime(1400, end);
  bp.Q.value = 1.3;
  const rg = ctx.createGain();
  rg.gain.value = 0.2;
  const rattle = ctx.createOscillator();
  rattle.type = 'triangle';
  rattle.frequency.setValueAtTime(28, t);
  rattle.frequency.exponentialRampToValueAtTime(9, end);
  const rd = ctx.createGain();
  rd.gain.value = 0.1;
  rattle.connect(rd).connect(rg.gain);
  roll.connect(bp).connect(rg).connect(out);
  // The bowl: a low wooden rumble.
  const rum = ctx.createBufferSource();
  rum.buffer = k.v.noiseBuffer;
  rum.loop = true;
  rum.playbackRate.value = 0.7;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(260, t);
  lp.frequency.exponentialRampToValueAtTime(150, end);
  const lg = ctx.createGain();
  lg.gain.value = 0.14;
  rum.connect(lp).connect(lg).connect(out);
  for (const s of [roll, rum, lap, rattle]) {
    s.start(t);
    s.stop(end + 0.1);
  }
  // Launch: the croupier's flick.
  hit(k, 'claves', 'c', 0, { vel: 0.18, cents: 500, dur: 0.03, rel: 0.03, lp: 6000 });
  // Diamonds: hard little knocks, spreading out as the ball slows.
  let x = duration * 0.6;
  let gap = 0.08;
  let v = 0.24;
  while (x < duration - 0.04) {
    const wood = Math.random() < 0.5;
    hit(k, wood ? 'woodblock' : 'claves', wood ? 'hi' : 'c', x, { vel: v, cents: rnd(400, 900), dur: 0.03, rel: 0.025, lp: 6000, pan: rnd(-0.4, 0.4) });
    x += gap * rnd(0.8, 1.3);
    gap *= 1.22;
    v *= 0.9;
  }
}

// ---- Coins and wins ----------------------------------------------------------------

/** Successive coins (within 0.3 s) climb a little ladder instead of repeating one note. */
let coinIdx = 0;
let coinLast = -9;
const COIN_LADDER = [7, 9, 8, 10, 9, 11, 10, 12, 11, 13, 12, 10];

/** A coin dropping into the purse: a glockenspiel ping with a metal chink. */
export function coin(k: FxKit, delay = 0) {
  const at = k.ctx.currentTime + delay;
  coinIdx = at - coinLast < 0.3 && at >= coinLast ? coinIdx + 1 : 0;
  coinLast = Math.max(coinLast, at);
  const m = penta(COIN_LADDER[coinIdx % COIN_LADDER.length]);
  const pan = rnd(-0.4, 0.4);
  note(k, 'glock', m, delay, { vel: rnd(0.32, 0.4), lp: 6500, pan });
  hit(k, 'triangle', 'mute', delay, { vel: rnd(0.06, 0.09), cents: rnd(-400, 200), lp: 9000, pan });
  burst(k, { d: delay, dur: 0.015, f: 6500, q: 2, vol: 0.05, pan });
}

const WIN_ARPS = [
  [72, 77, 81, 84], // C F A C
  [69, 72, 77, 81], // A C F A
  [77, 79, 81, 84], // F G A C
];

/** Small win: a vibraphone arpeggio landing on a warm F6/9, with glock and harp. */
export function win(k: FxKit) {
  k = lv(k, -4);
  const arp = pick(WIN_ARPS);
  arp.forEach((m, i) => {
    note(k, 'vibes', m, i * 0.075, { vel: 0.55 + i * 0.05, pan: -0.3 + i * 0.2 });
    note(k, 'celesta', m + 12, i * 0.075, { vel: 0.22, lp: 5000, pan: 0.3 - i * 0.2 });
  });
  const land = 0.3;
  [65, 69, 74, 79].forEach((m, i) => note(k, 'vibes', m, land + i * 0.012, { vel: 0.42, dur: 1.1, rel: 0.6, pan: -0.25 + i * 0.17 }));
  note(k, 'harp', 41, land, { vel: 0.55 });
  note(k, 'harp', 53, land + 0.02, { vel: 0.4 });
  note(k, 'glock', 89, land + 0.04, { vel: 0.26, lp: 6000, pan: 0.2 });
  hit(k, 'triangle', 'hit', land, { vel: 0.1, lp: 9000, pan: 0.35 });
}

/** Last big win, so a second call right after (the jackpot tier) plays the encore instead. */
let bigLast = -9;

/**
 * Big win: an orchestral moment in F. Gong and timpani, a brass fanfare (F F Bb C7 -> F),
 * choir underneath, a harp sweep and a cascade of bells, coins raining, and the moths taking
 * off at the end over a shimmering Fmaj9.
 */
export function bigWin(k: FxKit) {
  const now = k.ctx.currentTime;
  if (now - bigLast < 1.6) {
    bigLast = now;
    return bigWinEncore(k);
  }
  bigLast = now;
  const br: NoteOpts = { rel: 0.12, lp: 5200 };
  // Bang: gong and a timpani under a short rising cymbal.
  hit(k, 'gong', 'g', 0, { vel: 0.55 });
  note(k, 'timpani', 53, 0, { vel: 0.8 });
  note(k, 'timproll', 48, 0.12, { vel: 0.45, dur: 0.55, att: 0.4, rel: 0.1 });
  // Fanfare: stab, stab, Bb, C7 — then F.
  const stab = (d: number, tp: number[], hn: number[], dur: number, vel: number) => {
    tp.forEach((m, i) => note(k, 'trumpet', m, d + i * 0.004, { ...br, vel, dur, pan: -0.15 + i * 0.15 }));
    hn.forEach((m, i) => note(k, 'horn', m, d + 0.006, { ...br, vel: vel * 0.9, dur, pan: 0.25 - i * 0.1 }));
  };
  stab(0.0, [69, 72, 77], [53, 60], 0.11, 0.62);
  stab(0.16, [69, 72, 77], [53, 60], 0.1, 0.6);
  stab(0.32, [70, 74, 77], [46, 58], 0.16, 0.66);
  stab(0.52, [70, 76, 79], [48, 58], 0.16, 0.7);
  note(k, 'timpani', 48, 0.52, { vel: 0.65 });
  const T = 0.74;
  stab(T, [69, 72, 77, 81], [41, 53, 60, 65], 1.3, 0.74);
  hit(k, 'clash', 'crash', T, { vel: 0.5 });
  note(k, 'timpani', 53, T, { vel: 0.9 });
  [53, 57, 60, 65, 69].forEach((m, i) => note(k, 'choir', m, T, { vel: 0.5, att: 0.18, dur: 1.9, rel: 0.9, pan: -0.4 + i * 0.2 }));
  // Harp sweeps up the F major scale.
  for (let i = 0; i < 15; i++) note(k, 'harp', scale(i - 7), T + i * 0.028, { vel: 0.3 + i * 0.012, pan: -0.5 + i * 0.07 });
  // Bells cascading down, then back up, across the stereo field.
  const casc = [13, 12, 11, 10, 9, 8, 7, 8, 10, 12];
  casc.forEach((p, i) => note(k, i % 2 ? 'celesta' : 'glock', penta(p), T + 0.12 + i * 0.09, { vel: 0.3, lp: 6000, pan: Math.sin(i * 1.3) * 0.6 }));
  hit(k, 'triangle', 'roll', T + 0.1, { vel: 0.12, dur: 1.5, rel: 0.6, lp: 9000 });
  hit(k, 'marktree', 'desc', T + 0.4, { vel: 0.22, lp: 9000 });
  // Coins raining into the purse.
  for (let i = 0; i < 14; i++) coin(k, T + 0.35 + i * 0.075 + rnd(0, 0.03));
  // The moths lift off; a soft Fmaj9 rings under them.
  wings(k, 2.0, 16, 13, 0.11, -0.7, 0.7);
  [65, 69, 72, 76, 79].forEach((m, i) => note(k, 'vibes', m, 2.35 + i * 0.03, { vel: 0.38, pan: -0.3 + i * 0.15 }));
  note(k, 'harp', 41, 2.35, { vel: 0.45 });
  note(k, 'celesta', 89, 2.5, { vel: 0.22, lp: 5000 });
  hit(k, 'suscym', 'bell', 2.35, { vel: 0.16 });
}

/** Jackpot encore: the band lifts once more — a plagal Bb -> F "amen" an octave higher. */
function bigWinEncore(k: FxKit) {
  const br: NoteOpts = { rel: 0.15, lp: 5200 };
  hit(k, 'clash', 'crash', 0, { vel: 0.45 });
  note(k, 'timpani', 46, 0, { vel: 0.75 });
  [70, 74, 77, 82].forEach((m, i) => note(k, 'trumpet', m, i * 0.004, { ...br, vel: 0.66, dur: 0.3, pan: -0.2 + i * 0.13 }));
  [46, 58, 62].forEach((m) => note(k, 'horn', m, 0.006, { ...br, vel: 0.6, dur: 0.3 }));
  const T = 0.38;
  [72, 77, 81, 84].forEach((m, i) => note(k, 'trumpet', m, T + i * 0.004, { ...br, vel: 0.72, dur: 1.4, pan: -0.2 + i * 0.13 }));
  [41, 53, 57, 60].forEach((m) => note(k, 'horn', m, T + 0.006, { ...br, vel: 0.62, dur: 1.4 }));
  note(k, 'timpani', 53, T, { vel: 0.9 });
  hit(k, 'gong', 'g', T, { vel: 0.4 });
  [60, 65, 69, 72, 77].forEach((m, i) => note(k, 'choir', m, T, { vel: 0.46, att: 0.2, dur: 2, rel: 1, pan: -0.4 + i * 0.2 }));
  for (let i = 0; i < 12; i++) note(k, i % 2 ? 'glock' : 'celesta', penta(8 + ((i * 3) % 6)), T + 0.1 + i * 0.08, { vel: 0.26, lp: 6000, pan: Math.cos(i) * 0.6 });
  for (let i = 0; i < 12; i++) coin(k, T + 0.4 + i * 0.07 + rnd(0, 0.03));
  wings(k, 1.5, 22, 14, 0.12, 0.7, -0.7);
  hit(k, 'marktree', 'asc', T + 1.1, { vel: 0.2, lp: 9000 });
}

/** Lines lighting up one after another: each one a step higher on the F pentatonic. */
export function lineHit(k: FxKit, i: number) {
  k = lv(k, -5);
  const m = penta(3 + Math.max(0, Math.min(10, i)));
  const pan = Math.max(-0.5, Math.min(0.5, -0.4 + i * 0.1));
  note(k, 'vibes', m > 88 ? m - 12 : m, 0, { vel: 0.62, pan });
  note(k, m + 12 > 96 ? 'glock' : 'celesta', m + 12 > 96 ? m : m + 12, 0.008, { vel: 0.26, lp: 5500, pan: -pan });
  note(k, 'harp', m - 12, 0, { vel: 0.38 });
  if (i >= 5) hit(k, 'triangle', 'mute', 0, { vel: 0.07, lp: 9000, pan: 0.4 });
}

/** Suspense on the last reel / the finish line: a timpani roll and cymbal swelling on C, a clock-like pulse. */
export function tension(k: FxKit, duration: number) {
  k = lv(k, -4);
  const D = Math.max(0.4, duration);
  note(k, 'timproll', 48, 0, { vel: 0.6, att: D * 0.85, dur: D, rel: 0.15 });
  hit(k, 'suscym', 'roll', 0, { vel: 0.35, att: D * 0.9, dur: D, rel: 0.12 });
  // Pulse: woodblock ticks getting faster and a little louder.
  let x = 0;
  let gap = 0.16;
  let i = 0;
  while (x < D - 0.03) {
    hit(k, 'woodblock', i % 2 ? 'hi' : 'w', x, { vel: 0.1 + (x / D) * 0.14, cents: i % 2 ? 0 : -500, dur: 0.03, rel: 0.03, lp: 5000, pan: i % 2 ? 0.2 : -0.2 });
    x += gap;
    gap = Math.max(0.07, gap * 0.9);
    i++;
  }
}

/** Part of the stake back: a soft two-note "not bad" on the vibes, resolving to F. */
export function partial(k: FxKit) {
  k = lv(k, -8);
  const [a, b] = pick([[72, 77], [76, 77], [74, 72]]);
  note(k, 'vibes', a, 0, { vel: 0.4, pan: -0.15 });
  note(k, 'vibes', b, 0.11, { vel: 0.46, pan: 0.15 });
  note(k, 'harp', b - 24, 0.11, { vel: 0.32 });
}

/** A loss: a gentle falling figure in F minor on marimba, landing softly on a low F. */
export function lose(k: FxKit) {
  k = lv(k, -5);
  const fig = pick([[72, 68, 65], [68, 67, 65], [75, 72, 68]]);
  fig.forEach((m, i) => note(k, 'marimba', m - 12, i * 0.13, { vel: 0.5 - i * 0.05, lp: 3000, pan: 0.2 - i * 0.2 }));
  note(k, 'harp', 41, 0.26, { vel: 0.35, lp: 1500 });
}

/** Medal / achievement / unlock: a bright little "ta-da" with horn underneath. */
export function medal(k: FxKit) {
  k = lv(k, -4);
  [72, 77, 81].forEach((m, i) => {
    note(k, 'vibes', m, i * 0.085, { vel: 0.55 + i * 0.05, pan: -0.3 + i * 0.2 });
    note(k, 'celesta', m + 12, i * 0.085, { vel: 0.2, lp: 5000 });
  });
  const T = 0.3;
  [53, 60, 65].forEach((m) => note(k, 'horn', m, T, { vel: 0.5, dur: 0.85, rel: 0.4, lp: 3500 }));
  [65, 69, 72, 79, 84].forEach((m, i) => note(k, 'vibes', m, T + i * 0.015, { vel: 0.46, pan: -0.3 + i * 0.15 }));
  note(k, 'harp', 41, T, { vel: 0.5 });
  [89, 93, 96].forEach((m, i) => note(k, 'glock', m, T + 0.06 + i * 0.07, { vel: 0.22, lp: 6000, pan: 0.2 - i * 0.2 }));
  hit(k, 'triangle', 'hit', T, { vel: 0.12, lp: 9000 });
}

/** The season ends: wistful and warm — the vibes sing C A G F over a choir moving Bbmaj7 -> F. */
export function seasonOver(k: FxKit) {
  k = lv(k, -5);
  [[72, 0], [69, 0.4], [67, 0.8], [65, 1.25]].forEach(([m, d], i) => note(k, 'vibes', m, d, { vel: 0.5 - i * 0.03, pan: 0.15 }));
  [50, 57, 62, 65].forEach((m) => note(k, 'choir', m, 0, { vel: 0.4, att: 0.3, dur: 1.15, rel: 0.5, pan: -0.2 }));
  [48, 57, 60, 65].forEach((m) => note(k, 'choir', m, 1.2, { vel: 0.4, att: 0.3, dur: 1.6, rel: 1.2, pan: -0.2 }));
  note(k, 'harp', 46, 0, { vel: 0.45 });
  note(k, 'harp', 41, 1.25, { vel: 0.5 });
  [65, 69, 72, 77].forEach((m, i) => note(k, 'harp', m, 1.35 + i * 0.07, { vel: 0.28, pan: 0.3 }));
  note(k, 'celesta', 81, 1.7, { vel: 0.18, lp: 4500 });
}

/** A gentle magic shimmer: a mark tree brushed upwards and a celesta figure. */
export function shimmer(k: FxKit) {
  k = lv(k, -3);
  hit(k, 'marktree', 'asc', 0, { vel: rnd(0.16, 0.22), lp: 9000, pan: rnd(-0.3, 0.3) });
  const base = pick([7, 8, 10]);
  [0, 1, 2, 4].forEach((s, i) => note(k, 'celesta', penta(base + s), 0.05 + i * 0.075, { vel: 0.32, lp: 5500, pan: -0.3 + i * 0.2 }));
}

/** A coin flicked into the fountain: ping, flight, a plop and a tiny wish sparkle. */
export function wish(k: FxKit) {
  note(k, 'glock', 88, 0, { vel: 0.28, lp: 6500, pan: 0.2 });
  burst(k, { dur: 0.012, f: 6000, q: 2, vol: 0.05 });
  // Plop: the coin breaks the surface, a bubble rises.
  burst(k, { d: 0.5, dur: 0.18, f: 1400, to: 350, q: 1.2, vol: 0.18 });
  tone(k, 950, 0.09, 'sine', 0.07, 0.51, 380);
  tone(k, 600, 0.07, 'sine', 0.035, 0.62, 1100);
  [0.66, 0.74].forEach((d) => tone(k, rnd(1300, 1900), 0.05, 'sine', 0.02, d, 2600));
  [9, 11, 13].forEach((p, i) => note(k, 'celesta', penta(p), 0.85 + i * 0.09, { vel: 0.2, lp: 5000, pan: -0.2 + i * 0.2 }));
}

/** Shop till: the drawer clacks open and the register bell rings. */
export function till(k: FxKit) {
  k = lv(k, -4);
  hit(k, 'ratchet', 'crank', 0, { vel: 0.25, dur: 0.07, rel: 0.04, lp: 5000 });
  hit(k, 'woodblock', 'w', 0.06, { vel: 0.3, cents: -900, dur: 0.06, rel: 0.05, lp: 3000 });
  burst(k, { d: 0.05, dur: 0.18, f: 900, to: 400, q: 1.2, vol: 0.06 });
  note(k, 'glock', 89, 0.1, { vel: 0.45, lp: 7000, pan: 0.15 });
  hit(k, 'triangle', 'hit', 0.1, { vel: 0.14, lp: 9000, pan: 0.15 });
  note(k, 'glock', 93, 0.18, { vel: 0.3, lp: 7000, pan: 0.25 });
}

// ---- Plinko, crash, keno, bingo, scratch ------------------------------------------

/** A glass peg brushed by a plinko moth; pitch climbs through the pentatonic with the row. */
export function pegTick(k: FxKit, row: number) {
  const r = Math.max(0, row);
  let m = penta(5 + (r % 10));
  if (m > 96) m -= 12;
  note(k, 'glock', m, 0, { vel: rnd(0.16, 0.22), dur: 0.12, rel: 0.12, lp: 6500, cents: rnd(-8, 8), pan: rnd(-0.35, 0.35) });
  burst(k, { dur: 0.01, f: 6000, q: 2, vol: 0.03 });
}

/** A plinko moth landing in a bucket: soft felt thump plus a note that tells the result. */
export function bucket(k: FxKit, mult: number) {
  k = lv(k, -7);
  hit(k, 'cajon', 'tone', 0, { vel: 0.4, lp: 1800 });
  if (mult >= 1) {
    note(k, 'vibes', 77, 0.01, { vel: 0.42 });
    note(k, 'vibes', 81, 0.07, { vel: 0.42 });
    if (mult >= 5) note(k, 'celesta', 89, 0.13, { vel: 0.26, lp: 5000 });
  } else note(k, 'marimba', mult >= 0.5 ? 60 : 53, 0.01, { vel: 0.4, lp: 2500 });
}

/**
 * The crash moth's flight (a stop function): wind rushing past and wings beating, while a
 * bowed vibraphone and a soft drone climb slowly. Everything rises over 30 s, then holds.
 */
export function flight(k: FxKit): () => void {
  k = lv(k, -9);
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 0.5);
  out.connect(k.out);
  // Wind: looped noise through a band that opens upwards.
  const wind = ctx.createBufferSource();
  wind.buffer = k.v.noiseBuffer;
  wind.loop = true;
  const wf = ctx.createBiquadFilter();
  wf.type = 'bandpass';
  wf.Q.value = 0.9;
  wf.frequency.setValueAtTime(450, t);
  wf.frequency.exponentialRampToValueAtTime(2400, t + 30);
  const wg = ctx.createGain();
  wg.gain.setValueAtTime(0.05, t);
  wg.gain.linearRampToValueAtTime(0.11, t + 30);
  // Wing beats: amplitude flutter.
  const wing = ctx.createOscillator();
  wing.frequency.setValueAtTime(11, t);
  wing.frequency.linearRampToValueAtTime(16, t + 30);
  const wd = ctx.createGain();
  wd.gain.value = 0.035;
  wing.connect(wd).connect(wg.gain);
  wind.connect(wf).connect(wg).connect(out);
  // Drone: two soft detuned triangles on F rising an octave and a fifth.
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  a.type = 'triangle';
  b.type = 'triangle';
  a.frequency.setValueAtTime(87.3, t);
  b.frequency.setValueAtTime(87.3 * 1.004, t);
  a.frequency.exponentialRampToValueAtTime(87.3 * 3, t + 30);
  b.frequency.exponentialRampToValueAtTime(87.3 * 3 * 1.004, t + 30);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.exponentialRampToValueAtTime(2200, t + 30);
  const dg = ctx.createGain();
  dg.gain.value = 0.05;
  a.connect(lp);
  b.connect(lp);
  lp.connect(dg).connect(out);
  // Bowed vibes: a singing C that glides up an octave over the flight.
  note(k, 'vibesbow', 72, 0.05, { vel: 0.3, att: 1.2, dur: 30, rel: 0.3, glide: 12 }, out);
  const srcs = [wind, wing, a, b];
  for (const s of srcs) s.start(t);
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    try {
      const n = ctx.currentTime;
      out.gain.cancelScheduledValues(n);
      out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), n);
      out.gain.setTargetAtTime(0.0001, n, 0.06);
      for (const s of srcs) s.stop(n + 0.4);
      setTimeout(() => out.disconnect(), 600);
    } catch {
      /* already stopped */
    }
  };
}

/** The night wind catches the moth: a gust, wings faltering, a soft falling harp. */
export function fizzle(k: FxKit) {
  k = lv(k, -7);
  burst(k, { dur: 1.1, f: 300, to: 1500, q: 0.8, vol: 0.2, att: 0.15, pan: -0.3 });
  burst(k, { d: 0.2, dur: 0.9, f: 1800, to: 450, q: 1.5, vol: 0.12, att: 0.1, pan: 0.3 });
  wings(k, 0.1, 7, 9, 0.08, 0.4, -0.4);
  [77, 72, 68, 65, 60].forEach((m, i) => note(k, 'harp', m, 0.35 + i * 0.09, { vel: 0.38 - i * 0.03, pan: 0.3 - i * 0.15 }));
  tone(k, 110, 0.4, 'sine', 0.1, 0.05, 60);
}

// ---- Teich-Derby, Eisstraße, Zielscheibe --------------------------------------------

/** A rubber duck: a squeezed, nasal "qua-ack" (saw through two vowel formants). */
export function quack(k: FxKit, pitch = 1) {
  k = lv(k, -5);
  const ctx = k.ctx;
  const syl = (d: number, f0: number, len: number, vol: number) => {
    const t = ctx.currentTime + d;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f0 * 0.9, t);
    o.frequency.linearRampToValueAtTime(f0 * 1.08, t + len * 0.25);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.72, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.setValueAtTime(vol, t + len * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    const sum = ctx.createGain();
    sum.connect(g);
    for (const [ff, q, gg] of [[1100, 5, 1], [2600, 7, 0.5]] as const) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff * Math.sqrt(pitch);
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = gg;
      o.connect(bp).connect(fg).connect(sum);
    }
    const p = ctx.createStereoPanner();
    p.pan.value = rnd(-0.3, 0.3);
    g.connect(p).connect(k.out);
    o.start(t);
    o.stop(t + len + 0.05);
  };
  const f = 520 * pitch * rnd(0.97, 1.03);
  syl(0, f, 0.09, 0.22);
  syl(0.12, f * 0.95, 0.16, 0.26);
}

/** Falling into the water: a slap on the surface, a gulp, a spray and droplets. */
export function splash(k: FxKit, big = 1) {
  k = lv(k, -2);
  hit(k, 'cajon', 'slap', 0, { vel: 0.45 * big, lp: 2500 });
  burst(k, { dur: 0.5 * big, f: 2600, to: 500, q: 0.8, vol: 0.26, att: 0.005 });
  burst(k, { d: 0.03, dur: 0.7 * big, f: 5000, type: 'highpass', q: 0.7, vol: 0.06, att: 0.02 });
  tone(k, 220, 0.22, 'sine', 0.14 * big, 0.01, 70);
  for (let i = 0; i < 6; i++) {
    const d = 0.12 + i * rnd(0.05, 0.09);
    const f = rnd(900, 1900);
    tone(k, f, 0.05, 'sine', 0.035, d, f * 1.6);
  }
}

/** A dart into a cork target: dull knock, the shaft humming for a moment. */
export function thunk(k: FxKit) {
  k = lv(k, -8);
  hit(k, 'woodblock', 'w', 0, { vel: 0.45, cents: -1500 + rnd(-80, 80), dur: 0.08, rel: 0.06, lp: 1500 });
  hit(k, 'cajon', 'tone', 0, { vel: 0.4, lp: 1200 });
  burst(k, { dur: 0.03, f: 3000, q: 2, vol: 0.12 });
  // The shaft quivering: a quick wobbling twang.
  const ctx = k.ctx;
  const t = ctx.currentTime + 0.012;
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = rnd(300, 340);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  const am = ctx.createOscillator();
  am.frequency.value = 22;
  const ad = ctx.createGain();
  ad.gain.value = 0.03;
  am.connect(ad).connect(g.gain);
  o.connect(g).connect(k.out);
  o.start(t);
  am.start(t);
  o.stop(t + 0.36);
  am.stop(t + 0.36);
}

/** Ice cracking: sharp splintering snaps, a glassy tinkle and a low groan in the sheet. */
export function iceCrack(k: FxKit) {
  let d = 0;
  for (let i = 0; i < 7; i++) {
    burst(k, { d, dur: rnd(0.015, 0.035), f: rnd(2500, 6000), q: 3, vol: 0.32 - i * 0.035, pan: rnd(-0.5, 0.5) });
    d += rnd(0.02, 0.06);
  }
  hit(k, 'claves', 'c', 0, { vel: 0.3, cents: 900, dur: 0.03, rel: 0.02, lp: 8000 });
  [93, 98].forEach((m, i) => note(k, 'glock', m - 2, 0.05 + i * 0.06, { vel: 0.12, lp: 8000, cents: rnd(-30, 30) }));
  tone(k, 85, 0.35, 'sine', 0.18, 0.05, 48);
}

/** A light hop onto ice: a soft tap and a glassy ping climbing with every step. */
export function hop(k: FxKit, step = 0) {
  k = lv(k, -3);
  const s = Math.max(0, Math.min(step, 14));
  hit(k, 'shaker', 'up', 0, { vel: 0.25, lp: 6000 });
  burst(k, { dur: 0.025, f: 2400, q: 2, vol: 0.12 });
  note(k, 'celesta', penta(3 + s), 0.01, { vel: 0.3, lp: 5500, pan: rnd(-0.2, 0.2) });
}

// ---- Sternenhimmel (keno), Glühwürmchen-Bingo, Kratzglück ---------------------------

/** A shooting star streaking across the dome. */
export function starFall(k: FxKit) {
  k = lv(k, -2);
  const pan = pick([-1, 1]);
  burst(k, { dur: 0.45, f: 6000, to: 1500, q: 1.6, vol: 0.06, att: 0.08, pan: pan * 0.5 });
  hit(k, 'marktree', 'desc', 0, { vel: 0.12, lp: 9000, pan: -pan * 0.3 });
}

/** A picked star is hit: bells climbing the F major scale with every hit. */
export function starHit(k: FxKit, i: number) {
  const m = scale(4 + Math.max(0, Math.min(i, 14)));
  note(k, 'vibes', m > 88 ? m - 12 : m, 0, { vel: 0.6 });
  note(k, 'celesta', Math.min(96, m + 12), 0.01, { vel: 0.3, lp: 5500, pan: 0.25 });
  note(k, 'glock', Math.min(96, m + 7 + 12 > 96 ? m + 7 : m + 19), 0.07, { vel: 0.2, lp: 6000, pan: -0.25 });
}

/** A firefly settles on a number; a hit glows warmer and brighter than a miss. */
export function firefly(k: FxKit, hit_: boolean) {
  k = lv(k, -3);
  if (hit_) {
    const m = penta(rnd(5, 10) | 0);
    note(k, 'vibes', m, 0, { vel: 0.5, pan: rnd(-0.3, 0.3) });
    note(k, 'celesta', m + 12, 0.02, { vel: 0.22, lp: 5000 });
  } else note(k, 'celesta', penta(rnd(5, 10) | 0), 0, { vel: 0.22, lp: 4000, pan: rnd(-0.4, 0.4) });
}

/** Scratching the coating: a few gritty micro-scrapes (fires constantly while scratching). */
export function scratch(k: FxKit) {
  k = lv(k, -5);
  const base = rnd(2600, 4200);
  let d = 0;
  const n = 3 + ((Math.random() * 3) | 0);
  for (let i = 0; i < n; i++) {
    burst(k, { d, dur: rnd(0.012, 0.025), f: base * rnd(0.85, 1.2), q: 1.6, vol: rnd(0.05, 0.08) });
    d += rnd(0.012, 0.022);
  }
}

// ---- Diamantminen, Drachenturm, Mondmünze -------------------------------------------

/** A stone cracking open: a hard crack, a knock of rock and a little grit trickling. */
export function crack(k: FxKit) {
  burst(k, { dur: 0.04, f: 2600, q: 2, vol: 0.3 });
  hit(k, 'tom', 'rim', 0, { vel: 0.4, cents: -300, lp: 3000 });
  hit(k, 'claves', 'c', 0.01, { vel: 0.25, cents: -900, dur: 0.04, rel: 0.03, lp: 4000 });
  tone(k, 150, 0.12, 'sine', 0.16, 0.01, 85);
  let d = 0.05;
  for (let i = 0; i < 6; i++) {
    burst(k, { d, dur: 0.012, f: rnd(3000, 6000), q: 2, vol: 0.08 * (1 - i / 7), pan: rnd(-0.4, 0.4) });
    d += rnd(0.025, 0.06);
  }
}

/** A soft puff of smoke: no bang, just air and a low thump. */
export function puff(k: FxKit) {
  burst(k, { dur: 0.7, f: 900, to: 220, type: 'lowpass', q: 0.8, vol: 0.22, att: 0.03 });
  burst(k, { dur: 0.45, f: 2500, to: 900, q: 0.8, vol: 0.05, att: 0.06, pan: 0.2 });
  hit(k, 'shaker', 'down', 0.03, { vel: 0.2, lp: 3000 });
  tone(k, 105, 0.32, 'sine', 0.14, 0, 55);
}

/** A brass coin flicked into the air: thumbnail flick, then a ring that wobbles as it spins. */
export function coinFlip(k: FxKit) {
  hit(k, 'claves', 'c', 0, { vel: 0.22, cents: 800, dur: 0.02, rel: 0.02, lp: 8000 });
  burst(k, { dur: 0.02, f: 4200, q: 3, vol: 0.12 });
  const ctx = k.ctx;
  const t = ctx.currentTime + 0.02;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.7, t);
  const lfo = ctx.createOscillator();
  lfo.frequency.setValueAtTime(14, t);
  lfo.frequency.linearRampToValueAtTime(8, t + 0.8);
  const ld = ctx.createGain();
  ld.gain.value = 0.5;
  lfo.connect(ld).connect(g.gain);
  g.connect(k.out);
  lfo.start(t);
  lfo.stop(t + 1);
  hit(k, 'triangle', 'hit', 0.02, { vel: 0.18, lp: 7000, cents: -300 }, g);
  note(k, 'glock', 86, 0.02, { vel: 0.18, lp: 6000 }, g);
}

/** The coin lands on brass and rattles flat, faster and faster. */
export function coinLand(k: FxKit) {
  note(k, 'glock', 84, 0, { vel: 0.42, lp: 6500 });
  hit(k, 'triangle', 'mute', 0, { vel: 0.12, lp: 9000, cents: -200 });
  burst(k, { dur: 0.02, f: 5000, q: 2, vol: 0.12 });
  let d = 0.1;
  let gap = 0.075;
  for (let i = 0; i < 7; i++) {
    hit(k, 'triangle', 'mute', d, { vel: 0.08 * (1 - i / 8), lp: 9000, cents: rnd(-500, 0), dur: 0.05, rel: 0.04, pan: rnd(-0.2, 0.2) });
    d += gap;
    gap *= 0.72;
  }
}

/** A heavy wooden door creaking open: a slowly scraped guiro pitched down, dark. */
export function creak(k: FxKit) {
  k = lv(k, -8);
  hit(k, 'guiro', 'slow', 0, { vel: 0.45, cents: -1000 + rnd(-100, 100), dur: 0.55, rel: 0.15, lp: 1800, pan: rnd(-0.2, 0.2) });
  tone(k, rnd(170, 190), 0.4, 'sawtooth', 0.012, 0.02, 120, 0.06);
  tone(k, 70, 0.3, 'sine', 0.06, 0.45, 50);
}

// ---- Straßenwürfel, Großes Rad -------------------------------------------------------

/** A bone die hitting stone (strength 0..1): a dry click and a short hollow knock. */
export function diceHit(k: FxKit, strength = 1) {
  const v = Math.max(0.05, Math.min(1, strength));
  const pan = rnd(-0.3, 0.3);
  hit(k, 'claves', 'c', 0, { vel: 0.18 + 0.25 * v, cents: rnd(100, 600), dur: 0.025, rel: 0.02, lp: 7000, pan });
  hit(k, 'woodblock', 'w', 0.004, { vel: 0.1 + 0.2 * v, cents: rnd(-1000, -600), dur: 0.04, rel: 0.03, lp: 2500, pan });
  burst(k, { dur: 0.02, f: rnd(2800, 3800), q: 2.5, vol: 0.18 * v, pan });
}

/** The wheel's leather tongue snapping over a peg: soft, quick, slightly different every time. */
export function clicker(k: FxKit) {
  hit(k, 'claves', 'c', 0, { vel: rnd(0.1, 0.14), cents: rnd(-600, -350), dur: 0.018, rel: 0.02, lp: 3500, pan: 0.15 });
  burst(k, { dur: 0.012, f: rnd(2000, 2600), q: 2, vol: 0.05, pan: 0.15 });
}

/** Soft wing beats of a moth leaving its hiding place. */
export function flutter(k: FxKit) {
  k = lv(k, -3);
  const from = rnd(-0.5, 0.5);
  wings(k, 0, 6, rnd(12, 15), 0.1, from, from + pick([-0.4, 0.4]));
}

// ---- Cards ------------------------------------------------------------------------

/** Paper on felt: the snap of the card's edge, then the soft slap. */
function cardSlap(k: FxKit, d: number, vol: number, bright: number, pan: number) {
  burst(k, { d, dur: 0.03, f: 3000 * bright, to: 5500 * bright, q: 1.4, vol: 0.2 * vol, pan });
  burst(k, { d: d + 0.004, dur: 0.05, f: 900, type: 'lowpass', q: 0.8, vol: 0.28 * vol, pan });
  tone(k, rnd(170, 200), 0.04, 'sine', 0.05 * vol, d + 0.004, 110);
}

/** Poker: a card snapping over on the felt; `i` lifts it a little per card. */
export function pokerCard(k: FxKit, i = 0) {
  k = lv(k, 5);
  const pan = Math.max(-0.5, Math.min(0.5, -0.4 + i * 0.2));
  burst(k, { dur: 0.04, f: 1600, to: 4000, q: 1, vol: 0.06, pan });
  cardSlap(k, 0.035, rnd(0.9, 1.05), 1 + i * 0.04, pan);
}

/** Hold toggle: a brass latch — click plus a small bell, up when it locks, down when it lets go. */
export function pokerHold(k: FxKit, on: boolean) {
  k = lv(k, -4);
  hit(k, 'claves', 'c', 0, { vel: 0.22, cents: on ? 600 : 200, dur: 0.02, rel: 0.02, lp: 7000 });
  hit(k, 'triangle', 'mute', 0, { vel: 0.06, lp: 8000, cents: on ? 0 : -500 });
  note(k, 'vibes', on ? 84 : 77, 0.012, { vel: on ? 0.4 : 0.3, dur: 0.3, rel: 0.2 });
}

/** A card sliding off the shoe and slapping onto the felt. */
export function cardDeal(k: FxKit) {
  k = lv(k, 5);
  const pan = rnd(-0.2, 0.2);
  burst(k, { dur: 0.09, f: 1500, to: 4200, q: 0.9, vol: 0.09, att: 0.03, pan });
  cardSlap(k, 0.08, rnd(0.9, 1.05), rnd(0.9, 1.1), pan);
}

/** A card turned over: a soft snap of paper. */
export function cardFlip(k: FxKit) {
  k = lv(k, 3);
  const pan = rnd(-0.2, 0.2);
  burst(k, { dur: 0.035, f: 2200, to: 5000, q: 1.2, vol: 0.14, pan });
  cardSlap(k, 0.03, rnd(0.55, 0.7), 1.2, pan);
}

/** The slow peel of a squeezed card: paper bending, little stick-slip creaks getting denser. */
export function cardPeel(k: FxKit, duration = 0.8) {
  const D = Math.max(0.2, duration);
  burst(k, { dur: D, f: 800, to: 2400, q: 2.5, vol: 0.05, att: D * 0.5 });
  let d = 0.02;
  while (d < D - 0.02) {
    burst(k, { d, dur: 0.012, f: rnd(1800, 3600), q: 2.5, vol: rnd(0.03, 0.06) * (0.5 + d / D) });
    d += rnd(0.03, 0.09) * (1 - (d / D) * 0.6);
  }
}
