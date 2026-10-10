// The club floor's music (floor 4): house in the club, hard techno in the bunker, boom-bap on
// the hip-hop floor. Each mood has a base groove that always plays and a "stage layer"
// (bass, claps, hats, leads) whose level follows how close the player is to the dance floor.
// The base also opens up (lowpass) as you come closer. Synthesised like the rest of audio.ts.

export type ClubMood = 'club' | 'techno' | 'hiphop';

export const CLUB_BPM: Record<ClubMood, number> = { club: 124, techno: 134, hiphop: 88 };

/** The building blocks audio.ts lends us (its private voices). */
export interface Voices {
  ctx: BaseAudioContext;
  tone(freq: number, dur: number, type?: OscillatorType, vol?: number, delay?: number, slideTo?: number, out?: AudioNode | null, attack?: number): void;
  noise(dur: number, vol?: number, delay?: number, freq?: number, type?: BiquadFilterType, q?: number, out?: AudioNode | null, sweepTo?: number): void;
  bell(freq: number, vol?: number, delay?: number, dur?: number, out?: AudioNode | null): void;
}

interface Chain {
  out: GainNode;
  /** Base groove goes through here: muffled far away, open near the stage. */
  lp: BiquadFilterNode;
  /** Stage layer gain (0 far away, 1 on the dance floor). */
  layer: GainNode;
  /** Base level of the mood (see TRIM). */
  trim: GainNode;
  mood: ClubMood;
}

/**
 * Level balance per mood, measured on the master output (RMS/K-weighted, see the polish
 * notes): `far`/`near` scale the whole groove away from and on the dance floor (so far
 * away it sits with the other floors), `layer` evens out the stage layers, so club, bunker and
 * hip-hop floor reach the same loudness at the stage.
 */
const TRIM: Record<ClubMood, { far: number; near: number; layer: number }> = {
  club: { far: 1, near: 1, layer: 1 },
  techno: { far: 0.75, near: 1.12, layer: 1.6 },
  hiphop: { far: 1, near: 1, layer: 1.7 },
};
const trimGain = (m: ClubMood, lvl: number) => TRIM[m].far + (TRIM[m].near - TRIM[m].far) * lvl;

const cutoff = (lvl: number) => 2200 * Math.pow(8, lvl);
const layerGain = (lvl: number) => Math.max(0.0001, Math.pow(lvl, 1.3));

/** Per-output chains (the mood crossfade makes a new output each time) and the current level. */
export class ClubMix {
  private chains: Chain[] = [];
  level = 0;

  private chain(v: Voices, out: GainNode, mood: ClubMood) {
    let c = this.chains.find((x) => x.out === out);
    if (c) return c;
    const lp = v.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff(this.level);
    lp.Q.value = 0.7;
    const trim = v.ctx.createGain();
    trim.gain.value = trimGain(mood, this.level);
    lp.connect(trim).connect(out);
    const layer = v.ctx.createGain();
    layer.gain.value = layerGain(this.level) * TRIM[mood].layer;
    layer.connect(lp);
    c = { out, lp, layer, trim, mood };
    this.chains.push(c);
    // Old outputs have faded out long ago.
    if (this.chains.length > 4) this.chains.shift();
    return c;
  }

  /** Smoothly moves every chain to a new proximity level (0..1). */
  setLevel(ctx: BaseAudioContext, lvl: number) {
    this.level = Math.max(0, Math.min(1, lvl));
    const now = ctx.currentTime;
    for (const c of this.chains) {
      c.lp.frequency.setTargetAtTime(cutoff(this.level), now, 0.25);
      c.layer.gain.setTargetAtTime(layerGain(this.level) * TRIM[c.mood].layer, now, 0.25);
      c.trim.gain.setTargetAtTime(trimGain(c.mood, this.level), now, 0.25);
    }
  }

  play(m: ClubMood, v: Voices, bar: number, b: number, d: number, spb: number, out: GainNode) {
    const c = this.chain(v, out, m);
    if (m === 'club') clubBeat(v, bar, b, d, spb, c);
    else if (m === 'techno') technoBeat(v, bar, b, d, spb, c);
    else hiphopBeat(v, bar, b, d, spb, c);
  }
}

/** A short four-on-the-floor kick: a sine dropping in pitch plus a little click. */
function kick(v: Voices, d: number, out: AudioNode, vol = 0.3, hard = false) {
  v.tone(hard ? 170 : 140, hard ? 0.34 : 0.26, 'sine', vol, d, 42, out, 0.002);
  v.noise(0.012, hard ? 0.09 : 0.05, d, 3500, 'bandpass', 1, out);
  if (hard) v.tone(55, 0.3, 'triangle', vol * 0.35, d + 0.01, 45, out, 0.004);
}

