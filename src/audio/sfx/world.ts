// Effects of the world (UI, doors, elevator, foyer, arrival, boss, ambience …). See kit.ts.
// Every effect is layered: a transient (the touch), a body (the material) and a tail (the
// room). Things that fire often (clicks, footsteps, rustles) vary a little on every call.
import type { FxKit } from './kit';
import { hallIR, type InstId } from '../voices';
import { ftom } from '../sampler';

export const INSTRUMENTS: InstId[] = [
  // UI, foyer and arrival
  'piano', 'vibes', 'handbells', 'triangle', 'chimes', 'marktree', 'claves', 'slapstick', 'ratchet', 'tom',
  // the Moth Queen
  'timpani', 'gong', 'organ', 'choir',
];

// ---- Small building blocks ---------------------------------------------------------

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];

/** A stereo position on the way to `out`. */
function panTo(k: FxKit, p: number, out: AudioNode = k.out): AudioNode {
  const sp = k.ctx.createStereoPanner();
  sp.pan.value = Math.max(-1, Math.min(1, p));
  sp.connect(out);
  return sp;
}

interface Burst {
  /** Delay from now (s). */
  d?: number;
  dur: number;
  vol: number;
  f: number;
  type?: BiquadFilterType;
  q?: number;
  /** Filter frequency at the end. */
  to?: number;
  /** Attack (s); the rest of `dur` is an exponential fall. */
  att?: number;
  pan?: number;
  out?: AudioNode;
  /** Playback rate of the noise (lower = grainier, darker). */
  rate?: number;
}

