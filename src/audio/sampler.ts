// Plays the recorded instruments (src/audio/inst, built by tools/sounds/build.py).
// Each instrument is its own lazy chunk of base64 MP3s; `need()` loads and decodes it once,
// and until then `has()` is false so callers fall back to the synthesised voice.
// Pitched instruments pick the nearest recorded note and resample it; sustaining ones loop a
// crossfaded section so a note can be held for any length. Kits pick an articulation, a
// velocity layer close to the wanted loudness and rotate through round robins.

import { INSTRUMENTS, type InstId } from './inst';

export type { InstId };

interface PitchedSample {
  midi: number;
  buf: AudioBuffer;
  /** Seconds into the buffer where the sound starts (decoders may pad the front). */
  start: number;
  loop?: [number, number];
  vel?: number;
}
interface KitSample {
  peak: number;
  buf: AudioBuffer;
  start: number;
}
type Loaded = { kind: 'p'; s: PitchedSample[] } | { kind: 'k'; arts: Map<string, KitSample[]>; rr: Map<string, number> };

export interface NoteOpts {
  /** 0..1, maps to loudness (and to the layer for multi-velocity instruments). */
  vel?: number;
  /** Seconds the note is held; omitted = let it ring out naturally. */
  dur?: number;
  /** Release time in seconds after `dur`. */
  rel?: number;
  /** Attack fade-in (seconds), for soft entries of pads. */
  att?: number;
  /** -1..1 stereo position. */
  pan?: number;
  /** Extra detune in cents. */
  cents?: number;
  /** Lowpass cutoff in Hz (darker, softer playing); omitted = open. */
  lp?: number;
  /** Linear gain multiplier on top of `vel`. */
  gain?: number;
  /** Pitch glide: ends `glide` semitones away over the note's duration. */
  glide?: number;
}

function decodeB64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Where the first audible sample is: MP3 decoders add a little silence at the front. */
function findStart(buf: AudioBuffer) {
  const d = buf.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const thr = peak * 0.02;
  for (let i = 0; i < d.length; i++) if (Math.abs(d[i]) > thr) return Math.max(0, (i - 64) / buf.sampleRate);
  return 0;
}

export class Sampler {
  private loaded = new Map<InstId, Loaded>();
  private pending = new Map<InstId, Promise<void>>();

  constructor(private ctx: BaseAudioContext) {}

  has(id: InstId) {
    return this.loaded.has(id);
  }

  /** Loads instruments in the background; resolves when all are ready (failures are ignored). */
  need(...ids: InstId[]): Promise<void> {
    return Promise.all(ids.map((id) => this.load(id))).then(() => undefined);
  }

  private load(id: InstId): Promise<void> {
    if (this.loaded.has(id)) return Promise.resolve();
    let p = this.pending.get(id);
    if (p) return p;
    p = INSTRUMENTS[id]()
      .then(async ({ default: data }) => {
        if (data.k === 'p') {
          const s = await Promise.all(
            data.s.map(async (e) => {
              const buf = await this.ctx.decodeAudioData(decodeB64(e[1] as string));
              const start = findStart(buf);
              const smp: PitchedSample = { midi: e[0] as number, buf, start };
              if (e.length === 4) smp.loop = [start + (e[2] as number), start + (e[3] as number)];
              if (e.length === 3) smp.vel = e[2] as number;
              return smp;
            }),
          );
          s.sort((a, b) => a.midi - b.midi);
          this.loaded.set(id, { kind: 'p', s });
        } else {
          const arts = new Map<string, KitSample[]>();
          await Promise.all(
            data.s.map(async (e) => {
              const buf = await this.ctx.decodeAudioData(decodeB64(e[2] as string));
              const list = arts.get(e[0] as string) ?? [];
              list.push({ peak: e[1] as number, buf, start: findStart(buf) });
              arts.set(e[0] as string, list);
            }),
          );
          for (const l of arts.values()) l.sort((a, b) => a.peak - b.peak);
          this.loaded.set(id, { kind: 'k', arts, rr: new Map() });
        }
      })
      .catch(() => {
        /* missing or undecodable: the synth fallback keeps playing */
      })
      .finally(() => this.pending.delete(id));
    this.pending.set(id, p);
    return p;
  }

  /** Lowest and highest recorded note of a pitched instrument. */
  range(id: InstId): [number, number] | null {
    const l = this.loaded.get(id);
    if (!l || l.kind !== 'p') return null;
    return [l.s[0].midi, l.s[l.s.length - 1].midi];
  }

