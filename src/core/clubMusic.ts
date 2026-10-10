// The club floor's music (floor 4, "Club Nachtfalter"): piano house in the club, hard acid
// techno in the bunker, dusty boom-bap on the hip-hop floor. Each room has a base groove that
// always plays (kick, bass, chords: what you hear through the walls, muffled by a lowpass far
// away) and a "stage layer" (hats, percussion, hooks, leads, effects) whose level follows how
// close the player is to the dance floor. The base opens up as you come closer.
//
// Like the foyer band, every room is written out a whole bar at a time (on beat 0) and follows
// a long form with build-ups and breakdowns, so the music only repeats after about four minutes.
// Recorded instruments (tr808/lm2 drum machines, piano, organ, choir, upright bass, vibes, horns,
// industrial metal) carry the music; synthesis is used where a club would use it too: the sub
// bass, the acid line, the dub stabs, risers and vinyl noise.

import { mtof } from '../audio/sampler';
import type { InstId, NoteOpts, Voices } from '../audio/voices';
import { chord, improvise, nearest, voice, type Chord } from '../audio/moods/jazz';
import { hum, pick, rnd } from '../audio/moods/types';

export type { Voices };

export type ClubMood = 'club' | 'techno' | 'hiphop';

export const CLUB_BPM: Record<ClubMood, number> = { club: 124, techno: 134, hiphop: 88 };

/** Recorded instruments per room (loaded lazily on the first beat; synth stand-ins play until then). */
const NEED: Record<ClubMood, InstId[]> = {
  club: ['tr808', 'lm2', 'claps', 'hihat', 'piano', 'bass', 'organ', 'choir', 'suscym'],
  techno: ['tr808', 'lm2', 'hihat', 'suscym', 'claps', 'anvil', 'brakedrum', 'ratchet', 'clash'],
  hiphop: ['lm2', 'tr808', 'snare', 'hihat', 'piano', 'wurli', 'bass', 'vibes', 'trumpet', 'trombone', 'choir'],
};
const FX_NEED: InstId[] = ['tr808', 'lm2', 'suscym', 'clash'];

interface Chain {
  out: GainNode;
  /** Base groove goes through here: muffled far away, open near the stage. */
  lp: BiquadFilterNode;
  /** Stage layer gain (0 far away, 1 on the dance floor). */
  layer: GainNode;
  /** Base level of the mood (see TRIM). */
  trim: GainNode;
  /** Sidechain "pump" for pads (ducks on every kick), feeds the base. */
  pump: GainNode;
  /** Stereo dotted-eighth echo (ping-pong), returns into the stage layer. */
  echo: GainNode;
  /** Saturator for the acid line / dub stabs, feeds the stage layer. */
  drive: GainNode;
  /** Lowpassed rumble bus (techno), feeds the base. */
  rumble: GainNode;
  mood: ClubMood;
  /** Voice-leading memory between bars. */
  comp: number;
  solo: { last: number; rest: number; dir: number };
}

/**
 * Level balance per mood, measured with tools/sounds/render.mjs: `far`/`near` scale the whole
 * groove away from and on the dance floor, `layer` evens out the stage layers, so club, bunker
 * and hip-hop floor reach the same loudness at the stage (about -30 dBFS rendered, -38 far away).
 */
const TRIM: Record<ClubMood, { far: number; near: number; layer: number }> = {
  club: { far: 0.4, near: 1, layer: 1 },
  techno: { far: 0.62, near: 1.1, layer: 1 },
  hiphop: { far: 0.4, near: 1, layer: 1 },
};
const trimGain = (m: ClubMood, lvl: number) => TRIM[m].far + (TRIM[m].near - TRIM[m].far) * lvl;

const cutoff = (lvl: number) => 2200 * Math.pow(8, lvl);
const layerGain = (lvl: number) => Math.max(0.0001, Math.pow(lvl, 1.3));

/** Soft clipping curve for the drive bus. */
function driveCurve(k: number) {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(k * x) / Math.tanh(k);
  }
  return c;
}

/** Per-output chains (the mood crossfade makes a new output each time) and the current level. */
export class ClubMix {
  private chains: Chain[] = [];
  private loaded = new Set<ClubMood>();
  level = 0;

  private chain(v: Voices, out: GainNode, mood: ClubMood) {
    let c = this.chains.find((x) => x.out === out);
    if (c) return c;
    const ctx = v.ctx;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff(this.level);
    lp.Q.value = 0.7;
    const trim = ctx.createGain();
    trim.gain.value = trimGain(mood, this.level);
    lp.connect(trim).connect(out);
    const layer = ctx.createGain();
    layer.gain.value = layerGain(this.level) * TRIM[mood].layer;
    layer.connect(lp);

    const pump = ctx.createGain();
    pump.connect(lp);

    // Ping-pong echo: dotted eighths, darker with every repeat.
    const spb = 60 / CLUB_BPM[mood];
    const echo = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 350;
    const dl = ctx.createDelay(2);
    const dr = ctx.createDelay(2);
    dl.delayTime.value = dr.delayTime.value = spb * 0.75;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 2600;
    const fb = ctx.createGain();
    fb.gain.value = 0.42;
    const pl = ctx.createStereoPanner();
    const pr = ctx.createStereoPanner();
    pl.pan.value = -0.75;
    pr.pan.value = 0.75;
    echo.connect(hp).connect(dl);
    dl.connect(pl).connect(layer);
    dl.connect(dr);
    dr.connect(pr).connect(layer);
    dr.connect(tone).connect(fb).connect(dl);

    // Drive: a warm saturator, then a highpass so the acid never muddies the kick.
    const drive = ctx.createGain();
    const ws = ctx.createWaveShaper();
    ws.curve = driveCurve(2.6);
    ws.oversample = '2x';
    const post = ctx.createGain();
    post.gain.value = 0.22;
    const dhp = ctx.createBiquadFilter();
    dhp.type = 'highpass';
    dhp.frequency.value = 90;
    drive.connect(ws).connect(post).connect(dhp).connect(layer);
    const send = ctx.createGain();
    send.gain.value = 0.35;
    dhp.connect(send).connect(echo);

    // Rumble: everything low and round, nothing above 170 Hz.
    const rumble = ctx.createGain();
    const rlp = ctx.createBiquadFilter();
    rlp.type = 'lowpass';
    rlp.frequency.value = 170;
    rlp.Q.value = 0.9;
    rumble.connect(rlp).connect(lp);

    c = { out, lp, layer, trim, pump, echo, drive, rumble, mood, comp: 64, solo: { last: 74, rest: 0, dir: 1 } };
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
    if (!this.loaded.has(m)) {
      this.loaded.add(m);
      void v.need(...NEED[m]);
    }
    const c = this.chain(v, out, m);
    // Pads breathe with the kick on every beat.
    duck(c, v.at(d), spb, m === 'hiphop' ? 0.75 : 0.35);
    if (b !== 0) return;
    if (m === 'club') houseBar(v, bar, d, spb, c);
    else if (m === 'techno') technoBar(v, bar, d, spb, c);
    else hiphopBar(v, bar, d, spb, c);
  }
}