/** Filtered noise with an attack/decay envelope, optional sweep and stereo position. */
function burst(k: FxKit, o: Burst) {
  const ctx = k.ctx;
  const t = ctx.currentTime + Math.max(0, o.d ?? 0);
  const src = ctx.createBufferSource();
  src.buffer = k.v.noiseBuffer;
  src.playbackRate.value = o.rate ?? 1;
  const f = ctx.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.frequency.setValueAtTime(o.f, t);
  if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  f.Q.value = o.q ?? 1;
  const g = ctx.createGain();
  const att = Math.min(o.att ?? 0.004, o.dur * 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  const out = o.out ?? k.out;
  src.connect(f).connect(g).connect(o.pan ? panTo(k, o.pan, out) : out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + o.dur + 0.05);
}

interface Osc {
  d?: number;
  dur: number;
  vol: number;
  f: number;
  to?: number;
  type?: OscillatorType;
  att?: number;
  pan?: number;
  out?: AudioNode;
  /** Lowpass on the voice. */
  lp?: number;
}

/** One oscillator with an envelope (and optional lowpass and pan). */
function osc(k: FxKit, o: Osc) {
  const ctx = k.ctx;
  const t = ctx.currentTime + Math.max(0, o.d ?? 0);
  const s = ctx.createOscillator();
  s.type = o.type ?? 'sine';
  s.frequency.setValueAtTime(o.f, t);
  if (o.to) s.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const g = ctx.createGain();
  const att = Math.min(o.att ?? 0.005, o.dur * 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(o.vol, t + att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  let node: AudioNode = s;
  if (o.lp) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = o.lp;
    f.Q.value = 0.6;
    s.connect(f);
    node = f;
  }
  const out = o.out ?? k.out;
  node.connect(g).connect(o.pan ? panTo(k, o.pan, out) : out);
  s.start(t);
  s.stop(t + o.dur + 0.05);
}

/** A struck glass: inharmonic partials that die away at different rates, with a slight beat. */
function glass(k: FxKit, f: number, vol: number, d = 0, out: AudioNode = k.out, len = 1, pan = 0) {
  const o = pan ? panTo(k, pan, out) : out;
  osc(k, { f, dur: 1.1 * len, vol, d, att: 0.001, out: o });
  osc(k, { f: f * 1.003, dur: 0.9 * len, vol: vol * 0.5, d, att: 0.001, out: o });
  osc(k, { f: f * 2.32, dur: 0.45 * len, vol: vol * 0.4, d, att: 0.001, out: o });
  osc(k, { f: f * 4.25, dur: 0.18 * len, vol: vol * 0.25, d, att: 0.001, out: o });
  burst(k, { d, dur: 0.012, vol: vol * 1.2, f: 6000, q: 2, out: o });
}

/** A metal bell (tram, slot machine) through a lowpass: hum, strike and partials. */
function metalBell(k: FxKit, f: number, vol: number, d: number, out: AudioNode, len = 1.2, lp = 3000) {
  const l = k.ctx.createBiquadFilter();
  l.type = 'lowpass';
  l.frequency.value = lp;
  l.connect(out);
  for (const [r, a, ln] of [[0.5, 0.35, 1.4], [1, 1, 1], [1.19, 0.45, 0.7], [1.5, 0.3, 0.6], [2.0, 0.35, 0.5], [2.74, 0.2, 0.3]] as const)
    osc(k, { f: f * r, dur: len * ln, vol: vol * a, d, att: 0.002, out: l });
}

/**
 * A voice laughing "ha-ha-ha": a buzzing glottal source through two vowel formants, each
 * syllable a breath pulse, falling in pitch and slowing down. Used by the Queen and, far
 * away and muffled, by a guest in the casino crowd.
 */
function laugh(k: FxKit, at: number, out: AudioNode, o: { f0: number; n: number; vol: number; lp?: number; gap?: number; fall?: number }) {
  const ctx = k.ctx;
  const t0 = ctx.currentTime + at;
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  const vib = ctx.createOscillator();
  const vibG = ctx.createGain();
  vib.frequency.value = 6.5;
  vibG.gain.value = o.f0 * 0.025;
  vib.connect(vibG).connect(src.frequency);
  const breath = ctx.createBufferSource();
  breath.buffer = k.v.noiseBuffer;
  breath.loop = true;
  const bG = ctx.createGain();
  bG.gain.value = 0.35;
  const env = ctx.createGain();
  env.gain.value = 0;
  const mix = ctx.createGain();
  src.connect(mix);
  breath.connect(bG).connect(mix);
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  const f3 = ctx.createBiquadFilter();
  f1.type = f2.type = f3.type = 'bandpass';
  f1.frequency.value = 800;
  f2.frequency.value = 1250;
  f3.frequency.value = 2700;
  f1.Q.value = 5;
  f2.Q.value = 6;
  f3.Q.value = 8;
  const g2 = ctx.createGain();
  g2.gain.value = 0.55;
  const g3 = ctx.createGain();
  g3.gain.value = 0.2;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = o.lp ?? 5000;
  mix.connect(f1).connect(env);
  mix.connect(f2).connect(g2).connect(env);
  mix.connect(f3).connect(g3).connect(env);
  env.connect(lp).connect(out);
  let t = t0;
  const gap = o.gap ?? 0.13;
  const fall = o.fall ?? 0.94;
  let f = o.f0;
  for (let i = 0; i < o.n; i++) {
    const len = gap * (0.62 + i * 0.03);
    // "h": breath first, then the voice comes in on the vowel and drops in pitch.
    src.frequency.setValueAtTime(f * 1.06, t);
    src.frequency.exponentialRampToValueAtTime(f * 0.93, t + len);
    const v = o.vol * (1 - i / (o.n + 2)) * rnd(0.85, 1.1);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(v, t + 0.018);
    env.gain.setTargetAtTime(0, t + len * 0.55, len * 0.18);
    t += gap * (1 + i * 0.07) * rnd(0.92, 1.08);
    f *= fall;
  }
  for (const s of [src, vib, breath]) {
    s.start(t0);
    s.stop(t + 0.3);
  }
}

// ---- UI -------------------------------------------------------------------------

let clickN = 0;
/** A small bakelite button: a soft clave tick with a felt-damped body; never quite the same twice. */
export function click(k: FxKit) {
  clickN++;
  const c = rnd(-60, 60) + (clickN % 2 ? 0 : 40);
  k.v.hit('claves', 'c', 0, k.out, { vel: rnd(0.2, 0.26), cents: c - 500, lp: 4200, gain: 0.25, pan: rnd(-0.1, 0.1) });
  burst(k, { dur: 0.018, vol: 0.025, f: rnd(3000, 3800), q: 3 });
  osc(k, { f: 880 * Math.pow(2, c / 1200), dur: 0.06, vol: 0.006, type: 'triangle', att: 0.002 });
}

/** Hovering a card: the faintest glassy tick, picking a note of a pentatonic scale. */
export function hover(k: FxKit) {
  const f = pick([1568, 1760, 2093, 2349, 2637]) * rnd(0.997, 1.003);
  osc(k, { f, dur: 0.09, vol: 0.024, att: 0.003, pan: rnd(-0.25, 0.25) });
  osc(k, { f: f * 2.01, dur: 0.04, vol: 0.008, att: 0.002 });
}

/** Air moving past: a swept band of noise that travels across the stereo field. */
export function whoosh(k: FxKit) {
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const dir = Math.random() < 0.5 ? -1 : 1;
  const len = rnd(0.34, 0.44);
  const sp = ctx.createStereoPanner();
  sp.pan.setValueAtTime(-0.5 * dir, t);
  sp.pan.linearRampToValueAtTime(0.5 * dir, t + len);
  sp.connect(k.out);
  for (const [f0, f1, q, v] of [[320, 2600, 1.4, 0.05], [900, 5200, 2.5, 0.018]] as const) {
    const src = ctx.createBufferSource();
    src.buffer = k.v.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = q;
    const p = rnd(0.9, 1.1);
    f.frequency.setValueAtTime(f0 * p, t);
    f.frequency.exponentialRampToValueAtTime(f1 * p, t + len * 0.6);
    f.frequency.exponentialRampToValueAtTime(f1 * p * 0.6, t + len);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + len * 0.55);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(sp);
    src.start(t, Math.random());
    src.stop(t + len + 0.05);
  }
}

// ---- Doors and the elevator -------------------------------------------------------

/** The heavy casino door: latch, a draught of air, the oak settling into the frame and the little shop bell above it. */
export function door(k: FxKit) {
  burst(k, { dur: 0.03, vol: 0.12, f: 2400, q: 4 });
  burst(k, { d: 0.02, dur: 0.6, vol: 0.06, f: 260, type: 'lowpass', q: 0.7, att: 0.2 });
  k.v.hit('tom', 'hit', 0.05, k.out, { vel: 0.3, cents: -700, lp: 500, gain: 0.5 });
  osc(k, { d: 0.05, f: 88, to: 55, dur: 0.4, vol: 0.09 });
  // The bell on its spring: two strikes, the second softer.
  k.v.hit('handbells', 'b', 0.12, k.out, { vel: 0.24, cents: rnd(-30, 30), pan: 0.25 });
  k.v.hit('handbells', 'b', 0.27, k.out, { vel: 0.15, cents: rnd(-30, 30) + 200, pan: 0.3 });
}

/** Brass elevator doors running on their rollers, closing with a padded thump. */
export function elevatorDoor(k: FxKit) {
  burst(k, { dur: 0.04, vol: 0.06, f: 1800, q: 4 });
  // The rollers: a low rumble with a brass edge, slowing towards the end.
  burst(k, { dur: 0.66, vol: 0.06, f: 900, q: 2, to: 500, att: 0.08, rate: 0.6 });
  burst(k, { dur: 0.66, vol: 0.08, f: 180, type: 'lowpass', q: 1, att: 0.1, rate: 0.5 });
  for (let i = 0; i < 5; i++) burst(k, { d: 0.08 + i * rnd(0.09, 0.12), dur: 0.02, vol: 0.02, f: rnd(2200, 3200), q: 6 });
  // Doors meet.
  k.v.hit('tom', 'hit', 0.62, k.out, { vel: 0.25, cents: -900, lp: 380, gain: 0.6 });
  osc(k, { d: 0.62, f: 72, to: 48, dur: 0.28, vol: 0.09 });
  osc(k, { d: 0.63, f: 1046, dur: 0.6, vol: 0.006, lp: 2000 });
}

/** Floor button: a brass click and a small lit-up note on the vibraphone. */
export function elevatorButton(k: FxKit) {
  k.v.hit('claves', 'c', 0, k.out, { vel: 0.25, cents: -300, lp: 5000, gain: 0.3 });
  burst(k, { dur: 0.02, vol: 0.06, f: 2600, q: 3 });
  k.v.note('vibes', pick([79, 81, 84]), 0.025, k.out, { vel: 0.22, dur: 0.25, rel: 0.4, gain: 0.6 });
}

/** The ride: the motor winding up, cable hum, the car creaking on its rails, a settle at the end. */
export function elevatorRide(k: FxKit, dur: number, up: boolean) {
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const end = t + dur;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(0.5, t + 0.35);
  out.gain.setValueAtTime(0.5, end - 0.4);
  out.gain.exponentialRampToValueAtTime(0.0001, end);
  out.connect(k.out);
  // Motor: two detuned saws through a lowpass; it rises as it speeds up and sags when braking.
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 320;
  lp.Q.value = 2;
  const mg = ctx.createGain();
  mg.gain.value = 0.035;
  lp.connect(mg).connect(out);
  const f0 = up ? 52 : 60;
  const f1 = up ? 68 : 56;
  const oscs: OscillatorNode[] = [];
  for (const det of [0, 9]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.detune.value = det;
    o.frequency.setValueAtTime(f0 * 0.7, t);
    o.frequency.exponentialRampToValueAtTime(f0, t + 0.6);
    o.frequency.linearRampToValueAtTime(f1, end - 0.5);
    o.frequency.exponentialRampToValueAtTime(f1 * 0.75, end);
    o.connect(lp);
    oscs.push(o);
  }
  const hum = ctx.createOscillator();
  hum.frequency.value = 110;
  const hg = ctx.createGain();
  hg.gain.value = 0.03;
  hum.connect(hg).connect(out);
  oscs.push(hum);
  // Air in the shaft.
  const air = ctx.createBufferSource();
  air.buffer = k.v.noiseBuffer;
  air.loop = true;
  const af = ctx.createBiquadFilter();
  af.type = 'bandpass';
  af.frequency.value = up ? 500 : 400;
  af.Q.value = 0.7;
  const ag = ctx.createGain();
  ag.gain.value = 0.035;
  air.connect(af).connect(ag).connect(out);
  for (const o of oscs) {
    o.start(t);
    o.stop(end + 0.1);
  }
  air.start(t);
  air.stop(end + 0.1);
  // Rail creaks and cable ticks, sparse and irregular.
  for (let d = 0.35; d < dur - 0.3; d += rnd(0.4, 0.8)) burst(k, { d, dur: 0.035, vol: rnd(0.012, 0.025), f: rnd(1400, 2400), q: 5, pan: rnd(-0.4, 0.4) });
  // Settling into the floor.
  k.v.hit('tom', 'hit', Math.max(0, dur - 0.15), k.out, { vel: 0.18, cents: -1000, lp: 300, gain: 0.6 });
}

/** Arrival: a two-note ding on the vibraphone, a glockenspiel shine on top. */
export function elevatorDing(k: FxKit) {
  k.v.note('vibes', 88, 0, k.out, { vel: 0.62, pan: -0.1 });
  k.v.note('vibes', 84, 0.34, k.out, { vel: 0.55, pan: 0.1 });
  osc(k, { f: 2637, dur: 1.4, vol: 0.01, att: 0.002 });
  osc(k, { d: 0.34, f: 2093, dur: 1.6, vol: 0.009, att: 0.002 });
}

// ---- Foyer -----------------------------------------------------------------------

/** The foyer's grand piano: the real thing, ringing on a little after the key comes up. */
export function pianoNote(k: FxKit, freq: number, vel = 1) {
  const m = ftom(freq);
  k.v.note('piano', m, 0, k.out, { vel: Math.min(1, 0.66 * vel * rnd(0.94, 1.05)), dur: 1.6, rel: 0.9, pan: Math.max(-0.4, Math.min(0.4, (m - 66) / 50)) });
}

/** The brass bell on the reception desk: the palm tap, the ding, a whisper of triangle shimmer. */
export function deskBell(k: FxKit) {
  burst(k, { dur: 0.015, vol: 0.06, f: 3000, q: 3 });
  k.v.hit('handbells', 'b', 0.004, k.out, { vel: 0.85, cents: rnd(-25, 25) + 500 });
  k.v.hit('triangle', 'hit', 0.006, k.out, { vel: 0.3, gain: 0.7 });
  osc(k, { f: 2093, dur: 1.6, vol: 0.035, att: 0.002 });
}

/** Bubbles rising in a glass: a soft hiss and tiny pops, thinning out. */
export function fizz(k: FxKit) {
  burst(k, { dur: 1.0, vol: 0.035, f: 7000, type: 'highpass', att: 0.05 });
  const n = 26;
  for (let i = 0; i < n; i++) {
    const d = Math.pow(Math.random(), 1.6) * 1.0;
    const f = rnd(2400, 5200);
    osc(k, { d, f, to: f * 1.25, dur: rnd(0.012, 0.03), vol: rnd(0.01, 0.035) * (1 - d * 0.6), att: 0.001, pan: rnd(-0.3, 0.3) });
  }
}

/** Two glasses meeting: two slightly different pitches, so they beat against each other. */
export function clink(k: FxKit) {
  const f = rnd(1900, 2300);
  glass(k, f, 0.09, 0, k.out, 1.1, -0.15);
  glass(k, f * rnd(1.05, 1.09), 0.07, 0.006, k.out, 1, 0.15);
}

/** Westminster quarters, one change per call (in turn), on tubular chimes after a soft shimmer. */
const CHANGES = [
  [76, 74, 72, 67],
  [72, 76, 74, 67],
  [72, 74, 76, 72],
  [76, 72, 74, 67],
  [67, 74, 76, 72],
];
let change = 0;
export function chime(k: FxKit) {
  k.v.hit('marktree', 'desc', 0, k.out, { vel: 0.3, gain: 0.5, pan: 0.2 });
  const ch = CHANGES[change++ % CHANGES.length];
  ch.forEach((m, i) => k.v.note('chimes', m, 0.1 + i * 0.36, k.out, { vel: i === 3 ? 0.5 : 0.42, pan: (i - 1.5) * 0.08 }));
}

/** The boiler's steam whistle: a breathy A-major triad that scoops up into pitch and settles. */
export function steamWhistle(k: FxKit) {
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const len = 1.25;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(1, t + 0.12);
  g.gain.setValueAtTime(1, t + len - 0.25);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(k.out);
  for (const [f, v] of [[440, 0.03], [554, 0.024], [659, 0.02]] as const) {
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(f * 0.9, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.16);
    o.frequency.setValueAtTime(f, t + len - 0.3);
    o.frequency.exponentialRampToValueAtTime(f * 0.96, t + len);
    const w = ctx.createOscillator();
    const wg = ctx.createGain();
    w.frequency.value = rnd(4.5, 6);
    wg.gain.value = f * 0.004;
    w.connect(wg).connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = v;
    o.connect(og).connect(g);
    for (const s of [o, w]) {
      s.start(t);
      s.stop(t + len + 0.05);
    }
    // Breath on each pipe.
    burst(k, { dur: len, vol: v * 0.8, f, q: 12, att: 0.1, out: g });
  }
  // Steam hissing out of the valve, outlasting the tone.
  burst(k, { dur: len + 0.5, vol: 0.04, f: 4200, q: 0.8, att: 0.05, to: 2800 });
  burst(k, { dur: 0.05, vol: 0.06, f: 1800, q: 3 });
}

// ---- The Moth Queen -----------------------------------------------------------------

/**
 * A new boss phase. 1: a timpani stroke and a dark organ chord (the warning).
 * 2: timpani and gong under organ and choir in D minor. 3: everything, a semitone
 * clash in the choir and the gong left ringing.
 */
export function bossSting(k: FxKit, phase = 2) {
  const p = Math.max(1, Math.min(3, Math.round(phase)));
  // The recorded orchestra is loud; trim it so the sting sits above the music, not over everything.
  const out = k.ctx.createGain();
  out.gain.value = 0.32;
  out.connect(k.out);
  // D minor; phase 3 adds the flat sixth that pulls against the fifth.
  const organ = p >= 3 ? [38, 50, 53, 57, 58] : [38, 50, 53, 57];
  k.v.note('timpani', 50, 0, out, { vel: 0.7 + p * 0.1 });
  k.v.note('timpani', 45, 0.002, out, { vel: 0.5 + p * 0.1 });
  osc(k, { f: 73.4, to: 55, dur: 1.2, vol: 0.3 + p * 0.08, out });
  burst(k, { dur: 0.3, vol: 0.12, f: 220, type: 'lowpass', q: 0.8, out });
  k.v.chord('organ', organ, 0.06, out, { vel: 0.5 + p * 0.07, dur: 0.9 + p * 0.4, rel: 1.1, att: 0.03 });
  if (p >= 2) {
    k.v.hit('gong', 'g', 0.02, out, { vel: 0.45 + (p - 2) * 0.3 });
    k.v.chord('choir', p >= 3 ? [62, 65, 69, 70] : [62, 65, 69], 0.12, out, { vel: 0.6, dur: 1.1 + p * 0.3, rel: 1.4, att: 0.12 });
  }
  if (p >= 3) {
    k.v.note('timpani', 50, 0.5, out, { vel: 0.6 });
    k.v.note('timpani', 45, 0.75, out, { vel: 0.85 });
  }
  // Wings rushing past.
  burst(k, { d: 0.2, dur: 0.9, vol: 0.05 + p * 0.015, f: 600, q: 0.8, to: 3500, att: 0.3, pan: -0.3 });
  burst(k, { d: 0.32, dur: 0.8, vol: 0.04 + p * 0.012, f: 700, q: 0.8, to: 3000, att: 0.3, pan: 0.3 });
}

/** The Queen laughs: a cold, theatrical "ha-ha-ha-ha" falling away, with a shadow an octave up. */
export function queenLaugh(k: FxKit) {
  const f0 = rnd(300, 330);
  laugh(k, 0, k.out, { f0, n: 5, vol: 0.18, gap: 0.12, fall: 0.95 });
  laugh(k, 0.004, panTo(k, 0.25, k.verb), { f0: f0 * 2.005, n: 5, vol: 0.04, gap: 0.12, fall: 0.95, lp: 3500 });
}

// ---- Little things ----------------------------------------------------------------

/** A box camera: shutter blade, the mirror slapping back, the spring winding down. */
export function shutter(k: FxKit) {
  burst(k, { dur: 0.012, vol: 0.18, f: 4200, q: 5 });
  burst(k, { d: 0.006, dur: 0.03, vol: 0.08, f: 1200, q: 2 });
  burst(k, { d: 0.07, dur: 0.02, vol: 0.14, f: 2600, q: 4 });
  k.v.hit('claves', 'c', 0.07, k.out, { vel: 0.18, cents: -700, lp: 3000, gain: 0.5 });
  osc(k, { d: 0.09, f: 1500, to: 800, dur: 0.12, vol: 0.012, type: 'triangle' });
  for (let i = 0; i < 4; i++) burst(k, { d: 0.11 + i * 0.022, dur: 0.012, vol: 0.03 * (1 - i / 5), f: 3400, q: 6 });
}

/** Cloth and paper: a handful of soft crackles in a short swell, different every time. */
export function rustle(k: FxKit) {
  const len = rnd(0.24, 0.36);
  const base = rnd(1600, 2600);
  burst(k, { dur: len, vol: 0.022, f: base, q: 0.9, att: len * 0.4, to: base * 0.6 });
  const n = 9 + Math.floor(Math.random() * 6);
  for (let i = 0; i < n; i++) {
    const d = Math.random() * len;
    const env = Math.sin((d / len) * Math.PI);
    burst(k, { d, dur: rnd(0.012, 0.035), vol: rnd(0.012, 0.03) * (0.4 + env), f: rnd(1800, 5200), q: rnd(1.5, 3), pan: rnd(-0.2, 0.2) });
  }
}

let stepN = 0;
/** A footstep on the carpet: heel then toe, left and right a touch apart. */
export function footstep(k: FxKit) {
  stepN++;
  const side = stepN % 2 ? -0.08 : 0.08;
  const v = rnd(0.8, 1.1);
  burst(k, { dur: 0.06, vol: 0.03 * v, f: rnd(380, 520), type: 'lowpass', q: 0.8, pan: side });
  osc(k, { f: rnd(70, 85), to: 50, dur: 0.07, vol: 0.015 * v, pan: side });
  burst(k, { d: rnd(0.05, 0.07), dur: 0.04, vol: 0.012 * v, f: rnd(900, 1300), q: 1.2, pan: side });
}

/** Starting pistol for the duck race: a whip-crack report and its boom rolling off the water. */
export function starter(k: FxKit) {
  k.v.hit('slapstick', 's', 0, k.out, { vel: 0.8 });
  burst(k, { dur: 0.02, vol: 0.3, f: 3000, q: 1 });
  burst(k, { dur: 0.35, vol: 0.2, f: 1400, type: 'lowpass', q: 0.7, to: 300 });
  osc(k, { f: 95, to: 42, dur: 0.3, vol: 0.2 });
  // The echo across the pond.
  burst(k, { d: 0.18, dur: 0.6, vol: 0.04, f: 900, type: 'lowpass', q: 0.6, att: 0.02, out: k.verb });
}

// ---- Arrival: the taxi -------------------------------------------------------------

/**
 * A running 1920s taxi: two detuned saws and a sub pulsed at the firing rate through a filter
 * that opens with the revs, an exhaust burble, tyre roll and the hiss of a wet road.
 * `set(rpm, speed)` glides to new values (both 0..1); `stop()` turns the engine off.
 */
export function car(k: FxKit): { set(rpm: number, speed: number, glide?: number): void; stop(): void } {
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 0.25);
  out.connect(k.out);
  const a = ctx.createOscillator();
  const b = ctx.createOscillator();
  const sub = ctx.createOscillator();
  a.type = 'sawtooth';
  b.type = 'sawtooth';
  sub.type = 'square';
  b.detune.value = 14;
  const mix = ctx.createGain();
  mix.gain.value = 0.09;
  const subGain = ctx.createGain();
  subGain.gain.value = 0.05;
  a.connect(mix);
  b.connect(mix);
  sub.connect(subGain).connect(mix);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 3;
  const am = ctx.createGain();
  am.gain.value = 0.6;
  const lfo = ctx.createOscillator();
  lfo.type = 'triangle';
  const lfoDepth = ctx.createGain();
  lfoDepth.gain.value = 0.4;
  lfo.connect(lfoDepth).connect(am.gain);
  mix.connect(lp).connect(am).connect(out);
  // Exhaust: low noise chopped by the same firing pulse, so it burbles with the engine.
  const ex = ctx.createBufferSource();
  ex.buffer = k.v.noiseBuffer;
  ex.loop = true;
  ex.playbackRate.value = 0.5;
  const exF = ctx.createBiquadFilter();
  exF.type = 'lowpass';
  exF.frequency.value = 260;
  const exG = ctx.createGain();
  exG.gain.value = 0.25;
  ex.connect(exF).connect(exG).connect(am);
  // Tyres: rolling rumble and the hiss of rainwater.
  const road = ctx.createBufferSource();
  road.buffer = k.v.noiseBuffer;
  road.loop = true;
  const roadF = ctx.createBiquadFilter();
  roadF.type = 'bandpass';
  roadF.frequency.value = 350;
  roadF.Q.value = 0.8;
  const roadG = ctx.createGain();
  roadG.gain.value = 0.0001;
  road.connect(roadF).connect(roadG).connect(out);
  const wet = ctx.createBiquadFilter();
  wet.type = 'highpass';
  wet.frequency.value = 2800;
  const wetG = ctx.createGain();
  wetG.gain.value = 0.0001;
  road.connect(wet).connect(wetG).connect(out);
  const apply = (rpm: number, speed: number, at: number, glide: number) => {
    const f = 34 + rpm * 62;
    a.frequency.setTargetAtTime(f, at, glide);
    b.frequency.setTargetAtTime(f, at, glide);
    sub.frequency.setTargetAtTime(f / 2, at, glide);
    lfo.frequency.setTargetAtTime(f / 2, at, glide);
    lp.frequency.setTargetAtTime(220 + rpm * 1300, at, glide);
    mix.gain.setTargetAtTime(0.07 + rpm * 0.07, at, glide);
    exF.frequency.setTargetAtTime(200 + rpm * 400, at, glide);
    roadG.gain.setTargetAtTime(0.0001 + speed * 0.07, at, glide);
    roadF.frequency.setTargetAtTime(250 + speed * 500, at, glide);
    wetG.gain.setTargetAtTime(0.0001 + speed * 0.022, at, glide);
  };
  apply(0.15, 0, t, 0.01);
  for (const o of [a, b, sub, lfo]) o.start(t);
  road.start(t);
  ex.start(t);
  let stopped = false;
  return {
    set: (rpm, speed, glide = 0.25) => !stopped && apply(rpm, speed, ctx.currentTime, glide),
    stop: () => {
      if (stopped) return;
      stopped = true;
      const n = ctx.currentTime;
      apply(0, 0, n, 0.15);
      out.gain.setTargetAtTime(0.0001, n + 0.1, 0.25);
      for (const o of [a, b, sub, lfo, road, ex]) o.stop(n + 1.5);
    },
  };
}

