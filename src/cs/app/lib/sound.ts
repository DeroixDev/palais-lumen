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
  levelUp() { [523, 784, 1047, 1568].forEach((f, i) => tone(f, 0.4, { type: 'square', vol: 0.05, at: i * 0.1 })); },
  error() { tone(200, 0.15, { type: 'square', vol: 0.06 }); },
};