// ---- Shared building blocks -----------------------------------------------------------

function duck(c: Chain, t: number, spb: number, depth: number) {
  const g = c.pump.gain;
  g.setTargetAtTime(depth, t, 0.004);
  g.setTargetAtTime(1, t + 0.04, spb * 0.22);
}

/** Looping noise through a sweeping filter with a swelling envelope (risers, washes, hiss). */
function wash(v: Voices, out: AudioNode, d: number, dur: number, vol: number, f0: number, f1: number, type: BiquadFilterType = 'highpass', q = 0.8, att = 0.85) {
  const ctx = v.ctx;
  const t = v.at(d);
  const src = ctx.createBufferSource();
  src.buffer = v.noiseBuffer;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + dur * att);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 1.5);
  src.stop(t + dur + 0.05);
}

/** A synth bass note: round sine sub plus a plucky filtered saw on top (house, techno). */
function synthBass(v: Voices, out: AudioNode, midi: number, d: number, dur: number, vel: number, bright = 1) {
  const ctx = v.ctx;
  const t = v.at(d);
  const f = mtof(midi);
  const sub = ctx.createOscillator();
  sub.frequency.value = f;
  const saw = ctx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.value = f;
  saw.detune.value = 6;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 2.5;
  lp.frequency.setValueAtTime(220 + 900 * bright * vel, t);
  lp.frequency.exponentialRampToValueAtTime(140, t + Math.min(dur, 0.18));
  const gs = ctx.createGain();
  const gw = ctx.createGain();
  gw.gain.value = 0.32;
  const g = ctx.createGain();
  const end = t + Math.max(0.05, dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.075 * vel, t + 0.006);
  g.gain.setTargetAtTime(0.055 * vel, t + 0.02, 0.08);
  g.gain.setTargetAtTime(0, end, 0.025);
  sub.connect(gs).connect(g);
  saw.connect(lp).connect(gw).connect(g);
  g.connect(out);
  for (const o of [sub, saw]) {
    o.start(t);
    o.stop(end + 0.15);
  }
}

/** A drum roll for a build-up: denser and higher over `bars`, crescendo into the drop. */
function roll(v: Voices, out: AudioNode, id: InstId, art: string, d: number, spb: number, k: number, bars: number, gain = 1) {
  const p = k / bars; // 0..1 through the build
  const per = p < 0.5 ? 2 : p < 0.75 ? 4 : 8; // hits per beat
  const last = k === bars - 1;
  for (let i = 0; i < 4 * per; i++) {
    const pos = i / per;
    if (last && pos >= 3) break; // a breath before the drop
    const x = p + pos / 4 / bars;
    v.hit(id, art, d + pos * spb + hum(2), out, { vel: 0.3 + 0.6 * x, gain, cents: x * 500, pan: (i % 2 ? 0.15 : -0.15) });
  }
}

// ---- Club: piano house ------------------------------------------------------------------
//
// A minor, 124 bpm. 128 bars (~4.1 min): intro, groove, breakdown + build, peak (piano hook in
// octaves), deep (organ stabs, congas, a soulful ii-V-I), groove 2 (choir sings the second
// hook), a second breakdown + build, peak 2. Kick, sub bass, piano chords and the pad are the
// base; hats, claps' sparkle, percussion, hooks, organ and risers are the stage layer.

type HouseSec = 'intro' | 'groove' | 'break' | 'peak' | 'deep' | 'groove2' | 'peak2';
const HOUSE_FORM: HouseSec[] = ['intro', 'groove', 'break', 'peak', 'deep', 'groove2', 'break', 'peak2'];
const H_P1 = ['Am9', 'Fmaj9', 'Cmaj9', 'G6'];
const H_P2 = ['Dm9', 'G13', 'Cmaj9', 'Am9'];
const H_PB = ['Fmaj9', 'G6', 'Em7', 'Am9'];

/** Piano stab rhythms: [16th step, length in steps]. */
const STABS: [number, number][][] = [
  [[2, 1], [6, 1], [10, 1], [14, 1]], // offbeat eighths (deep house)
  [[0, 3], [3, 3], [6, 4], [10, 2], [13, 3]], // the classic syncopated piano house figure
  [[0, 2], [3, 1], [6, 2], [8, 1], [11, 2], [14, 2]],
];
const STAB_FILL: [number, number][] = [[0, 3], [3, 3], [6, 2], [8, 1], [10, 1], [12, 1], [14, 2]];

type Line = [number, number, number][]; // [16th step, midi, length in steps]
/** Hook A over Am9 Fmaj9 Cmaj9 G6 (played in octaves on the piano). */
const HOOK_A: Line[] = [
  [[0, 76, 3], [3, 72, 3], [6, 76, 2], [8, 79, 3], [11, 76, 3], [14, 74, 2]],
  [[0, 72, 3], [3, 69, 3], [6, 72, 2], [8, 76, 4], [12, 74, 2], [14, 72, 2]],
  [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 71, 3], [11, 72, 3], [14, 74, 2]],
  [[0, 74, 3], [3, 71, 3], [6, 67, 2], [8, 69, 6], [14, 71, 2]],
];
/** Hook B over Dm9 G13 Cmaj9 Am9 (choir in groove 2, piano in peak 2). */
const HOOK_B: Line[] = [
  [[0, 77, 2], [2, 76, 2], [4, 74, 2], [6, 72, 4], [10, 69, 2], [12, 72, 4]],
  [[0, 74, 3], [3, 71, 3], [6, 74, 2], [8, 77, 4], [12, 76, 4]],
  [[0, 76, 3], [3, 79, 3], [6, 76, 2], [8, 74, 2], [10, 72, 2], [12, 71, 4]],
  [[0, 72, 3], [3, 69, 5], [8, 76, 3], [11, 74, 3], [14, 72, 2]],
];