/** The starter motor cranking three times, then the engine catching with a cough. */
export function ignition(k: FxKit) {
  for (let i = 0; i < 3; i++) {
    const d = i * 0.13;
    osc(k, { d, f: 38, to: 46, dur: 0.12, vol: 0.05, type: 'sawtooth', lp: 900 });
    burst(k, { d, dur: 0.11, vol: 0.05, f: 1100, q: 2, att: 0.02 });
    burst(k, { d, dur: 0.015, vol: 0.04, f: 3000, q: 4 });
  }
  // Catch: a cough of exhaust and the first revs.
  burst(k, { d: 0.4, dur: 0.18, vol: 0.12, f: 300, type: 'lowpass', q: 1 });
  osc(k, { d: 0.4, f: 55, to: 95, dur: 0.45, vol: 0.06, type: 'sawtooth', lp: 700 });
}

/** Brakes on a wet road: tyres hissing through the water, a short squeal, the springs settling. */
export function brake(k: FxKit) {
  burst(k, { dur: 0.8, vol: 0.06, f: 900, q: 1, to: 300, att: 0.08 });
  burst(k, { dur: 0.7, vol: 0.03, f: 4500, type: 'highpass', att: 0.05 });
  osc(k, { d: 0.06, f: 2350, to: 2150, dur: 0.38, vol: 0.016, att: 0.06 });
  osc(k, { d: 0.1, f: 3120, to: 2950, dur: 0.26, vol: 0.008, att: 0.05 });
  osc(k, { d: 0.55, f: 210, to: 160, dur: 0.25, vol: 0.01, type: 'triangle', lp: 800 });
}