  /**
   * Plays `midi` (fractional allowed) on a pitched instrument at absolute time `t` into `out`.
   * Returns false when the instrument is not loaded (so the caller can synthesise instead).
   */
  note(id: InstId, midi: number, t: number, out: AudioNode, o: NoteOpts = {}): boolean {
    const l = this.loaded.get(id);
    if (!l || l.kind !== 'p') return false;
    const vel = Math.max(0.02, Math.min(1, o.vel ?? 0.8));
    let pool = l.s;
    if (pool[0].vel !== undefined) {
      // Multi-velocity (timpani): the layer closest to the wanted velocity.
      const layers = [...new Set(pool.map((s) => s.vel!))];
      const lv = layers.reduce((a, b) => (Math.abs(b - vel) < Math.abs(a - vel) ? b : a));
      pool = pool.filter((s) => s.vel === lv);
    }
    let best = pool[0];
    for (const s of pool) if (Math.abs(s.midi - midi) < Math.abs(best.midi - midi) || (Math.abs(s.midi - midi) === Math.abs(best.midi - midi) && s.midi < midi)) best = s;
    this.voice(best.buf, best.start, best.loop, midi - best.midi, t, out, vel, o);
    return true;
  }

  /** Plays a kit articulation (e.g. 'hihat', 'c'). `vel` picks the layer and the level. */
  hit(id: InstId, art: string, t: number, out: AudioNode, o: NoteOpts = {}): boolean {
    const l = this.loaded.get(id);
    if (!l || l.kind !== 'k') return false;
    const list = l.arts.get(art);
    if (!list) return false;
    const vel = Math.max(0.02, Math.min(1, o.vel ?? 0.8));
    // Layer: the softest one that is at least as loud as wanted (else the loudest); rotate among
    // samples with the same peak band for round robins.
    const top = list[list.length - 1].peak;
    const want = vel * top;
    let cand = list.filter((s) => s.peak >= want * 0.85);
    if (!cand.length) cand = [list[list.length - 1]];
    const band = cand.filter((s) => s.peak <= cand[0].peak * 1.25);
    const k = (l.rr.get(art) ?? 0) + 1;
    l.rr.set(art, k);
    const s = band[k % band.length];
    const gain = Math.min(1.5, want / s.peak);
    this.voice(s.buf, s.start, undefined, 0, t, out, 1, { ...o, gain: (o.gain ?? 1) * gain });
    return true;
  }

  /** Names of the articulations a kit has (for picking variants). */
  arts(id: InstId): string[] {
    const l = this.loaded.get(id);
    return l && l.kind === 'k' ? [...l.arts.keys()] : [];
  }

  private voice(buf: AudioBuffer, start: number, loop: [number, number] | undefined, semis: number, t: number, out: AudioNode, vel: number, o: NoteOpts) {
    const ctx = this.ctx;
    t = Math.max(t, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const rate = Math.pow(2, (semis + (o.cents ?? 0) / 100) / 12);
    src.playbackRate.setValueAtTime(rate, t);
    const g = ctx.createGain();
    const level = Math.pow(vel, 1.5) * (o.gain ?? 1);
    const att = o.att ?? 0.003;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(level, t + att);
    let node: AudioNode = src;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      f.Q.value = 0.5;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    let tail: AudioNode = g;
    if (o.pan) {
      const p = ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      g.connect(p);
      tail = p;
    }
    tail.connect(out);
    const natural = (buf.duration - start) / rate;
    let end: number;
    if (o.dur !== undefined) {
      if (loop && o.dur > (loop[1] - start) / rate) {
        src.loop = true;
        src.loopStart = loop[0];
        src.loopEnd = loop[1];
      }
      const rel = o.rel ?? 0.12;
      const off = t + Math.max(att, o.dur);
      g.gain.setValueAtTime(level, off);
      g.gain.setTargetAtTime(0, off, rel / 3);
      end = off + rel * 1.5;
      if (!src.loop) end = Math.min(end, t + natural);
    } else {
      end = t + natural;
    }
    if (o.glide) src.playbackRate.exponentialRampToValueAtTime(rate * Math.pow(2, o.glide / 12), Math.max(t + 0.01, end));
    src.start(t, start);
    src.stop(end + 0.02);
    src.onended = () => {
      try {
        tail.disconnect();
      } catch {
        /* ignore */
      }
    };
  }
}

/** Note name helper for readable compositions: n('C4') = 60, n('F#2') = 42, n('Bb3') = 58. */
export function n(name: string): number {
  const m = /^([A-Ga-g])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('bad note ' + name);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase() as 'C'];
  return base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
}

/** Midi note to frequency. */
export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** Frequency to (fractional) midi note. */
export const ftom = (f: number) => 69 + 12 * Math.log2(f / 440);
