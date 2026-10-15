// Every sound is synthesized with WebAudio. No files.

import type { Rarity } from '../../contract';
import { save } from './state';

let ac: AudioContext | null = null;
let master: GainNode | null = null;

function ctx(): AudioContext | null {
  if (!save.settings.sound) return null;
  try {
    if (!ac) {
      ac = new AudioContext();
      master = ac.createGain();
      const comp = ac.createDynamicsCompressor();
      master.connect(comp).connect(ac.destination);
    }
    if (ac.state === 'suspended') void ac.resume();
    master!.gain.value = save.settings.volume * 0.6;
    return ac;
  } catch { return null; }
}
/** Unlock audio on the first gesture. */
addEventListener('pointerdown', () => { if (save.settings.sound) ctx(); }, { once: true });

function tone(freq: number, dur: number, opts: { type?: OscillatorType; vol?: number; at?: number; slide?: number; attack?: number } = {}) {
  const a = ctx(); if (!a || !master) return;
  const t = a.currentTime + (opts.at ?? 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = opts.type ?? 'sine';
  o.frequency.setValueAtTime(freq, t);
  if (opts.slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * opts.slide), t + dur);
  const v = opts.vol ?? 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(v, t + (opts.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, opts: { vol?: number; at?: number; freq?: number; q?: number; type?: BiquadFilterType } = {}) {
  const a = ctx(); if (!a || !master) return;
  const t = a.currentTime + (opts.at ?? 0);
  const len = Math.max(1, Math.floor(a.sampleRate * dur));
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource(); src.buffer = buf;
  const f = a.createBiquadFilter(); f.type = opts.type ?? 'bandpass'; f.frequency.value = opts.freq ?? 2000; f.Q.value = opts.q ?? 1;
  const g = a.createGain(); g.gain.value = opts.vol ?? 0.2;
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

let lastTick = 0;
export const sfx = {
  /** Reel tick as a tile passes the marker. */
  tick(speed = 1) {
    const now = performance.now();
    if (now - lastTick < 28) return;
    lastTick = now;
    tone(1800 + Math.random() * 200, 0.03, { type: 'square', vol: 0.05 + 0.03 * Math.min(1, speed) });
    noise(0.02, { freq: 4500, q: 4, vol: 0.06 });
  },
  click() { tone(900, 0.05, { type: 'triangle', vol: 0.12 }); },
  hover() { tone(1400, 0.025, { type: 'sine', vol: 0.03 }); },
  open() {
    noise(0.25, { freq: 800, q: 0.7, vol: 0.18, type: 'lowpass' });
    tone(180, 0.2, { type: 'sawtooth', vol: 0.08, slide: 2.2 });
  },
  reveal(r: Rarity) {
    const base: Record<Rarity, number[]> = {
      consumer: [523], industrial: [523, 659], milspec: [523, 659], restricted: [523, 659, 784],
      classified: [587, 740, 880, 1175], covert: [659, 831, 988, 1319], gold: [523, 659, 784, 1046, 1318, 1568],
    };
    const notes = base[r];
    notes.forEach((f, i) => tone(f, r === 'gold' ? 0.9 : 0.35, { type: r === 'covert' || r === 'gold' ? 'sawtooth' : 'triangle', vol: 0.09, at: i * (r === 'gold' ? 0.09 : 0.06) }));
    if (r === 'gold') sfx.fanfare();
  },
  fanfare() {
    const seq = [[784, 0], [988, 0.12], [1175, 0.24], [1568, 0.38], [1319, 0.62], [1568, 0.74], [2093, 0.9]];
    seq.forEach(([f, at]) => { tone(f, 0.5, { type: 'square', vol: 0.05, at: at + 0.4 }); tone(f / 2, 0.6, { type: 'triangle', vol: 0.08, at: at + 0.4 }); });
    noise(1.6, { freq: 7000, q: 0.5, vol: 0.06, at: 0.4, type: 'highpass' });
  },
  /** The rising hush before a gold tile lands. */
  suspense() {
    tone(110, 1.6, { type: 'sawtooth', vol: 0.05, slide: 4, attack: 0.6 });
  },
  coin() { tone(1568, 0.08, { type: 'square', vol: 0.06 }); tone(2093, 0.18, { type: 'square', vol: 0.05, at: 0.07 }); },
  sell() { [1047, 1319, 1568].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.08, at: i * 0.05 })); },
  win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.1, at: i * 0.08 })); },
  lose() { tone(330, 0.5, { type: 'sawtooth', vol: 0.07, slide: 0.5 }); },
  boom() { noise(0.8, { freq: 300, q: 0.4, vol: 0.4, type: 'lowpass' }); tone(90, 0.6, { type: 'sine', vol: 0.3, slide: 0.4 }); },
  /** Short bright rise with a soft bell on top. */
  levelUp() {
    [659, 880, 1175].forEach((f, i) => tone(f, 0.22, { type: 'triangle', vol: 0.09, at: i * 0.07 }));
    tone(1760, 0.7, { type: 'sine', vol: 0.06, at: 0.2 });
    tone(2637, 0.5, { type: 'sine', vol: 0.025, at: 0.22 });
  },
  /** Stage-up: low swell, then a chord that opens up. */
  rankUp() {
    tone(55, 1.1, { type: 'sine', vol: 0.22, slide: 2, attack: 0.5 });
    noise(0.9, { freq: 900, q: 0.6, vol: 0.05, type: 'lowpass' });
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 1.2, { type: 'triangle', vol: 0.06, at: 0.95 + i * 0.05 }));
    [1047, 1568, 2093].forEach((f, i) => tone(f, 0.9, { type: 'sine', vol: 0.04, at: 1.05 + i * 0.12 }));
  },
  /** The old frame breaking. */
  shatter() {
    noise(0.5, { freq: 3800, q: 0.8, vol: 0.18, type: 'highpass' });
    noise(0.25, { freq: 400, q: 0.7, vol: 0.25, type: 'lowpass' });
    for (let i = 0; i < 5; i++) tone(2400 + Math.random() * 2400, 0.12, { type: 'triangle', vol: 0.03, at: 0.03 + i * 0.05 });
  },
  error() { tone(200, 0.15, { type: 'square', vol: 0.06 }); },
  /** Crane motor: a low whine that winds down as the load comes in. */
  crane(sec = 1.4) {
    tone(70, sec, { type: 'sawtooth', vol: 0.035, slide: 0.6, attack: 0.15 });
    tone(140, sec * 0.9, { type: 'square', vol: 0.012, slide: 0.55, attack: 0.2 });
    noise(sec, { freq: 380, q: 0.8, vol: 0.05, type: 'lowpass' });
  },
  /** A heavy pallet touching down on concrete. */
  thud() {
    noise(0.45, { freq: 180, q: 0.6, vol: 0.32, type: 'lowpass' });
    tone(62, 0.4, { type: 'sine', vol: 0.26, slide: 0.55 });
    noise(0.12, { freq: 1600, q: 0.9, vol: 0.05, at: 0.02 });
  },
  /** One box popping open (rarer = brighter, tiny for the commons). */
  pop(lvl = 0) {
    const now = performance.now();
    if (now - lastPop < 34) return;
    lastPop = now;
    noise(0.04, { freq: 1200 + lvl * 500 + Math.random() * 600, q: 1.6, vol: 0.05 + lvl * 0.01 });
    tone(320 + lvl * 140 + Math.random() * 80, 0.06, { type: 'triangle', vol: 0.03 + lvl * 0.006, slide: 1.8 });
  },
  /** Electric crackle as something bursts out (rarer = brighter). Throttled for long bursts. */
  zap(r: Rarity = 'milspec') {
    const now = performance.now();
    if (now - lastZap < 45) return;
    lastZap = now;
    const lvl = ['consumer', 'industrial', 'milspec', 'restricted', 'classified', 'covert', 'gold'].indexOf(r);
    noise(0.05 + Math.random() * 0.03, { freq: 2600 + Math.random() * 2600, q: 2.5, vol: 0.05 + lvl * 0.006, type: 'bandpass' });
    tone(700 + lvl * 160 + Math.random() * 300, 0.045, { type: 'square', vol: 0.022, slide: 0.35 });
  },
  /** A short burst of crackles. */
  crackle(n = 5, spread = 0.3) {
    for (let i = 0; i < n; i++) noise(0.025 + Math.random() * 0.03, { freq: 3000 + Math.random() * 4000, q: 3, vol: 0.05, at: Math.random() * spread, type: 'bandpass' });
  },
  splash() {
    noise(0.55, { freq: 900, q: 0.6, vol: 0.12, type: 'lowpass' });
    noise(0.3, { freq: 2600, q: 0.9, vol: 0.05, at: 0.04 });
  },
  /** The fountain winds up. */
  surge() {
    tone(65, 1.1, { type: 'sawtooth', vol: 0.05, slide: 3.2, attack: 0.45 });
    noise(0.9, { freq: 500, q: 0.5, vol: 0.1, type: 'lowpass' });
    sfx.crackle(6, 0.7);
  },
  /** Gold out of the fountain: thunder crack plus a bell. */
  goldChime() {
    noise(0.7, { freq: 220, q: 0.5, vol: 0.32, type: 'lowpass' });
    noise(0.12, { freq: 5000, q: 1.5, vol: 0.12 });
    [1318, 1976, 2637, 3951].forEach((f, i) => tone(f, 1.4 - i * 0.2, { type: 'sine', vol: 0.07 - i * 0.012, at: 0.05 + i * 0.07, attack: 0.006 }));
    [1568, 2093].forEach((f, i) => tone(f, 0.9, { type: 'triangle', vol: 0.05, at: 0.35 + i * 0.12 }));
  },
};
let lastZap = 0;
let lastPop = 0;