/** The handbrake ratchet, then the lever locking. */
export function handbrake(k: FxKit) {
  k.v.hit('ratchet', 'fast', 0, k.out, { vel: 0.3, lp: 4000, dur: 0.22, rel: 0.05, gain: 0.2 });
  burst(k, { d: 0.22, dur: 0.03, vol: 0.06, f: 1500, q: 3 });
}

/** The door handle, the latch letting go and the door swinging out (the rain gets louder). */
export function carDoorOpen(k: FxKit) {
  burst(k, { dur: 0.02, vol: 0.12, f: 2500, q: 4 });
  burst(k, { d: 0.06, dur: 0.04, vol: 0.1, f: 1500, q: 3 });
  k.v.hit('tom', 'rim', 0.06, k.out, { vel: 0.18, lp: 2500, gain: 0.5 });
  osc(k, { d: 0.12, f: 420, to: 380, dur: 0.25, vol: 0.006, type: 'sawtooth', lp: 1400 });
  burst(k, { d: 0.1, dur: 0.5, vol: 0.01, f: 5000, type: 'highpass', att: 0.25 });
}

/** The door slammed shut: a deep body thump, the latch catching, a rattle in the panel. */
export function carDoor(k: FxKit) {
  k.v.hit('tom', 'hit', 0, k.out, { vel: 0.4, cents: -800, lp: 600, gain: 0.5 });
  burst(k, { dur: 0.12, vol: 0.18, f: 450, type: 'lowpass', q: 1 });
  osc(k, { f: 95, to: 55, dur: 0.22, vol: 0.13 });
  burst(k, { d: 0.025, dur: 0.04, vol: 0.12, f: 2600, q: 6 });
  burst(k, { d: 0.03, dur: 0.015, vol: 0.08, f: 4200, q: 8 });
  for (let i = 0; i < 3; i++) burst(k, { d: 0.07 + i * 0.03, dur: 0.012, vol: 0.02, f: 1800, q: 5 });
}