/** Bass midi for a chord root, kept in the deep A1..G#2 octave. */
const lowRoot = (c: Chord, lo = 33) => lo + ((c.root - lo) % 12 + 12) % 12;

/** Kick levels (the drum machine samples are normalised hot). */
const KG = { house808: 0.15, houseLm: 0.14, techno808: 0.17, technoLm: 0.15 };

function houseKick(v: Voices, out: AudioNode, d: number, vel = 0.9) {
  v.hit('tr808', 'bd2550', d, out, { vel, gain: KG.house808 });
  v.hit('lm2', 'kick', d, out, { vel: vel * 0.75, gain: KG.houseLm });
}

function houseBar(v: Voices, bar: number, d: number, spb: number, c: Chain) {
  const i = bar % 128;
  const sec = HOUSE_FORM[i >> 4];
  const k = i % 16;
  const q = spb / 4;
  const T = (s: number, ms = 4) => d + s * q + hum(ms);
  const B: AudioNode = c.lp;
  const L: AudioNode = c.layer;
  const breakdown = sec === 'break' && k < 8;
  const build = sec === 'break' && k >= 8;
  const deepSide = sec === 'deep' || sec === 'groove2' || sec === 'peak2';
  const prog = breakdown ? H_PB : deepSide ? H_P2 : H_P1;
  const cd = chord(prog[k % 4]);
  const vo = voice(cd, c.comp, 55, 76);
  c.comp = vo.reduce((a, b) => a + b, 0) / vo.length;
  const root = lowRoot(cd);
  const peak = sec === 'peak' || sec === 'peak2';

  // Crash on the first bar of a big section.
  if (k === 0 && i > 0 && (peak || sec === 'groove' || sec === 'deep')) v.hit('suscym', 'hit', d, L, { vel: 0.6, gain: 0.55, pan: 0.3 });

  // ---- Kick and sub bass (base) ----
  if (!breakdown) {
    for (let b = 0; b < 4; b++) {
      if (build && k === 15 && b === 3) continue;
      houseKick(v, B, T(b * 4, 2), b === 0 ? 0.95 : 0.88);
    }
  }
  const bassOn = !breakdown && !(build && k >= 12) && !(sec === 'intro' && k < 4);
  if (bassOn) {
    const oct = root + 12;
    const fifth = root + 7;
    const pat: Line =
      sec === 'deep' || sec === 'peak2'
        ? [[0, root, 2], [3, root, 2], [6, oct, 1], [8, root, 2], [10, fifth, 2], [13, root, 2], [15, oct, 1]]
        : k % 4 === 3
          ? [[2, root, 2], [6, root, 2], [10, oct, 1], [11, fifth, 1], [14, root, 1], [15, oct - 2, 1]]
          : [[2, root, 2], [6, root, 2], [10, root, 2], [14, root, 1], [15, oct, 1]];
    for (const [s, m, len] of pat) {
      synthBass(v, B, m, T(s, 3), len * q * 0.92, s % 4 === 2 ? 0.9 : 0.75, peak ? 1.2 : 0.9);
      v.note('bass', m + 12, T(s, 3), B, { vel: 0.55, dur: len * q * 0.85, rel: 0.05, lp: 1400, gain: 0.15 });
    }
  }

  // ---- Claps, hats and percussion ----
  const drums = !breakdown && !(sec === 'intro' && k < 2);
  if (drums && !(sec === 'intro' && k < 8)) {
    for (const s of [4, 12]) {
      if (build && k === 15 && s === 12) continue;
      v.hit('claps', 'clap', T(s, 3), B, { vel: 0.8, gain: 0.55, pan: -0.08 });
      v.hit('tr808', 'cp', T(s, 3) + 0.006, L, { vel: 0.7, gain: 0.45, pan: 0.1 });
    }
    if (peak && k % 4 === 3) v.hit('claps', 'clap', T(15, 3), L, { vel: 0.5, gain: 0.4, pan: 0.2 });
  }
  if (drums && !(build && k >= 14)) {
    const accent = [0.35, 0.18, 0.55, 0.22];
    for (let s = 0; s < 16; s++) {
      if (sec === 'intro' && k < 8 && s % 2) continue;
      v.hit('hihat', 'c', T(s, 3), L, { vel: accent[s % 4] + rnd(-0.04, 0.04), gain: 0.5, pan: 0.25 });
    }
    if (sec !== 'intro' || k >= 8) for (const s of [2, 6, 10, 14]) v.hit('tr808', peak ? 'oh10' : 'oh00', T(s, 2), L, { vel: 0.62, gain: 0.45, pan: -0.2 });
    if (peak) for (const s of [4, 12]) v.hit('lm2', 'tambourine', T(s + 0.15, 2), L, { vel: 0.5, gain: 0.45, pan: 0.45 });
    if (sec === 'deep' || sec === 'groove2')
      for (let s = 0; s < 16; s++) v.hit('lm2', 'cabasa', T(s, 3), L, { vel: s % 2 ? 0.25 : 0.4, gain: 0.35, pan: 0.5 });
    if (sec === 'deep') {
      const congas: [number, string][] = [[3, 'conga-h'], [6, 'conga-m'], [7, 'conga-h'], [11, 'conga-l'], [14, 'conga-m']];
      for (const [s, a] of congas) v.hit('lm2', a, T(s, 6), L, { vel: 0.55 + rnd(-0.1, 0.1), gain: 0.5, pan: -0.45 });
    }
  }

  // ---- Piano (base) ----
  const pianoOpts = (vel: number, len: number, lp?: number): NoteOpts => ({ vel: vel + rnd(-0.04, 0.04), dur: len, rel: 0.12, gain: 0.5, pan: -0.15, lp });
  if (breakdown) {
    // Breakdown: a slow rolled chord, the hook drifting in softly on top.
    v.chord('piano', [root + 12, ...vo], T(0), B, { vel: 0.5, dur: spb * 3.8, rel: 1.2, gain: 0.55, pan: -0.15 }, 0.03);
    if (k >= 4) for (const [s, m, len] of HOOK_A[k % 4]) v.note('piano', m, T(s, 6), L, { vel: 0.4, dur: len * q, rel: 0.3, gain: 0.45, pan: 0.2 });
  } else if (sec !== 'deep') {
    const lp = sec === 'intro' ? 700 + k * 260 : build ? 2500 + (k - 8) * 600 : undefined;
    const pat = build ? (k >= 12 ? [0, 2, 4, 6, 8, 10, 12, 14].map((s) => [s, 1] as [number, number]) : STABS[0]) : sec === 'intro' ? STABS[0] : k % 4 === 3 ? STAB_FILL : STABS[sec === 'groove2' || sec === 'peak2' ? 2 : 1];
    pat.forEach(([s, len], j) => {
      if (build && k === 15 && s >= 12) return;
      const vel = build ? 0.45 + (k - 8) * 0.05 : j === 0 ? 0.72 : 0.6;
      v.chord('piano', vo, T(s, 5), B, pianoOpts(vel, len * q * 0.9, lp), 0.004);
      if (s === 0 && !build) v.note('piano', root + 12, T(s, 5), B, pianoOpts(0.5, len * q, lp));
    });
  }

  // ---- Organ stabs (deep) ----
  if (sec === 'deep') {
    const ov = voice(cd, 62, 55, 74);
    for (const [s, len] of k % 4 === 3 ? STAB_FILL : STABS[0]) v.chord('organ', ov, T(s, 4), L, { vel: 0.55, dur: len * q * 0.8, rel: 0.06, gain: 0.32, pan: 0.2 });
    if (k % 2 === 0) v.note('organ', root + 24, T(0), B, { vel: 0.5, dur: spb * 0.5, rel: 0.1, gain: 0.25 });
  }

  // ---- Choir pad (base, pumping) ----
  if (breakdown || build || sec === 'deep' || sec === 'peak2' || sec === 'groove2') {
    const pv = voice(cd, 62, 52, 74);
    const vel = breakdown ? 0.55 : build ? 0.4 + (k - 8) * 0.04 : 0.4;
    v.chord('choir', pv, T(0, 2), c.pump, { vel, dur: spb * 4, att: 0.35, rel: 0.6, gain: 0.45, pan: 0.1 });
  }

  // ---- Hooks (stage) ----
  if (sec === 'peak')
    for (const [s, m, len] of HOOK_A[k % 4]) {
      v.note('piano', m, T(s, 4), L, { vel: 0.72, dur: len * q * 0.95, rel: 0.2, gain: 0.55, pan: 0.2 });
      v.note('piano', m - 12, T(s, 4), L, { vel: 0.6, dur: len * q * 0.95, rel: 0.2, gain: 0.5, pan: 0.2 });
    }
  if (sec === 'peak2' && k >= 4)
    for (const [s, m, len] of HOOK_B[k % 4]) {
      v.note('piano', m, T(s, 4), L, { vel: 0.7, dur: len * q * 0.95, rel: 0.2, gain: 0.55, pan: 0.2 });
      v.note('piano', m - 12, T(s, 4), L, { vel: 0.58, dur: len * q * 0.95, rel: 0.2, gain: 0.5, pan: 0.2 });
    }
  if (sec === 'groove2' && k >= 8) {
    // The choir sings hook B in long notes, an "ooh" over the groove.
    for (const [s, m, len] of HOOK_B[k % 4]) if (len >= 3) v.note('choir', m - 12, T(s, 8), L, { vel: 0.55, dur: len * q * 1.3, att: 0.06, rel: 0.4, gain: 0.5, pan: -0.2 });
  }
  if (peak && k % 8 === 7) v.chord('organ', voice(cd, 66, 58, 79), T(14, 2), c.echo, { vel: 0.6, dur: q * 1.5, rel: 0.05, gain: 0.35 });

  // ---- Build-up: snare roll, riser, cymbal swell ----
  if (build) {
    roll(v, B, 'lm2', 'snare-m', d, spb, k - 8, 8, 0.3);
    if (k === 12) wash(v, L, d, spb * 16, 0.07, 400, 9000, 'highpass', 0.9, 0.95);
    if (k === 14) v.hit('suscym', 'swell', d, L, { vel: 0.6, gain: 0.5 });
  }
  if (breakdown && k === 0) wash(v, L, d, spb * 6, 0.05, 8000, 300, 'lowpass', 0.7, 0.05);
}

