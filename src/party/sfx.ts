// Sounds for Unser Party Spiel, all synthesised with WebAudio (no files): dice, hops, coins,
// stars, bonks, whistle, countdown, fanfare, and a light music loop. Same style as Unser Uno.

let ctx: AudioContext | null = null;
let sfxBus: GainNode | null = null;
let musBus: GainNode | null = null;
let noise: AudioBuffer | null = null;
let sfxVol = 0.8;
let musVol = 0.45;

const SFX_GAIN = 0.5;
const MUS_GAIN = 0.16;

export function setVolumes(sound: number, music: number) {
  sfxVol = sound;
  musVol = music;
  if (sfxBus) sfxBus.gain.value = sfxVol * SFX_GAIN;
  if (musBus) musBus.gain.value = musVol * MUS_GAIN;
}

/** Call from a user gesture; browsers only start audio after one. */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  sfxBus = ctx.createGain();
  sfxBus.gain.value = sfxVol * SFX_GAIN;
  sfxBus.connect(ctx.destination);
  musBus = ctx.createGain();
  musBus.gain.value = musVol * MUS_GAIN;
  musBus.connect(ctx.destination);
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  if (wantMusic) startMusic(wantMusic);
}

const ok = () => !!ctx && !!sfxBus && sfxVol > 0 && ctx.state === 'running' && !document.hidden;

function tone(at: number, f: number, dur: number, g: number, type: OscillatorType = 'triangle', slide = 0, bus = sfxBus!) {
  const c = ctx!;
  const o = c.createOscillator();
  const v = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, at);
  if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, at + dur);
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(g, at + 0.01);
  v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(v).connect(bus);
  o.start(at);
  o.stop(at + dur + 0.02);
}
function burst(at: number, dur: number, f: number, q: number, g: number, type: BiquadFilterType = 'bandpass', bus = sfxBus!) {
  const c = ctx!;
  const s = c.createBufferSource();
  const fl = c.createBiquadFilter();
  const v = c.createGain();
  s.buffer = noise;
  fl.type = type;
  fl.frequency.value = f;
  fl.Q.value = q;
  v.gain.setValueAtTime(0.0001, at);
  v.gain.exponentialRampToValueAtTime(g, at + 0.004);
  v.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  s.connect(fl).connect(v).connect(bus);
  s.start(at, Math.random() * 0.3, dur + 0.02);
}
const T = () => ctx!.currentTime;

export const sfx = {
  roll() { if (!ok()) return; const t = T(); for (let i = 0; i < 6; i++) tone(t + i * 0.05, 500 + i * 90, 0.05, 0.08, 'square'); },
  jump() { if (!ok()) return; tone(T(), 300, 0.16, 0.2, 'square', 2.4); },
  hit() { if (!ok()) return; const t = T(); tone(t, 160, 0.2, 0.45, 'square', 0.5); burst(t, 0.12, 1200, 1, 0.35); tone(t + 0.05, 880, 0.25, 0.18, 'triangle', 1.5); },
  land() { if (!ok()) return; const t = T(); tone(t, 140, 0.2, 0.45, 'sine', 0.45); burst(t, 0.1, 400, 1, 0.3, 'lowpass'); },
  hop(i: number) { if (!ok()) return; tone(T(), 420 + Math.min(i, 14) * 45, 0.13, 0.2, 'square', 1.7); },
  coin() { if (!ok()) return; const t = T(); tone(t, 988, 0.08, 0.22, 'square'); tone(t + 0.07, 1318, 0.26, 0.22, 'square'); },
  lose() { if (!ok()) return; const t = T(); tone(t, 440, 0.18, 0.22, 'sawtooth', 0.6); tone(t + 0.15, 300, 0.3, 0.22, 'sawtooth', 0.6); },
  star() { if (!ok()) return; const t = T(); [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(t + i * 0.08, f, 0.4, 0.2, 'triangle')); burst(t + 0.4, 0.7, 6000, 1, 0.14, 'highpass'); },
  whoosh() { if (!ok()) return; const t = T(); burst(t, 0.35, 900, 0.7, 0.3); tone(t, 300, 0.3, 0.07, 'sine', 3); },
  pop() { if (!ok()) return; tone(T(), 660, 0.08, 0.18, 'square', 1.4); },
  bonk() { if (!ok()) return; const t = T(); tone(t, 220, 0.3, 0.4, 'square', 0.35); burst(t, 0.2, 500, 1, 0.4, 'lowpass'); },
  boom() { if (!ok()) return; const t = T(); burst(t, 0.5, 260, 0.6, 0.7, 'lowpass'); tone(t, 90, 0.45, 0.45, 'sine', 0.4); },
  beep(hi: boolean) { if (!ok()) return; tone(T(), hi ? 1046 : 523, hi ? 0.55 : 0.2, 0.25, 'square'); },
  whistle() { if (!ok()) return; const t = T(); tone(t, 1900, 0.18, 0.16, 'sine', 1.08); tone(t + 0.2, 1900, 0.45, 0.16, 'sine', 0.97); },
  creak() { if (!ok()) return; const t = T(); tone(t, 90, 1.1, 0.2, 'sawtooth', 1.6); burst(t, 1, 300, 4, 0.12); },
  crank() { if (!ok()) return; const t = T(); burst(t, 0.06, 2200, 3, 0.25); tone(t, 260, 0.06, 0.1, 'square', 1.3); },
  buy() { if (!ok()) return; const t = T(); tone(t, 1318, 0.06, 0.18, 'square'); tone(t + 0.06, 1760, 0.18, 0.18, 'square'); burst(t, 0.1, 5000, 2, 0.12); },
  wheel() { if (!ok()) return; tone(T(), 1200, 0.03, 0.08, 'square'); },
  fanfare() { if (!ok()) return; const t = T(); ([[523, 0], [659, 0.15], [784, 0.3], [1047, 0.5], [784, 0.75], [1047, 0.9]] as const).forEach(([f, d]) => { tone(t + d, f, 0.35, 0.18, 'square'); tone(t + d, f / 2, 0.35, 0.1, 'triangle'); }); },
};