/** The taxi's bulb horn: two friendly toots, a nasal reed squeeze with a bend into pitch. */
export function horn(k: FxKit) {
  const ctx = k.ctx;
  for (const d of [0, 0.24]) {
    const t = ctx.currentTime + d;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1300;
    bp.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.02);
    g.gain.setValueAtTime(0.04, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    bp.connect(g).connect(panTo(k, 0.35));
    for (const f of [415, 523]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(f * 0.93, t);
      o.frequency.exponentialRampToValueAtTime(f, t + 0.04);
      o.connect(bp);
      o.start(t);
      o.stop(t + 0.2);
    }
  }
}

/** The casino's great doors: handles, the hinges groaning, warm air rushing out, the bells above. */
export function bigDoors(k: FxKit) {
  burst(k, { dur: 0.05, vol: 0.12, f: 1200, q: 3 });
  k.v.hit('tom', 'rim', 0.01, k.out, { vel: 0.2, lp: 2000, gain: 0.25, pan: -0.2 });
  k.v.hit('tom', 'rim', 0.04, k.out, { vel: 0.18, lp: 2000, gain: 0.25, pan: 0.2 });
  // Hinge groan: a slow, jittering saw through a resonant band.
  for (const [pan, f0, d] of [[-0.4, 175, 0.05], [0.4, 150, 0.12]] as const)
    osc(k, { d, f: f0, to: f0 * 0.78, dur: 0.65, vol: 0.016, type: 'sawtooth', lp: 900, att: 0.15, pan });
  burst(k, { d: 0.05, dur: 0.7, vol: 0.05, f: 500, q: 2, to: 250, att: 0.2 });
  // Air, and the room opening up.
  burst(k, { d: 0.1, dur: 1.2, vol: 0.05, f: 700, q: 0.6, att: 0.5, to: 1600 });
  burst(k, { d: 0.62, dur: 0.18, vol: 0.08, f: 260, type: 'lowpass', q: 1 });
  k.v.hit('handbells', 'b', 0.2, k.out, { vel: 0.22, cents: rnd(-20, 20), pan: -0.3 });
  k.v.hit('handbells', 'b', 0.32, k.out, { vel: 0.17, cents: rnd(-20, 20) + 300, pan: 0.3 });
}