function clap(v: Voices, d: number, out: AudioNode, vol = 0.1) {
  for (let k = 0; k < 3; k++) v.noise(k === 2 ? 0.16 : 0.03, vol * (k === 2 ? 1 : 0.6), d + k * 0.011, 1400, 'bandpass', 0.9, out);
}

/** Acid line: a squelchy sawtooth through a resonant filter that sweeps down. */
function acid(v: Voices, freq: number, d: number, dur: number, open: number, out: AudioNode, vol = 0.05) {
  const ctx = v.ctx;
  const t = ctx.currentTime + Math.max(0, d);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(freq, t);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 11;
  f.frequency.setValueAtTime(300 + open * 2400, t);
  f.frequency.exponentialRampToValueAtTime(220, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f).connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

/** Club: warm deep house. Base: kick, offbeat chord stabs and a pad. Stage layer: bass, claps, hats, a lead. */
function clubBeat(v: Voices, bar: number, b: number, d: number, spb: number, c: Chain) {
  const prog: [number, number[]][] = [
    [110, [261.6, 329.6, 392, 493.9]], // Am9
    [87.3, [261.6, 329.6, 440, 523.3]], // Fmaj7
    [130.8, [329.6, 392, 493.9, 587.3]], // Cmaj9
    [98, [293.7, 392, 493.9, 587.3]], // G6
  ];
  const [root, voicing] = prog[bar % 4];
  const half = spb / 2;
  // Base (always).
  kick(v, d, c.lp, 0.24);
  for (const f of voicing) v.tone(f, half * 0.7, 'triangle', 0.022, d + half, undefined, c.lp, 0.004);
  if (b === 0) for (const f of voicing.slice(0, 3)) v.tone(f / 2, spb * 4, 'sine', 0.014, d, undefined, c.lp, 0.6);
  v.noise(0.04, 0.02, d + half, 8000, 'highpass', 1, c.lp);
  // Stage layer: bass on the offbeat, claps on 2 and 4, sixteenth hats, open hats, a lead.
  const L = c.layer;
  kick(v, d, L, 0.16);
  v.tone(root / 2, half * 0.9, 'sine', 0.2, d + half, undefined, L, 0.006);
  v.tone(root, half * 0.6, 'square', 0.035, d + half, undefined, L, 0.006);
  if (b === 1 || b === 3) clap(v, d, L, 0.11);
  for (let k = 0; k < 4; k++) v.noise(0.025, k === 2 ? 0.05 : 0.025, d + (k * spb) / 4, 9500, 'highpass', 1, L);
  v.noise(0.14, 0.04, d + half, 7000, 'highpass', 1, L);
  if (bar % 8 >= 4)
    for (let k = 0; k < 2; k++) {
      const f = voicing[(b * 2 + k + bar) % voicing.length] * 2;
      v.tone(f, half * 0.8, 'square', 0.014, d + k * half, undefined, L, 0.005);
    }
  if (b === 0 && bar % 8 === 7) v.noise(spb * 4, 0.05, d, 400, 'bandpass', 1, L, 8000);
}

/** Techno bunker: hard and dark. Base: kick and rumble. Stage layer: hats, rim, acid line, stabs. */
function technoBeat(v: Voices, bar: number, b: number, d: number, spb: number, c: Chain) {
  const roots = [55, 55, 49, 58.3];
  const root = roots[Math.floor(bar / 2) % 4];
  const q = spb / 4;
  kick(v, d, c.lp, 0.3, true);
  // Rumble: a dark offbeat bass.
  for (const k of [2, 3]) v.tone(root, q * 0.9, 'triangle', 0.1, d + k * q, undefined, c.lp, 0.004);
  v.noise(0.03, 0.025, d + 2 * q, 6000, 'highpass', 1, c.lp);
  const L = c.layer;
  for (let k = 0; k < 4; k++) v.noise(k === 2 ? 0.09 : 0.02, k === 2 ? 0.06 : 0.03, d + k * q, 10000, 'highpass', 1, L);
  if (b === 1 || b === 3) {
    clap(v, d, L, 0.09);
    v.noise(0.02, 0.06, d, 1800, 'bandpass', 6, L);
  }
  // Sixteenth acid pattern, opening over eight bars.
  const pat = [1, 0, 1, 2, 0, 1, 0, 1.5, 1, 0, 2, 1, 0, 1, 1.5, 0];
  for (let k = 0; k < 4; k++) {
    const s = pat[(b * 4 + k) % 16];
    if (!s) continue;
    acid(v, root * 2 * s, d + k * q, q * 0.9, ((bar % 8) + 1) / 8, L, 0.045);
  }
  if (b === 0 && bar % 4 === 0) for (const r of [1, 1.19, 1.5]) v.tone(root * 4 * r, 0.25, 'square', 0.02, d, root * 2 * r, L, 0.003);
}

/** Hip-hop floor: boom-bap. Base: dusty Rhodes, sub bass and vinyl crackle. Stage layer: kick, snare, swung hats, scratches. */
function hiphopBeat(v: Voices, bar: number, b: number, d: number, spb: number, c: Chain) {
  const prog: [number, number[]][] = [
    [73.4, [293.7, 349.2, 440, 523.3]], // Dm7
    [65.4, [261.6, 329.6, 392, 466.2]], // C7
    [58.3, [293.7, 349.2, 440, 523.3]], // Bbmaj7
    [55, [277.2, 329.6, 392, 493.9]], // A7
  ];
  const [root, voicing] = prog[bar % 4];
  const sw = spb * 0.6;
  // Base.
  if (b === 0 || (b === 2 && bar % 2 === 1))
    for (const f of voicing) {
      v.tone(f, spb * 1.8, 'sine', 0.032, d + (b ? sw : 0), undefined, c.lp, 0.01);
      v.tone(f * 2, spb * 0.5, 'triangle', 0.008, d + (b ? sw : 0), undefined, c.lp, 0.004);
    }
  if (b === 0 || b === 2) v.tone(root, spb * 1.4, 'sine', 0.2, d, undefined, c.lp, 0.01);
  if (Math.random() < 0.6) v.noise(0.006, 0.03, d + Math.random() * spb, 3000, 'highpass', 1, c.lp);
  // Stage layer.
  const L = c.layer;
  if (b === 0) kick(v, d, L, 0.3);
  if (b === 1 && bar % 2 === 0) kick(v, d + sw, L, 0.22);
  if (b === 2) kick(v, d + sw, L, 0.24);
  if (b === 1 || b === 3) {
    v.noise(0.18, 0.13, d, 1900, 'bandpass', 0.8, L);
    v.tone(190, 0.1, 'triangle', 0.08, d, 140, L, 0.002);
  }
  v.noise(0.03, 0.035, d, 8500, 'highpass', 1, L);
  v.noise(0.03, 0.022, d + sw, 8500, 'highpass', 1, L);
  // A scratch at the end of every fourth bar.
  if (bar % 4 === 3 && b === 3) {
    v.noise(0.09, 0.07, d, 2400, 'bandpass', 2, L, 900);
    v.noise(0.07, 0.06, d + 0.12, 900, 'bandpass', 2, L, 2600);
  }
}

/** Little one-shots for the club props. */
export function clubFx(v: Voices, kind: string, out: AudioNode) {
  switch (kind) {
    case 'airhorn':
      for (const [k, dl] of [[0, 0], [1, 0.22], [2, 0.44]] as const) {
        const len = k === 2 ? 0.6 : 0.16;
        for (const f of [466, 470, 587]) v.tone(f, len, 'sawtooth', 0.03, dl, f * 0.97, out, 0.01);
      }
      return;
    case 'rewind':
      v.noise(0.5, 0.08, 0, 4000, 'bandpass', 3, out, 300);
      v.tone(900, 0.5, 'sawtooth', 0.02, 0, 120, out, 0.01);
      return;
    case 'drop':
      v.noise(1.2, 0.06, 0, 300, 'bandpass', 1, out, 9000);
      v.tone(60, 0.9, 'sine', 0.3, 1.1, 38, out, 0.004);
      v.noise(0.5, 0.08, 1.1, 6000, 'highpass', 1, out);
      return;
    case 'bass':
      for (let k = 0; k < 4; k++) v.tone(55, 0.22, 'sine', 0.28, k * 0.17, 40, out, 0.004);
      return;
    case 'lights':
      v.tone(1200, 0.05, 'square', 0.03, 0, undefined, out, 0.002);
      v.tone(1600, 0.05, 'square', 0.03, 0.06, undefined, out, 0.002);
      return;
    case 'fog':
      v.noise(1.4, 0.07, 0, 700, 'bandpass', 0.6, out, 2400);
      return;
    case 'sneaker':
      for (let k = 0; k < 2; k++) v.noise(0.05, 0.05, k * 0.09, 5200, 'bandpass', 4, out);
      return;
    case 'chain':
      for (let k = 0; k < 5; k++) v.bell(2400 + Math.random() * 900, 0.03, k * 0.05, 0.3, out);
      return;
  }
}
