// Small synthesised sounds (no audio files): card flick, draw, shuffle, UNO chime, catch, win.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.55;
}

/** Call from a user gesture once; browsers only start audio after one. */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.55;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.4), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
}

const ok = () => !!ctx && !!master && !muted && ctx.state === 'running' && !document.hidden;

function burst(at: number, dur: number, freq: number, q: number, gain: number, type: BiquadFilterType = 'bandpass') {
  const c = ctx!;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  src.connect(f).connect(g).connect(master!);
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
  o.connect(g).connect(master!);
  o.start(at);
  o.stop(at + dur + 0.02);
}

export const sfx = {
  flick() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    burst(t, 0.07, 2600 + Math.random() * 900, 1.2, 0.5);
    tone(t, 180, 0.06, 0.12, 'sine', 0.6);
  },
  draw() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    burst(t, 0.11, 1500, 0.8, 0.28);
  },
  shuffle() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    for (let i = 0; i < 9; i++) burst(t + i * 0.045 + Math.random() * 0.02, 0.05, 2000 + Math.random() * 1500, 1.4, 0.22);
  },
  uno() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    tone(t, 784, 0.16, 0.22, 'square');
    tone(t + 0.1, 1175, 0.32, 0.22, 'square');
    tone(t + 0.1, 1568, 0.32, 0.08, 'sine');
  },
  caught() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    tone(t, 330, 0.18, 0.2, 'sawtooth', 0.6);
    tone(t + 0.14, 247, 0.26, 0.2, 'sawtooth', 0.6);
  },
  turn() {
    if (!ok()) return;
    tone(ctx!.currentTime, 1320, 0.12, 0.08, 'sine');
  },
  skip() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    tone(t, 520, 0.12, 0.12, 'square', 0.5);
  },
  rev() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    tone(t, 400, 0.22, 0.12, 'triangle', 2);
  },
  nope() {
    if (!ok()) return;
    tone(ctx!.currentTime, 140, 0.12, 0.15, 'square');
  },
  win() {
    if (!ok()) return;
    const t = ctx!.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(t + i * 0.09, f, 0.5, 0.15, 'triangle'));
    for (let i = 0; i < 6; i++) tone(t + 0.5 + i * 0.07, 2000 + Math.random() * 2000, 0.15, 0.04, 'sine');
  },
};
