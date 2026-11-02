// Sound for Unser Uno Spiel: effects built from the casino's recorded instruments (src/audio/inst,
// lazy chunks) layered over short synthesised card noises, plus the table music (music.ts).
// Every effect has a synthesised fallback, so the first moves sound right while samples load.

import { Sampler, type InstId } from '../audio/sampler';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fxBus: GainNode | null = null;
let musicBus: GainNode | null = null;
let verb: GainNode | null = null;
let noise: AudioBuffer | null = null;
let sampler: Sampler | null = null;
let muted = false;
const readyHooks: (() => void)[] = [];

/** Recorded instruments the effects use; loaded after the music ones, one after another. */
const FX_INST: InstId[] = ['woodblock', 'xylo', 'claps', 'trumpet', 'trombone', 'glock', 'tom'];

export function setMuted(m: boolean) {
  muted = m;
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.8, ctx.currentTime, 0.03);
}
export const isMuted = () => muted;

/** Music on/off on its own (kept per browser). */
let musicOn = (() => { try { return localStorage.getItem('unounser.music') !== '0'; } catch { return true; } })();
export const isMusicOn = () => musicOn;
export function setMusicOn(on: boolean) {
  musicOn = on;
  try { localStorage.setItem('unounser.music', on ? '1' : '0'); } catch { /* private mode */ }
  if (musicBus && ctx) musicBus.gain.setTargetAtTime(on ? 0.42 : 0, ctx.currentTime, 0.1);
}

/** A short generated room: enough air for the brass and the marimba without a reverb file. */
function makeVerb(c: AudioContext) {
  const len = Math.floor(c.sampleRate * 1.6);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const send = c.createGain();
  send.gain.value = 0.22;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5200;
  send.connect(conv).connect(lp).connect(master!);
  return send;
}

/** Call from a user gesture once; browsers only start audio after one. */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 3;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  master.connect(comp).connect(ctx.destination);
  verb = makeVerb(ctx);
  fxBus = ctx.createGain();
  fxBus.gain.value = 0.75;
  fxBus.connect(master);
  fxBus.connect(verb);
  musicBus = ctx.createGain();
  musicBus.gain.value = musicOn ? 0.42 : 0;
  musicBus.connect(master);
  const mv = ctx.createGain();
  mv.gain.value = 0.5;
  musicBus.connect(mv).connect(verb);
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  sampler = new Sampler(ctx);
  // a hidden tab throttles timers: pause the sound instead of letting the music stutter
  document.addEventListener('visibilitychange', () => { if (!ctx) return; if (document.hidden) void ctx.suspend(); else void ctx.resume(); });
  for (const f of readyHooks.splice(0)) f();
}

/** Runs `f` once audio exists (right away when it already does). */
export function whenAudio(f: () => void) {
  if (ctx) f();
  else readyHooks.push(f);
}

/** For music.ts: the shared context, sampler and music bus (null until unlock). */
export function audio() {
  return ctx && sampler && musicBus ? { ctx, sampler, bus: musicBus } : null;
}

/** Effects instruments: loaded one by one after the music has what it needs. */
let fxLoading = false;
export function loadFx() {
  if (fxLoading || !sampler) return;
  fxLoading = true;
  const s = sampler;
  void FX_INST.reduce((p, id) => p.then(() => s.need(id)), Promise.resolve());
}

/** Music gets quieter for a moment under a big effect. */
function duck(t: number, depth = 0.5, hold = 0.5) {
  if (!musicBus || !musicOn) return;
  const g = musicBus.gain;
  g.cancelScheduledValues(t);
  g.setTargetAtTime(0.42 * depth, t, 0.03);
  g.setTargetAtTime(0.42, t + hold, 0.35);
}

const ok = () => !!ctx && !!master && !muted && ctx.state === 'running' && !document.hidden;
const S = (id: InstId, midi: number, t: number, o: Parameters<Sampler['note']>[4] = {}) => sampler!.note(id, midi, t, fxBus!, o);
const H = (id: InstId, art: string, t: number, o: Parameters<Sampler['hit']>[4] = {}) => sampler!.hit(id, art, t, fxBus!, o);