// ---- Ambience beds -------------------------------------------------------------------

interface BedParts {
  /** Continuous sources to stop at the end. */
  srcs: AudioScheduledSourceNode[];
  /** Schedules the bed's events up to absolute time `until`. */
  tick(until: number): void;
}

/**
 * Runs a bed on the ambience bus with its own hall (so the room fades with the bus).
 * Events are scheduled 1.5 s ahead from a slow timer; `horizon` schedules that many seconds
 * up front instead (offline test renders).
 */
function runBed(k: FxKit, horizon: number | undefined, build: (dry: AudioNode, wet: AudioNode) => BedParts): () => void {
  const ctx = k.ctx;
  const t = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, t);
  out.gain.exponentialRampToValueAtTime(1, t + 1.2);
  out.connect(k.amb);
  const verb = ctx.createConvolver();
  verb.buffer = hallIR(ctx, 2.8, 0.4);
  const wet = ctx.createGain();
  wet.gain.value = 0.7;
  wet.connect(verb).connect(out);
  const parts = build(out, wet);
  let timer = 0;
  if (horizon) parts.tick(t + horizon);
  else {
    parts.tick(t + 1.5);
    timer = window.setInterval(() => parts.tick(ctx.currentTime + 1.5), 400);
  }
  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    const n = ctx.currentTime;
    out.gain.cancelScheduledValues(n);
    out.gain.setValueAtTime(out.gain.value, n);
    out.gain.setTargetAtTime(0.0001, n, 0.3);
    for (const s of parts.srcs) {
      try {
        s.stop(n + 2);
      } catch {
        /* already stopped */
      }
    }
    setTimeout(() => out.disconnect(), 3500);
  };
}

/** A looping noise layer through a filter, its level drifting with slow LFOs. */
function noiseLayer(k: FxKit, out: AudioNode, type: BiquadFilterType, f: number, q: number, vol: number, drift: number, rate = 1): AudioScheduledSourceNode[] {
  const ctx = k.ctx;
  const src = ctx.createBufferSource();
  src.buffer = k.v.noiseBuffer;
  src.loop = true;
  src.playbackRate.value = rate;
  const fl = ctx.createBiquadFilter();
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(fl).connect(g).connect(out);
  const srcs: AudioScheduledSourceNode[] = [src];
  // Two LFOs at unrelated rates, so the swell never repeats exactly.
  for (const r of [rnd(0.05, 0.09), rnd(0.13, 0.21)]) {
    const l = ctx.createOscillator();
    l.frequency.value = r;
    const lg = ctx.createGain();
    lg.gain.value = vol * drift * 0.5;
    l.connect(lg).connect(g.gain);
    l.start();
    srcs.push(l);
  }
  src.start(0, Math.random() * 1.5);
  return srcs;
}

const VOWELS = [[730, 1090], [270, 2290], [530, 1840], [570, 840], [300, 870], [660, 1720], [440, 1020], [400, 1920]] as const;

/**
 * One guest talking somewhere in the room: a buzzing voice through two vowel formants,
 * syllables in phrases with pauses; far away (lowpassed, mostly reverb) so no words come through.
 */