// ---- Techno bunker: hard acid techno ----------------------------------------------------
//
// F minor (phrygian), 134 bpm, 128 bars (~3.8 min). The kick and a rolling rumble are the
// base, joined by a dark dub stab. Over 64-bar arcs the acid line opens and closes, the ride
// and industrial metal (brake drum, anvil, ratchet) come and go; one breakdown + build per arc.

type TechSec = 'intro' | 'ride' | 'acid' | 'break' | 'peak' | 'hypno' | 'tool' | 'peak2';
const TECH_FORM: TechSec[] = ['intro', 'ride', 'acid', 'break', 'peak', 'hypno', 'tool', 'peak2'];
/** Acid patterns, 16 steps: semitones over F2, '-' rest, '!' accent, '~' slide into the next. */
const ACID: string[][] = [
  ['0!', '-', '12', '0', '-', '3', '-', '0~', '7', '-', '0!', '10', '-', '0', '1~', '-'],
  ['0', '0', '12!', '0', '3~', '5', '-', '0', '0!', '-', '7', '0', '15~', '12', '-', '10'],
  ['0!', '-', '0', '12~', '10', '-', '7', '-', '0!', '3', '-', '0', '12!', '-', '1', '0'],
];
const T_ROOT = 41; // F2

/** One 303-style note: saw through a resonant two-pole cascade with an envelope, optional slide. */
function acidNote(v: Voices, out: AudioNode, midi: number, d: number, len: number, cut: number, envAmt: number, res: number, acc: boolean, slideTo?: number) {
  const ctx = v.ctx;
  const t = v.at(d);
  const o = ctx.createOscillator();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(mtof(midi), t);
  if (slideTo !== undefined) {
    o.frequency.setValueAtTime(mtof(midi), t + len * 0.55);
    o.frequency.exponentialRampToValueAtTime(mtof(slideTo), t + len * 0.85);
  }
  const top = Math.min(9000, cut * (1 + envAmt * (acc ? 1.7 : 1)));
  const dec = acc ? 0.11 : 0.2;
  const f1 = ctx.createBiquadFilter();
  f1.type = 'lowpass';
  f1.Q.value = res * (acc ? 1.25 : 1);
  f1.frequency.setValueAtTime(top, t);
  f1.frequency.exponentialRampToValueAtTime(cut, t + dec);
  const f2 = ctx.createBiquadFilter();
  f2.type = 'lowpass';
  f2.Q.value = 0.6;
  f2.frequency.setValueAtTime(top * 1.6, t);
  f2.frequency.exponentialRampToValueAtTime(cut * 1.6, t + dec);
  const g = ctx.createGain();
  const vol = acc ? 0.34 : 0.22;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.003);
  g.gain.setValueAtTime(vol * 0.85, t + len - 0.012);
  g.gain.linearRampToValueAtTime(0, t + len);
  o.connect(f1).connect(f2).connect(g).connect(out);
  o.start(t);
  o.stop(t + len + 0.03);
}

