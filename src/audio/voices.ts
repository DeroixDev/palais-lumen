// The sound building blocks shared by music and effects: synthesised voices (tone, noise,
// bell) and the recorded instruments (note, hit), all scheduled `d` seconds from now.
// If an instrument has not finished loading (or failed to), `note`/`hit` fall back to a
// synthesised stand-in of the same family, so nothing ever goes silent.

import { Sampler, mtof, type InstId, type NoteOpts } from './sampler';

export type { InstId, NoteOpts };

type Family = 'keys' | 'mallet' | 'pluck' | 'sustain' | 'timp';
const FAMILY: Partial<Record<InstId, Family>> = {
  piano: 'keys', pianof: 'keys', wurli: 'keys', harpsi: 'keys', celesta: 'mallet', musicbox: 'mallet',
  vibes: 'mallet', glock: 'mallet', marimba: 'mallet', xylo: 'mallet', tubbells: 'mallet', chimes: 'mallet', kalimba: 'mallet', tglock: 'mallet',
  bass: 'pluck', pizz: 'pluck', harp: 'pluck',
  timpani: 'timp', timproll: 'timp',
};

export class Voices {
  readonly smp: Sampler;
  private noiseBuf: AudioBuffer;

  constructor(
    readonly ctx: BaseAudioContext,
    /** Default output (the effects bus) when none is given. */
    public out: AudioNode,
  ) {
    this.smp = new Sampler(ctx);
    const nl = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, nl, ctx.sampleRate);
    const nd = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < nl; i++) nd[i] = Math.random() * 2 - 1;
  }

  get noiseBuffer() {
    return this.noiseBuf;
  }

  /** Absolute time for a delay from now. */
  at(d: number) {
    return this.ctx.currentTime + Math.max(0, d);
  }

  has(id: InstId) {
    return this.smp.has(id);
  }

  need(...ids: InstId[]) {
    return this.smp.need(...ids);
  }

  // ---- Synthesised voices ---------------------------------------------------

  /** One enveloped oscillator voice. */
  tone(freq: number, dur: number, type: OscillatorType = 'sine', vol = 0.5, delay = 0, slideTo?: number, out: AudioNode | null = this.out, attack = 0.008) {
    if (!out) return;
    const t = this.at(delay);
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  /** Filtered noise burst. */
  noise(dur: number, vol = 0.3, delay = 0, freq = 2000, type: BiquadFilterType = 'bandpass', q = 1, out: AudioNode | null = this.out, sweepTo?: number) {
    if (!out) return;
    const t = this.at(delay);
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.01, dur / 4));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  }

  /** Metallic bell (inharmonic partials). */
  bell(freq: number, vol = 0.2, delay = 0, dur = 0.6, out: AudioNode | null = this.out) {
    this.tone(freq, dur, 'sine', vol, delay, undefined, out, 0.002);
    this.tone(freq * 2.76, dur * 0.5, 'sine', vol * 0.45, delay, undefined, out, 0.002);
    this.tone(freq * 5.4, dur * 0.25, 'sine', vol * 0.25, delay, undefined, out, 0.002);
  }

  // ---- Recorded instruments -------------------------------------------------

  /** A note on a recorded instrument (midi may be fractional), `d` seconds from now. */
  note(id: InstId, midi: number, d: number, out: AudioNode | null = this.out, o: NoteOpts = {}) {
    if (!out) return;
    if (this.smp.note(id, midi, this.at(d), out, o)) return;
    // Stand-in until the recording is loaded.
    const f = mtof(midi);
    const v = Math.pow(o.vel ?? 0.8, 1.5) * (o.gain ?? 1);
    const dur = o.dur ?? 0.8;
    switch (FAMILY[id] ?? 'sustain') {
      case 'keys':
        this.tone(f, Math.max(0.3, dur + 0.4), 'triangle', 0.09 * v, d, undefined, out, 0.004);
        this.tone(f * 2, Math.max(0.2, dur * 0.5), 'sine', 0.03 * v, d, undefined, out, 0.003);
        return;
      case 'mallet':
        this.bell(f, 0.08 * v, d, Math.max(0.4, dur + 0.6), out);
        return;
      case 'pluck':
        this.tone(f, Math.min(1.2, dur + 0.3), 'triangle', 0.16 * v, d, undefined, out, 0.005);
        return;
      case 'timp':
        this.tone(f, 1, 'sine', 0.3 * v, d, f * 0.8, out, 0.004);
        return;
      default:
        this.tone(f, dur + (o.rel ?? 0.12), 'triangle', 0.06 * v, d, undefined, out, Math.max(0.02, o.att ?? 0.04));
    }
  }

  /** Several notes at once; `strum` spreads them (seconds between notes, negative = downwards). */
  chord(id: InstId, midis: number[], d: number, out: AudioNode | null = this.out, o: NoteOpts = {}, strum = 0) {
    const order = strum < 0 ? [...midis].reverse() : midis;
    order.forEach((m, i) => this.note(id, m, d + i * Math.abs(strum), out, { ...o, vel: (o.vel ?? 0.7) * (1 - i * 0.03) }));
  }

  /** A kit articulation (e.g. hit('hihat', 'c')), `d` seconds from now. */
  hit(id: InstId, art: string, d: number, out: AudioNode | null = this.out, o: NoteOpts = {}) {
    if (!out) return;
    if (this.smp.hit(id, art, this.at(d), out, o)) return;
    const v = (o.vel ?? 0.8) * (o.gain ?? 1);
    if (id === 'kick' || (id === 'tr808' && art.startsWith('kick')) || (id === 'lm2' && art.startsWith('kick'))) {
      this.tone(130, 0.25, 'sine', 0.3 * v, d, 45, out, 0.002);
    } else if (id === 'snare' || art.startsWith('snare') || art.startsWith('clap') || id === 'claps') {
      this.noise(0.14, 0.12 * v, d, 1800, 'bandpass', 0.8, out);
    } else if (id === 'hihat' || art.startsWith('hh') || art.startsWith('hihat')) {
      this.noise(art === 'o' || art.includes('open') ? 0.3 : 0.04, 0.05 * v, d, 8000, 'highpass', 1, out);
    } else if (id === 'suscym' || id === 'clash' || id === 'gong') {
      this.noise(id === 'gong' ? 2 : 0.8, 0.05 * v, d, id === 'gong' ? 600 : 6000, id === 'gong' ? 'bandpass' : 'highpass', 1, out);
    } else if (id === 'triangle' || id === 'handbells' || id === 'marktree' || id === 'belltree' || id === 'sleigh') {
      this.bell(2600, 0.04 * v, d, 0.8, out);
    } else {
      this.noise(0.05, 0.15 * v, d, 2500, 'bandpass', 3, out);
    }
  }
}