function talker(k: FxKit, dry: AudioNode, wet: AudioNode, t0: number) {
  const ctx = k.ctx;
  const male = Math.random() < 0.55;
  const base = male ? rnd(95, 135) : rnd(180, 240);
  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  src.frequency.value = base;
  const f1 = ctx.createBiquadFilter();
  const f2 = ctx.createBiquadFilter();
  f1.type = f2.type = 'bandpass';
  f1.Q.value = 4;
  f2.Q.value = 5;
  const g2 = ctx.createGain();
  g2.gain.value = 0.5;
  const env = ctx.createGain();
  env.gain.value = 0;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = rnd(1100, 1600);
  src.connect(f1).connect(env);
  src.connect(f2).connect(g2).connect(env);
  const pan = panTo(k, rnd(-0.8, 0.8), dry);
  const dg = ctx.createGain();
  const level = rnd(0.5, 1);
  dg.gain.value = 0.35 * level;
  const wg = ctx.createGain();
  wg.gain.value = level;
  env.connect(lp);
  lp.connect(dg).connect(pan);
  lp.connect(wg).connect(wet);
  src.start(t0);
  let next = t0 + rnd(0, 3);
  let left = 0;
  return {
    src,
    tick(until: number) {
      while (next < until) {
        if (left <= 0) {
          // Between phrases: a pause, then a new phrase of 3-12 syllables.
          next += rnd(0.6, 3.5);
          left = 3 + Math.floor(Math.random() * 10);
          continue;
        }
        const len = rnd(0.11, 0.24);
        const [a, b] = pick(VOWELS);
        f1.frequency.setTargetAtTime(a, next, 0.02);
        f2.frequency.setTargetAtTime(b, next, 0.02);
        src.frequency.setTargetAtTime(base * rnd(0.9, 1.15) * (left === 1 ? 0.88 : 1), next, 0.04);
        const v = 0.09 * rnd(0.5, 1);
        env.gain.setTargetAtTime(v, next, 0.02);
        env.gain.setTargetAtTime(0, next + len * 0.7, 0.03);
        next += len + rnd(0.01, 0.06);
        left--;
      }
    },
  };
}

/** Distant poker chips: a pair of clay clacks, sometimes a short stack riffle. */
function chipsFar(k: FxKit, d: number, out: AudioNode) {
  const pan = rnd(-0.8, 0.8);
  const riffle = Math.random() < 0.3;
  const n = riffle ? 5 + Math.floor(Math.random() * 5) : 2;
  for (let i = 0; i < n; i++) {
    const dd = d + i * (riffle ? rnd(0.03, 0.05) : 0.06);
    burst(k, { d: dd, dur: 0.035, vol: rnd(0.02, 0.035), f: rnd(2600, 3600), q: 6, pan, out });
    osc(k, { d: dd, f: rnd(2200, 2700), dur: 0.035, vol: 0.004, type: 'triangle', pan, out });
  }
}

/** A far-off slot machine paying out: a little bell rung fast, then a few coins. */
function slotBells(k: FxKit, d: number, out: AudioNode) {
  const f = pick([1318, 1397, 1568]);
  const n = 6 + Math.floor(Math.random() * 10);
  const pan = panTo(k, rnd(-0.9, 0.9), out);
  for (let i = 0; i < n; i++) metalBell(k, f, 0.01 * (1 - i / (n + 4)), d + i * 0.075, pan, 0.25, 2600);
  for (let i = 0; i < 5; i++) osc(k, { d: d + n * 0.075 + i * rnd(0.05, 0.1), f: rnd(2400, 3000), dur: 0.15, vol: 0.004, out: pan, att: 0.001 });
}

/**
 * The casino floor: a room full of murmuring guests, chips, glasses, slot machines paying
 * out far away, and now and then somebody laughing. Quiet, slow-changing, never in front.
 */
export function ambience(k: FxKit, horizon?: number): () => void {
  return runBed(k, horizon, (dry, wet) => {
    const ctx = k.ctx;
    const t0 = ctx.currentTime;
    // The room's air: a low murmur bed that breathes.
    const srcs = [
      ...noiseLayer(k, dry, 'bandpass', 330, 0.8, 0.03, 0.6, 0.7),
      ...noiseLayer(k, wet, 'bandpass', 700, 1, 0.025, 0.7, 0.8),
      ...noiseLayer(k, dry, 'lowpass', 140, 0.7, 0.03, 0.4, 0.5),
    ];
    // Guests talking.
    const talkers = Array.from({ length: 7 }, () => talker(k, dry, wet, t0));
    srcs.push(...talkers.map((x) => x.src));
    let chips = t0 + rnd(0.5, 3);
    let glasses = t0 + rnd(2, 6);
    let slots = t0 + rnd(5, 10);
    let laughs = t0 + rnd(8, 16);
    return {
      srcs,
      tick(until) {
        for (const x of talkers) x.tick(until);
        const d = (t: number) => t - ctx.currentTime;
        while (chips < until) {
          chipsFar(k, d(chips), dry);
          chips += rnd(2.5, 7);
        }
        while (glasses < until) {
          const f = rnd(2000, 2700);
          const p = rnd(-0.8, 0.8);
          glass(k, f, 0.006, d(glasses), wet, 0.8, p);
          glass(k, f * rnd(1.04, 1.1), 0.004, d(glasses) + 0.008, dry, 0.7, p);
          glasses += rnd(5, 13);
        }
        while (slots < until) {
          slotBells(k, d(slots), wet);
          slots += rnd(9, 22);
        }
        while (laughs < until) {
          const p = panTo(k, rnd(-0.7, 0.7), wet);
          laugh(k, d(laughs), p, { f0: Math.random() < 0.5 ? rnd(140, 180) : rnd(230, 290), n: 4 + Math.floor(Math.random() * 4), vol: 0.035, lp: 1500, gap: rnd(0.14, 0.18) });
          laughs += rnd(16, 40);
        }
      },
    };
  });
}

/**
 * Rain on the pavement as a buffer of thousands of tiny drop clicks (each a short decaying
 * ring at a random pitch), plus a few heavier plips into puddles. Built once per bed.
 */
function rainBuffer(ctx: BaseAudioContext, secs: number): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * secs);
  const buf = ctx.createBuffer(2, len, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const drops = Math.floor(secs * 420);
  for (let i = 0; i < drops; i++) {
    const at = Math.floor(Math.random() * len);
    const big = Math.random() < 0.012;
    const f = big ? rnd(900, 2200) : rnd(2500, 9000);
    const decay = big ? rnd(0.006, 0.014) : rnd(0.0015, 0.005);
    const amp = (big ? 0.3 : 0.18) * Math.pow(Math.random(), 2.2);
    const p = Math.random();
    const n = Math.floor(decay * sr * 5);
    const chirp = big ? 1.6 : 1;
    let ph = Math.random() * 6.28;
    for (let j = 0; j < n; j++) {
      const idx = (at + j) % len;
      const e = Math.exp(-j / (decay * sr));
      ph += (2 * Math.PI * f * (1 + (chirp - 1) * (j / n))) / sr;
      const s = Math.sin(ph) * e * amp;
      L[idx] += s * (1 - p);
      R[idx] += s * p;
    }
  }
  return buf;
}