/** A dub chord stab: detuned saws through one lowpass that closes fast, sent into the echo. */
function dubStab(v: Voices, out: AudioNode, midis: number[], d: number, vol: number, open = 1400) {
  const ctx = v.ctx;
  const t = v.at(d);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(open, t);
  f.frequency.exponentialRampToValueAtTime(260, t + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.004);
  g.gain.setTargetAtTime(0, t + 0.05, 0.07);
  f.connect(g).connect(out);
  for (const m of midis)
    for (const det of [-9, 9]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = mtof(m);
      o.detune.value = det;
      o.connect(f);
      o.start(t);
      o.stop(t + 0.45);
    }
}

function technoKick(v: Voices, out: AudioNode, d: number, vel = 0.95) {
  v.hit('tr808', 'bd5050', d, out, { vel, gain: KG.techno808, cents: -40 });
  v.hit('lm2', 'kick-alt', d, out, { vel: vel * 0.8, gain: KG.technoLm });
}

function technoBar(v: Voices, bar: number, d: number, spb: number, c: Chain) {
  const i = bar % 128;
  const sec = TECH_FORM[i >> 4];
  const k = i % 16;
  const q = spb / 4;
  const T = (s: number, ms = 2) => d + s * q + hum(ms);
  const B: AudioNode = c.lp;
  const L: AudioNode = c.layer;
  const breakdown = sec === 'break' && k < 8;
  const build = sec === 'break' && k >= 8;
  const peak = sec === 'peak' || sec === 'peak2';
  // The root steps down to Eb for the last two bars of every eight in the big sections.
  const shift = (peak || sec === 'hypno') && k % 8 >= 6 ? -2 : 0;
  const root = T_ROOT + shift;

  if (k === 0 && (peak || sec === 'hypno')) v.hit('clash', 'crash', d, L, { vel: 0.7, gain: 0.5, pan: -0.3 });

  // ---- Kick and rumble (base) ----
  if (!breakdown) {
    for (let b = 0; b < 4; b++) {
      if (build && k === 15 && b === 3) continue;
      technoKick(v, B, T(b * 4, 1), b === 0 ? 1 : 0.93);
    }
    // Rolling rumble after every kick: three dark sixteenths at F1.
    if (!(build && k >= 14))
      for (let b = 0; b < 4; b++)
        for (const [s, vel] of [[1, 0.4], [2, 0.8], [3, 0.6]] as const) {
          if (sec === 'intro' && k < 4 && s === 1) continue;
          v.tone(mtof(root - 12), q * 0.95, 'triangle', 0.05 * vel, T(b * 4 + s, 1), undefined, c.rumble, 0.006);
        }
  }

  // ---- Hats, ride, claps ----
  const drums = !breakdown && !(build && k >= 14);
  if (drums) {
    for (let s = 0; s < 16; s++) {
      const off = s % 4 === 2;
      if (!off && (sec === 'intro' || sec === 'ride')) continue;
      v.hit('hihat', 'c', T(s, 2), L, { vel: off ? 0.55 : s % 2 ? 0.22 : 0.32, gain: 0.9, pan: 0.3 });
    }
    if (sec !== 'intro' && sec !== 'tool') for (const s of [2, 6, 10, 14]) v.hit('suscym', 'ride', T(s, 2), L, { vel: 0.45 + rnd(-0.05, 0.05), gain: 0.7, pan: -0.35 });
    if (peak) for (const s of [2, 6, 10, 14]) v.hit('tr808', 'oh10', T(s, 1), L, { vel: 0.5, gain: 0.4, pan: 0.15 });
    const claps = peak || sec === 'hypno' || sec === 'tool' ? [4, 12] : sec === 'ride' || sec === 'acid' ? (k % 2 ? [12] : []) : [];
    for (const s of claps) {
      v.hit('claps', 'clap', T(s, 2), L, { vel: 0.75, gain: 0.55 });
      v.hit('tr808', 'cp', T(s, 2), c.echo, { vel: 0.5, gain: 0.25 });
    }
  }

  // ---- Industrial metal (stage, through the echo) ----
  if (drums && (sec === 'acid' || peak || sec === 'tool' || sec === 'hypno')) {
    if (sec !== 'hypno') for (const s of [3, 11]) v.hit('brakedrum', 'hammer', T(s, 4), L, { vel: 0.45 + rnd(-0.08, 0.08), gain: 0.35, pan: -0.55 });
    if (k % 2 === 1) v.hit('anvil', pick(['a', 'b']), T(14, 4), L, { vel: 0.5, gain: 0.3, pan: 0.55 });
    if (k % 2 === 1) v.hit('anvil', 'a', T(14, 4), c.echo, { vel: 0.5, gain: 0.18 });
    if ((sec === 'tool' || sec === 'hypno') && Math.random() < 0.4) v.hit('brakedrum', 'hammer', T(pick([7, 9, 13]), 4), c.echo, { vel: 0.4, gain: 0.25 });
    if (k % 8 === 7 && sec !== 'hypno') v.hit('ratchet', 'fast', T(12), L, { vel: 0.6, gain: 0.35, pan: 0.4 });
  }

  // ---- Acid line (stage, driven) ----
  const acidOn = sec === 'acid' || sec === 'break' || peak || sec === 'hypno';
  if (acidOn && !(build && k === 15)) {
    const pat = ACID[sec === 'peak' ? 1 : sec === 'peak2' ? 2 : 0];
    // The filter opens and closes over the 64-bar arc, each section adds its own bias.
    const arc = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i % 64)) / 64);
    const bias = sec === 'acid' ? -0.25 + (k / 16) * 0.35 : sec === 'hypno' ? -0.15 : sec === 'break' ? (k / 16) * 0.4 : 0.2;
    const open = Math.max(0, Math.min(1, arc * 0.7 + bias + 0.15));
    const cut = 180 + 1700 * open * open;
    const res = 9 + open * 6;
    // Hypnotic section: the pattern rotates by two steps every four bars.
    const rot = sec === 'hypno' ? ((k >> 2) * 2) % 16 : 0;
    for (let s = 0; s < 16; s++) {
      const prev = pat[(s - 1 + rot + 16) % 16];
      if (prev.includes('~') && s > 0) continue; // already held by the slide
      const st = pat[(s + rot) % 16];
      if (st === '-') continue;
      const semi = parseInt(st, 10);
      const slide = st.includes('~');
      const next = pat[(s + 1 + rot) % 16];
      const to = slide && next !== '-' ? root + parseInt(next, 10) : undefined;
      acidNote(v, c.drive, root + semi, T(s, 1), q * (slide ? 1.95 : 0.6), cut, 2.4 + open * 2, res, st.includes('!'), to);
    }
  }

  // ---- Dub stab (base + echo) ----
  if ((breakdown && k % 2 === 0) || (sec === 'hypno' && k % 4 === 0) || (sec === 'tool' && k % 4 === 2)) {
    const st = [root + 12, root + 15, root + 19, root + 22];
    dubStab(v, B, st, T(0), 0.06, breakdown ? 900 + k * 150 : 1400);
    dubStab(v, c.echo, st, T(0), 0.07, 1800);
    if (breakdown) dubStab(v, c.echo, st.map((m) => m - 2), T(10), 0.05, 1200);
  }

  // ---- Build-up ----
  if (build) {
    roll(v, L, 'lm2', 'snare-l', d, spb, k - 8, 8, 0.35);
    roll(v, B, 'claps', 'clap', d, spb, k - 8, 8, 0.12);
    if (k === 8) wash(v, L, d, spb * 32, 0.05, 300, 10000, 'highpass', 1.2, 0.97);
  }
  if (breakdown && k === 0) wash(v, c.echo, d, spb * 8, 0.06, 6000, 200, 'bandpass', 2, 0.05);
}