// ---------- music: a light loop in two moods (board, minigame), scheduled ahead ----------
type Mood = 'board' | 'mg' | 'menu' | null;
let wantMusic: Mood = null;
let musTimer = 0;
let step = 0;
let nextAt = 0;

const SCALE = [0, 2, 4, 7, 9];
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
const PROG: Record<Exclude<Mood, null>, { bpm: number; roots: number[]; lead: number[] }> = {
  board: { bpm: 112, roots: [57, 53, 60, 55], lead: [0, 2, 4, -1, 3, 2, 1, -1, 4, 3, 2, 0, 1, -1, 2, -1] },
  mg: { bpm: 138, roots: [55, 55, 60, 58], lead: [4, -1, 4, 3, 2, -1, 0, 2, 4, -1, 6, 4, 3, -1, 2, -1] },
  menu: { bpm: 96, roots: [60, 57, 53, 55], lead: [2, -1, -1, 4, -1, 3, -1, -1, 1, -1, -1, 2, -1, 0, -1, -1] },
};

function schedule() {
  if (!ctx || !musBus || !wantMusic) return;
  const P = PROG[wantMusic];
  const spb = 60 / P.bpm / 2; // eighth notes
  while (nextAt < ctx.currentTime + 0.25) {
    const at = nextAt;
    const bar = Math.floor(step / 16) % P.roots.length;
    const root = P.roots[bar];
    const s = step % 16;
    if (musVol > 0 && !document.hidden) {
      if (s % 4 === 0) tone(at, midi(root - 12), spb * 1.8, 0.5, 'triangle', 0, musBus);
      if (s % 4 === 2) tone(at, midi(root - 5), spb * 0.9, 0.3, 'triangle', 0, musBus);
      if (s % 8 === 4) { tone(at, midi(root + 4), spb * 2.5, 0.12, 'sine', 0, musBus); tone(at, midi(root + 7), spb * 2.5, 0.1, 'sine', 0, musBus); }
      if (s % 2 === 1) burst(at, 0.04, 8000, 1, 0.16, 'highpass', musBus);
      if (s % 8 === 0) burst(at, 0.12, 180, 1, 0.5, 'lowpass', musBus);
      const l = P.lead[s];
      if (l >= 0) tone(at, midi(root + 12 + SCALE[l % 5] + (l >= 5 ? 12 : 0)), spb * 0.85, 0.11, 'square', 0, musBus);
    }
    nextAt += spb;
    step++;
  }
}

export function startMusic(mood: Mood) {
  wantMusic = mood;
  if (!ctx) return;
  if (!mood) { clearInterval(musTimer); musTimer = 0; return; }
  if (!musTimer) {
    nextAt = ctx.currentTime + 0.1;
    step = 0;
    musTimer = window.setInterval(schedule, 90);
  }
}