/** A drip from the awning landing in a puddle: a click and a rising "plip". */
function drip(k: FxKit, d: number, out: AudioNode, pan: number, f: number) {
  const p = panTo(k, pan, out);
  burst(k, { d, dur: 0.01, vol: 0.02, f: 5000, q: 2, out: p });
  osc(k, { d, f, to: f * 1.8, dur: 0.05, vol: 0.022, att: 0.002, out: p });
}

/** A car swishing past on the wet road, left to right or back: tyre hiss and a dull engine with a Doppler drop. */
function swish(k: FxKit, at: number, out: AudioNode) {
  const ctx = k.ctx;
  const t = ctx.currentTime + at;
  const len = rnd(3, 4.5);
  const dir = Math.random() < 0.5 ? -1 : 1;
  const sp = ctx.createStereoPanner();
  sp.pan.setValueAtTime(-0.9 * dir, t);
  sp.pan.linearRampToValueAtTime(0.9 * dir, t + len);
  const g = ctx.createGain();
  const v = rnd(0.7, 1.1);
  // Loudness of a source passing by: inverse square of the distance, closest in the middle.
  const curve = new Float32Array(64).map((_, i) => {
    const x = (i / 63) * 2 - 1;
    return (v / (1 + 20 * x * x)) * (1 - Math.pow(Math.abs(x), 8));
  });
  g.gain.setValueAtTime(0, t);
  g.gain.setValueCurveAtTime(curve, t, len);
  g.connect(sp).connect(out);
  const src = ctx.createBufferSource();
  src.buffer = k.v.noiseBuffer;
  src.loop = true;
  const hiss = ctx.createBiquadFilter();
  hiss.type = 'bandpass';
  hiss.Q.value = 0.9;
  hiss.frequency.setValueAtTime(900, t);
  hiss.frequency.exponentialRampToValueAtTime(2600, t + len * 0.5);
  hiss.frequency.exponentialRampToValueAtTime(800, t + len);
  const hg = ctx.createGain();
  hg.gain.value = 0.3;
  src.connect(hiss).connect(hg).connect(g);
  const rumble = ctx.createBiquadFilter();
  rumble.type = 'lowpass';
  rumble.frequency.value = 220;
  const rg = ctx.createGain();
  rg.gain.value = 0.3;
  src.connect(rumble).connect(rg).connect(g);
  const eng = ctx.createOscillator();
  eng.type = 'sawtooth';
  const ef = rnd(48, 62);
  eng.frequency.setValueAtTime(ef * 1.05, t);
  eng.frequency.setValueAtTime(ef * 1.05, t + len * 0.45);
  eng.frequency.exponentialRampToValueAtTime(ef * 0.94, t + len * 0.6);
  const el = ctx.createBiquadFilter();
  el.type = 'lowpass';
  el.frequency.value = 300;
  const eg = ctx.createGain();
  eg.gain.value = 0.06;
  eng.connect(el).connect(eg).connect(g);
  src.start(t, Math.random());
  eng.start(t);
  src.stop(t + len + 0.1);
  eng.stop(t + len + 0.1);
}

/**
 * The street outside at night: rain on the pavement, drips from the awning, the city humming
 * far off, a car swishing past on the wet road now and then and a tram bell somewhere distant.
 */
export function street(k: FxKit, horizon?: number): () => void {
  return runBed(k, horizon, (dry, wet) => {
    const ctx = k.ctx;
    const t0 = ctx.currentTime;
    // Rain: two decorrelated loops of the drop buffer at slightly different speeds.
    const srcs: AudioScheduledSourceNode[] = [];
    const rain = rainBuffer(ctx, 5.3);
    const rain2 = rainBuffer(ctx, 6.1);
    for (const [b, r, v] of [[rain, 1, 0.34], [rain2, 0.91, 0.26]] as const) {
      const s = ctx.createBufferSource();
      s.buffer = b;
      s.loop = true;
      s.playbackRate.value = r;
      const g = ctx.createGain();
      g.gain.value = v;
      s.connect(g).connect(dry);
      const ws = ctx.createGain();
      ws.gain.value = v * 0.3;
      g.connect(ws).connect(wet);
      s.start(0, Math.random() * 3);
      srcs.push(s);
    }
    // The wash of rain further off, and the city: low traffic rumble that swells slowly.
    srcs.push(...noiseLayer(k, dry, 'highpass', 5000, 0.5, 0.012, 0.3));
    srcs.push(...noiseLayer(k, wet, 'bandpass', 1500, 0.5, 0.012, 0.4));
    srcs.push(...noiseLayer(k, dry, 'lowpass', 120, 0.7, 0.05, 0.5, 0.5));
    srcs.push(...noiseLayer(k, dry, 'bandpass', 260, 0.8, 0.018, 0.7, 0.6));
    // Two drip spots on the awning, each with its own pitch and slightly irregular period.
    const spots = [
      { pan: -0.35, f: rnd(700, 900), every: rnd(1.1, 1.6), next: t0 + rnd(0.2, 1) },
      { pan: 0.45, f: rnd(1000, 1300), every: rnd(1.7, 2.6), next: t0 + rnd(0.5, 2) },
    ];
    let car = t0 + rnd(3, 7);
    let tram = t0 + rnd(12, 20);
    return {
      srcs,
      tick(until) {
        const d = (t: number) => t - ctx.currentTime;
        for (const s of spots)
          while (s.next < until) {
            drip(k, d(s.next), dry, s.pan, s.f * rnd(0.96, 1.04));
            s.next += s.every * rnd(0.75, 1.35);
          }
        while (car < until) {
          swish(k, d(car), dry);
          car += rnd(10, 26);
        }
        while (tram < until) {
          // Ding-ding, two streets away.
          const f = rnd(1040, 1110);
          metalBell(k, f, 0.022, d(tram), wet, 1.6, 1800);
          metalBell(k, f, 0.018, d(tram) + 0.32, wet, 1.6, 1800);
          tram += rnd(35, 70);
        }
      },
    };
  });
}