// ---- Hip-hop floor: boom-bap ------------------------------------------------------------
//
// D minor, 88 bpm, swung sixteenths, 96 bars (~4.4 min) in eight-bar parts: intro, verse x2,
// hook (vibes melody, horn stabs), verse 2 x2 (Wurlitzer chops), break (drums, bass and
// scratches), hook, bridge x2 (vibes improvising over new changes), hook, outro verse. A dusty
// detuned piano/Wurli loop, upright bass, kick and snare are the base; hats, ghost notes,
// vibes, horns, scratches and vinyl crackle are the stage layer.

type HipSec = 'intro' | 'verse' | 'verse2' | 'hook' | 'break' | 'bridge';
const HIP_FORM: HipSec[] = ['intro', 'verse', 'verse', 'hook', 'verse2', 'verse2', 'break', 'hook', 'bridge', 'bridge', 'hook', 'verse'];
const HP_V = ['Dm9', 'Bbmaj7', 'Gm9', 'A7b9'];
const HP_H = ['Gm9', 'C9', 'Fmaj9', 'A7alt'];
const HP_B = ['Ebmaj7', 'Dm9', 'Gm9', 'A7b9'];
/** Vibes hook over Gm9 C9 Fmaj9 A7alt. */
const HIP_HOOK: Line[] = [
  [[0, 74, 3], [3, 77, 3], [6, 81, 4], [10, 79, 2], [12, 77, 4]],
  [[0, 76, 6], [6, 79, 2], [8, 82, 4], [12, 81, 4]],
  [[0, 81, 3], [3, 79, 3], [6, 76, 2], [8, 77, 4], [12, 72, 4]],
  [[0, 73, 6], [6, 76, 2], [8, 79, 3], [11, 77, 3], [14, 76, 2]],
];
/** Chop rhythms for the sampled-sounding chord loop: [16th step, length]. */
const CHOPS: [number, number][][] = [
  [[0, 6], [7, 2], [10, 4], [14, 2]],
  [[0, 3], [3, 4], [10, 3], [13, 3]],
];
/** Kick patterns (16th steps) for the two bars of a phrase. */
const HIP_KICK = [
  [0, 7, 10],
  [0, 3, 10, 15],
];
const SW = 0.2; // swing: the off-sixteenths sit 20% of a sixteenth late

/** A record scratch: a sung sample pushed back and forth, plus the needle's noise. */
function scratch(v: Voices, out: AudioNode, d: number, q: number, n = 4) {
  for (let j = 0; j < n; j++) {
    const fwd = j % 2 === 0;
    const len = q * (fwd ? 0.9 : 0.6);
    const at = d + j * q * 0.8;
    v.note('choir', fwd ? 62 : 69, at, out, { vel: 0.7, dur: len, rel: 0.02, att: 0.004, glide: fwd ? 9 : -9, lp: 3200, gain: 0.5, pan: 0.15 });
    v.noise(len, 0.05, at, fwd ? 1400 : 2600, 'bandpass', 2.5, out, fwd ? 3200 : 900);
  }
}