function burst(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass', sweep = 0, pan = 0) {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, at);
  if (sweep) f.frequency.exponentialRampToValueAtTime(freq * sweep, at + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  let tail: AudioNode = g;
  if (pan) { const p = c.createStereoPanner(); p.pan.value = pan; g.connect(p); tail = p; }
  src.connect(f).connect(g);
  tail.connect(fxBus!);
  src.start(at, Math.random() * 0.2, dur + 0.02);
}

function tone(at: number, freq: number, dur: number, gain: number, type: OscillatorType = 'triangle', slide = 0) {
  const c = ctx!;
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, at + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(fxBus!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

export const sfx = {
  /** A card slapped onto the pile: paper snap plus a soft thump of the felt. */
  flick() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    const p = r(-0.25, 0.25);
    burst(t, 0.05, r(3200, 4400), 0.9, 0.42, 'highpass', 0, p);
    burst(t + 0.004, 0.09, r(1700, 2300), 1.1, 0.3, 'bandpass', 0.6, p);
    burst(t, 0.07, 260, 0.7, 0.5, 'lowpass');
    tone(t, r(150, 175), 0.07, 0.12, 'sine', 0.55);
  },
  /** A card pulled off the deck: a short slide, rising. */
  draw() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    burst(t, 0.13, 900, 0.9, 0.22, 'bandpass', 3.2, r(-0.2, 0.2));
    burst(t + 0.09, 0.04, 3600, 1, 0.14, 'highpass');
  },
  /** Riffle shuffle: quick flutter that speeds up, then the bridge. */
  shuffle() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    let at = t;
    for (let i = 0; i < 16; i++) {
      at += 0.042 - i * 0.0016;
      burst(at, 0.035, r(2200, 3600), 1.4, 0.13 + i * 0.006, 'bandpass', 0, (i % 2 ? 0.3 : -0.3));
    }
    burst(at + 0.05, 0.28, 1200, 0.6, 0.24, 'bandpass', 2.4);
    burst(at + 0.32, 0.06, 240, 0.8, 0.35, 'lowpass');
  },
  /** UNO!: two soft mallet notes and one muted horn note (no fanfare). */
  uno() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    if (S('xylo', 79, t, { vel: 0.5 })) {
      S('xylo', 84, t + 0.1, { vel: 0.55 });
      S('trumpet', 72, t + 0.1, { vel: 0.35, dur: 0.18, rel: 0.15 });
    } else {
      tone(t, 784, 0.12, 0.1, 'sine');
      tone(t + 0.1, 1047, 0.2, 0.1, 'sine');
    }
  },
  /** Caught without UNO: two low trombone steps down, short. */
  caught() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    if (S('trombone', 53, t, { vel: 0.5, dur: 0.2, rel: 0.08, glide: -1 })) {
      S('trombone', 50, t + 0.24, { vel: 0.5, dur: 0.35, rel: 0.2, glide: -1 });
    } else {
      tone(t, 330, 0.16, 0.12, 'triangle', 0.7);
      tone(t + 0.16, 247, 0.24, 0.12, 'triangle', 0.7);
    }
  },
  /** My turn: two soft mallet notes. */
  turn() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    if (S('xylo', 76, t, { vel: 0.45 })) S('xylo', 83, t + 0.09, { vel: 0.55 });
    else { tone(t, 988, 0.12, 0.08, 'sine'); tone(t + 0.09, 1480, 0.2, 0.08, 'sine'); }
  },
  /** Aussetzen: a dry block knock and a drop. */
  skip() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    if (H('woodblock', 'w', t, { vel: 0.9 })) { H('woodblock', 'w', t + 0.11, { vel: 0.6, cents: -300 }); S('xylo', 64, t + 0.11, { vel: 0.4 }); }
    else tone(t, 520, 0.12, 0.12, 'square', 0.5);
  },
  /** Richtungswechsel: three mallet notes, up and back. */
  rev() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    const run = [72, 79, 72];
    if (S('xylo', run[0], t, { vel: 0.4 })) run.slice(1).forEach((m, i) => S('xylo', m, t + (i + 1) * 0.08, { vel: 0.38 }));
    else tone(t, 400, 0.18, 0.08, 'triangle', 1.5);
  },
  /** +2 / +4 lands on someone: a soft drum hit (two for +4), no blare. */
  plus(strong = false) {
    if (!ok()) return;
    const t = ctx!.currentTime;
    if (H('tom', 'hit', t, { vel: strong ? 0.7 : 0.55 })) {
      if (strong) H('tom', 'hit', t + 0.12, { vel: 0.5, cents: -200 });
    } else {
      tone(t, strong ? 120 : 160, 0.2, 0.16, 'sine', 0.6);
    }
  },
  nope() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    if (!H('woodblock', 'w', t, { vel: 0.5, cents: -700, lp: 1400 })) tone(t, 140, 0.12, 0.15, 'square');
  },
  /** I went out: a short, warm three-note phrase (no fanfare, no claps). */
  win() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    duck(t, 0.6, 0.9);
    const line = [72, 76, 79];
    if (S('xylo', line[0], t, { vel: 0.5 })) {
      line.slice(1).forEach((m, i) => S('xylo', m, t + (i + 1) * 0.12, { vel: 0.5 }));
      S('glock', 84, t + 0.36, { vel: 0.25 });
    } else {
      line.forEach((m, i) => tone(t + i * 0.12, 440 * Math.pow(2, (m - 69) / 12), 0.3, 0.08, 'triangle'));
    }
  },
  /** Someone else went out: a short falling mallet line. */
  lose() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    duck(t, 0.6, 0.8);
    const line = [76, 72, 67];
    if (S('xylo', line[0], t, { vel: 0.45 })) line.slice(1).forEach((m, i) => S('xylo', m, t + (i + 1) * 0.13, { vel: 0.4 }));
    else line.forEach((m, i) => tone(t + i * 0.13, 440 * Math.pow(2, (m - 69) / 12), 0.2, 0.07));
  },
};