/** Builds a smooth stereo hall impulse response: early reflections, then a tail whose highs die first. */
export function hallIR(ctx: BaseAudioContext, seconds = 2.2, bright = 0.5): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = ctx.createBuffer(2, len, sr);
  const pre = Math.floor(0.012 * sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    // Diffuse tail: noise through a one-pole lowpass whose cutoff falls over time.
    let lp = 0;
    for (let i = pre; i < len; i++) {
      const p = (i - pre) / (len - pre);
      const env = Math.pow(1 - p, 2.4) * Math.exp(-p * 2.2);
      const k = 0.06 + bright * 0.6 * Math.pow(1 - p, 2);
      lp += k * ((Math.random() * 2 - 1) - lp);
      d[i] = lp * env * (1.6 - bright * 0.6);
    }
    // A few early reflections, different per side for width.
    const taps = ch ? [0.007, 0.017, 0.029, 0.041, 0.058] : [0.011, 0.021, 0.033, 0.047, 0.063];
    taps.forEach((tt, i) => {
      const j = pre + Math.floor(tt * sr);
      if (j < len) d[j] += (ch ? -1 : 1) * (0.5 - i * 0.07);
    });
    // Fade in the first milliseconds so the dry signal stays clear.
    for (let i = 0; i < pre + 200 && i < len; i++) d[i] *= Math.min(1, i / (pre + 200));
  }
  // Normalise energy so changing the length does not change the level much.
  let e = 0;
  for (let ch = 0; ch < 2; ch++) for (const v of ir.getChannelData(ch)) e += v * v;
  const g = 1.4 / Math.sqrt(e / 2);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] *= g;
  }
  return ir;
}