function hiphopBar(v: Voices, bar: number, d: number, spb: number, c: Chain) {
  const i = bar % 96;
  const sec = HIP_FORM[i >> 3];
  const k = i % 8;
  const q = spb / 4;
  const T = (s: number, ms = 7) => d + (s + (s % 2 ? SW : 0)) * q + hum(ms);
  const B: AudioNode = c.lp;
  const L: AudioNode = c.layer;
  const prog = sec === 'hook' ? HP_H : sec === 'bridge' ? HP_B : HP_V;
  const cd = chord(prog[k % 4]);
  const root = 26 + ((cd.root - 26) % 12 + 12) % 12; // D1..C#2 region, played an octave up on the upright
  const intro = sec === 'intro' && k < 2;
  const brk = sec === 'break';

  // ---- Vinyl: hiss (base) and crackle (stage), every bar ----
  wash(v, B, d, spb * 4 + 0.05, 0.012, 5000, 5200, 'bandpass', 0.4, 0.02);
  for (let j = 0; j < 14; j++) v.noise(0.003 + Math.random() * 0.004, rnd(0.04, 0.16), d + Math.random() * spb * 4, rnd(2500, 7000), 'highpass', 1, L);

  // ---- Drums ----
  if (!intro) {
    const kicks = brk && k % 2 ? [0, 10] : HIP_KICK[k % 2];
    for (const s of kicks) {
      v.hit('lm2', 'kick', T(s, 4), B, { vel: s === 0 ? 0.95 : 0.82, gain: 0.3 });
      v.hit('tr808', 'bd5050', T(s, 4), B, { vel: 0.7, gain: 0.15 });
    }
    if (!(brk && k < 4))
      for (const s of [4, 12]) {
        v.hit('lm2', 'snare-l', T(s, 5), B, { vel: 0.9, gain: 0.3 });
        v.hit('snare', 's', T(s, 5) + 0.004, B, { vel: 0.7, gain: 0.25, pan: 0.05 });
      }
    // Ghost notes and a late snare drag before the turnaround.
    v.hit('snare', 'tap', T(pick([7, 9, 15]), 8), L, { vel: 0.3, gain: 0.35, pan: 0.1 });
    if (k % 4 === 3) v.hit('lm2', 'snare-m', T(15, 4), L, { vel: 0.5, gain: 0.35 });
    // Hats: swung eighths with sixteenth pickups, an open hat closing the phrase.
    for (let s = 0; s < 16; s++) {
      const on = s % 2 === 0 || (s % 4 === 3 && Math.random() < 0.35);
      if (!on) continue;
      if (k % 4 === 3 && s === 14) {
        v.hit('hihat', 'o', T(s), L, { vel: 0.45, gain: 0.45, pan: 0.3 });
        continue;
      }
      v.hit('hihat', 'c', T(s), L, { vel: (s % 4 === 0 ? 0.42 : 0.3) + rnd(-0.06, 0.06), gain: 0.8, pan: 0.3 });
    }
  }

  // ---- Upright bass (base) ----
  if (!intro) {
    const pat: Line =
      sec === 'verse2' || sec === 'bridge'
        ? [[0, root + 12, 5], [6, root + 12, 2], [8, root + 19, 2], [10, root + 12, 3], [14, nearest((chord(prog[(k + 1) % 4]).root + 1) % 12, root + 12), 2]]
        : [[0, root + 12, 6], [7, root + 12, 2], [10, root + 12, 4], [14, root + 19 > 50 ? root + 7 : root + 19, 2]];
    for (const [s, m, len] of pat) v.note('bass', Math.min(55, Math.max(28, m)), T(s, 6), B, { vel: s === 0 ? 0.9 : 0.75, dur: len * q * 0.9, rel: 0.08, gain: 0.4 });
  }

  // ---- The dusty chord loop (base) ----
  const loopOn = !(brk && k < 6);
  if (loopOn) {
    const inst: InstId = sec === 'verse2' ? 'wurli' : 'piano';
    const vo = voice(cd, c.comp, 55, 74);
    c.comp = vo.reduce((a, b) => a + b, 0) / vo.length;
    const tape = rnd(-14, -6); // a slightly flat, wobbly record
    const lp = intro || brk ? 900 : inst === 'wurli' ? 3000 : 2400;
    const pat = CHOPS[sec === 'verse2' || sec === 'bridge' ? 1 : 0];
    for (const [s, len] of pat) v.chord(inst, vo, T(s, 4), B, { vel: s === 0 ? 0.62 : 0.5, dur: len * q * 0.9, rel: 0.1, gain: inst === 'wurli' ? 0.6 : 0.5, lp, cents: tape, pan: -0.2 }, 0.006);
    if (inst === 'piano') v.note('piano', vo[vo.length - 1] + 12, T(0, 4), B, { vel: 0.4, dur: spb * 1.4, lp, cents: tape, gain: 0.4, pan: -0.2 });
  }

  // ---- Vibes: the hook, or an improvised line in the bridge (stage) ----
  if (sec === 'hook')
    for (const [s, m, len] of HIP_HOOK[k % 4]) v.note('vibes', m, T(s, 6), L, { vel: 0.62 + rnd(-0.05, 0.05), dur: len * q * 1.1, rel: 0.5, gain: 0.55, pan: 0.3 });
  if (sec === 'bridge' && k >= 2) {
    const ev = improvise([cd], [4], c.solo, 67, 84, 0.45);
    for (const e of ev) v.note('vibes', e.midi, d + e.at * spb + (e.at % 1 ? SW * 0.5 * spb : 0) + hum(6), L, { vel: e.vel, dur: e.dur * spb, rel: 0.4, gain: 0.5, pan: 0.3 });
  }

  // ---- Horn stabs, now and then (stage) ----
  const horns = (sec === 'hook' && (k === 0 || k === 4 || (k % 4 === 3 && i >= 80))) || (sec === 'verse' && i >= 88 && k % 2 === 0) || (sec === 'bridge' && k === 7);
  if (horns) {
    const hv = voice(cd, 70, 62, 79).slice(-3);
    const hit = (s: number, len: number, fall = false) => {
      hv.slice(1).forEach((m) => v.note('trumpet', m, T(s, 5), L, { vel: 0.75, dur: len * q, rel: 0.08, gain: 0.4, pan: -0.3, glide: fall ? -3 : 0 }));
      v.note('trombone', hv[0] - 12, T(s, 5), L, { vel: 0.75, dur: len * q, rel: 0.08, gain: 0.45, pan: 0.35, glide: fall ? -3 : 0 });
    };
    hit(0, 2);
    hit(3, 3, Math.random() < 0.5);
  }

  // ---- Scratches (stage) ----
  if ((brk && k % 2 === 1) || (k === 7 && sec !== 'intro' && sec !== 'bridge')) scratch(v, L, T(12, 2), q, brk ? 6 : 4);
  if (brk && k === 0) scratch(v, L, T(0, 2), q, 8);
}

// ---- Club props: one-shots -----------------------------------------------------------

/** Detuned saw cluster through a drive and a presence peak (the sound-system air horn). */
function hornBlast(v: Voices, out: AudioNode, d: number, len: number, base: number, fall: boolean) {
  const ctx = v.ctx;
  const t = v.at(d);
  const peakF = ctx.createBiquadFilter();
  peakF.type = 'peaking';
  peakF.frequency.value = 1800;
  peakF.gain.value = 7;
  peakF.Q.value = 1;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 5500;
  const ws = ctx.createWaveShaper();
  ws.curve = driveCurve(3);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.22, t + 0.012);
  g.gain.setValueAtTime(0.22, t + len - 0.04);
  g.gain.linearRampToValueAtTime(0, t + len);
  ws.connect(peakF).connect(lp).connect(g).connect(out);
  for (const r of [1, 1.006, 1.26, 1.266, 0.5]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f = base * r;
    o.frequency.setValueAtTime(f * 0.94, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    if (fall) {
      o.frequency.setValueAtTime(f, t + len * 0.55);
      o.frequency.exponentialRampToValueAtTime(f * 0.86, t + len);
    }
    const og = ctx.createGain();
    og.gain.value = r === 0.5 ? 0.35 : 0.25;
    o.connect(og).connect(ws);
    o.start(t);
    o.stop(t + len + 0.05);
  }
}

/** Little one-shots for the club props. */
export function clubFx(v: Voices, kind: string, out: AudioNode) {
  void v.need(...FX_NEED);
  const ctx = v.ctx;
  const vary = rnd(0.97, 1.03);
  switch (kind) {
    case 'airhorn': {
      // BAP BAP BAAAAP, with a dub echo trailing behind.
      const echo = ctx.createDelay(1);
      echo.delayTime.value = 0.27;
      const fb = ctx.createGain();
      fb.gain.value = 0.33;
      const eg = ctx.createGain();
      eg.gain.value = 0.35;
      const send = ctx.createGain();
      echo.connect(fb).connect(echo);
      echo.connect(eg).connect(out);
      send.connect(out);
      send.connect(echo);
      const f = 466 * vary;
      hornBlast(v, send, 0, 0.16, f, false);
      hornBlast(v, send, 0.2, 0.16, f, false);
      hornBlast(v, send, 0.4, 0.75, f, true);
      setTimeout(() => {
        try {
          send.disconnect();
          echo.disconnect();
        } catch {
          /* already gone */
        }
      }, 4000);
      return;
    }
    case 'rewind': {
      // The selector pulls the record back: a pitch zooming up, wobbling, then dropping out.
      const t = v.at(0);
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(180 * vary, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
      o.frequency.exponentialRampToValueAtTime(90, t + 0.75);
      const lfo = ctx.createOscillator();
      lfo.frequency.setValueAtTime(14, t);
      lfo.frequency.linearRampToValueAtTime(28, t + 0.7);
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(600, t);
      f.frequency.exponentialRampToValueAtTime(3500, t + 0.45);
      f.frequency.exponentialRampToValueAtTime(300, t + 0.75);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.32, t + 0.05);
      g.gain.setValueAtTime(0.32, t + 0.6);
      g.gain.linearRampToValueAtTime(0, t + 0.78);
      const am = ctx.createGain();
      am.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      o.connect(f).connect(am).connect(g).connect(out);
      for (const x of [o, lfo]) {
        x.start(t);
        x.stop(t + 0.85);
      }
      wash(v, out, 0, 0.75, 0.3, 900, 6000, 'bandpass', 2, 0.6);
      v.noise(0.05, 0.4, 0.76, 2500, 'bandpass', 1.5, out);
      return;
    }
    case 'drop': {
      // Riser, a beat of silence, then the impact: 808, crash and a falling sub.
      wash(v, out, 0, 1.05, 0.14, 300, 9000, 'highpass', 1.2, 0.97);
      v.tone(220, 1.0, 'sawtooth', 0.025, 0, 880, out, 0.6);
      v.hit('tr808', 'bd7550', 1.12, out, { vel: 1, gain: 1.1 });
      v.hit('lm2', 'kick', 1.12, out, { vel: 0.9, gain: 0.8 });
      v.hit('clash', 'crash', 1.12, out, { vel: 0.85, gain: 0.7, pan: 0.2 });
      v.tone(62, 1.1, 'sine', 0.45, 1.12, 34, out, 0.004);
      wash(v, out, 1.12, 1.2, 0.06, 6000, 400, 'lowpass', 0.7, 0.03);
      return;
    }
    case 'bass': {
      // An 808 bass riff that shakes the floor: A, A, E, G.
      const notes = [33, 33, 28, 31];
      notes.forEach((m, j) => {
        const dl = j * 0.18;
        v.tone(mtof(m) * 1.5, 0.3, 'sine', 0.42, dl, mtof(m), out, 0.003);
        v.tone(mtof(m) * 2, 0.12, 'triangle', 0.08, dl, mtof(m) * 1.5, out, 0.002);
        v.hit('tr808', 'bd5050', dl, out, { vel: 0.7, gain: 0.6 });
      });
      return;
    }
    case 'lights': {
      // A heavy relay clunk, the tubes buzzing up and a little sparkle.
      v.hit('lm2', 'stick-h', 0, out, { vel: 0.9, gain: 1.2 });
      v.noise(0.03, 0.45, 0, 1200, 'bandpass', 2, out);
      v.tone(100 * vary, 0.35, 'sawtooth', 0.06, 0.04, undefined, out, 0.02);
      v.noise(0.35, 0.08, 0.04, 3000, 'bandpass', 3, out);
      v.bell(2637 * vary, 0.09, 0.12, 0.5, out);
      v.bell(3520 * vary, 0.08, 0.2, 0.6, out);
      return;
    }
    case 'fog':
      // The fog machine: a pump thump, then a pressurised hiss that swells and settles.
      v.tone(70, 0.18, 'sine', 0.5, 0, 45, out, 0.004);
      wash(v, out, 0.05, 1.6, 0.33, 900, 3500, 'bandpass', 0.7, 0.15);
      wash(v, out, 0.05, 1.4, 0.12, 6000, 9000, 'highpass', 0.7, 0.2);
      return;
    case 'sneaker':
      // Two rubber squeaks on the polished floor.
      for (let j = 0; j < 2; j++) {
        const f = rnd(2300, 2900);
        const dl = j * rnd(0.1, 0.14);
        v.tone(f, 0.07, 'triangle', 0.24, dl, f * rnd(1.15, 1.35), out, 0.005);
        v.tone(f * 2, 0.06, 'sine', 0.08, dl, f * 2.5, out, 0.005);
        v.noise(0.06, 0.15, dl, f, 'bandpass', 6, out);
      }
      return;
    case 'chain':
      // A dangling chain: a burst of metal links clinking, thinning out.
      for (let j = 0; j < 9; j++) {
        const dl = Math.pow(j / 9, 1.6) * 0.45 + rnd(0, 0.015);
        const vol = 0.22 * (1 - j / 12);
        v.bell(rnd(2200, 4200), vol, dl, rnd(0.12, 0.3), out);
        v.noise(0.012, vol * 1.6, dl, rnd(4000, 7000), 'bandpass', 3, out);
      }
      return;
  }
}
